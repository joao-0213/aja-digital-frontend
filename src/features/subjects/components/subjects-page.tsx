'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import {
  Button,
  Check,
  Empty,
  ErrorState,
  Input,
  LinkButton,
  PageHeading,
  Select,
  Skeleton
} from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useEditableDialogSelection } from '@/hooks/use-editable-dialog-selection';
import { useUrlFilterParam } from '@/hooks/use-url-filter-param';
import { countLabel } from '@/lib/utils';
import { useClassesApi } from '@/features/classes';
import type { SubjectSummary } from '../api';
import { subjectKeys, useSubjectsApi } from '../hooks/use-subjects';
import { SubjectCard } from './subject-card';
import { SubjectEditor, type SubjectSelection } from './subject-editor';

export function SubjectsPage() {
  const { user, sessionKey } = useSession();
  const params = useSearchParams();
  const requestedClass = params.get('turma') ?? 'all';
  const [classId, setClassId] = useUrlFilterParam(requestedClass);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const {
    selection,
    open: openSelection,
    close
  } = useEditableDialogSelection<SubjectSelection>('subjects-open', 'subjects-fields');
  const api = useSubjectsApi();
  const classApi = useClassesApi();
  const query = useHttpQuery(
    { sessionKey, key: subjectKeys.list(classId, search, page) },
    useCallback((signal) => api.list(search, classId, page, signal), [api, search, classId, page]),
    { keepPreviousData: true }
  );
  const classes = useHttpQuery(
    { sessionKey, key: subjectKeys.classOptions },
    useCallback((signal) => classApi.options(signal), [classApi])
  );
  const canAdmin = user?.role === 'admin';
  const activeClasses = classes.data?.filter((item) => item.active) ?? [];
  const inactiveClassIds = new Set(
    (classes.data ?? []).filter((item) => !item.active).map((item) => item.id)
  );
  const hasArchivedSubjects = (query.data?.items ?? []).some((subject) =>
    inactiveClassIds.has(subject.classId)
  );
  const visibleSubjects = (query.data?.items ?? []).filter(
    (subject) => showArchived || classId !== 'all' || !inactiveClassIds.has(subject.classId)
  );
  const openEditor = (record?: SubjectSummary) => {
    openSelection({
      record,
      targetClass:
        record?.classId ??
        (classId !== 'all' && activeClasses.some((item) => item.id === classId)
          ? classId
          : (activeClasses[0]?.id ?? '')),
      intent: crypto.randomUUID()
    });
  };
  const fromClass = requestedClass !== 'all';
  return (
    <>
      <LinkButton secondary href={fromClass ? '/turmas' : '/'} className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {fromClass ? 'Voltar às turmas' : 'Voltar ao painel'}
      </LinkButton>
      <PageHeading
        title={user?.role === 'student' ? 'Minhas disciplinas' : 'Disciplinas'}
        action={
          canAdmin && (
            <Button
              disabled={!activeClasses.length || classes.loading || !!classes.error}
              onClick={() => openEditor()}
            >
              <Plus aria-hidden="true" className="size-4" />
              Nova disciplina
            </Button>
          )
        }
      />
      {canAdmin && !classes.loading && !classes.error && !activeClasses.length && (
        <p className="mb-5 text-sm text-slate-500">
          Cadastre ou ative uma turma para criar disciplinas.
        </p>
      )}
      <div className="mb-7 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72">
          <Input
            label="Buscar disciplina"
            placeholder="Nome da disciplina"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full sm:w-72">
          <Select
            label="Turma"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todas as turmas</option>
            {classes.data?.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
                {item.active ? '' : ' (encerrada)'}
              </option>
            ))}
          </Select>
        </div>
        {classId === 'all' && (hasArchivedSubjects || showArchived) && (
          <div className="pb-1">
            <Check
              label="Mostrar turmas encerradas"
              checked={showArchived}
              onChange={setShowArchived}
            />
          </div>
        )}
      </div>
      {classes.error && (
        <div className="mb-5">
          <ErrorState message={classes.error.message} retry={() => void classes.retry()} />
        </div>
      )}
      {query.loading ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState message={query.error.message} retry={() => void query.retry()} />
      ) : !visibleSubjects.length ? (
        <Empty
          title="Nenhuma disciplina encontrada"
          description={
            hasArchivedSubjects && !showArchived
              ? 'Ative "Mostrar turmas encerradas" para consultar o acervo anterior.'
              : user?.role === 'admin'
                ? 'Altere os filtros ou cadastre uma nova disciplina.'
                : user?.role === 'teacher'
                  ? 'Altere os filtros ou aguarde uma atribuição administrativa.'
                  : 'Altere os filtros ou aguarde sua matrícula em uma turma.'
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleSubjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              archived={inactiveClassIds.has(subject.classId)}
              onEdit={canAdmin && subject.canManageContent ? () => openEditor(subject) : undefined}
            />
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
            Página {page} · {countLabel(query.data.total, 'disciplina', 'disciplinas')}
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
      {selection && canAdmin && (
        <SubjectEditor
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
