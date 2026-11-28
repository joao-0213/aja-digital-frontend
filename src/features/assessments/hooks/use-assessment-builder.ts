'use client';

import { useEffect, useReducer, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BankQuestion } from '@/features/questions';
import { useHttpEditor } from '@/hooks/use-http-editor';
import { toErrorMessage } from '@/lib/errors';
import { HttpError } from '@/lib/http-client';
import type { TrailModule } from '@/models';
import type { useSession } from '@/providers/app-context';
import {
  isStaffAssessment,
  toAssessmentCreate,
  type AssessmentFields,
  type AssessmentQuestionEntry,
  type AssessmentStaff,
  type AssessmentSubject
} from '../api';
import {
  fromBrazilDateTimeLocal,
  isDeadlineInPast,
  minBrazilDateTimeLocal,
  needsAssessmentStructureRecovery,
  restoreAssessmentStructure,
  toBrazilDateTimeLocal
} from '../lib/assessment-editor';
import type { useAssessmentsApi } from './use-assessments';
import {
  assessmentBuilderReducer,
  createInitialAssessmentBuilderState,
  isAmbiguousBuilderError,
  resolveBuilderSaveRequest,
  type BuilderDialogState,
  type BuilderSaveAction,
  type PendingCreate,
  type PendingPublish
} from './assessment-builder-state';

export type AuthoredEntry = Extract<AssessmentQuestionEntry, { source: 'authored' }>;

export function entriesFromRecord(record: AssessmentStaff | undefined): AssessmentQuestionEntry[] {
  if (!record) return [];
  return record.questions.map((question) =>
    question.origin === 'author'
      ? {
          source: 'authored',
          clientKey: question.id,
          questionId: question.id,
          question: {
            subject: question.subject,
            topic: question.topic,
            difficulty: question.difficulty,
            institution: question.institution,
            year: question.year,
            statement: question.statement,
            options: question.options,
            image: question.image ?? null,
            correct: question.correct,
            explanation: question.explanation
          }
        }
      : { source: 'bank', questionId: question.id }
  );
}

function initialFields(record: AssessmentStaff | undefined, firstModule: string): AssessmentFields {
  return {
    moduleId: record?.moduleId ?? firstModule,
    title: record?.title ?? '',
    description: record?.description ?? '',
    kind: record?.kind ?? 'quiz',
    maxGrade: record?.maxGrade ?? null,
    deadline: record?.deadline ?? null,
    required: record?.required ?? true,
    allowLate: record?.allowLate ?? false,
    questions: entriesFromRecord(record)
  };
}

