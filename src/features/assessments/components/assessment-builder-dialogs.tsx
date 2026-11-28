'use client';

import type { FormEvent } from 'react';
import { RecordConflict } from '@/components/shared/record-conflict';
import { Button, Dialog, Input, Select, Textarea } from '@/components/ui';
import { BankSelector, type BankQuestion } from '@/features/questions';
import { resolveActorDisplayName } from '@/lib/academic-format';
import { brazilDateTimeLabel, countLabel } from '@/lib/utils';
import type { TrailModule } from '@/models';
import type { AssessmentFields, AssessmentStaff, AssessmentSubject } from '../api';
import type { BuilderDialogState } from '../hooks/assessment-builder-state';

export function AssessmentConflictBanner({
  latest,
  modules,
  subjects,
  onReviewed
}: {
  latest: AssessmentStaff | undefined;
  modules: TrailModule[];
  subjects: AssessmentSubject[];
  onReviewed: () => void;
}) {
  return (
    <div className="mb-6">
      <RecordConflict
        author={resolveActorDisplayName(
          latest?.updatedBy,
          subjects.flatMap((subject) => subject.teachers)
        )}
        updatedAt={latest?.updatedAt}
        onReviewed={onReviewed}
      >
        <p>
          <strong>{latest?.title}</strong>
        </p>
        <p>{latest?.description}</p>
        <p>
          Prazo:{' '}
          {latest?.deadline ? `${brazilDateTimeLabel(latest.deadline)} (Brasília)` : 'Sem prazo'}
        </p>
        <p>
          Módulo:{' '}
          {modules.find((item) => item.id === latest?.moduleId)?.title ?? 'Módulo indisponível'}
        </p>
        <ol className="list-decimal pl-5">
          {latest?.questions.map((question) => (
            <li key={question.id}>{question.statement}</li>
          ))}
        </ol>
      </RecordConflict>
    </div>
  );
}

export function AssessmentBuilderDialog({
  dialog,
  fields,
  activeRecord,
  subject,
  module,
  selectedBankIds,
  structuralLocked,
  uncertain,
  busy,
  conflicted,
  blocked,
  questionStructureChanged,
  resetConfirmedFor,
  authorStatement,
  authorOptions,
  authorCorrect,
  authorExplanation,
  onSetAuthorStatement,
  onSetAuthorOptions,
  onSetAuthorCorrect,
  onSetAuthorExplanation,
  onAddBankQuestion,
  onAddAuthorQuestion,
  onClose,
  onCloseSimple,
  onPublish,
  onConfirmReset,
  onLeave
}: {
  dialog: BuilderDialogState;
  fields: AssessmentFields;
  activeRecord: AssessmentStaff | undefined;
  subject: AssessmentSubject | undefined;
  module: TrailModule | undefined;
  selectedBankIds: string[];
  structuralLocked: boolean;
  uncertain: boolean;
  busy: boolean;
  conflicted: boolean;
  blocked: boolean;
  questionStructureChanged: boolean;
  resetConfirmedFor: string;
  authorStatement: string;
  authorOptions: string[];
  authorCorrect: number;
  authorExplanation: string;
  onSetAuthorStatement: (value: string) => void;
  onSetAuthorOptions: (updater: (current: string[]) => string[]) => void;
  onSetAuthorCorrect: (value: number) => void;
  onSetAuthorExplanation: (value: string) => void;
  onAddBankQuestion: (question: BankQuestion) => void;
  onAddAuthorQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onCloseSimple: () => void;
  onPublish: (confirmResetDrafts: boolean) => void;
  onConfirmReset: () => void;
  onLeave: () => void;
}) {
  return (
    <Dialog
      open={dialog !== null}
      onClose={onClose}
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
            onSelect={onAddBankQuestion}
          />
          <div className="mt-5 flex justify-end">
            <Button onClick={onCloseSimple}>Concluir seleção ({selectedBankIds.length})</Button>
          </div>
        </>
      )}
      {dialog === 'author' && (
        <form className="space-y-4" onSubmit={onAddAuthorQuestion}>
          <Textarea
            label="Enunciado"
            value={authorStatement}
            required
            onChange={(event) => onSetAuthorStatement(event.target.value)}
          />
          {authorOptions.map((option, index) => (
            <Input
              key={index}
              label={`Alternativa ${String.fromCharCode(65 + index)}`}
              value={option}
              required
              onChange={(event) =>
                onSetAuthorOptions((current) =>
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
            onChange={(event) => onSetAuthorCorrect(Number(event.target.value))}
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
            onChange={(event) => onSetAuthorExplanation(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCloseSimple}>
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
            <Button variant="secondary" onClick={onCloseSimple}>
              Voltar ao editor
            </Button>
            <Button
              loading={busy}
              disabled={conflicted || blocked}
              onClick={() =>
                onPublish(
                  questionStructureChanged && resetConfirmedFor === JSON.stringify(fields.questions)
                )
              }
            >
              {activeRecord?.status === 'published' ? 'Confirmar alterações' : 'Publicar atividade'}
            </Button>
          </div>
        </>
      )}
      {dialog === 'reset' && (
        <>
          <p className="text-sm leading-6 text-slate-600">
            A composição mudou. Confirmar reinicia somente as tentativas ainda não entregues;
            entregas confirmadas são preservadas. O servidor aplica essa alteração junto com a nova
            revisão.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Voltar ao editor
            </Button>
            <Button onClick={onConfirmReset}>Confirmar e continuar</Button>
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
            <Button variant="secondary" onClick={onCloseSimple}>
              Continuar editando
            </Button>
            <Button onClick={onLeave}>Voltar para atividades</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
