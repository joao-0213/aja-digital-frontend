'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, MessageSquare, Plus } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useUrlFilterParam } from '@/hooks/use-url-filter-param';
import { Avatar, Badge, Button, Empty, LinkButton, PageHeading } from '@/components/ui';
import { countLabel, dateLabel } from '@/lib/utils';
import { ForumComposerDialog } from './forum-composer';
import { ForumFilters } from './forum-filters';
import { forumKeys, useForumApi } from '../hooks/use-forum';
import type { ForumFilter } from '../api';

export function ForumPage() {
  const { user } = useSession();
  const params = useSearchParams();
  const context = params.get('material')
    ? `material:${params.get('material')}`
    : params.get('questao')
      ? `question:${params.get('questao')}`
      : 'new';
  return <ForumPageContent key={`${user?.id ?? ''}:${context}`} />;
}

function ForumPageContent() {
  const { client, sessionKey, user } = useSession();
  const params = useSearchParams();
  const api = useForumApi();
  const options = useHttpQuery(
    { sessionKey, key: forumKeys.options },
    useCallback((signal) => api.options(signal), [api]),
    !!user
  );
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useUrlFilterParam(params.get('disciplina') ?? 'all');
  const [classId, setClassId] = useState('all');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(!!params.get('questao') || !!params.get('material'));
  const materialId = params.get('material');
  const questionId = params.get('questao');
  const requestedSubject = params.get('disciplina');
  const filters = useMemo<ForumFilter>(
    () => ({
      ...(classId !== 'all' ? { classId } : {}),
      ...(subjectId !== 'all' ? { subjectId } : {}),
      ...(search.trim() ? { q: search.trim() } : {}),
      ...(filter === 'unread' ? { unread: true } : {}),
      ...(filter === 'solved' ? { solved: true } : {}),
      sort: '-createdAt'
    }),
    [classId, subjectId, search, filter]
  );
  const topics = useHttpQuery(
    { sessionKey, key: ['forum', 'topics', filters] },
    useCallback((signal) => api.all(filters, signal), [api, filters]),
    { enabled: !!user, keepPreviousData: true }
  );
  const activeSubjects = useMemo(
    () =>
      (options.data?.subjects ?? []).filter((item) =>
        options.data?.classes.some((row) => row.id === item.classId && row.active)
      ),
    [options.data]
  );
  const activeClasses = options.data?.classes ?? [];
  const visibleSubjects = options.data?.subjects ?? [];
  const composerSubjects = useMemo(
    () =>
      activeSubjects
        .filter((item) => classId === 'all' || item.classId === classId)
        .map((item) => ({
          id: item.id,
          name: item.name,
          classId: item.classId,
          className: activeClasses.find((row) => row.id === item.classId)?.name
        })),
    [activeSubjects, activeClasses, classId]
  );
  const initialContext = useMemo(
    () => ({
      materialId,
      questionId,
      subjectId: requestedSubject ?? activeSubjects[0]?.id ?? ''
    }),
    [materialId, questionId, requestedSubject, activeSubjects]
  );
  const canPublish =
    !!user && activeSubjects.some((item) => classId === 'all' || item.classId === classId);
  const handleClose = useCallback(() => setOpen(false), []);
  const handlePublished = useCallback(() => {
    setOpen(false);
    void client.invalidateQueries(['forum']);
  }, [client]);

  const backHref = materialId
    ? `/materiais?id=${encodeURIComponent(materialId)}`
    : requestedSubject
      ? `/disciplinas/detalhes?id=${encodeURIComponent(requestedSubject)}`
      : '/';
  const backLabel = materialId
    ? 'Voltar ao material'
    : requestedSubject
      ? 'Voltar à disciplina'
      : 'Voltar ao painel';

  return (
    <>
      <LinkButton secondary href={backHref} className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {backLabel}
      </LinkButton>
      <PageHeading
        title="Fórum de dúvidas"
        action={
          <Button onClick={() => setOpen(true)} disabled={!canPublish}>
            <Plus aria-hidden="true" className="size-4" />
            Nova pergunta
          </Button>
        }
      />
      {options.error && (
        <p role="alert" className="mb-4 text-sm text-rose-700">
          {options.error.message}{' '}
          <button
            type="button"
            onClick={options.retry}
            className="font-bold underline underline-offset-4"
          >
            Tentar novamente
          </button>
        </p>
      )}
      <ForumFilters
        search={search}
        onSearchChange={setSearch}
        classId={classId}
        onClassChange={setClassId}
        subjectId={subjectId}
        onSubjectChange={setSubjectId}
        filter={filter}
        onFilterChange={setFilter}
        classes={activeClasses}
        subjects={visibleSubjects}
      />
      <div className="space-y-3">
        {topics.loading && (
          <p role="status" className="text-sm text-slate-500">
            Carregando perguntas…
          </p>
        )}
        {topics.error && (
          <p role="alert" className="text-sm text-rose-700">
            {topics.error.message}{' '}
            <button
              type="button"
              onClick={topics.retry}
              className="font-bold underline underline-offset-4"
            >
              Tentar novamente
            </button>
          </p>
        )}
        {(topics.data ?? [])
          .filter((topic) => filter !== 'unanswered' || topic.replies.length === 0)
          .map((topic) => {
            const solved = topic.replies.some((reply) => reply.accepted);
            return (
              <Link
                key={topic.id}
                href={`/forum/topico?id=${encodeURIComponent(topic.id)}`}
                className="block min-w-0 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-200 sm:p-6"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge>
                    {activeSubjects.find((item) => item.id === topic.subjectId)?.name ??
                      topic.subjectId}
                  </Badge>
                  <span className="text-xs text-slate-400">{dateLabel(topic.createdAt)}</span>
                  {solved && (
                    <Badge tone="green">
                      <CheckCircle2 aria-hidden="true" className="size-3" />
                      Resolvida
                    </Badge>
                  )}
                  {!topic.read && <Badge tone="purple">Nova</Badge>}
                </div>
                <h2 className="text-lg font-semibold text-slate-800 [overflow-wrap:anywhere]">
                  {topic.title}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
                  {topic.body}
                </p>
                {topic.target && (
                  <p className="mt-3 text-xs text-brand-700">
                    Referência:{' '}
                    {topic.target.type === 'material'
                      ? 'Material da disciplina'
                      : 'Questão do banco'}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Avatar name={topic.author.name} size="sm" />
                  <span className="text-xs text-slate-500 [overflow-wrap:anywhere]">
                    {topic.author.name}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-400">
                    <MessageSquare aria-hidden="true" className="size-4" />
                    {countLabel(topic.replies.length, 'resposta', 'respostas')}
                  </span>
                </div>
              </Link>
            );
          })}
      </div>
      {!topics.loading &&
        !topics.error &&
        !(topics.data ?? []).some(
          (topic) => filter !== 'unanswered' || topic.replies.length === 0
        ) && (
          <Empty
            title="Sem perguntas nesta seleção"
            description="As dúvidas publicadas aparecerão aqui."
          />
        )}
      <ForumComposerDialog
        open={open}
        onClose={handleClose}
        initialContext={initialContext}
        subjects={composerSubjects}
        onPublished={handlePublished}
      />
    </>
  );
}
