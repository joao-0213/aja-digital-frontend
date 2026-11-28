'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  LinkButton,
  PageHeading,
  Pagination,
  Select,
  Skeleton,
  ErrorState
} from '@/components/ui';
import { countLabel } from '@/lib/utils';
import { roleLabels } from '@/lib/labels';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useEditableDialogSelection } from '@/hooks/use-editable-dialog-selection';
import type { User, Role } from '@/models';
import { userKeys, useUsersApi } from '../hooks/use-users';
import { UserDialog, type UserSelection } from './user-dialog';

type UserSelectionInput =
  | { action: 'edit'; record?: User }
  | { action: 'role'; record: User; nextRole: Role }
  | { action: 'deactivate' | 'withdraw'; record: User };

export function UsersPage() {
  const { client, sessionKey, user } = useSession();
  const api = useUsersApi();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const {
    selection,
    open: openSelection,
    close
  } = useEditableDialogSelection<UserSelection>('users-open', 'users-fields');
  const query = useHttpQuery(
    { sessionKey, key: userKeys.list(search, filter, false, page) },
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
  const isSelfRoleDemotion = (value: UserSelection | UserSelectionInput) =>
    value.action === 'role' && value.record.id === user.id && value.nextRole !== 'admin';
  const open = (value: UserSelectionInput) => {
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
        <Card padding="none" className="overflow-hidden">
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
                              variant="danger-ghost"
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
      {query.data && (
        <Pagination
          className="mt-5"
          page={page}
          totalPages={Math.ceil(query.data.total / query.data.pageSize)}
          onPageChange={setPage}
        />
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
