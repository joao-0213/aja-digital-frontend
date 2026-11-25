'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, ListChecks, MessageSquare, Pencil, Plus } from 'lucide-react';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useSession } from '@/providers/app-context';
import { Button, Empty, ErrorState, LinkButton, Skeleton } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { HttpError } from '@/lib/http-client';
import { countLabel } from '@/lib/utils';
import type { TrailModule } from '@/models';
import { createSubjectsApi, type SubjectDetail } from '../api';
import { moduleOrderCommand } from '../lib/module-order';
import { useSubjectVisit } from '../hooks/use-subject-updates';
import { ModuleEditor, type ModuleSelection } from './module-editor';
import { createMaterialsApi, ModuleMaterials } from '@/features/materials';
import { AssessmentSummaries, createAssessmentsApi } from '@/features/assessments';
import { SubjectWall } from './subject-wall';

function SubjectContent({ id, materialsView }: { id: string; materialsView: boolean }) {
  const { client, sessionKey, resourceEpoch, user } = useSession();
  const api = useMemo(() => createSubjectsApi(client), [client]);
  const query = useHttpQuery({ sessionKey, key: `subject:${id}:${resourceEpoch}` }, useCallback(signal => api.read(id, signal), [api, id]), !!id);
  const materialsApi = useMemo(() => createMaterialsApi(client), [client]);
  const subjectMaterials = useHttpQuery({ sessionKey, key: `subject-materials:${id}:${resourceEpoch}` }, useCallback(signal => materialsApi.all({ subjectId: id }, signal), [materialsApi, id]), !!id && materialsView);
  const assessmentsApi = useMemo(() => createAssessmentsApi(client), [client]);
  const activities = useHttpQuery({ sessionKey, key: `subject-assessments:${id}:${resourceEpoch}` }, useCallback(signal => assessmentsApi.all({ subjectId: id }, signal, sessionKey), [assessmentsApi, id, sessionKey]), !!id && materialsView);
  const attempts = useHttpQuery({ sessionKey, key: `subject-attempts:${id}:${resourceEpoch}` }, useCallback(signal => assessmentsApi.allAttempts({}, signal, sessionKey), [assessmentsApi, sessionKey]), !!id && materialsView);
  const submissions = useHttpQuery({ sessionKey, key: `subject-submissions:${id}:${resourceEpoch}` }, useCallback(signal => assessmentsApi.allSubmissions({}, signal, sessionKey), [assessmentsApi, sessionKey]), !!id && materialsView);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [selection, setSelection] = useState<ModuleSelection | null>(() => client.readDraft<ModuleSelection>(`module-open:${id}`) ?? null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderError, setReorderError] = useState('');
  const [reorderConflict, setReorderConflict] = useState(false);
  const [latestOrder, setLatestOrder] = useState<SubjectDetail | null>(null);
  const [acknowledgedOrder, setAcknowledgedOrder] = useState<{ source: SubjectDetail; view: SubjectDetail } | null>(null);
  const data = query.data && acknowledgedOrder?.source === query.data ? acknowledgedOrder.view : query.data;
  const visit = useSubjectVisit(data?.subject);
  if (!id) return <Empty title="Selecione uma disciplina" action={<LinkButton href="/disciplinas">Ver disciplinas</LinkButton>} />;
  if (query.loading) return <Skeleton />;
  if (query.error) return <><ErrorState message={query.error.message} retry={() => void query.retry()} /><LinkButton href="/disciplinas">Ver disciplinas</LinkButton></>;
  if (!data) return <Empty title="Disciplina indisponível" action={<LinkButton href="/disciplinas">Ver disciplinas</LinkButton>} />;
  const { subject, modules, projections } = data;
  const canEdit = subject.canManageContent;
  const openModule = (record?: TrailModule) => { const next = { record, intent: crypto.randomUUID() }; client.clearDraft(`module-fields:${id}`, sessionKey); client.saveDraft(`module-open:${id}`, next, sessionKey); setSelection(next); };
  const close = () => { client.clearDraft(`module-open:${id}`, sessionKey); setSelection(null); };
  const inspectOrder = async () => {
    try { setLatestOrder(await api.read(id)); }
    catch (cause: unknown) { setReorderError(cause instanceof Error ? cause.message : 'Não foi possível consultar a ordem atual.'); }
  };
  const move = async (moduleId: string, direction: -1 | 1) => {
    if (reorderBusy || reorderConflict || !canEdit) return;
    const command = moduleOrderCommand(subject.revision ?? 1, modules, moduleId, direction);
    if (!command) return;
    setReorderBusy(true); setReorderError('');
    try {
      await api.reorderModules(id, command);
      // The command response may be paged; only the full detail can replace this set.
      await query.invalidate();
    } catch (cause: unknown) {
      setReorderError(cause instanceof Error ? cause.message : 'Não foi possível alterar a ordem. O conjunto anterior foi mantido.');
      if (cause instanceof HttpError && cause.kind === 'conflict') { setReorderConflict(true); await inspectOrder(); }
    } finally { setReorderBusy(false); }
  };
  const subjectQuery = encodeURIComponent(id);
  return <>
    <LinkButton secondary href="/disciplinas" className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar às disciplinas</LinkButton>
    <header className="course-banner mb-6 rounded-xl border border-slate-200 p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="mb-2 text-xs font-semibold tracking-wide text-brand-700 [overflow-wrap:anywhere]">{subject.className} · Apoio às aulas presenciais</p><h1 className="text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">{subject.name}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{subject.description}</p></div>{canEdit && materialsView && <Button variant={editing ? 'primary' : 'secondary'} aria-pressed={editing} onClick={() => setEditing(!editing)}><Pencil aria-hidden="true" className="size-4" />{editing ? 'Concluir organização' : 'Organizar módulos'}</Button>}</div><div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm"><span className="text-slate-500">Equipe docente: <span className="text-slate-700">{subject.teachers.map(teacher => teacher.name).join(', ') || 'Sem docentes atribuídos'}</span></span><Link href={`/forum?disciplina=${subjectQuery}`} className="inline-flex min-h-11 items-center gap-2 font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"><MessageSquare aria-hidden="true" className="size-4" />Dúvidas da turma</Link>{canEdit && <Link href={`/frequencia?disciplina=${subjectQuery}`} className="inline-flex min-h-11 items-center gap-2 font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"><ListChecks aria-hidden="true" className="size-4" />Fazer chamada</Link>}</div></header>
    {visit.error && <div role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><p>Sua visita não foi registrada. As novidades foram mantidas. {visit.error.message}</p><Button variant="secondary" onClick={() => void visit.retry()}>Tentar registrar visita novamente</Button></div>}
    {visit.hasUpdates && <p className="mb-4 text-sm text-brand-700">Há publicações novas nesta disciplina.</p>}
    <nav aria-label="Seções da disciplina" className="mb-6 flex gap-6 border-b border-slate-200">{[{ label: 'Mural', href: `/disciplinas/detalhes?id=${subjectQuery}`, active: !materialsView }, { label: 'Materiais e atividades', href: `/disciplinas/detalhes?id=${subjectQuery}&aba=materiais`, active: materialsView }].map(tab => <Link key={tab.label} href={tab.href} aria-current={tab.active ? 'page' : undefined} className={`min-h-12 border-b-2 px-1 py-3 text-sm font-semibold ${tab.active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{tab.label}</Link>)}</nav>
    {!materialsView ? <SubjectWall subject={subject} /> : <div className="grid items-start gap-6 xl:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="xl:sticky xl:top-6"><ResponsiveDisclosure title="Nesta disciplina"><nav aria-label="Índice de módulos" className="flex flex-wrap gap-2 xl:flex-col">{modules.map((mod, index) => <a key={mod.id} href={`#module-${mod.id}`} onClick={() => setCollapsed(current => current.filter(value => value !== mod.id))} className="flex min-h-11 items-start gap-3 rounded-lg px-3 py-3 text-sm leading-5 text-slate-600 [overflow-wrap:anywhere] hover:bg-brand-50 hover:text-brand-700"><span className="font-semibold tabular-nums text-brand-600">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0">{mod.title}</span></a>)}</nav>{canEdit && <Button variant="ghost" className="mt-3" onClick={() => openModule()}><Plus aria-hidden="true" className="size-4" />Novo módulo</Button>}</ResponsiveDisclosure></aside>
      <div className="min-w-0 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Materiais e atividades</h2><p className="mt-1 text-xs text-slate-500">{countLabel(subjectMaterials.data ? subjectMaterials.data.length : projections.materials.count, 'material', 'materiais')} · {countLabel(activities.data ? activities.data.length : projections.assessments.count, 'atividade', 'atividades')}</p></div><Button variant="ghost" onClick={() => setCollapsed(collapsed.length ? [] : modules.map(mod => mod.id))}>{collapsed.length ? 'Expandir módulos' : 'Recolher módulos'}</Button></div>
        {reorderError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{reorderError}</p>}
        {reorderConflict && <RecordConflict author="Equipe docente" updatedAt={latestOrder?.subject.updatedAt} onReviewed={() => { if (!latestOrder || !query.data) return; setAcknowledgedOrder({ source: query.data, view: latestOrder }); setReorderConflict(false); setReorderError(''); setLatestOrder(null); }}><p>A ordem anterior foi mantida. Confira a sequência atual antes de fazer um novo movimento.</p>{latestOrder ? <ol className="list-inside list-decimal">{latestOrder.modules.map(mod => <li key={mod.id}>{mod.title}</li>)}</ol> : <Button variant="secondary" onClick={() => void inspectOrder()}>Consultar ordem atual</Button>}</RecordConflict>}
        {modules.map((mod, index) => { const open = !collapsed.includes(mod.id); return <section id={`module-${mod.id}`} key={mod.id} className="module-section overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center gap-2 bg-slate-50/70 p-4 sm:px-5"><h3 className="min-w-0 flex-1"><button type="button" aria-expanded={open} aria-controls={`content-${mod.id}`} className="flex w-full items-center gap-3 text-left" onClick={() => setCollapsed(current => open ? [...current, mod.id] : current.filter(value => value !== mod.id))}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-sm font-semibold text-brand-700">{index + 1}</span><span className="min-w-0 flex-1 font-semibold text-slate-900 [overflow-wrap:anywhere]">{mod.title}</span><ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} /></button></h3>{canEdit && editing && <div className="flex items-center"><Button variant="ghost" aria-label={`Editar módulo ${mod.title}`} onClick={() => openModule(mod)}><Pencil aria-hidden="true" className="size-4" /></Button><Button variant="ghost" disabled={index === 0 || reorderBusy || reorderConflict} aria-label={`Mover ${mod.title} para cima`} onClick={() => void move(mod.id, -1)}><ChevronUp aria-hidden="true" className="size-4" /></Button><Button variant="ghost" disabled={index === modules.length - 1 || reorderBusy || reorderConflict} aria-label={`Mover ${mod.title} para baixo`} onClick={() => void move(mod.id, 1)}><ChevronDown aria-hidden="true" className="size-4" /></Button></div>}</div><div id={`content-${mod.id}`} hidden={!open}>{mod.description && <p className="px-5 pt-4 text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{mod.description}</p>}<ModuleMaterials module={mod} canEdit={canEdit} editing={editing} onChanged={() => { void query.invalidate(); void subjectMaterials.invalidate(); }} /><AssessmentSummaries module={mod} items={activities.data ?? []} attempts={attempts.data ?? []} submissions={submissions.data ?? []} canManage={canEdit} studentId={user?.role === 'student' ? user.id : undefined} loading={activities.loading} error={activities.error} retry={() => void activities.retry()} attemptsLoading={attempts.loading} attemptsError={attempts.error} retryAttempts={() => void attempts.retry()} submissionsLoading={submissions.loading} submissionsError={submissions.error} retrySubmissions={() => void submissions.retry()} /></div></section>; })}
        {!modules.length && <Empty title="Nenhum módulo cadastrado" description={canEdit ? 'Crie o primeiro módulo para organizar os conteúdos das aulas.' : 'Os módulos serão exibidos após a publicação pelo professor.'} action={canEdit && <Button onClick={() => openModule()}>Criar primeiro módulo</Button>} />}
      </div>
    </div>}
    {selection && canEdit && <ModuleEditor key={selection.intent} subjectId={id} selection={selection} close={close} saved={() => { close(); void query.invalidate(); }} />}
  </>;
}

export function SubjectDetails() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  return <SubjectContent key={id} id={id} materialsView={params.get('aba') === 'materiais'} />;
}
