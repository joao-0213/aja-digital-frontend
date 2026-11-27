'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useSession, useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Check, Dialog, Empty, Input, LinkButton, PageHeading, Select, Skeleton, ErrorState } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useHttpEditor } from '@/hooks/use-http-editor';
import { aggregateAttendanceByStudent, brazilDateTimeLabel } from '@/lib/utils';
import { createAttendanceApi } from '@/features/attendance';
import { createClassesApi } from '@/features/classes';
import { createStudentsApi, type EnrollmentDto } from '../api';
import { BatchEnrollmentDialog } from './batch-enrollment-dialog';

type Selection = { action: 'add' | 'cancel' | 'end'; record?: EnrollmentDto; classId: string; className: string; intent: string };
const labels: Record<string, string> = { active: 'Ativo', pending: 'Pendente', ended: 'Encerrado', cancelled: 'Cancelado' };

function EnrollmentDialog({ selection, close, saved }: { selection: Selection; close: () => void; saved: () => void }) {
  const { client } = useSession();
  const { notify } = useApp();
  const api = useMemo(() => createStudentsApi(client), [client]);
  const state = useHttpEditor<{ email: string }, EnrollmentDto>({ email: selection.record?.email ?? '' }, selection.record?.revision ?? 0, 'students-fields');
  const closeEditor = () => {
    if (state.busy) return;
    state.clear();
    close();
  };
  const submit = async () => {
    const ok = await state.editor.submit(
      (_fields, revision) => api.command(selection.record!.id, selection.action as 'cancel' | 'end', revision, selection.intent),
      selection.record ? () => api.readEnrollment(selection.record!.id) : undefined,
    );
    if (ok) { state.clear(); notify('Situação da matrícula atualizada. Histórico preservado.'); saved(); }
  };
  return <Dialog open onClose={closeEditor} title={selection.action === 'cancel' ? 'Cancelar matrícula pendente?' : 'Encerrar vínculo com a turma?'}><form className="space-y-5" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <p className="text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{selection.record?.email} · {selection.className}. {selection.action === 'cancel' ? 'O cadastro posterior não consumirá esta pendência.' : 'O aluno perde o acesso à turma, inclusive em atividades abertas.'} O histórico será preservado. Não há restauração automática.</p>
    {state.conflicted && <RecordConflict author="Equipe administrativa" updatedAt={state.latest?.updatedAt} onReviewed={state.editor.acknowledge}>{state.latest ? <p>{state.latest.email} · {labels[state.latest.status]} · {state.latest.className ?? selection.className}</p> : <Button variant="secondary" onClick={() => void state.editor.review(() => api.readEnrollment(selection.record!.id))}>Consultar versão atual</Button>}</RecordConflict>}
    {state.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
    {state.blocked && <p className="text-sm text-slate-600">Feche esta janela e atualize a lista para conferir o que foi registrado antes de iniciar outra operação.</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={state.busy} onClick={closeEditor}>Cancelar</Button><Button type="submit" variant="danger" loading={state.busy} disabled={state.conflicted || state.blocked}>Confirmar</Button></div>
  </form></Dialog>;
}

export function StudentsPage() {
  const { client, sessionKey, user, resourceEpoch } = useSession();
  const params = useSearchParams();
  const api = useMemo(() => createStudentsApi(client), [client]);
  const attendanceApi = useMemo(() => createAttendanceApi(client), [client]);
  const classApi = useMemo(() => createClassesApi(client), [client]);
  const requestedClassId = params.get('turma') ?? '';
  const [classSelection, setClassSelection] = useState({ source: requestedClassId, id: requestedClassId });
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [enrollmentPage, setEnrollmentPage] = useState(1);
  const [selection, setSelection] = useState<Selection | null>(() => client.readDraft<Selection>('students-open') ?? null);
  const allowed = !!user && user.role !== 'student';
  const classes = useHttpQuery({ sessionKey, key: `student-class-options:${resourceEpoch}` }, useCallback(signal => classApi.options(signal), [classApi]), allowed);
  const selectedClassId = classSelection.source === requestedClassId ? classSelection.id : requestedClassId;
  const classId = selectedClassId || classes.data?.[0]?.id || '';
  const schoolClass = classes.data?.find(item => item.id === classId);
  const students = useHttpQuery({ sessionKey, key: JSON.stringify(['students', classId, search, history, page, resourceEpoch]) }, useCallback(signal => api.list(classId, search, history, page, signal), [api, classId, search, history, page]), allowed && !!classId);
  const enrollments = useHttpQuery({ sessionKey, key: JSON.stringify(['class-enrollments', classId, search, history, enrollmentPage, resourceEpoch]) }, useCallback(signal => api.enrollments(classId, search, history, enrollmentPage, signal), [api, classId, search, history, enrollmentPage]), user?.role === 'admin' && !!classId);
  const classAttendance = useHttpQuery({ sessionKey, key: JSON.stringify(['class-attendance-summary', classId, resourceEpoch]) }, useCallback(async signal => {
    const subjects = await attendanceApi.subjects(signal);
    const classSubjects = subjects.filter(subject => subject.classId === classId);
    if (!classSubjects.length) return new Map<string, { present: number; total: number }>();
    const lessonsBySubject = await Promise.all(classSubjects.map(subject => attendanceApi.subjectLessons(subject.id, signal)));
    return aggregateAttendanceByStudent(lessonsBySubject.flat());
  }, [attendanceApi, classId]), allowed && !!classId);
  if (!allowed) return <Empty title="Área da equipe pedagógica" description="Seu perfil não permite consultar os alunos de outras contas." action={<LinkButton secondary href="/">Voltar ao painel</LinkButton>} />;
  const visible = students.data?.items ?? [];
  const pending = enrollments.data?.items ?? [];
  const open = (action: Selection['action'], record?: EnrollmentDto) => { const next = { action, record, classId, className: schoolClass?.name ?? record?.className ?? 'Turma indisponível', intent: crypto.randomUUID() }; client.clearDraft('students-fields', sessionKey); client.saveDraft('students-open', next, sessionKey); setSelection(next); };
  const close = () => { client.clearDraft('students-open', sessionKey); setSelection(null); };
  const refreshAll = () => { void students.invalidate(); void enrollments.invalidate(); void classes.invalidate(); void classAttendance.invalidate(); };
  return <>
    <LinkButton secondary href={requestedClassId ? '/turmas' : '/'} className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />{requestedClassId ? 'Voltar às turmas' : 'Voltar ao painel'}</LinkButton>
    <PageHeading title="Alunos" action={user?.role === 'admin' && <Button disabled={!schoolClass?.active || !!classes.error} onClick={() => open('add')}>Adicionar aluno por e-mail</Button>} />
    <div className="mb-6 grid items-center gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,360px)_280px_1fr]"><Input aria-label="Buscar aluno ou matrícula" placeholder="Buscar por nome ou e-mail…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setEnrollmentPage(1); }} /><Select aria-label="Turma" value={classId} onChange={event => { setClassSelection({ source: requestedClassId, id: event.target.value }); setPage(1); setEnrollmentPage(1); }}><option value="">Selecione uma turma</option>{classes.data?.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inativa)'}</option>)}</Select><Check label="Incluir histórico encerrado" checked={history} onChange={value => { setHistory(value); setPage(1); setEnrollmentPage(1); }} /></div>
    {classes.loading ? <Skeleton /> : classes.error ? <ErrorState message={classes.error.message} retry={() => void classes.retry()} /> : !classes.data?.length ? <Empty title="Nenhuma turma disponível" description="As turmas aparecem conforme suas atribuições." /> : !schoolClass ? <Empty title="Turma indisponível neste contexto" /> : students.loading || enrollments.loading ? <Skeleton /> : students.error || enrollments.error ? <ErrorState message={students.error?.message ?? enrollments.error!.message} retry={() => { void students.retry(); void enrollments.retry(); }} /> : <>
      <Card className="!p-0 overflow-hidden"><h2 className="px-5 pt-5 font-semibold">Alunos vinculados — {schoolClass.name}</h2><div className="relative overflow-x-auto" role="region" aria-label="Lista de alunos" tabIndex={0}><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-5">Aluno</th><th className="p-5">Vínculo</th><th className="p-5">Frequência</th><th className="p-5"><span className="sr-only">Ações</span></th></tr></thead><tbody className="divide-y">{visible.map(item => { const record = item.enrollment; const attendanceSummary = item.attendance?.total ? item.attendance : classAttendance.data?.get(item.id); return <tr key={item.id}><td className="p-5"><div className="flex items-center gap-3"><Avatar name={item.name} /><div className="max-w-xs"><p className="font-semibold [overflow-wrap:anywhere]">{item.name}</p><p className="mt-1 break-all text-xs text-slate-500">{item.email}</p></div></div></td><td className="p-5"><Badge tone={record?.status === 'ended' ? 'neutral' : 'green'}>{record ? labels[record.status] : 'Histórico'}</Badge><p className="mt-2 text-xs text-slate-500">{record?.legacy ? 'Matrícula anterior — data não registrada' : record?.enrolledAt ? brazilDateTimeLabel(record.enrolledAt) : 'Data não registrada'}</p></td><td className="p-5">{attendanceSummary?.total ? `${Math.round(attendanceSummary.present / attendanceSummary.total * 100)}% (${attendanceSummary.present}/${attendanceSummary.total})` : classAttendance.loading ? 'Carregando…' : 'Sem registro'}</td><td className="p-5"><div className="flex flex-wrap items-center gap-2"><Link className="inline-flex min-h-11 items-center whitespace-nowrap font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900" href={`/alunos/perfil?id=${encodeURIComponent(item.id)}`}>Ver perfil</Link>{user?.role === 'admin' && record?.status === 'active' && <Button variant="ghost" onClick={() => open('end', record)}>Encerrar vínculo</Button>}</div></td></tr>; })}</tbody></table></div>{!visible.length && <Empty title="Nenhum aluno encontrado" description="Altere os filtros. Matrículas pendentes ainda não são participantes ativos." />}</Card>
      {students.data && students.data.total > students.data.pageSize && <div className="mt-4 flex items-center justify-between gap-3"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-sm">Página {page}</span><Button variant="secondary" disabled={page * students.data.pageSize >= students.data.total} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
      {user?.role === 'admin' && <Card className="mt-6"><h2 className="font-semibold">Matrículas pendentes{history && ' e canceladas'}</h2><p className="mt-1 text-xs text-slate-500">Aguardam confirmação de cadastro.</p><ul className="mt-4 divide-y">{pending.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="break-all text-sm font-medium">{item.email}</p><p className="mt-1 text-xs text-slate-500">{labels[item.status]} · {brazilDateTimeLabel(item.createdAt)}</p></div>{item.status === 'pending' && <Button variant="secondary" onClick={() => open('cancel', item)}>Cancelar pendência</Button>}</li>)}</ul>{!pending.length && <p className="py-5 text-sm text-slate-500">Nenhuma matrícula pendente.</p>}</Card>}
      {enrollments.data && enrollments.data.total > enrollments.data.pageSize && <div className="mt-4 flex items-center justify-between gap-3"><Button variant="secondary" disabled={enrollmentPage === 1} onClick={() => setEnrollmentPage(value => value - 1)}>Vínculos anteriores</Button><span className="text-sm">Lote de vínculos {enrollmentPage}</span><Button variant="secondary" disabled={enrollmentPage * enrollments.data.pageSize >= enrollments.data.total} onClick={() => setEnrollmentPage(value => value + 1)}>Mais vínculos</Button></div>}
    </>}
    {selection && (selection.action === 'add'
      ? <BatchEnrollmentDialog
        key={selection.intent}
        classId={selection.classId}
        className={selection.className}
        initialIntent={selection.intent}
        close={close}
        onRefresh={refreshAll}
        saved={() => { close(); refreshAll(); }}
      />
      : <EnrollmentDialog key={selection.intent} selection={selection} close={close} saved={() => { close(); refreshAll(); }} />)}
  </>;
}
