'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, FileText, ShieldCheck } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Avatar, Badge, Button, Card, Check, Dialog, Empty, Input, LinkButton, PageHeading, Select, Textarea } from '@/components/ui';
import { dateLabel, percent, roleLabels, textMatch, uid } from '@/lib/utils';
import { canChangeRole } from '@/lib/domain';
import { quotaLabels } from './profile';
import type { Role } from '@/models';
export function StudentsPage() {
  const {
    db,
    role,
    mutate,
    busy
  } = useApp();
  const [classId, setClassId] = useState('c1');
  const [search, setSearch] = useState('');
  const [enroll, setEnroll] = useState(false);
  const [target, setTarget] = useState('');
  const schoolClass = db.classes.find(c => c.id === classId);
  const students = db.users.filter(u => u.role === 'student' && schoolClass?.studentIds.includes(u.id) && textMatch(u.name + ' ' + u.email, search));
  if (role === 'student') return <Empty title="Área da equipe pedagógica" description="Selecione o perfil de professor ou administrador para conhecer esta tela." />;
  return <>
    <PageHeading eyebrow="Acompanhamento acadêmico" title="Alunos" description="Consulte as matrículas e os dados acadêmicos dos alunos." action={role === 'admin' && <Button disabled={!schoolClass?.active} onClick={() => {
      setTarget('');
      setEnroll(true);
    }}><Plus className="size-4" />Matricular aluno</Button>} />
    <div className="mb-6 grid max-w-2xl gap-3 sm:grid-cols-2">
      <Input aria-label="Buscar aluno" placeholder="Buscar por nome ou e-mail…" value={search} onChange={e => setSearch(e.target.value)} />
      <Select aria-label="Turma" value={classId} onChange={e => setClassId(e.target.value)}>
        {db.classes.map(c => <option key={c.id} value={c.id}>
          {c.name}
          {!c.active ? ' (inativa)' : ''}
        </option>)}
      </Select>
    </div>
    <Card className="!p-0 overflow-hidden">
      <p className="px-5 pt-4 text-xs text-slate-500 sm:hidden">Deslize para ver todas as colunas.</p>
      <div className="relative overflow-x-auto" role="region" aria-label="Lista de alunos" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-5 font-medium">Aluno</th>
              <th className="p-5 font-medium">Objetivo</th>
              <th className="p-5 font-medium">Frequência</th>
              <th className="p-5">
                <span className="sr-only">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map(u => {
              const records = db.attendance.filter(a => db.subjects.some(s => s.id === a.subjectId && s.classId === classId) && a.records[u.id] !== undefined);
              return <tr key={u.id}>
              <td className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div>
                    <p className="whitespace-nowrap font-semibold">
                      {u.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {u.email}
                    </p>
                  </div>
                </div>
              </td>
              <td className="p-5">
                <p>
                  {u.course || 'Não informado'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {u.institution}
                </p>
              </td>
              <td className="p-5">
                <Badge tone="green">
                  {records.length ? `${percent(records.filter(a => a.records[u.id]).length, records.length)}%` : 'Sem registro'}
                </Badge>
              </td>
              <td className="p-5">
                <Link className="whitespace-nowrap font-semibold text-brand-600" href={`/alunos/perfil?id=${u.id}`}>Ver perfil</Link>
              </td>
            </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!students.length && <Empty title="Nenhum aluno encontrado" description="Altere os filtros ou matricule alunos nesta turma." />}
    </Card>
    <Dialog open={enroll} onClose={() => setEnroll(false)} title={`Matricular em ${schoolClass?.name}`}>
      <form className="space-y-5" onSubmit={async e => {
        e.preventDefault();
        if (await mutate(d => {
          const c = d.classes.find(c => c.id === classId)!;
          if (!c.active) throw new Error('Esta turma está inativa.');
          if (!c.studentIds.includes(target)) c.studentIds.push(target);
        }, 'Matrícula realizada.')) setEnroll(false);
      }}>
        <Select label="Aluno cadastrado" value={target} onChange={e => setTarget(e.target.value)} required>
          <option value="">Selecione um aluno</option>
          {db.users.filter(u => u.role === 'student' && !schoolClass?.studentIds.includes(u.id)).map(u => <option key={u.id} value={u.id}>
            {u.name}
          </option>)}
        </Select>
        <Button type="submit" loading={busy} disabled={!target}>Confirmar matrícula</Button>
      </form>
    </Dialog>
  </>;
}
export function StudentDetails() {
  const {
    db,
    role,
    mutate,
    busy
  } = useApp();
  const id = useSearchParams().get('id') ?? 'u1';
  const student = db.users.find(u => u.id === id);
  const [reject, setReject] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (role === 'student') return <Empty title="Acesso reservado à equipe pedagógica" />;
  if (!student) return <Empty title="Aluno não encontrado" />;
  const docs = db.documents.filter(d => d.userId === id);
  return <>
    <Link href="/alunos" className="mb-5 inline-block text-sm font-semibold text-brand-600">Alunos / Perfil</Link>
    <PageHeading title={student.name} description="Informações acadêmicas do aluno." />
    <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <Avatar name={student.name} src={student.avatar} size="lg" />
        <h2 className="mt-5 text-lg font-semibold">
          {student.name}
        </h2>
        <p className="mt-2 break-all text-sm text-slate-500">
          {student.email}
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-500">
          {student.bio}
        </p>
      </Card>
      <div className="space-y-5">
        <Card>
          <h2 className="mb-5 font-semibold">Objetivos e informações</h2>
          <dl className="grid gap-5 sm:grid-cols-2">
            {[['Curso pretendido', student.course], ['Instituição alvo', student.institution], ['Modalidade de ingresso', quotaLabels[student.quota]], ['Turmas', db.classes.filter(c => c.studentIds.includes(id)).map(c => c.name).join(', ')]].map(([label, value]) => <div key={label}>
              <dt className="text-xs text-slate-400">
                {label}
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {value || 'Não informado'}
              </dd>
            </div>)}
          </dl>
        </Card>
        <Card>
          <h2 className="mb-5 font-semibold">Documentos de exemplo</h2>
          {role !== 'admin' ? <p className="text-sm leading-6 text-slate-500">A análise de documentos é restrita à coordenação. Troque para o perfil de administrador para testar este fluxo.</p> : <div className="space-y-4">
            {docs.map(d => <div key={d.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap gap-3">
                <FileText className="size-5 text-brand-500" />
                <span className="flex-1 break-all text-sm font-medium">
                  {d.name}
                </span>
                <Badge tone={d.status === 'approved' ? 'green' : d.status === 'pending' ? 'amber' : 'red'}>
                  {d.status === 'approved' ? 'Aprovado' : d.status === 'pending' ? 'Em análise' : 'Rejeitado'}
                </Badge>
              </div>
              {d.status === 'pending' && <div className="flex gap-2">
                <Button variant="secondary" loading={busy} onClick={() => void mutate(draft => {
                  draft.documents.find(doc => doc.id === d.id)!.status = 'approved';
                }, 'Documento de exemplo aprovado.')}>Aprovar</Button>
                <Button variant="ghost" onClick={() => {
                  setReject(d.id);
                  setReason('');
                }}>Rejeitar</Button>
              </div>}
              {d.reason && <p className="text-sm text-rose-600">
                {d.reason}
              </p>}
            </div>)}
            {!docs.length && <p className="text-sm text-slate-400">Nenhum documento enviado.</p>}
          </div>}
        </Card>
      </div>
    </div>
    <Dialog open={!!reject} onClose={() => setReject(null)} title="Rejeitar documento">
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        if (await mutate(d => {
          const doc = d.documents.find(doc => doc.id === reject)!;
          doc.status = 'rejected';
          doc.reason = reason.trim();
        }, 'Documento rejeitado com justificativa.')) setReject(null);
      }}>
        <Textarea label="Motivo da rejeição" value={reason} onChange={e => setReason(e.target.value)} required minLength={8} />
        <Button type="submit" loading={busy} variant="danger">Confirmar rejeição</Button>
      </form>
    </Dialog>
  </>;
}
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
export function UsersPage() {
  const {
    db,
    role,
    mutate,
    busy
  } = useApp();
  const [search, setSearch] = useState('');
  const [change, setChange] = useState<{
    id: string;
    role: Role;
  } | null>(null);
  if (role !== 'admin') return <Empty title="Área da administração" description="Selecione o perfil de administrador para gerenciar cargos na demonstração." />;
  const admins = db.users.filter(u => u.role === 'admin').length;
  return <>
    <PageHeading eyebrow="Gestão de acesso" title="Usuários e cargos" description="Gerencie os perfis de acesso desta demonstração." />
    <div className="mb-6 max-w-md">
      <Input aria-label="Buscar usuário" value={search} onChange={e => setSearch(e.target.value)} placeholder="Busque nome ou e-mail…" />
    </div>
    <Card className="!p-0 overflow-hidden">
      <p className="px-5 pt-4 text-xs text-slate-500 sm:hidden">Deslize para ver todas as colunas.</p>
      <div className="relative overflow-x-auto" role="region" aria-label="Lista de usuários e cargos" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-5 font-medium">Usuário</th>
              <th className="p-5 font-medium">E-mail</th>
              <th className="p-5 font-medium">Perfil</th>
              <th className="p-5 font-medium">Alterar cargo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {db.users.filter(u => textMatch(u.name + ' ' + u.email, search)).map(u => <tr key={u.id}>
              <td className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} size="sm" />
                  <span className="whitespace-nowrap font-semibold">
                    {u.name}
                  </span>
                </div>
              </td>
              <td className="p-5 text-slate-500">
                {u.email}
              </td>
              <td className="p-5">
                <Badge tone={u.role === 'admin' ? 'purple' : u.role === 'teacher' ? 'amber' : 'neutral'}>
                  {roleLabels[u.role]}
                </Badge>
              </td>
              <td className="min-w-52 p-5">
                <Select aria-label={`Cargo de ${u.name}`} value={u.role} onChange={e => setChange({
                  id: u.id,
                  role: e.target.value as Role
                })} disabled={u.role === 'admin' && admins === 1}>
                  <option value="student">Aluno</option>
                  <option value="teacher">Professor</option>
                  <option value="admin">Administrador</option>
                </Select>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Card>
    <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="size-4" />O último administrador não pode ser removido. Permissões reais devem ser validadas no backend.</p>
    <Dialog open={!!change} onClose={() => setChange(null)} title="Alterar perfil de acesso?">
      <p className="mb-5 text-sm leading-6">{db.users.find(u => u.id === change?.id)?.name} passará a ser {change ? roleLabels[change.role].toLowerCase() : ''}. Esta alteração afeta apenas os dados da demonstração.</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setChange(null)}>Cancelar</Button>
        <Button loading={busy} onClick={async () => {
          if (change && (await mutate(d => {
            const u = d.users.find(u => u.id === change.id)!;
            if (!canChangeRole(u, change.role, d.users)) throw new Error('Não é possível remover o último administrador.');
            u.role = change.role;
          }, 'Perfil atualizado. Notificação ao usuário simulada.'))) setChange(null);
        }}>Confirmar alteração</Button>
      </div>
    </Dialog>
  </>;
}
