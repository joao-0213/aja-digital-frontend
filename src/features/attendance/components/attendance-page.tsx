'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Check, Dialog, Empty, ErrorState, Input, LinkButton, PageHeading, Select, Skeleton } from '@/components/ui';
import { dateLabel } from '@/lib/utils';
import { useHttpQuery } from '@/hooks/use-http-query';
import { RecordConflict } from '@/components/shared/record-conflict';
import { HttpError } from '@/lib/http-client';
import { compareAttendanceRecords } from '@/lib/attendance';
import { createAttendanceApi, type AttendanceLesson, type AttendanceRoster } from '../api';

function todayInBrasilia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function AttendancePage() {
  const { client, user, sessionKey, resourceEpoch } = useSession();
  const { notify } = useApp();
  const params = useSearchParams();
  const api = useMemo(() => createAttendanceApi(client), [client]);
  const subjects = useHttpQuery({ sessionKey, key: `attendance-subjects:${resourceEpoch}` }, useCallback(signal => api.subjects(signal), [api]), user?.role !== 'student');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [roster, setRoster] = useState<AttendanceRoster>();
  const [lesson, setLesson] = useState<AttendanceLesson>();
  const [records, setRecords] = useState<Record<string, boolean>>({});
  const [expectedRevision, setExpectedRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [conflictLesson, setConflictLesson] = useState<AttendanceLesson>();
  const [error, setError] = useState('');
  const selection = `${subjectId}\u0000${date}\u0000${time}`;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const requestVersion = useRef(0);
  const loadedSelection = useRef('');
  const requestedSubject = params.get('disciplina') ?? '';
  const available = subjects.data ?? [];
  const selectedSubject = available.find(item => item.id === subjectId);
  const students = roster?.items ?? [];

  useEffect(() => { setDate(todayInBrasilia()); }, []);
  useEffect(() => {
    if (!available.length) return;
    setSubjectId(current => current && available.some(item => item.id === current)
      ? current
      : available.find(item => item.id === requestedSubject)?.id ?? available[0].id);
  }, [available, requestedSubject]);

  const invalidateSelection = () => {
    requestVersion.current += 1;
    loadedSelection.current = '';
    setLoading(false); setSaving(false); setLoaded(false); setConfirm(false);
    setRoster(undefined); setLesson(undefined); setRecords({}); setExpectedRevision(0);
    setConflictLesson(undefined); setError('');
  };

  const load = async () => {
    if (!subjectId || !date || !time) return;
    const requestedSelection = `${subjectId}\u0000${date}\u0000${time}`;
    const version = ++requestVersion.current;
    loadedSelection.current = '';
    setLoading(true); setError(''); setConflictLesson(undefined);
    try {
      const [nextRoster, page] = await Promise.all([
        api.eligible(subjectId, date, time),
        api.lesson(subjectId, date, time)
      ]);
      if (version !== requestVersion.current || selectionRef.current !== requestedSelection) return;
      const current = page.find(item => item.date === date && item.time === time);
      const eligible = nextRoster.filter(item => item.eligible);
      setRoster({ items: eligible.map(item => ({ ...item, present: current?.records?.[item.id] ?? null })) });
      setLesson(current);
      setRecords(current ? { ...current.records } : Object.fromEntries(eligible.map(item => [item.id, true])));
      setExpectedRevision(current?.revision ?? 0);
      loadedSelection.current = requestedSelection;
      setLoaded(true);
    } catch (cause: unknown) {
      if (version !== requestVersion.current || selectionRef.current !== requestedSelection) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a chamada.');
      setLoaded(false);
    } finally { if (version === requestVersion.current) setLoading(false); }
  };

  const inspectLatest = async () => {
    const requestedSelection = `${subjectId}\u0000${date}\u0000${time}`;
    const version = requestVersion.current;
    try {
      const latest = lesson
        ? await api.read(lesson.id)
        : (await api.lesson(subjectId, date, time)).find(item => item.date === date && item.time === time);
      if (version !== requestVersion.current || selectionRef.current !== requestedSelection) return;
      if (!latest) {
        setError('Não há chamada atual para conferir. Seu preenchimento foi mantido.');
        return;
      }
      setConflictLesson(latest);
      setLesson(latest);
      setError('');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? `${cause.message} Seu preenchimento foi mantido.` : 'Não foi possível consultar a versão atual. Seu preenchimento foi mantido.');
    }
  };

  const save = async () => {
    const requestedSelection = `${subjectId}\u0000${date}\u0000${time}`;
    if (saving || conflictLesson || !selectedSubject?.canManageContent || !loaded || loadedSelection.current !== requestedSelection) return;
    if (lesson && (lesson.subjectId !== subjectId || lesson.date !== date || lesson.time !== time)) return;
    const version = requestVersion.current;
    setSaving(true); setError('');
    try {
      const saved = lesson
        ? await api.update(lesson.id, records, expectedRevision)
        : await api.create({ subjectId, date, time, records });
      if (version !== requestVersion.current || selectionRef.current !== requestedSelection) return;
      setLesson(saved); setExpectedRevision(saved.revision); setConflictLesson(undefined);
      setConfirm(false); setLoaded(true); notify('Frequência salva.');
    } catch (cause: unknown) {
      if (version !== requestVersion.current || selectionRef.current !== requestedSelection) return;
      setError(cause instanceof Error ? `${cause.message} Seu preenchimento foi mantido.` : 'Não foi possível salvar. Seu preenchimento foi mantido.');
      if (cause instanceof HttpError && cause.kind === 'conflict') { setConfirm(false); await inspectLatest(); }
    } finally { if (version === requestVersion.current) setSaving(false); }
  };

  const markLabel = (mark: boolean | undefined) => mark === undefined ? 'Sem registro' : mark ? 'Presente' : 'Ausente';
  const presentCount = Object.values(records).filter(Boolean).length;
  const absentCount = Object.values(records).filter(value => !value).length;
  const conflictPresentCount = conflictLesson ? Object.values(conflictLesson.records).filter(Boolean).length : 0;
  if (user?.role === 'student') return <Empty title="Registro de frequência" description="Esta tela está disponível para professores e administradores." />;
  if (subjects.loading && !subjects.data) return <Skeleton />;
  if (subjects.error) return <ErrorState message={subjects.error.message} retry={() => void subjects.retry()} />;
  if (!available.length) return <Empty title="Nenhuma disciplina atribuída" description="A frequência pode ser registrada apenas nas disciplinas atribuídas à equipe." />;

  return <>
    <LinkButton secondary href={requestedSubject ? `/disciplinas/detalhes?id=${encodeURIComponent(requestedSubject)}` : '/'} className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />{requestedSubject ? 'Voltar à disciplina' : 'Voltar ao painel'}</LinkButton>
    <PageHeading title="Registro de frequência" />
    <Card className="mb-6">
      <form className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_180px_130px_auto]" onSubmit={event => { event.preventDefault(); void load(); }}>
        <Select label="Disciplina / turma" value={subjectId} onChange={event => { invalidateSelection(); setSubjectId(event.target.value); }}>
          {available.map(item => <option key={item.id} value={item.id}>{item.name} · {item.className}</option>)}
        </Select>
        <Input label="Data da aula" type="date" value={date} onChange={event => { invalidateSelection(); setDate(event.target.value); }} required />
        <Input label="Horário" type="time" value={time} onChange={event => { invalidateSelection(); setTime(event.target.value); }} required />
        <Button type="submit" loading={loading} disabled={!subjectId || !date || !time}>Carregar chamada</Button>
      </form>
    </Card>
    {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loaded ? <Card>
      {conflictLesson && <RecordConflict key={conflictLesson.revision} author="Equipe AJA" updatedAt={conflictLesson.updatedAt} onReviewed={() => { setExpectedRevision(conflictLesson.revision); setLesson(conflictLesson); setConflictLesson(undefined); }}>
        <p>Chamada atual: {conflictPresentCount} {conflictPresentCount === 1 ? 'presença' : 'presenças'} em {dateLabel(conflictLesson.date)} às {conflictLesson.time}.</p>
        <p>Compare as marcações salvas com seu preenchimento. Os controles abaixo mantêm suas alterações; ajuste-os antes de salvar.</p>
        <ul aria-label="Comparação da frequência por aluno" className="divide-y divide-amber-200 whitespace-normal">
          {compareAttendanceRecords(conflictLesson.records, records, students).map(row => <li key={row.studentId} className="py-3">
            <p className="font-semibold">{row.name}</p>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-xs sm:text-sm">
              <div><dt className="font-medium">Versão salva</dt><dd>{markLabel(row.saved)}</dd></div>
              <div><dt className="font-medium">Seu preenchimento</dt><dd>{markLabel(row.local)}</dd></div>
            </dl>
            {row.changed && <p className="mt-1 text-xs font-semibold">Marcação diferente</p>}
          </li>)}
        </ul>
      </RecordConflict>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{selectedSubject?.className} · {dateLabel(date)}</h2>
        <Badge tone="purple">{presentCount} {presentCount === 1 ? 'presente' : 'presentes'} / {students.length} {students.length === 1 ? 'aluno' : 'alunos'}</Badge>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setRecords(Object.fromEntries(students.map(student => [student.id, true])))}>Marcar todos presentes</Button>
        <Button variant="ghost" onClick={() => setRecords(Object.fromEntries(students.map(student => [student.id, false])))}>Marcar todos ausentes</Button>
      </div>
      <div className="divide-y divide-slate-100">
        {students.map(student => <div key={student.id} className="flex items-center gap-3 py-4">
          <Avatar name={student.name} size="sm" />
          <span className="flex-1 text-sm font-medium">{student.name}</span>
          <Check label={records[student.id] ? 'Presente' : 'Ausente'} checked={records[student.id] ?? false} onChange={value => setRecords(previous => ({ ...previous, [student.id]: value }))} />
        </div>)}
      </div>
      <p className="py-5 text-xs text-slate-500">Exibindo apenas alunos matriculados na data da aula.</p>
      <div className="mt-5 flex justify-end">
        <Button disabled={!students.length || !!conflictLesson || !selectedSubject?.canManageContent} onClick={() => setConfirm(true)}>
          {lesson ? 'Atualizar chamada' : 'Salvar chamada'}
        </Button>
      </div>
    </Card> : <Empty title="Selecione uma aula para começar" description="Escolha disciplina, data e horário para carregar a chamada." />}
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="Confirmar frequência">
      <p className="mb-5 text-sm leading-6 text-slate-500">Salvar {presentCount} {presentCount === 1 ? 'presença' : 'presenças'} e {absentCount} {absentCount === 1 ? 'ausência' : 'ausências'} em {dateLabel(date)} às {time}?</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setConfirm(false)}>Revisar</Button>
        <Button loading={saving} disabled={!!conflictLesson} onClick={() => void save()}>Confirmar</Button>
      </div>
    </Dialog>
  </>;
}