export function useAssessmentBuilder({
  api,
  sessionKey,
  client,
  modules,
  subjects,
  record,
  requestedModule
}: {
  api: ReturnType<typeof useAssessmentsApi>;
  sessionKey: string;
  client: ReturnType<typeof useSession>['client'];
  modules: TrailModule[];
  subjects: AssessmentSubject[];
  record?: AssessmentStaff;
  requestedModule: string;
}) {
  const router = useRouter();
  const availableModules = modules.filter(
    (module) => subjects.find((subject) => subject.id === module.subjectId)?.canManageContent
  );
  const firstModule =
    availableModules.find((module) => module.id === requestedModule)?.id ??
    availableModules[0]?.id ??
    '';
  const initial = initialFields(record, firstModule);
  const context = `assessment-composer:${record?.id ?? 'new'}`;
  const form = useHttpEditor<AssessmentFields, AssessmentStaff>(
    initial,
    record?.revision ?? 0,
    context
  );
  const { fields, dirty, editor } = form;
  const pendingCreateKey = `${context}:pending-create`;
  const pendingPublishKey = `${context}:pending-publish`;
  const intentKey = `${context}:intent`;

  const [state, dispatch] = useReducer(assessmentBuilderReducer, undefined, () =>
    createInitialAssessmentBuilderState(
      record,
      client.readDraft<PendingCreate>(pendingCreateKey) ?? null,
      client.readDraft<PendingPublish>(pendingPublishKey) ?? null
    )
  );
  const {
    activeRecord,
    businessConflict,
    latestRecord,
    latestError,
    latestLoading,
    pendingCreate,
    pendingPublish,
    dialog,
    resetConfirmedFor,
    validationError
  } = state;

  const [nowMs, setNowMs] = useState(() => Date.now());
  const minDeadline = minBrazilDateTimeLocal(nowMs);
  const [deadlineEnabled, setDeadlineEnabled] = useState(() => !!fields.deadline);
  const [deadlineInput, setDeadlineInput] = useState(() => toBrazilDateTimeLocal(fields.deadline));
  const [intent] = useState(() => client.readDraft<string>(intentKey) ?? crypto.randomUUID());
  const [previews, setPreviews] = useState<Record<string, BankQuestion>>({});
  const [authorStatement, setAuthorStatement] = useState('');
  const [authorOptions, setAuthorOptions] = useState(['', '', '', '']);
  const [authorCorrect, setAuthorCorrect] = useState(0);
  const [authorExplanation, setAuthorExplanation] = useState('');

  const structuralLocked = !!activeRecord?.hasSubmissions || businessConflict;
  const uncertain = !!pendingCreate || !!pendingPublish;

  useEffect(() => {
    client.saveDraft(intentKey, intent, sessionKey);
  }, [client, intentKey, intent, sessionKey]);

  const questionStructureChanged =
    !!activeRecord &&
    JSON.stringify(fields.questions) !== JSON.stringify(entriesFromRecord(activeRecord));
  const localStructure = {
    moduleId: fields.moduleId,
    questionIds: fields.questions.map((entry) =>
      entry.source === 'bank' ? entry.questionId : (entry.questionId ?? entry.clientKey)
    ),
    originals: fields.questions.filter(
      (entry): entry is AuthoredEntry => entry.source === 'authored' && entry.questionId === null
    )
  };
  const needsStructureRecovery =
    needsAssessmentStructureRecovery(activeRecord, localStructure, structuralLocked) ||
    (!!activeRecord &&
      structuralLocked &&
      (fields.kind !== activeRecord.kind ||
        fields.required !== activeRecord.required ||
        fields.allowLate !== activeRecord.allowLate ||
        fields.maxGrade !== activeRecord.maxGrade ||
        !!fields.deadline !== !!activeRecord.deadline));

  const update = (patch: Partial<AssessmentFields>) => {
    dispatch({ type: 'SET_VALIDATION_ERROR', message: '' });
    editor.change({ ...fields, ...patch });
  };

  const module = availableModules.find((item) => item.id === fields.moduleId);
  const subject = module && subjects.find((item) => item.id === module.subjectId);
  const snapshots = activeRecord?.questions ?? record?.questions ?? [];

  const enforceFutureDeadline =
    !activeRecord || activeRecord.status === 'draft' || fields.deadline !== activeRecord.deadline;
  const deadlineError =
    deadlineEnabled && !fields.deadline
      ? 'Informe a data e o horário do prazo.'
      : fields.deadline && enforceFutureDeadline && isDeadlineInPast(fields.deadline, nowMs)
        ? 'O prazo de entrega não pode ser anterior ao momento atual.'
        : undefined;

  const validate = (currentMs = Date.now()) => {
    if (!fields.title.trim()) return 'Informe o título da atividade.';
    if (!availableModules.some((item) => item.id === fields.moduleId))
      return 'Selecione um módulo ao qual você tenha acesso.';
    if (deadlineEnabled && !fields.deadline) return 'Informe a data e o horário do prazo.';
    if (fields.deadline && !fromBrazilDateTimeLocal(toBrazilDateTimeLocal(fields.deadline)))
      return 'Confira a data e o horário do prazo.';
    if (fields.deadline && enforceFutureDeadline && isDeadlineInPast(fields.deadline, currentMs))
      return 'O prazo de entrega não pode ser anterior ao momento atual.';
    if (structuralLocked && !!activeRecord?.deadline !== !!fields.deadline)
      return 'Depois de uma entrega, mantenha a presença ou ausência do prazo atual.';
    if (fields.allowLate && !fields.deadline)
      return 'Para aceitar entregas atrasadas, defina um prazo.';
    if (fields.kind === 'quiz' && !fields.questions.length)
      return 'Adicione pelo menos uma questão ao questionário.';
    if (fields.kind === 'work' && fields.questions.length)
      return 'Remova as questões antes de salvar um trabalho.';
    if (
      fields.kind === 'work' &&
      fields.maxGrade !== null &&
      (!Number.isFinite(fields.maxGrade) || fields.maxGrade <= 0)
    )
      return 'A nota máxima opcional precisa ser positiva.';
    return '';
  };

  const assertSession = () => {
    const current = client.getSnapshot();
    if (current.status !== 'authenticated' || current.sessionKey !== sessionKey)
      throw new HttpError('cancelled', 'A sessão mudou antes de concluir esta alteração.');
  };

  const persistPendingCreate = (value: PendingCreate | null) => {
    if (value) client.saveDraft(pendingCreateKey, value, sessionKey);
    else client.clearDraft(pendingCreateKey, sessionKey);
    dispatch({ type: 'SET_PENDING_CREATE', value });
  };

  const persistPendingPublish = (value: PendingPublish | null) => {
    if (value) client.saveDraft(pendingPublishKey, value, sessionKey);
    else client.clearDraft(pendingPublishKey, sessionKey);
    dispatch({ type: 'SET_PENDING_PUBLISH', value });
  };

  const clearPending = () => {
    client.clearDraft(pendingCreateKey, sessionKey);
    client.clearDraft(pendingPublishKey, sessionKey);
    dispatch({ type: 'CLEAR_PENDING' });
  };

  const rememberRecord = async (saved: AssessmentStaff) => {
    assertSession();
    dispatch({ type: 'RECORD_REMEMBERED', record: saved });
    await editor.review(async () => saved);
    assertSession();
    editor.acknowledge();
  };

  const inspectCurrent = async () => {
    if (!activeRecord) return;
    dispatch({ type: 'INSPECT_START' });
    try {
      assertSession();
      const latest = await api.readForSession(activeRecord.id, sessionKey);
      assertSession();
      if (!isStaffAssessment(latest))
        throw new HttpError('forbidden', 'A atividade não está disponível para edição.');
      dispatch({ type: 'INSPECT_SUCCESS', record: latest });
    } catch (cause: unknown) {
      dispatch({
        type: 'INSPECT_ERROR',
        message: toErrorMessage(cause, 'Não foi possível consultar a estrutura atual.')
      });
    }
  };

  const adoptCurrent = async () => {
    if (!latestRecord) return;
    const recoverable = restoreAssessmentStructure({ ...fields, ...localStructure }, latestRecord);
    const deadline =
      !!latestRecord.deadline === !!recoverable.deadline
        ? recoverable.deadline
        : latestRecord.deadline;
    const recovered: AssessmentFields = {
      ...fields,
      moduleId: recoverable.moduleId,
      title: recoverable.title,
      description: recoverable.description,
      deadline,
      kind: latestRecord.kind,
      maxGrade: latestRecord.maxGrade,
      required: latestRecord.required,
      allowLate: latestRecord.allowLate,
      questions: entriesFromRecord(latestRecord)
    };
    assertSession();
    await editor.review(async () => latestRecord);
    assertSession();
    editor.change(recovered);
    editor.acknowledge();
    setDeadlineEnabled(!!recovered.deadline);
    setDeadlineInput(toBrazilDateTimeLocal(recovered.deadline));
    dispatch({ type: 'ADOPT_CURRENT', record: latestRecord });
  };

  const save = async (action: BuilderSaveAction, confirmResetDrafts = false) => {
    const currentMs = Date.now();
    setNowMs(currentMs);
    const message = validate(currentMs);
    if (message) {
      dispatch({ type: 'SET_VALIDATION_ERROR', message });
      dispatch({ type: 'SET_DIALOG', dialog: null });
      return;
    }
    dispatch({ type: 'SET_VALIDATION_ERROR', message: '' });
    const payload = pendingCreate?.fields ?? {
      ...fields,
      ...(confirmResetDrafts ? { confirmResetDrafts: true } : {})
    };
    const currentId = activeRecord?.id;
    const nextAction = pendingCreate?.action ?? action;
    const saved = await editor.submit(
      async (draft, revision) => {
        assertSession();
        let current: AssessmentStaff;
        if (pendingPublish) {
          const result = await api.publish(
            pendingPublish.id,
            pendingPublish.revision,
            pendingPublish.intent
          );
          assertSession();
          persistPendingPublish(null);
          current = result;
          await rememberRecord(current);
          return current;
        }
        if (pendingCreate) {
          const created = await api.create(
            toAssessmentCreate(pendingCreate.fields),
            pendingCreate.intent
          );
          assertSession();
          persistPendingCreate(null);
          current = created;
          await rememberRecord(current);
        } else if (activeRecord) {
          try {
            current = await api.edit(
              activeRecord.id,
              confirmResetDrafts ? payload : draft,
              revision
            );
          } catch (cause: unknown) {
            if (cause instanceof HttpError && cause.code === 'BUSINESS_CONFLICT') {
              dispatch({ type: 'BUSINESS_CONFLICT' });
            }
            throw cause;
          }
          assertSession();
          await rememberRecord(current);
        } else {
          const frozen: PendingCreate = { fields: payload, intent, action: nextAction };
          persistPendingCreate(frozen);
          let created: AssessmentStaff;
          try {
            created = await api.create(toAssessmentCreate(frozen.fields), frozen.intent);
            assertSession();
          } catch (cause: unknown) {
            if (!isAmbiguousBuilderError(cause)) persistPendingCreate(null);
            throw cause;
          }
          persistPendingCreate(null);
          current = created;
          await rememberRecord(current);
        }
        if (nextAction === 'publish' && current.status === 'draft') {
          const publication: PendingPublish = pendingPublish ?? {
            id: current.id,
            revision: current.revision,
            intent: `${intent}-publish`
          };
          persistPendingPublish(publication);
          assertSession();
          try {
            const published = await api.publish(
              publication.id,
              publication.revision,
              publication.intent
            );
            assertSession();
            persistPendingPublish(null);
            await rememberRecord(published);
            return published;
          } catch (cause: unknown) {
            if (!isAmbiguousBuilderError(cause)) persistPendingPublish(null);
            throw cause;
          }
        }
        return current;
      },
      currentId
        ? async () => {
            const latest = await api.readForSession(currentId, sessionKey);
            if (!isStaffAssessment(latest))
              throw new HttpError('forbidden', 'A atividade não está disponível para edição.');
            return latest;
          }
        : undefined
    );
    dispatch({ type: 'SAVE_FINISHED' });
    if (saved) {
      form.clear();
      clearPending();
      client.clearDraft(intentKey, sessionKey);
      router.push('/questionarios');
    }
  };

  const requestSave = (action: BuilderSaveAction) => {
    const decision = resolveBuilderSaveRequest({
      action,
      uncertain,
      pendingCreateAction: pendingCreate?.action,
      conflicted: editor.getSnapshot().conflicted,
      blocked: editor.getSnapshot().blocked,
      needsStructureRecovery,
      structuralLocked,
      questionStructureChanged,
      resetConfirmed: resetConfirmedFor === JSON.stringify(fields.questions),
      validationMessage: ''
    });
    if (decision.kind === 'retry_uncertain') {
      void save(decision.action);
      return;
    }
    if (decision.kind === 'blocked') return;
    if (decision.kind === 'needs_recovery' || decision.kind === 'structural_locked') {
      dispatch({ type: 'SET_VALIDATION_ERROR', message: decision.message });
      return;
    }
    if (decision.kind === 'confirm_reset') {
      dispatch({ type: 'OPEN_RESET_CONFIRM', action: decision.action });
      return;
    }
    const currentMs = Date.now();
    setNowMs(currentMs);
    const message = validate(currentMs);
    if (message) {
      dispatch({ type: 'SET_VALIDATION_ERROR', message });
      return;
    }
    if (decision.kind === 'open_review') dispatch({ type: 'SET_DIALOG', dialog: 'review' });
    else if (decision.kind === 'save_draft') void save('draft', decision.confirmResetDrafts);
  };

  const selectedBankIds = fields.questions
    .filter(
      (entry): entry is Extract<AssessmentQuestionEntry, { source: 'bank' }> =>
        entry.source === 'bank'
    )
    .map((entry) => entry.questionId);

  const addBankQuestion = (question: BankQuestion) => {
    setPreviews((previous) => ({ ...previous, [question.id]: question }));
    const selected = selectedBankIds.includes(question.id);
    update({
      questions: selected
        ? fields.questions.filter(
            (entry) => entry.source !== 'bank' || entry.questionId !== question.id
          )
        : [...fields.questions, { source: 'bank', questionId: question.id }]
    });
  };

  const addAuthorQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !module ||
      !authorStatement.trim() ||
      authorOptions.length < 2 ||
      authorOptions.some((option) => !option.trim()) ||
      !authorExplanation.trim()
    ) {
      dispatch({
        type: 'SET_VALIDATION_ERROR',
        message: 'Preencha o enunciado, as alternativas e a explicação do gabarito.'
      });
      return;
    }
    const entry: AuthoredEntry = {
      source: 'authored',
      clientKey: crypto.randomUUID(),
      questionId: null,
      question: {
        subject: subject?.name ?? 'Matemática',
        topic: 'Questão original',
        difficulty: 'medium',
        institution: 'Autoral',
        year: new Date().getFullYear(),
        statement: authorStatement.trim(),
        options: authorOptions.map((option) => option.trim()),
        image: null,
        correct: authorCorrect,
        explanation: authorExplanation.trim()
      }
    };
    update({ questions: [...fields.questions, entry] });
    setAuthorStatement('');
    setAuthorOptions(['', '', '', '']);
    setAuthorCorrect(0);
    setAuthorExplanation('');
    dispatch({ type: 'SET_DIALOG', dialog: null });
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.questions.length) return;
    const questions = [...fields.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    update({ questions });
  };

  const removeQuestion = (index: number) => {
    update({
      questions: fields.questions.filter((_, position) => position !== index)
    });
  };

  const leaveEditor = () => {
    if (dirty || uncertain) dispatch({ type: 'SET_DIALOG', dialog: 'leave' });
    else router.push('/questionarios');
  };

  const setDialog = (next: BuilderDialogState) => dispatch({ type: 'SET_DIALOG', dialog: next });
  const closeDialog = () => dispatch({ type: 'CLOSE_DIALOG' });
  const confirmReset = () => {
    const action = state.pendingAction ?? 'draft';
    dispatch({
      type: 'CONFIRM_RESET',
      signature: JSON.stringify(fields.questions),
      nextAction: action
    });
    if (action === 'draft') void save('draft', true);
  };
  const acknowledgeConflict = () => {
    const latest = editor.getSnapshot().latest;
    dispatch({
      type: 'CONFLICT_ACKNOWLEDGED',
      latest: latest && isStaffAssessment(latest) ? latest : undefined
    });
    editor.acknowledge();
  };

  return {
    availableModules,
    fields,
    editor,
    activeRecord,
    latestRecord,
    latestError,
    latestLoading,
    pendingCreate,
    dialog,
    resetConfirmedFor,
    validationError,
    minDeadline,
    setNowMs,
    enforceFutureDeadline,
    deadlineEnabled,
    setDeadlineEnabled,
    deadlineInput,
    setDeadlineInput,
    deadlineError,
    previews,
    authorStatement,
    setAuthorStatement,
    authorOptions,
    setAuthorOptions,
    authorCorrect,
    setAuthorCorrect,
    authorExplanation,
    setAuthorExplanation,
    structuralLocked,
    uncertain,
    questionStructureChanged,
    needsStructureRecovery,
    module,
    subject,
    snapshots,
    selectedBankIds,
    update,
    inspectCurrent,
    adoptCurrent,
    save,
    requestSave,
    addBankQuestion,
    addAuthorQuestion,
    moveQuestion,
    removeQuestion,
    leaveEditor,
    setDialog,
    closeDialog,
    confirmReset,
    acknowledgeConflict,
    navigateBack: () => router.push('/questionarios')
  };
}
