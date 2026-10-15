'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Check, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { dateLabel, uid } from '@/lib/utils';

export function AttendancePage() {
  const {
    db,
    role,
    user,
    mutate,
    busy
  } = useApp();
  const params = useSearchParams();
  const allowedSubjects = db.subjects.filter(s => role === 'admin' || s.teacherId === user.id);
  const requestedSubject = params.get('disciplina');
  const [subject, setSubject] = useState(allowedSubjects.find(s => s.id === requestedSubject)?.id ?? allowedSubjects[0]?.id ?? '');
  const [date, setDate] = useState('2026-10-05');
  const [time, setTime] = useState('19:00');
  const [records, setRecords] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const s = db.subjects.find(s => s.id === subject);
  const c = db.classes.find(c => c.id === s?.classId);
  const students = db.users.filter(u => c?.studentIds.includes(u.id));
  const existing = db.attendance.find(a => a.subjectId === subject && a.date === date && a.time === time);
  if (role === 'student') return <Empty title="Registro de frequência" description="Esta tela está disponível para professores e administradores." />;
  const load = () => {
    setRecords(existing?.records ?? Object.fromEntries(students.map(u => [u.id, true])));
    setLoaded(true);
  };
  return <>
    <PageHeading eyebrow="Gestão acadêmica" title="Registro de frequência" description="Uma chamada por aula, com histórico preservado." />
    <Card className="mb-6">
      <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_180px_130px_auto]">
        <Select label="Disciplina / turma" value={subject} onChange={e => {
          setSubject(e.target.value);
          setLoaded(false);
        }}>
          {allowedSubjects.map(s => <option key={s.id} value={s.id}>{s.name} · {db.classes.find(c => c.id === s.classId)?.name}</option>)}
        </Select>
        <Input label="Data da aula" type="date" value={date} onChange={e => {
          setDate(e.target.value);
          setLoaded(false);
        }} required />
        <Input label="Horário" type="time" value={time} onChange={e => {
          setTime(e.target.value);
          setLoaded(false);
        }} required />
        <Button onClick={load} disabled={!subject || !date || !time}>Carregar chamada</Button>
      </div>
    </Card>
    {loaded ? <Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{c?.name} · {dateLabel(date)}</h2>
        <Badge tone="purple">{Object.values(records).filter(Boolean).length} presentes / {students.length} alunos</Badge>
      </div>
      <div className="mb-4 flex gap-2">
        <Button variant="secondary" onClick={() => setRecords(Object.fromEntries(students.map(u => [u.id, true])))}>Marcar todos presentes</Button>
        <Button variant="ghost" onClick={() => setRecords(Object.fromEntries(students.map(u => [u.id, false])))}>Marcar todos ausentes</Button>
      </div>
      <div className="divide-y divide-slate-100">
        {students.map(u => <div key={u.id} className="flex items-center gap-3 py-4">
          <Avatar name={u.name} size="sm" />
          <span className="flex-1 text-sm font-medium">
            {u.name}
          </span>
          <Check label={records[u.id] ? 'Presente' : 'Ausente'} checked={records[u.id] ?? false} onChange={value => setRecords(prev => ({
            ...prev,
            [u.id]: value
          }))} />
        </div>)}
      </div>
      {!students.length && <p className="py-8 text-sm text-slate-500">Esta turma ainda não tem alunos.</p>}
      <div className="mt-5 flex justify-end">
        <Button disabled={!students.length} onClick={() => setConfirm(true)}>
          {existing ? 'Atualizar chamada' : 'Salvar chamada'}
        </Button>
      </div>
    </Card> : <Empty title="Selecione uma aula para começar" description="Escolha a disciplina, a data e o horário. Chamadas já salvas serão carregadas para revisão." />}
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="Confirmar frequência">
      <p className="mb-5 text-sm leading-6 text-slate-500">Salvar {Object.values(records).filter(Boolean).length} presenças e {Object.values(records).filter(v => !v).length} ausências em {dateLabel(date)} às {time}?</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setConfirm(false)}>Revisar</Button>
        <Button loading={busy} onClick={async () => {
          if (await mutate(d => {
            const item = d.attendance.find(a => a.subjectId === subject && a.date === date && a.time === time);
            if (item) item.records = records;else d.attendance.push({
              id: uid('attendance'),
              subjectId: subject,
              date,
              time,
              records
            });
          }, 'Frequência salva.')) setConfirm(false);
        }}>Confirmar</Button>
      </div>
    </Dialog>
  </>;
}
