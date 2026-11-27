'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  Empty,
  Input,
  LinkButton,
  PageHeading,
  Select,
  Skeleton,
  ErrorState
} from '@/components/ui';
import { ConfirmAlert } from '@/components/shared/confirm-alert';
import { RecordConflict } from '@/components/shared/record-conflict';
import { countLabel } from '@/lib/utils';
import { roleLabels } from '@/lib/labels';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useEditableDialogSelection } from '@/hooks/use-editable-dialog-selection';
import { useHttpEditor } from '@/hooks/use-http-editor';
import type { User, Role } from '@/models';
import { createUsersApi, type UserFields } from '../api';

type Selection = {
  record?: User;
  action: 'edit' | 'role' | 'deactivate' | 'withdraw';
  nextRole?: Role;
  intent: string;
};

function UserDialog({
  selection,
  close,
  saved
}: {
  selection: Selection;
  close: () => void;
  saved: () => void;
}) {
  const { client } = useSession();
  const { notify } = useApp();
  const api = useMemo(() => createUsersApi(client), [client]);
  const { record, action, nextRole, intent } = selection;
  const edit = action === 'edit';
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
      (fields, revision) =>
        edit
          ? api.save(
              { name: fields.name.trim(), email: fields.email.trim().toLowerCase() },
              revision,
              record?.id,
              intent
            )
          : api.command(record!.id, action, revision, nextRole),
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
  const destructive = action === 'withdraw' || action === 'deactivate';
  const subjectLabel = record && record.role !== 'teacher' ? 'usuário' : 'docente';
  return (
    <Dialog
      open
      onClose={closeEditor}
      title={
        edit
          ? record
            ? `Editar ${subjectLabel}`
            : 'Cadastrar docente'
          : action === 'role'
            ? 'Alterar perfil de acesso?'
            : action === 'withdraw'
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
          {edit ? (
            <>
              {!record && (
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
                {record?.name}
                {action === 'role'
                  ? ` passará a ser ${roleLabels[nextRole!].toLowerCase()}.`
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
                <Button
                  variant="secondary"
                  onClick={() => void state.editor.review(() => api.read(record!.id))}
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

export function UsersPage() {
  const { client, sessionKey, user } = useSession();
  const api = useMemo(() => createUsersApi(client), [client]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const {
    selection,
    open: openSelection,
    close
  } = useEditableDialogSelection<Selection>('users-open', 'users-fields');
  const query = useHttpQuery(
    { sessionKey, key: ['users', search, filter, page] },
    useCallback((signal) => api.list(search, filter, page, signal), [api, search, filter, page]),
    { enabled: user?.role === 'admin', keepPreviousData: true }
  );
  if (user?.role !== 'admin')
    return (
      <Empty
        title="Área da administração"
        description="Seu perfil não permite gerenciar docentes e cargos."
        action={
          <LinkButton secondary href="/">
            Voltar ao painel
          </LinkButton>
        }
      />
    );
  const visibleItems = (query.data?.items ?? []).filter((item) =>
    statusFilter === 'all'
      ? true
      : statusFilter === 'active'
        ? item.active !== false
        : item.active === false
  );
  const isSelfRoleDemotion = (value: Pick<Selection, 'action' | 'record' | 'nextRole'>) =>
    value.action === 'role' && value.record?.id === user.id && value.nextRole !== 'admin';
  const open = (value: Omit<Selection, 'intent'>) => {
    if (isSelfRoleDemotion(value)) return;
    openSelection({ ...value, intent: crypto.randomUUID() });
  };
  const activeSelection = selection && !isSelfRoleDemotion(selection) ? selection : null;
  return (
    <>
      <LinkButton secondary href="/" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar ao painel
      </LinkButton>
      <PageHeading
        title="Usuários e docentes"
        action={<Button onClick={() => open({ action: 'edit' })}>Cadastrar docente</Button>}
      />
      <div className="mb-6 grid max-w-3xl gap-3 sm:grid-cols-3">
        <Input
          label="Buscar usuário"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Nome ou e-mail"
        />
        <Select
          label="Cargo global"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">Todos os cargos</option>
          <option value="teacher">Professores</option>
          <option value="student">Alunos</option>
          <option value="admin">Administradores</option>
        </Select>
        <Select
          label="Situação"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
        >
          <option value="all">Todas</option>
          <option value="active">Ativas</option>
          <option value="inactive">Inativas</option>
        </Select>
      </div>
      {query.loading ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState message={query.error.message} retry={() => void query.retry()} />
      ) : !visibleItems.length ? (
        <Empty
          title="Nenhum usuário encontrado"
          description="Altere o nome, e-mail, cargo ou situação pesquisada."
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Lista de usuários e cargos"
            tabIndex={0}
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-5">Usuário</th>
                  <th className="p-5">E-mail</th>
                  <th className="p-5">Cargo global</th>
                  <th className="p-5">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleItems.map((item) => {
                  const isSelf = item.id === user.id;
                  return (
                    <tr key={item.id}>
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <Avatar name={item.name} size="sm" />
                          <div className="min-w-40 max-w-xs">
                            <p className="font-semibold [overflow-wrap:anywhere]">
                              {item.name}
                              {isSelf && (
                                <span className="ml-1.5 text-xs font-normal text-slate-500">
                                  (você)
                                </span>
                              )}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <Badge tone={item.active === false ? 'neutral' : 'purple'}>
                                {item.active === false ? 'Conta inativa' : roleLabels[item.role]}
                              </Badge>
                              {item.active !== false && item.emailConfirmedAt === null && (
                                <Badge tone="amber">E-mail não confirmado</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="break-all p-5">{item.email}</td>
                      <td className="min-w-52 p-5">
                        <Select
                          aria-label={`Cargo de ${item.name}`}
                          value={item.role}
                          disabled={item.active === false || isSelf}
                          title={
                            isSelf
                              ? 'Você não pode alterar o próprio cargo de administrador.'
                              : undefined
                          }
                          onChange={(event) => {
                            if (isSelf) return;
                            open({
                              action: 'role',
                              record: item,
                              nextRole: event.target.value as Role
                            });
                          }}
                        >
                          <option value="student">Aluno</option>
                          <option value="teacher">Professor</option>
                          <option value="admin">Administrador</option>
                        </Select>
                      </td>
                      <td className="p-5">
                        {!isSelf && (
                          <div className="flex flex-wrap gap-2">
                            {item.active !== false && (
                              <Button
                                variant="ghost"
                                aria-label={`Editar ${item.name}`}
                                onClick={() => open({ action: 'edit', record: item })}
                              >
                                Editar
                              </Button>
                            )}
                            {item.active !== false && (
                              <Button
                                variant="ghost"
                                aria-label={`Inativar ${item.name}`}
                                onClick={() => open({ action: 'deactivate', record: item })}
                              >
                                Inativar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              className="!text-rose-700 hover:!bg-rose-50"
                              aria-label={`Excluir ${item.name}`}
                              onClick={() => open({ action: 'withdraw', record: item })}
                            >
                              Excluir
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {query.data && query.data.total > query.data.pageSize && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            disabled={page === 1 || query.loading}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-slate-600">
            Página {page} · {countLabel(query.data.total, 'usuário', 'usuários')}
          </span>
          <Button
            variant="secondary"
            disabled={page * query.data.pageSize >= query.data.total || query.loading}
            onClick={() => setPage((value) => value + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
      {activeSelection && (
        <UserDialog
          key={activeSelection.intent}
          selection={activeSelection}
          close={close}
          saved={() => {
            close();
            void query.invalidate();
            void client.refresh();
          }}
        />
      )}
    </>
  );
}
