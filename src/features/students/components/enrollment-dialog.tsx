'use client';

import { useApp } from '@/providers/app-context';
import { Button, Dialog } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpEditor } from '@/hooks/use-http-editor';
import type { EnrollmentDto } from '../api';
import { useStudentsApi } from '../hooks/use-students';

export type EnrollmentCommandSelection = {
  action: 'cancel' | 'end';
  record: EnrollmentDto;
  classId: string;
  className: string;
  intent: string;
};

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  ended: 'Encerrado',
  cancelled: 'Cancelado'
};

/** Confirmation dialog for cancelling a pending enrollment or ending an active one. */
export function EnrollmentDialog({
  selection,
  close,
  saved
}: {
  selection: EnrollmentCommandSelection;
  close: () => void;
  saved: () => void;
}) {
  const { notify } = useApp();
  const api = useStudentsApi();
  const { action, record, className, intent } = selection;
  const state = useHttpEditor<{ email: string }, EnrollmentDto>(
    { email: record.email },
    record.revision ?? 0,
    'students-fields'
  );

  const closeEditor = () => {
    if (state.busy) return;
    state.clear();
    close();
  };

  const submit = async () => {
    const ok = await state.editor.submit(
      (_fields, revision) => api.command(record.id, action, revision, intent),
      () => api.readEnrollment(record.id)
    );
    if (ok) {
      state.clear();
      notify('Situação da matrícula atualizada. Histórico preservado.');
      saved();
    }
  };

  return (
    <Dialog
      open
      onClose={closeEditor}
      title={action === 'cancel' ? 'Cancelar matrícula pendente?' : 'Encerrar vínculo com a turma?'}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
          {record.email} · {className}.{' '}
          {action === 'cancel'
            ? 'O cadastro posterior não consumirá esta pendência.'
            : 'O aluno perde o acesso à turma, inclusive em atividades abertas.'}{' '}
          O histórico será preservado. Não há restauração automática.
        </p>
        {state.conflicted && (
          <RecordConflict
            author="Equipe administrativa"
            updatedAt={state.latest?.updatedAt}
            onReviewed={state.editor.acknowledge}
          >
            {state.latest ? (
              <p>
                {state.latest.email} · {statusLabels[state.latest.status]} ·{' '}
                {state.latest.className ?? className}
              </p>
            ) : (
              <Button
                variant="secondary"
                onClick={() => void state.editor.review(() => api.readEnrollment(record.id))}
              >
                Consultar versão atual
              </Button>
            )}
          </RecordConflict>
        )}
        {state.error && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {state.error}
          </p>
        )}
        {state.blocked && (
          <p className="text-sm text-slate-600">
            Feche esta janela e atualize a lista para conferir o que foi registrado antes de iniciar
            outra operação.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={state.busy} onClick={closeEditor}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={state.busy}
            disabled={state.conflicted || state.blocked}
          >
            Confirmar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
