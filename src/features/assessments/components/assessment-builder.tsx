'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Button,
  Card,
  Check,
  Empty,
  ErrorState,
  Input,
  LinkButton,
  PageHeading,
  Select,
  Skeleton,
  Textarea
} from '@/components/ui';
import { resolveActorDisplayName } from '@/lib/academic-format';
import { brazilDateTimeLabel } from '@/lib/utils';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import type { TrailModule } from '@/models';
import { isStaffAssessment, type AssessmentStaff, type AssessmentSubject } from '../api';
import { useAssessmentBuilder } from '../hooks/use-assessment-builder';
import { useAssessmentsApi } from '../hooks/use-assessments';
import { fromBrazilDateTimeLocal, toBrazilDateTimeLocal } from '../lib/assessment-editor';
import { AssessmentBuilderDialog, AssessmentConflictBanner } from './assessment-builder-dialogs';
import { AssessmentQuestionList } from './assessment-question-list';

function defaultDeadline() {
  return fromBrazilDateTimeLocal(
    toBrazilDateTimeLocal(new Date(Date.now() + 7 * 86400000).toISOString())
  );
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
  modules: TrailModule[];
  subjects: AssessmentSubject[];
  record?: AssessmentStaff;
  requestedModule: string;
}) {
  const b = useAssessmentBuilder({
    api,
    sessionKey,
    client,
    modules,
    subjects,
    record,
    requestedModule
  });

  if (!b.availableModules.length)
    return (
      <Empty
        title="Nenhum módulo disponível"
        description="Você precisa estar atribuído a uma disciplina para preparar atividades."
        action={<LinkButton href="/questionarios">Voltar para atividades</LinkButton>}
      />
    );

  const editorSnapshot = b.editor.getSnapshot();

  return (
    <>
      <Button variant="secondary" className="mb-5" onClick={b.leaveEditor}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </Button>
      <PageHeading
        title={
          b.activeRecord
            ? b.activeRecord.status === 'draft'
              ? 'Editar rascunho'
              : 'Editar atividade publicada'
            : 'Criar atividade'
        }
      />
      {b.activeRecord?.updatedAt && (
        <p className="mb-4 text-xs text-slate-500">
          Última alteração:{' '}
          {resolveActorDisplayName(
            b.activeRecord.updatedBy,
            subjects.flatMap((subject) => subject.teachers)
          )}{' '}
          · {brazilDateTimeLabel(b.activeRecord.updatedAt)}
        </p>
      )}
      {editorSnapshot.conflicted && b.activeRecord && (
        <AssessmentConflictBanner
          latest={editorSnapshot.latest ?? undefined}
          modules={modules}
          subjects={subjects}
          onReviewed={b.acknowledgeConflict}
        />
      )}
      {b.structuralLocked && (
        <p className="mb-5 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Esta atividade já recebeu uma entrega. Título, orientações e a data do prazo atual ainda
          podem ser corrigidos. Questões, módulo, modalidade, obrigatoriedade e presença do prazo
          foram bloqueados.
        </p>
      )}
      {b.needsStructureRecovery && (
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
          {!b.latestRecord ? (
            <>
              <Button
                variant="secondary"
                loading={b.latestLoading}
                onClick={() => void b.inspectCurrent()}
              >
                Consultar estrutura atual
              </Button>
              {b.latestError && (
                <p role="alert" className="text-rose-700">
                  {b.latestError}
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                <strong>Módulo atual:</strong>{' '}
                {modules.find((item) => item.id === b.latestRecord?.moduleId)?.title ??
                  'Módulo indisponível'}
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                {b.latestRecord.questions.map((question) => (
                  <li key={question.id}>{question.statement}</li>
                ))}
              </ol>
              <Button variant="secondary" onClick={() => void b.adoptCurrent()}>
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
            value={b.fields.kind}
            disabled={b.structuralLocked || b.uncertain}
            onChange={(event) => {
              const kind = event.target.value as 'quiz' | 'work';
              b.update({
                kind,
                maxGrade: kind === 'quiz' ? null : b.fields.maxGrade,
                questions: kind === 'work' ? [] : b.fields.questions
              });
            }}
          >
            <option value="quiz">Questionário</option>
            <option value="work">Entrega de trabalho</option>
          </Select>
          <Input
            label="Título"
            value={b.fields.title}
            maxLength={150}
            required
            disabled={b.uncertain}
            onChange={(event) => b.update({ title: event.target.value })}
          />
          <Textarea
            label="Orientações"
            value={b.fields.description}
            disabled={b.uncertain}
            onChange={(event) => b.update({ description: event.target.value })}
          />
          <Select
            label="Módulo da disciplina"
            value={b.fields.moduleId}
            disabled={b.structuralLocked || b.uncertain}
            onChange={(event) => b.update({ moduleId: event.target.value })}
          >
            {b.availableModules.map((item) => (
              <option key={item.id} value={item.id}>
                {subjects.find((value) => value.id === item.subjectId)?.name} · {item.title}
              </option>
            ))}
          </Select>
          <Select
            label="Obrigatoriedade"
            value={b.fields.required ? 'required' : 'optional'}
            disabled={b.structuralLocked || b.uncertain}
            onChange={(event) => b.update({ required: event.target.value === 'required' })}
          >
            <option value="required">Obrigatória</option>
            <option value="optional">Opcional</option>
          </Select>
          {!b.structuralLocked && (
            <Check
              label="Definir prazo"
              checked={b.deadlineEnabled}
              disabled={b.uncertain}
              onChange={(checked) => {
                b.setNowMs(Date.now());
                b.setDeadlineEnabled(checked);
                const nextDeadline = checked ? defaultDeadline() : null;
                b.setDeadlineInput(toBrazilDateTimeLocal(nextDeadline));
                b.update({
                  deadline: nextDeadline,
                  allowLate: checked ? b.fields.allowLate : false
                });
              }}
            />
          )}
          {b.deadlineEnabled ? (
            <>
              <Input
                label="Prazo de entrega"
                type="datetime-local"
                min={b.enforceFutureDeadline ? b.minDeadline : undefined}
                error={b.deadlineError}
                disabled={b.uncertain}
                value={b.deadlineInput}
                onFocus={() => b.setNowMs(Date.now())}
                onChange={(event) => {
                  b.setNowMs(Date.now());
                  b.setDeadlineInput(event.target.value);
                  b.update({
                    deadline: fromBrazilDateTimeLocal(event.target.value, b.fields.deadline)
                  });
                }}
              />
              <p className="text-xs text-slate-500">Horário de Brasília (UTC−3).</p>
              <Check
                label="Aceitar entrega atrasada"
                checked={b.fields.allowLate}
                disabled={b.structuralLocked || b.uncertain}
                onChange={(checked) => b.update({ allowLate: checked })}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">Sem prazo</p>
          )}
          {b.fields.kind === 'work' && (
            <>
              <Check
                label="Permitir nota opcional"
                checked={b.fields.maxGrade !== null}
                disabled={b.structuralLocked || b.uncertain}
                onChange={(checked) => b.update({ maxGrade: checked ? 10 : null })}
              />
              {b.fields.maxGrade !== null && (
                <Input
                  label="Nota máxima"
                  type="number"
                  min="0.01"
                  step="any"
                  disabled={b.structuralLocked || b.uncertain}
                  value={Number.isNaN(b.fields.maxGrade) ? '' : b.fields.maxGrade}
                  onChange={(event) =>
                    b.update({
                      maxGrade: event.target.value === '' ? null : Number(event.target.value)
                    })
                  }
                />
              )}
            </>
          )}
        </Card>
        <div>
          {b.fields.kind === 'quiz' ? (
            <AssessmentQuestionList
              questions={b.fields.questions}
              snapshots={b.snapshots}
              previews={b.previews}
              structuralLocked={b.structuralLocked}
              uncertain={b.uncertain}
              onOpenAuthor={() => b.setDialog('author')}
              onOpenBank={() => b.setDialog('bank')}
              onMoveQuestion={b.moveQuestion}
              onRemoveQuestion={b.removeQuestion}
            />
          ) : (
            <Card>
              <h2 className="font-semibold">Entrega de trabalho</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Descreva nas orientações o que deve ser entregue. Os alunos poderão enviar arquivos
                e links; a devolutiva será publicada em uma etapa posterior.
              </p>
            </Card>
          )}
          {(b.validationError || editorSnapshot.error) && (
            <p role="alert" className="mt-4 text-sm text-rose-700">
              {b.validationError || editorSnapshot.error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={editorSnapshot.busy} onClick={b.leaveEditor}>
              Cancelar
            </Button>
            {b.uncertain ? (
              <Button
                loading={editorSnapshot.busy}
                disabled={
                  editorSnapshot.conflicted || editorSnapshot.blocked || b.needsStructureRecovery
                }
                onClick={() => void b.save(b.pendingCreate?.action ?? 'publish')}
              >
                Tentar novamente a mesma operação
              </Button>
            ) : (
              <>
                {b.activeRecord?.status !== 'published' && (
                  <Button
                    variant="secondary"
                    loading={editorSnapshot.busy}
                    disabled={
                      editorSnapshot.conflicted ||
                      editorSnapshot.blocked ||
                      b.needsStructureRecovery
                    }
                    onClick={() => b.requestSave('draft')}
                  >
                    Salvar rascunho
                  </Button>
                )}
                <Button
                  loading={editorSnapshot.busy}
                  disabled={
                    editorSnapshot.conflicted || editorSnapshot.blocked || b.needsStructureRecovery
                  }
                  onClick={() => b.requestSave('publish')}
                >
                  {b.activeRecord?.status === 'published'
                    ? 'Salvar alterações'
                    : 'Revisar publicação'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      {b.uncertain && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900"
        >
          A resposta não foi confirmada. Seu preenchimento está congelado; tente novamente para
          repetir a mesma intenção e o mesmo conteúdo no servidor.
        </p>
      )}
      <AssessmentBuilderDialog
        dialog={b.dialog}
        fields={b.fields}
        activeRecord={b.activeRecord}
        subject={b.subject}
        module={b.module}
        selectedBankIds={b.selectedBankIds}
        structuralLocked={b.structuralLocked}
        uncertain={b.uncertain}
        busy={editorSnapshot.busy}
        conflicted={editorSnapshot.conflicted}
        blocked={editorSnapshot.blocked}
        questionStructureChanged={b.questionStructureChanged}
        resetConfirmedFor={b.resetConfirmedFor}
        authorStatement={b.authorStatement}
        authorOptions={b.authorOptions}
        authorCorrect={b.authorCorrect}
        authorExplanation={b.authorExplanation}
        onSetAuthorStatement={b.setAuthorStatement}
        onSetAuthorOptions={b.setAuthorOptions}
        onSetAuthorCorrect={b.setAuthorCorrect}
        onSetAuthorExplanation={b.setAuthorExplanation}
        onAddBankQuestion={b.addBankQuestion}
        onAddAuthorQuestion={b.addAuthorQuestion}
        onClose={b.closeDialog}
        onCloseSimple={() => b.setDialog(null)}
        onPublish={(confirmResetDrafts) => void b.save('publish', confirmResetDrafts)}
        onConfirmReset={b.confirmReset}
        onLeave={() => {
          b.setDialog(null);
          b.navigateBack();
        }}
      />
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
