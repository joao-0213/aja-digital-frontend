'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Check,
  Dialog,
  Empty,
  ErrorState,
  Input,
  LinkButton,
  PageHeading,
  Select,
  Skeleton,
  Textarea
} from '@/components/ui';
import { brazilDateTimeLabel, countLabel } from '@/lib/utils';
import { resolveActorDisplayName } from '@/lib/academic-format';
import { RecordConflict } from '@/components/shared/record-conflict';
import { BankSelector, type BankQuestion } from '@/features/questions';
import { useHttpEditor } from '@/hooks/use-http-editor';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { HttpError } from '@/lib/http-client';
import { useAssessmentFilesApi, useAssessmentsApi } from '../hooks/use-assessments';
import type {
  AssessmentCreate,
  AssessmentFields,
  AssessmentQuestionEntry,
  AssessmentRead,
  AssessmentSnapshot,
  AssessmentStaff
} from '../api';
import {
  fromBrazilDateTimeLocal,
  isDeadlineInPast,
  minBrazilDateTimeLocal,
  needsAssessmentStructureRecovery,
  restoreAssessmentStructure,
  toBrazilDateTimeLocal
} from '../lib/assessment-editor';
import { toErrorMessage } from '@/lib/errors';

type AuthoredEntry = Extract<AssessmentQuestionEntry, { source: 'authored' }>;
type DialogState = 'bank' | 'author' | 'review' | 'reset' | 'leave' | null;
type SaveAction = 'draft' | 'publish';
type PendingCreate = { fields: AssessmentFields; intent: string; action: SaveAction };
type PendingPublish = { id: string; revision: number; intent: string };

function isStaffAssessment(activity: AssessmentRead | undefined): activity is AssessmentStaff {
  return !!activity && 'questionIds' in activity;
}

function entriesFromRecord(record: AssessmentStaff | undefined): AssessmentQuestionEntry[] {
  if (!record) return [];
  return record.questions.map((question) =>
    question.origin === 'author'
      ? {
          source: 'authored',
          clientKey: question.id,
          questionId: question.id,
          question: Object.fromEntries(
            Object.entries(question).filter(([key]) => !['id', 'origin'].includes(key))
          ) as AuthoredEntry['question']
        }
      : { source: 'bank', questionId: question.id }
  );
}

