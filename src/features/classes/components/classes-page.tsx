'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import {
  Badge,
  Button,
  Check,
  Empty,
  Input,
  LinkButton,
  PageHeading,
  Skeleton,
  ErrorState
} from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useEditableDialogSelection } from '@/hooks/use-editable-dialog-selection';
import { countLabel } from '@/lib/utils';
import type { SchoolClass } from '@/models';
import { classKeys, useClassesApi } from '../hooks/use-classes';
import { ClassDialog, type ClassSelection } from './class-dialog';

export function ClassesPage() {
  const { sessionKey, user } = useSession();
  const api = useClassesApi();
  const [search, setSearch] = useState('');
  const [inactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const {
    selection,
    open: openSelection,
    close
  } = useEditableDialogSelection<ClassSelection>('classes-open', 'classes-fields');
  const query = useHttpQuery(
    { sessionKey, key: classKeys.list(search, inactive, page) },
    useCallback(
      (signal) => api.list(search, inactive, page, signal),
      [api, search, inactive, page]
    ),
    { enabled: user?.role === 'admin', keepPreviousData: true }
  );
  if (user?.role !== 'admin')
    return (
      <Empty
        title="Área de gestão"
        description="Seu perfil não permite gerenciar turmas."
        action={
          <LinkButton secondary href="/">
            Voltar ao painel
          </LinkButton>
        }
      />
    );
  const openEdit = (record?: SchoolClass) => {
    openSelection({ action: 'edit', record, intent: crypto.randomUUID() });
  };
  const openCommand = (action: 'close' | 'reopen', record: SchoolClass) => {
    openSelection({ action, record, intent: crypto.randomUUID() });
  };
  return (
    <>
      <LinkButton secondary href="/" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar ao painel
      </LinkButton>
      <PageHeading title="Turmas" action={<Button onClick={() => openEdit()}>Nova turma</Button>} />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-80">
          <Input
            aria-label="Buscar turmas"
            placeholder="Buscar por nome ou código…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Check
          label="Mostrar turmas inativas"
          checked={inactive}
          onChange={(value) => {
            setInactive(value);
            setPage(1);
          }}
        />
      </div>
      {query.loading ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState message={query.error.message} retry={() => void query.retry()} />
      ) : !query.data?.items.length ? (
        <Empty
          title="Nenhuma turma encontrada"
          description="Tente outro nome ou inclua as turmas inativas."
        />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {query.data.items.map((item) => (
            <article
              key={item.id}
              className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 lg:flex-row lg:items-center lg:gap-6"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-semibold text-slate-900 [overflow-wrap:anywhere]">
                    {item.name}
                  </h2>
                  <Badge tone={item.active ? 'green' : 'neutral'}>
                    {item.active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500 [overflow-wrap:anywhere]">
                  {item.code} · {item.year} · {item.shift} ·{' '}
                  {countLabel(item.studentIds.length, 'aluno matriculado', 'alunos matriculados')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <LinkButton secondary href={`/disciplinas?turma=${encodeURIComponent(item.id)}`}>
                  Disciplinas
                </LinkButton>
                <LinkButton secondary href={`/alunos?turma=${encodeURIComponent(item.id)}`}>
                  Matrículas
                </LinkButton>
                <Button
                  variant="ghost"
                  aria-label={`Editar ${item.name}`}
                  onClick={() => openEdit(item)}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  className={item.active ? '!text-rose-700 hover:!bg-rose-50' : undefined}
                  aria-label={`${item.active ? 'Inativar' : 'Reativar'} ${item.name}`}
                  onClick={() => openCommand(item.active ? 'close' : 'reopen', item)}
                >
                  {item.active ? 'Inativar' : 'Reativar'}
                </Button>
              </div>
            </article>
          ))}
        </div>
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
            Página {page} · {countLabel(query.data.total, 'turma', 'turmas')}
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
      {selection && (
        <ClassDialog
          key={selection.intent}
          selection={selection}
          close={close}
          saved={() => {
            close();
            void query.invalidate();
          }}
        />
      )}
    </>
  );
}
