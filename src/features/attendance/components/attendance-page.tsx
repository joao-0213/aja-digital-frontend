'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Check, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { dateLabel, uid } from '@/lib/utils';
import { canManageSubject } from '@/lib/access';
import { useRecordRevision } from '@/hooks/use-record-revision';
import { RecordConflict } from '@/components/shared/record-conflict';
import { compareAttendanceRecords, recordAttendance } from '@/lib/attendance';
import { enrolledForLesson } from '@/lib/enrollment';

export function AttendancePage() {
  const {
    db,
    role,
    user,
    mutate,
    busy
  } = useApp();
  const params = useSearchParams();
  const allowedSubjects = db.subjects.filter(s => canManageSubject(db, user, s.id));
  const requestedSubject = params.get('disciplina');
  const [subject, setSubject] = useState(allowedSubjects.find(s => s.id === requestedSubject)?.id ?? allowedSubjects[0]?.id ?? '');
  const [date, setDate] = useState('2026-10-05');
  const [time, setTime] = useState('19:00');
  const [records, setRecords] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [openedId, setOpenedId] = useState<string | undefined>();
  const [confirm, setConfirm] = useState(false);
  const s = db.subjects.find(s => s.id === subject);
  const c = db.classes.find(c => c.id === s?.classId);
  const students = db.users.filter(u => u.role === 'student' && c && enrolledForLesson(db, c.id, u.id, date));
  const existing = db.attendance.find(a => a.subjectId === subject && a.date === date && a.time === time);
  const revision = useRecordRevision('attendance', existing);
  if (role === 'student') return <Empty title="Registro de frequência" description="Esta tela está disponível para professores e administradores." />;
  if (!allowedSubjects.length || requestedSubject && !allowedSubjects.some(s => s.id === requestedSubject)) return <Empty title="Disciplina indisponível para chamada" description="A frequência pode ser registrada apenas nas disciplinas atribuídas a você. Consulte a equipe administrativa para regularizar o acesso." />;
  const load = () => {
    setRecords(existing?.records ?? Object.fromEntries(students.map(u => [u.id, true])));
    revision.capture(existing);
    setOpenedId(existing?.id);
    setLoaded(true);
  };
  const markLabel = (mark: boolean | undefined) => mark === undefined ? 'Sem registro' : mark ? 'Presente' : 'Ausente';
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
      {revision.conflict && existing && <RecordConflict key={existing.revision} author={db.users.find(u => u.id === existing.updatedBy)?.name ?? 'Equipe AJA'} updatedAt={existing.updatedAt} onReviewed={() => { revision.acknowledge(); setOpenedId(existing.id); }}>
        <p>Chamada atual: {Object.values(existing.records).filter(Boolean).length} presenças em {dateLabel(existing.date)} às {existing.time}.</p>
        <p>Compare as marcações salvas com seu preenchimento. Os controles abaixo continuam com suas alterações; ajuste-os antes de salvar.</p>
        <ul aria-label="Comparação da frequência por aluno" className="divide-y divide-amber-200 whitespace-normal">
          {compareAttendanceRecords(existing.records, records, db.users).map(row => <li key={row.studentId} className="py-3">
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
      <p className="py-5 text-sm text-slate-500">Somente alunos vinculados na data da aula. Aulas anteriores à matrícula não geram faltas.</p>
      <div className="mt-5 flex justify-end">
        <Button disabled={!students.length || revision.conflict || !canManageSubject(db, user, subject)} onClick={() => setConfirm(true)}>
          {existing ? 'Atualizar chamada' : 'Salvar chamada'}
        </Button>
      </div>
    </Card> : <Empty title="Selecione uma aula para começar" description="Escolha a disciplina, a data e o horário. Chamadas já salvas serão carregadas para revisão." />}
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="Confirmar frequência">
      <p className="mb-5 text-sm leading-6 text-slate-500">Salvar {Object.values(records).filter(Boolean).length} presenças e {Object.values(records).filter(v => !v).length} ausências em {dateLabel(date)} às {time}?</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setConfirm(false)}>Revisar</Button>
        <Button loading={busy} disabled={revision.conflict} onClick={async () => {
          if (revision.conflict) return;
          if (await mutate(d => {
            recordAttendance(d, {
              id: existing?.id ?? uid('attendance'),
              subjectId: subject,
              date,
              time,
              records
            }, openedId);
          }, 'Frequência salva.', revision.expected)) { setConfirm(false); setLoaded(false); }
        }}>Confirmar</Button>
      </div>
    </Dialog>
  </>;
}
