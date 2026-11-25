'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import { Button, Empty, ErrorState, Input, LinkButton, PageHeading, Select, Skeleton } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { countLabel } from '@/lib/utils';
import { createClassesApi } from '@/features/classes';
import { createSubjectsApi, type SubjectSummary } from '../api';
import { SubjectCard } from './subject-card';
import { SubjectEditor, type SubjectSelection } from './subject-editor';

export function SubjectsPage() {
  const { client, user, sessionKey, resourceEpoch } = useSession();
  const params = useSearchParams();
  const requestedClass = params.get('turma') ?? 'all';
  const [filter, setFilter] = useState({ source: requestedClass, value: requestedClass });
  const classId = filter.source === requestedClass ? filter.value : requestedClass;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<SubjectSelection | null>(() => client.readDraft<SubjectSelection>('subjects-open') ?? null);
  const api = useMemo(() => createSubjectsApi(client), [client]);
  const classApi = useMemo(() => createClassesApi(client), [client]);
  const query = useHttpQuery({ sessionKey, key: JSON.stringify(['subjects', classId, search, page, resourceEpoch]) }, useCallback(signal => api.list(search, classId, page, signal), [api, search, classId, page]));
  const classes = useHttpQuery({ sessionKey, key: `subject-class-options:${resourceEpoch}` }, useCallback(signal => classApi.options(signal), [classApi]));
  const canAdmin = user?.role === 'admin';
  const activeClasses = classes.data?.filter(item => item.active) ?? [];
  const openEditor = (record?: SubjectSummary) => { const next = { record, targetClass: record?.classId ?? (classId !== 'all' && activeClasses.some(item => item.id === classId) ? classId : activeClasses[0]?.id ?? ''), intent: crypto.randomUUID() }; client.clearDraft('subjects-fields', sessionKey); client.saveDraft('subjects-open', next, sessionKey); setSelection(next); };
  const close = () => { client.clearDraft('subjects-open', sessionKey); setSelection(null); };
  const fromClass = requestedClass !== 'all';
  return <>
    <LinkButton secondary href={fromClass ? '/turmas' : '/'} className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />{fromClass ? 'Voltar às turmas' : 'Voltar ao painel'}</LinkButton>
    <PageHeading title={user?.role === 'student' ? 'Minhas disciplinas' : 'Disciplinas'} description="Acesse os materiais e atividades de cada disciplina." action={canAdmin && <Button disabled={!activeClasses.length || classes.loading || !!classes.error} onClick={() => openEditor()}><Plus aria-hidden="true" className="size-4" />Nova disciplina</Button>} />
    {canAdmin && !classes.loading && !classes.error && !activeClasses.length && <p className="mb-5 text-sm text-slate-500">Cadastre ou ative uma turma para criar disciplinas.</p>}
    <div className="mb-7 grid max-w-2xl gap-3 sm:grid-cols-2"><Input label="Buscar disciplina" placeholder="Nome da disciplina" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><Select label="Turma" value={classId} onChange={event => { setFilter({ source: requestedClass, value: event.target.value }); setPage(1); }}><option value="all">Todas as turmas</option>{classes.data?.map(item => <option value={item.id} key={item.id}>{item.name}{item.active ? '' : ' (inativa)'}</option>)}</Select></div>
    {classes.error && <div className="mb-5"><ErrorState message={classes.error.message} retry={() => void classes.retry()} /></div>}
    {query.loading ? <Skeleton /> : query.error ? <ErrorState message={query.error.message} retry={() => void query.retry()} /> : !query.data?.items.length ? <Empty title="Nenhuma disciplina encontrada" description={user?.role === 'teacher' ? 'Altere os filtros ou aguarde uma atribuição administrativa.' : 'Altere os filtros ou aguarde sua matrícula em uma turma.'} /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{query.data.items.map(subject => <SubjectCard key={subject.id} subject={subject} onEdit={canAdmin && subject.canManageContent ? () => openEditor(subject) : undefined} />)}</div>}
    <div className="mt-5 flex items-center justify-between gap-3"><Button variant="secondary" disabled={page === 1 || query.loading} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-sm text-slate-600">Página {page}{query.data && ` · ${countLabel(query.data.total, 'disciplina', 'disciplinas')}`}</span><Button variant="secondary" disabled={!query.data || page * query.data.pageSize >= query.data.total || query.loading} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>
    {selection && canAdmin && <SubjectEditor key={selection.intent} selection={selection} close={close} saved={() => { close(); void query.invalidate(); }} />}
  </>;
}
