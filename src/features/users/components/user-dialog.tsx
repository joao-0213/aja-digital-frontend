'use client';

import { useState } from 'react';
import { useApp } from '@/providers/app-context';
import { Button, Dialog, Input } from '@/components/ui';
import { ConfirmAlert } from '@/components/shared/confirm-alert';
import { RecordConflict } from '@/components/shared/record-conflict';
import { roleLabels } from '@/lib/labels';
import { useHttpEditor } from '@/hooks/use-http-editor';
import type { Role, User } from '@/models';
import type { UserFields } from '../api';
import { useUsersApi } from '../hooks/use-users';

export type UserSelection =
  | { action: 'edit'; record?: User; intent: string }
  | { action: 'role'; record: User; nextRole: Role; intent: string }
  | { action: 'deactivate' | 'withdraw'; record: User; intent: string };

/** Dialog for creating/editing teachers and confirming role or account status changes. */
export function UserDialog({
  selection,
  close,
  saved
}: {
  selection: UserSelection;
  close: () => void;
  saved: () => void;
}) {
  const { notify } = useApp();
  const api = useUsersApi();
  const edit = selection.action === 'edit';
  const record = selection.record;
  const initial: UserFields = { name: record?.name ?? '', email: record?.email ?? '' };
  const state = useHttpEditor<UserFields, User>(initial, record?.revision ?? 0, 'users-fields');
  const [confirmingClose, setConfirmingClose] = useState(false);

  const closeEditor = () => {
    if (state.busy) return;
    if (confirmingClose) {
      setConfirmingClose(false);
      return;
    }
    if (!edit || !state.dirty) {
      state.clear();
      close();
      return;
    }
    setConfirmingClose(true);
  };

  const save = async () => {
    const ok = await state.editor.submit(
      (fields, revision) => {
        if (selection.action === 'edit') {
          return api.save(
            { name: fields.name.trim(), email: fields.email.trim().toLowerCase() },
            revision,
            selection.record?.id,
            selection.intent
          );
        }
        if (selection.action === 'role') {
          return api.command(selection.record.id, 'role', revision, selection.nextRole);
        }
        return api.command(selection.record.id, selection.action, revision);
      },
      record ? () => api.read(record.id) : undefined
    );
    if (ok) {
      state.clear();
      notify(
        edit
          ? record
            ? 'Cadastro atualizado.'
            : 'Docente salvo. O acesso pode ser definido pelo fluxo de recuperação.'
          : 'Situação do usuário atualizada. Histórico preservado.'
      );
      saved();
    }
  };

  const destructive = selection.action === 'withdraw' || selection.action === 'deactivate';
  const subjectLabel = record && record.role !== 'teacher' ? 'usuário' : 'docente';

  return (
    <Dialog
      open
      onClose={closeEditor}
      title={
        selection.action === 'edit'
          ? selection.record
            ? `Editar ${subjectLabel}`
            : 'Cadastrar docente'
          : selection.action === 'role'
            ? 'Alterar perfil de acesso?'
            : selection.action === 'withdraw'
              ? `Excluir ${subjectLabel}?`
              : `Inativar ${subjectLabel}?`
      }
    >
      {confirmingClose ? (
        <ConfirmAlert
          message="Fechar esta edição sem salvar as alterações?"
          cancelLabel="Continuar editando"
          confirmLabel="Descartar alterações"
          onCancel={() => setConfirmingClose(false)}
          onConfirm={() => {
            state.clear();
            close();
          }}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {selection.action === 'edit' ? (
            <>
              {!selection.record && (
                <p className="text-sm leading-6 text-slate-600">
                  A senha será definida pelo docente na recuperação de acesso.
                </p>
              )}
              <Input
                label="Nome"
                value={state.fields.name}
                onChange={(event) =>
                  state.editor.change({ ...state.fields, name: event.target.value })
                }
                required
                minLength={3}
                maxLength={100}
                disabled={state.busy}
              />
              <Input
                label="E-mail"
                type="email"
                value={state.fields.email}
                onChange={(event) =>
                  state.editor.change({ ...state.fields, email: event.target.value })
                }
                required
                maxLength={254}
                disabled={state.busy}
              />
            </>
          ) : (
            <>
              <p className="text-sm leading-6 [overflow-wrap:anywhere]">
                {selection.record.name}
                {selection.action === 'role'
                  ? ` passará a ser ${roleLabels[selection.nextRole].toLowerCase()}.`
                  : ' perderá acesso à plataforma.'}
              </p>
              <p className="text-sm leading-6 text-slate-600">
                Atribuições incompatíveis serão encerradas, preservando o histórico.
              </p>
            </>
          )}
          {state.conflicted && (
            <RecordConflict
              author="Equipe administrativa"
              updatedAt={state.latest?.updatedAt}
              onReviewed={state.editor.acknowledge}
            >
              <p>O cadastro mudou. Seu preenchimento foi mantido.</p>
              {state.latest ? (
                <p>
                  {state.latest.name} · {state.latest.email} · {roleLabels[state.latest.role]} ·{' '}
                  {state.latest.active === false ? 'Inativo' : 'Ativo'}
                </p>
              ) : (
                record && (
                  <Button
                    variant="secondary"
                    onClick={() => void state.editor.review(() => api.read(record.id))}
                  >
                    Consultar versão atual
                  </Button>
                )
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
              Esta operação não pode ser repetida agora. Seu preenchimento foi preservado. Feche
              esta janela e atualize a lista para conferir o que foi registrado antes de iniciar
              outra operação.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={state.busy} onClick={closeEditor}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'danger' : 'primary'}
              loading={state.busy}
              disabled={state.conflicted || state.blocked}
            >
              {edit ? (record ? 'Salvar alterações' : 'Salvar docente') : 'Confirmar alteração'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