function initialFields(record: AssessmentStaff | undefined, moduleId: string): AssessmentFields {
  return {
    moduleId: record?.moduleId ?? moduleId,
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

function defaultDeadline() {
  return fromBrazilDateTimeLocal(
    toBrazilDateTimeLocal(new Date(Date.now() + 7 * 86400000).toISOString())
  );
}

function AssessmentQuestionImage({ image }: { image?: { src: string; alt: string } | null }) {
  const { sessionKey } = useSession();
  const match = image?.src.match(/^\/api\/v1\/files\/([^/]+)\/content$/);
  let fileId = '';
  try {
    fileId = match ? decodeURIComponent(match[1]) : '';
  } catch {
    fileId = '';
  }
  const files = useAssessmentFilesApi();
  const query = useHttpQuery(
    { sessionKey, key: ['assessments', 'question-image', fileId] },
    useCallback((signal) => files.download(fileId, 'inline', signal), [files, fileId]),
    !!fileId
  );
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!query.data) {
      setUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);
  if (!image) return null;
  if (!fileId)
    return /^\/questions\/[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/.test(image.src) ? (
      <img src={image.src} alt={image.alt} className="my-4 max-h-72 max-w-full" />
    ) : null;
  if (query.error)
    return (
      <div role="alert" className="my-3 text-sm text-rose-700">
        {query.error.message}{' '}
        <button
          type="button"
          className="font-bold underline underline-offset-4"
          onClick={() => void query.retry()}
        >
          Tentar carregar a imagem novamente
        </button>
      </div>
    );
  if (query.loading || !url)
    return (
      <p role="status" className="my-3 text-sm text-slate-500">
        Carregando imagem da questão…
      </p>
    );
  return <img src={url} alt={image.alt} className="my-4 max-h-72 max-w-full" />;
}

function AssessmentEditor({
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
  modules: import('@/models').TrailModule[];
  subjects: import('../api').AssessmentSubject[];
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
  const [activeRecord, setActiveRecord] = useState<AssessmentStaff | undefined>(record);
  const [businessConflict, setBusinessConflict] = useState(false);
  const [latestRecord, setLatestRecord] = useState<AssessmentStaff | null>(null);
  const [latestError, setLatestError] = useState('');
  const [latestLoading, setLatestLoading] = useState(false);
  const pendingCreateKey = `${context}:pending-create`;
  const pendingPublishKey = `${context}:pending-publish`;
  const intentKey = `${context}:intent`;
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    () => client.readDraft<PendingCreate>(pendingCreateKey) ?? null
  );
  const [pendingPublish, setPendingPublish] = useState<PendingPublish | null>(
    () => client.readDraft<PendingPublish>(pendingPublishKey) ?? null
  );
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingAction, setPendingAction] = useState<SaveAction | null>(null);
  const [resetConfirmedFor, setResetConfirmedFor] = useState('');
  const [validationError, setValidationError] = useState('');
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
    setValidationError('');
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
  const setPendingOperation = <T,>(
    key: string,
    value: T | null,
    setter: (value: T | null) => void
  ) => {
    if (value) client.saveDraft(key, value, sessionKey);
    else client.clearDraft(key, sessionKey);
    setter(value);
  };
  const rememberRecord = async (saved: AssessmentStaff) => {
    assertSession();
    setActiveRecord(saved);
    await editor.review(async () => saved);
    assertSession();
    editor.acknowledge();
  };
  const inspectCurrent = async () => {
    if (!activeRecord) return;
    setLatestLoading(true);
    setLatestError('');
    try {
      assertSession();
      const latest = await api.readForSession(activeRecord.id, sessionKey);
      assertSession();
      if (!isStaffAssessment(latest))
        throw new HttpError('forbidden', 'A atividade não está disponível para edição.');
      setLatestRecord(latest);
    } catch (cause: unknown) {
      setLatestError(toErrorMessage(cause, 'Não foi possível consultar a estrutura atual.'));
    } finally {
      setLatestLoading(false);
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
    setActiveRecord(latestRecord);
    setLatestRecord(null);
    setLatestError('');
    setBusinessConflict(false);
    setValidationError('');
  };
  const ambiguous = (cause: unknown) =>
    cause instanceof HttpError &&
    (['unavailable', 'timeout', 'invalid-response'].includes(cause.kind) ||
      (cause.status ?? 0) >= 500);
  const clearPending = () => {
    setPendingOperation(pendingCreateKey, null, setPendingCreate);
    setPendingOperation(pendingPublishKey, null, setPendingPublish);
  };

  const save = async (action: SaveAction, confirmResetDrafts = false) => {
    const currentMs = Date.now();
    setNowMs(currentMs);
    const message = validate(currentMs);
    if (message) {
      setValidationError(message);
      setDialog(null);
      return;
    }
    setValidationError('');
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
          setPendingOperation(pendingPublishKey, null, setPendingPublish);
          current = result as AssessmentStaff;
          await rememberRecord(current);
          return current;
        }
        if (pendingCreate) {
          const created = await api.create(
            Object.fromEntries(
              Object.entries(pendingCreate.fields).filter(([key]) => key !== 'confirmResetDrafts')
            ) as AssessmentCreate,
            pendingCreate.intent
          );
          assertSession();
          setPendingOperation(pendingCreateKey, null, setPendingCreate);
          current = created;
          await rememberRecord(current);
        } else if (activeRecord) {
          try {
            current = (await api.edit(
              activeRecord.id,
              confirmResetDrafts ? payload : draft,
              revision
            )) as AssessmentStaff;
          } catch (cause: unknown) {
            if (cause instanceof HttpError && cause.code === 'BUSINESS_CONFLICT') {
              setBusinessConflict(true);
              setLatestRecord(null);
              setLatestError('');
            }
            throw cause;
          }
          assertSession();
          await rememberRecord(current);
        } else {
          const frozen: PendingCreate = { fields: payload, intent, action: nextAction };
          setPendingOperation(pendingCreateKey, frozen, setPendingCreate);
          let created: AssessmentStaff;
          try {
            const createPayload = Object.fromEntries(
              Object.entries(frozen.fields).filter(([key]) => key !== 'confirmResetDrafts')
            ) as AssessmentCreate;
            created = await api.create(createPayload, frozen.intent);
            assertSession();
          } catch (cause: unknown) {
            if (!ambiguous(cause)) setPendingOperation(pendingCreateKey, null, setPendingCreate);
            throw cause;
          }
          setPendingOperation(pendingCreateKey, null, setPendingCreate);
          current = created;
          await rememberRecord(current);
        }
        if (nextAction === 'publish' && current.status === 'draft') {
          const publication: PendingPublish = pendingPublish ?? {
            id: current.id,
            revision: current.revision,
            intent: `${intent}-publish`
          };
          setPendingOperation(pendingPublishKey, publication, setPendingPublish);
          assertSession();
          try {
            const published = await api.publish(
              publication.id,
              publication.revision,
              publication.intent
            );
            assertSession();
            setPendingOperation(pendingPublishKey, null, setPendingPublish);
            await rememberRecord(published as AssessmentStaff);
            return published;
          } catch (cause: unknown) {
            if (!ambiguous(cause)) setPendingOperation(pendingPublishKey, null, setPendingPublish);
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
    setDialog(null);
    setPendingAction(null);
    if (saved) {
      form.clear();
      clearPending();
      client.clearDraft(intentKey, sessionKey);
      router.push('/questionarios');
    }
  };

  const requestSave = (action: SaveAction) => {
    if (uncertain) {
      void save(pendingCreate?.action ?? 'publish');
      return;
    }
    if (editor.getSnapshot().conflicted || editor.getSnapshot().blocked) return;
    if (needsStructureRecovery) {
      setValidationError('Consulte e use a estrutura atual antes de salvar os campos permitidos.');
      return;
    }
    if (structuralLocked && questionStructureChanged) {
      setValidationError(
        'A atividade já recebeu uma entrega. Mantenha a modalidade, o módulo e as questões atuais.'
      );
      return;
    }
    if (questionStructureChanged && resetConfirmedFor !== JSON.stringify(fields.questions)) {
      setPendingAction(action);
      setDialog('reset');
      return;
    }
    const currentMs = Date.now();
    setNowMs(currentMs);
    const message = validate(currentMs);
    if (message) {
      setValidationError(message);
      return;
    }
    if (action === 'publish') setDialog('review');
    else void save('draft', questionStructureChanged);
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
      setValidationError('Preencha o enunciado, as alternativas e a explicação do gabarito.');
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
    setDialog(null);
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.questions.length) return;
    const questions = [...fields.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    update({ questions });
  };

  if (!availableModules.length)
    return (
      <Empty
        title="Nenhum módulo disponível"
        description="Você precisa estar atribuído a uma disciplina para preparar atividades."
        action={<LinkButton href="/questionarios">Voltar para atividades</LinkButton>}
      />
    );
  const leaveEditor = () => {
    if (dirty || uncertain) setDialog('leave');
    else router.push('/questionarios');
  };

  return (
    <>
      <Button variant="secondary" className="mb-5" onClick={leaveEditor}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </Button>
      <PageHeading
        title={
          activeRecord
            ? activeRecord.status === 'draft'
              ? 'Editar rascunho'
              : 'Editar atividade publicada'
            : 'Criar atividade'
        }
      />
      {activeRecord?.updatedAt && (
        <p className="mb-4 text-xs text-slate-500">
          Última alteração:{' '}
          {resolveActorDisplayName(
            activeRecord.updatedBy,
            subjects.flatMap((subject) => subject.teachers)
          )}{' '}
          · {brazilDateTimeLabel(activeRecord.updatedAt)}
        </p>
      )}
      {editor.getSnapshot().conflicted && activeRecord && (
        <div className="mb-6">
          <RecordConflict
            author={resolveActorDisplayName(
              editor.getSnapshot().latest?.updatedBy,
              subjects.flatMap((subject) => subject.teachers)
            )}
            updatedAt={editor.getSnapshot().latest?.updatedAt}
            onReviewed={() => {
              const latest = editor.getSnapshot().latest;
              if (latest && isStaffAssessment(latest)) {
                setActiveRecord(latest);
                setLatestRecord(latest);
              }
              editor.acknowledge();
            }}
          >
            <p>
              <strong>{editor.getSnapshot().latest?.title}</strong>
            </p>
            <p>{editor.getSnapshot().latest?.description}</p>
            <p>
              Prazo:{' '}
              {editor.getSnapshot().latest?.deadline
                ? `${brazilDateTimeLabel(editor.getSnapshot().latest!.deadline!)} (Brasília)`
                : 'Sem prazo'}
            </p>
            <p>
              Módulo:{' '}
              {modules.find((item) => item.id === editor.getSnapshot().latest?.moduleId)?.title ??
                'Módulo indisponível'}
            </p>
            <ol className="list-decimal pl-5">
              {editor.getSnapshot().latest?.questions.map((question) => (
                <li key={question.id}>{question.statement}</li>
              ))}
            </ol>
          </RecordConflict>
        </div>
      )}
      {structuralLocked && (
        <p className="mb-5 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Esta atividade já recebeu uma entrega. Título, orientações e a data do prazo atual ainda
          podem ser corrigidos. Questões, módulo, modalidade, obrigatoriedade e presença do prazo
          foram bloqueados.
        </p>
      )}
      {needsStructureRecovery && (
        <section
          role="alert"
          className="mb-6 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
        >
          <p className="font-semibold">
            A primeira entrega chegou durante sua edição, ou seu rascunho local contém uma estrutura
            anterior.
          </p>
          <p>
            Consulte a estrutura atual antes de salvar. Título, orientações e uma data de prazo já
            existente serão mantidos; campos estruturais serão recuperados do servidor.
          </p>
          {!latestRecord ? (
            <>
              <Button
                variant="secondary"
                loading={latestLoading}
                onClick={() => void inspectCurrent()}
              >
                Consultar estrutura atual
              </Button>
              {latestError && (
                <p role="alert" className="text-rose-700">
                  {latestError}
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                <strong>Módulo atual:</strong>{' '}
                {modules.find((item) => item.id === latestRecord.moduleId)?.title ??
                  'Módulo indisponível'}
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                {latestRecord.questions.map((question) => (
                  <li key={question.id}>{question.statement}</li>
                ))}
              </ol>
              <Button variant="secondary" onClick={() => void adoptCurrent()}>
                Usar estrutura atual e manter meu texto
              </Button>
            </>
          )}
        </section>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="space-y-5">
          <h2 className="font-semibold">Configurações</h2>
          <Select
            label="Tipo de atividade"
            value={fields.kind}
            disabled={structuralLocked || uncertain}
            onChange={(event) => {
              const kind = event.target.value as 'quiz' | 'work';
              update({
                kind,
                maxGrade: kind === 'quiz' ? null : fields.maxGrade,
                questions: kind === 'work' ? [] : fields.questions
              });
            }}
          >
            <option value="quiz">Questionário</option>
            <option value="work">Entrega de trabalho</option>
          </Select>
          <Input
            label="Título"
            value={fields.title}
            maxLength={150}
            required
            disabled={uncertain}
            onChange={(event) => update({ title: event.target.value })}
          />
          <Textarea
            label="Orientações"
            value={fields.description}
            disabled={uncertain}
            onChange={(event) => update({ description: event.target.value })}
          />
          <Select
            label="Módulo da disciplina"
            value={fields.moduleId}
            disabled={structuralLocked || uncertain}
            onChange={(event) => update({ moduleId: event.target.value })}
          >
            {availableModules.map((item) => (
              <option key={item.id} value={item.id}>
                {subjects.find((value) => value.id === item.subjectId)?.name} · {item.title}
              </option>
            ))}
          </Select>
          <Select
            label="Obrigatoriedade"
            value={fields.required ? 'required' : 'optional'}
            disabled={structuralLocked || uncertain}
            onChange={(event) => update({ required: event.target.value === 'required' })}
          >
            <option value="required">Obrigatória</option>
            <option value="optional">Opcional</option>
          </Select>
          {!structuralLocked && (
            <Check
              label="Definir prazo"
              checked={deadlineEnabled}
              disabled={uncertain}
              onChange={(checked) => {
                setNowMs(Date.now());
                setDeadlineEnabled(checked);
                const nextDeadline = checked ? defaultDeadline() : null;
                setDeadlineInput(toBrazilDateTimeLocal(nextDeadline));
                update({ deadline: nextDeadline, allowLate: checked ? fields.allowLate : false });
              }}
            />
          )}
          {deadlineEnabled ? (
            <>
              <Input
                label="Prazo de entrega"
                type="datetime-local"
                min={enforceFutureDeadline ? minDeadline : undefined}
                error={deadlineError}
                disabled={uncertain}
                value={deadlineInput}
                onFocus={() => setNowMs(Date.now())}
                onChange={(event) => {
                  setNowMs(Date.now());
                  setDeadlineInput(event.target.value);
                  update({
                    deadline: fromBrazilDateTimeLocal(event.target.value, fields.deadline)
                  });
                }}
              />
              <p className="text-xs text-slate-500">Horário de Brasília (UTC−3).</p>
              <Check
                label="Aceitar entrega atrasada"
                checked={fields.allowLate}
                disabled={structuralLocked || uncertain}
                onChange={(checked) => update({ allowLate: checked })}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">Sem prazo</p>
          )}
          {fields.kind === 'work' && (
            <>
              <Check
                label="Permitir nota opcional"
                checked={fields.maxGrade !== null}
                disabled={structuralLocked || uncertain}
                onChange={(checked) => update({ maxGrade: checked ? 10 : null })}
              />
              {fields.maxGrade !== null && (
                <Input
                  label="Nota máxima"
                  type="number"
                  min="0.01"
                  step="any"
                  disabled={structuralLocked || uncertain}
                  value={Number.isNaN(fields.maxGrade) ? '' : fields.maxGrade}
                  onChange={(event) =>
                    update({
                      maxGrade: event.target.value === '' ? null : Number(event.target.value)
                    })
                  }
                />
              )}
            </>
          )}
        </Card>
        <div>
          {fields.kind === 'quiz' ? (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">
                  {countLabel(
                    fields.questions.length,
                    'questão selecionada',
                    'questões selecionadas'
                  )}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={structuralLocked || uncertain}
                    onClick={() => setDialog('author')}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Questão original
                  </Button>
                  <Button
                    disabled={structuralLocked || uncertain}
                    onClick={() => setDialog('bank')}
                  >
                    Buscar no banco
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {fields.questions.map((entry, index) => {
                  const question: AssessmentSnapshot | BankQuestion | undefined =
                    entry.source === 'authored'
                      ? {
                          id: entry.questionId ?? entry.clientKey,
                          origin: 'author',
                          ...entry.question
                        }
                      : (snapshots.find((item) => item.id === entry.questionId) ??
                        previews[entry.questionId]);
                  if (!question)
                    return (
                      <Card key={entry.source === 'bank' ? entry.questionId : entry.clientKey}>
                        <p role="status" className="text-sm text-slate-600">
                          Questão {index + 1}: o conteúdo não está disponível. Remova esta
                          referência e escolha outra questão.
                        </p>
                        <Button
                          variant="secondary"
                          className="mt-3"
                          disabled={structuralLocked}
                          onClick={() =>
                            update({
                              questions: fields.questions.filter(
                                (_, position) => position !== index
                              )
                            })
                          }
                        >
                          Remover questão indisponível
                        </Button>
                      </Card>
                    );
                  return (
                    <Card key={entry.source === 'bank' ? entry.questionId : entry.clientKey}>
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <Badge tone="purple">Questão {index + 1}</Badge>
                        <Badge>
                          {'origin' in question && question.origin === 'author'
                            ? 'Autoral desta atividade'
                            : 'Acervo'}
                        </Badge>
                        <Badge>{question.topic}</Badge>
                        <div className="ml-auto flex">
                          <Button
                            variant="ghost"
                            disabled={structuralLocked || uncertain || index === 0}
                            aria-label={`Mover questão ${index + 1} para cima`}
                            onClick={() => moveQuestion(index, -1)}
                          >
                            <ChevronUp aria-hidden="true" className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={
                              structuralLocked || uncertain || index === fields.questions.length - 1
                            }
                            aria-label={`Mover questão ${index + 1} para baixo`}
                            onClick={() => moveQuestion(index, 1)}
                          >
                            <ChevronDown aria-hidden="true" className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={structuralLocked || uncertain}
                            aria-label={`Remover questão ${index + 1}`}
                            onClick={() =>
                              update({
                                questions: fields.questions.filter(
                                  (_, position) => position !== index
                                )
                              })
                            }
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="leading-7 [overflow-wrap:anywhere]">{question.statement}</p>
                      <AssessmentQuestionImage image={question.image} />
                      <ol className="mt-4 space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <li
                            key={optionIndex}
                            className={`rounded-lg px-3 py-2 text-sm [overflow-wrap:anywhere] ${'correct' in question && optionIndex === question.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}
                          >
                            {String.fromCharCode(65 + optionIndex)}. {option}
                            {'correct' in question && optionIndex === question.correct && ' ✓'}
                          </li>
                        ))}
                      </ol>
                      {'explanation' in question && (
                        <p className="mt-3 text-sm text-slate-500 [overflow-wrap:anywhere]">
                          Explicação do gabarito: {question.explanation}
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
              {!fields.questions.length && (
                <Empty
                  title="Monte seu questionário"
                  description="Selecione questões do acervo ou escreva uma questão original."
                  action={
                    <Button
                      disabled={structuralLocked || uncertain}
                      onClick={() => setDialog('bank')}
                    >
                      Escolher questões
                    </Button>
                  }
                />
              )}
            </>
          ) : (
            <Card>
              <h2 className="font-semibold">Entrega de trabalho</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Descreva nas orientações o que deve ser entregue. Os alunos poderão enviar arquivos
                e links; a devolutiva será publicada em uma etapa posterior.
              </p>
            </Card>
          )}
          {(validationError || editor.getSnapshot().error) && (
            <p role="alert" className="mt-4 text-sm text-rose-700">
              {validationError || editor.getSnapshot().error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={editor.getSnapshot().busy} onClick={leaveEditor}>
              Cancelar
            </Button>
            {uncertain ? (
              <Button
                loading={editor.getSnapshot().busy}
                disabled={
                  editor.getSnapshot().conflicted ||
                  editor.getSnapshot().blocked ||
                  needsStructureRecovery
                }
                onClick={() => void save(pendingCreate?.action ?? 'publish')}
              >
                Tentar novamente a mesma operação
              </Button>
            ) : (
              <>
                {activeRecord?.status !== 'published' && (
                  <Button
                    variant="secondary"
                    loading={editor.getSnapshot().busy}
                    disabled={
                      editor.getSnapshot().conflicted ||
                      editor.getSnapshot().blocked ||
                      needsStructureRecovery
                    }
                    onClick={() => requestSave('draft')}
                  >
                    Salvar rascunho
                  </Button>
                )}
                <Button
                  loading={editor.getSnapshot().busy}
                  disabled={
                    editor.getSnapshot().conflicted ||
                    editor.getSnapshot().blocked ||
                    needsStructureRecovery
                  }
                  onClick={() => requestSave('publish')}
                >
                  {activeRecord?.status === 'published'
                    ? 'Salvar alterações'
                    : 'Revisar publicação'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      {uncertain && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900"
        >
          A resposta não foi confirmada. Seu preenchimento está congelado; tente novamente para
          repetir a mesma intenção e o mesmo conteúdo no servidor.
        </p>
      )}
      <Dialog
        open={dialog !== null}
        onClose={() => {
          setDialog(null);
          setPendingAction(null);
        }}
        title={
          dialog === 'bank'
            ? 'Adicionar do banco de questões'
            : dialog === 'author'
              ? 'Nova questão original'
              : dialog === 'review'
                ? 'Conferir atividade'
                : dialog === 'reset'
                  ? 'Reiniciar rascunhos de tentativa'
                  : 'Voltar para atividades'
        }
      >
        {dialog === 'bank' && (
          <>
            <BankSelector
              selectedIds={selectedBankIds}
              disabled={structuralLocked || uncertain}
              onSelect={addBankQuestion}
            />
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setDialog(null)}>
                Concluir seleção ({selectedBankIds.length})
              </Button>
            </div>
          </>
        )}
        {dialog === 'author' && (
          <form className="space-y-4" onSubmit={addAuthorQuestion}>
            <Textarea
              label="Enunciado"
              value={authorStatement}
              required
              onChange={(event) => setAuthorStatement(event.target.value)}
            />
            {authorOptions.map((option, index) => (
              <Input
                key={index}
                label={`Alternativa ${String.fromCharCode(65 + index)}`}
                value={option}
                required
                onChange={(event) =>
                  setAuthorOptions((current) =>
                    current.map((value, position) =>
                      position === index ? event.target.value : value
                    )
                  )
                }
              />
            ))}
            <Select
              label="Alternativa correta"
              value={authorCorrect}
              onChange={(event) => setAuthorCorrect(Number(event.target.value))}
            >
              {authorOptions.map((_, index) => (
                <option key={index} value={index}>
                  {String.fromCharCode(65 + index)}
                </option>
              ))}
            </Select>
            <Textarea
              label="Explicação do gabarito"
              value={authorExplanation}
              required
              onChange={(event) => setAuthorExplanation(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit">Adicionar questão</Button>
            </div>
          </form>
        )}
        {dialog === 'review' && (
          <>
            <p className="font-semibold [overflow-wrap:anywhere]">{fields.title}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
              {fields.description || 'Sem orientações adicionais.'}
            </p>
            <dl className="my-5 space-y-3 text-sm">
              <div>
                <dt className="font-semibold">Destino</dt>
                <dd>
                  {subject?.className} · {subject?.name} · {module?.title}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Condições</dt>
                <dd>
                  {fields.kind === 'quiz'
                    ? `Questionário · ${countLabel(fields.questions.length, 'questão', 'questões')}`
                    : 'Entrega de trabalho'}{' '}
                  · {fields.required ? 'Obrigatória' : 'Opcional'} ·{' '}
                  {fields.deadline
                    ? `${brazilDateTimeLabel(fields.deadline)} (Brasília) · ${fields.allowLate ? 'Aceita atraso' : 'Não aceita atraso'}`
                    : 'Sem prazo'}{' '}
                  · Envio único
                  {fields.kind === 'work' &&
                    fields.maxGrade !== null &&
                    ` · Nota opcional de 0 a ${fields.maxGrade}`}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Voltar ao editor
              </Button>
              <Button
                loading={editor.getSnapshot().busy}
                disabled={editor.getSnapshot().conflicted || editor.getSnapshot().blocked}
                onClick={() =>
                  void save(
                    'publish',
                    questionStructureChanged &&
                      resetConfirmedFor === JSON.stringify(fields.questions)
                  )
                }
              >
                {activeRecord?.status === 'published'
                  ? 'Confirmar alterações'
                  : 'Publicar atividade'}
              </Button>
            </div>
          </>
        )}
        {dialog === 'reset' && (
          <>
            <p className="text-sm leading-6 text-slate-600">
              A composição mudou. Confirmar reinicia somente as tentativas ainda não entregues;
              entregas confirmadas são preservadas. O servidor aplica essa alteração junto com a
              nova revisão.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setDialog(null);
                  setPendingAction(null);
                }}
              >
                Voltar ao editor
              </Button>
              <Button
                onClick={() => {
                  const action = pendingAction ?? 'draft';
                  setResetConfirmedFor(JSON.stringify(fields.questions));
                  setDialog(action === 'publish' ? 'review' : null);
                  if (action === 'draft') void save('draft', true);
                }}
              >
                Confirmar e continuar
              </Button>
            </div>
          </>
        )}
        {dialog === 'leave' && (
          <>
            <p className="text-sm leading-6 text-slate-600">
              {uncertain
                ? 'A resposta desta operação ainda precisa ser conferida. O conteúdo e a chave estável foram mantidos nesta sessão para retomar a mesma tentativa.'
                : 'Seu preenchimento foi mantido nesta sessão e poderá ser reaberto. As alterações ainda não foram enviadas ao servidor.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Continuar editando
              </Button>
              <Button
                onClick={() => {
                  setDialog(null);
                  router.push('/questionarios');
                }}
              >
                Voltar para atividades
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

export function AssessmentBuilder() {
  const params = useSearchParams();
  const { client, sessionKey, status, user } = useSession();
  const id = params.get('id') ?? undefined;
  const requestedModule = params.get('modulo') ?? '';
  const api = useAssessmentsApi();
  const query = useHttpQuery(
    { sessionKey, key: ['assessments', 'builder', id ?? 'new', requestedModule] },
    useCallback((signal) => api.builder(id, signal, sessionKey), [api, id, sessionKey]),
    status === 'authenticated' && user?.role !== 'student'
  );
  if (status === 'loading') return <Skeleton />;
  if (status !== 'authenticated' || !user)
    return (
      <Empty
        title="Entre para preparar atividades"
        description="A autoria de atividades está disponível para a equipe docente."
      />
    );
  if (user.role === 'student')
    return (
      <Empty
        title="Criação de atividades"
        description="Esta área está disponível para a equipe autorizada."
        action={<LinkButton href="/questionarios">Ver atividades</LinkButton>}
      />
    );
  if (query.loading) return <Skeleton />;
  if (query.error)
    return <ErrorState message={query.error.message} retry={() => void query.retry()} />;
  if (!query.data)
    return (
      <Empty
        title="Atividade indisponível"
        action={<LinkButton href="/questionarios">Ver atividades</LinkButton>}
      />
    );
  const record = isStaffAssessment(query.data.assessment) ? query.data.assessment : undefined;
  if (id && !record)
    return (
      <Empty
        title="Atividade indisponível"
        description="Seu vínculo não permite editar esta atividade ou ela foi retirada."
        action={<LinkButton href="/questionarios">Ver atividades</LinkButton>}
      />
    );
  return (
    <AssessmentEditor
      key={`${sessionKey}:${id ?? 'new'}`}
      api={api}
      sessionKey={sessionKey}
      client={client}
      modules={query.data.modules}
      subjects={query.data.subjects}
      record={record}
      requestedModule={requestedModule}
    />
  );
}
