'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Check, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { percent, textMatch } from '@/lib/utils';
import { canAccessStudent } from '@/lib/access';
import { enrolledForLesson, normalizeEmail, validEmail } from '@/lib/enrollment';
import type { Enrollment } from '@/models';

export function StudentsPage() {
  const { db, user, role, mutate, busy } = useApp();
  const params = useSearchParams();
  const [classId, setClassId] = useState(params.get('turma') ?? db.classes[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState(false);
  const [enroll, setEnroll] = useState(false);
  const [email, setEmail] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Enrollment | null>(null);
  const schoolClass = db.classes.find(c => c.id === classId);
  const records = db.enrollments.filter(e => e.classId === classId);
  const students = db.users.filter(u => u.role === 'student' && canAccessStudent(db, user, u.id) && (schoolClass?.studentIds.includes(u.id) || history && records.some(e => e.studentId === u.id && e.enrolledAt)) && textMatch(`${u.name} ${u.email}`, search));
  const pending = records.filter(e => (history || e.status === 'pending') && !e.enrolledAt && textMatch(e.email, search));
  const person = db.users.find(u => normalizeEmail(u.email) === normalizeEmail(email));
  const other = person && db.classes.find(c => c.id !== classId && c.active && c.studentIds.includes(person.id));
  const previous = records.find(e => e.email === normalizeEmail(email));
  const problem = !validEmail(email) ? 'Informe um e-mail válido.' : !schoolClass?.active ? 'Esta turma está inativa ou indisponível.' : person && (person.deletedAt || person.active === false || person.role !== 'student') ? 'Esta conta está inativa, excluída ou tem outro cargo. A inclusão não altera seu estado ou cargo.' : other ? `Já existe vínculo ativo em ${other.name}. Regularize esse vínculo antes de incluir aqui. Não há transferência automática.` : previous?.deletedAt ? 'Matrícula encerrada ou cancelada neste destino. Não há restauração pela interface.' : '';
  const currentRemoval = db.enrollments.find(e => e.id === removing?.id);
  const removalChanged = !!removing && (!currentRemoval || currentRemoval.status !== removing.status || currentRemoval.revision !== removing.revision);
  if (role === 'student') return <Empty title="Área da equipe pedagógica" description="Selecione o perfil de professor ou administrador para conhecer esta tela." />;
  return <>
    <PageHeading eyebrow="Acompanhamento acadêmico" title="Alunos" description="Consulte vínculos ativos, matrículas pendentes e histórico da turma." action={role === 'admin' && <Button disabled={!schoolClass?.active} onClick={() => { setEmail(''); setReviewed(false); setError(''); setEnroll(true); }}><Plus className="size-4" />Adicionar aluno por e-mail</Button>} />
    <div className="mb-6 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,360px)_240px_1fr]">
      <Input aria-label="Buscar aluno ou matrícula" placeholder="Buscar por nome ou e-mail…" value={search} onChange={e => setSearch(e.target.value)} />
      <Select aria-label="Turma" value={classId} onChange={e => setClassId(e.target.value)}>{db.classes.map(c => <option key={c.id} value={c.id}>{c.name}{!c.active ? ' (inativa)' : ''}</option>)}</Select>
      <Check label="Incluir histórico encerrado" checked={history} onChange={setHistory} />
    </div>
    <Card className="!p-0 overflow-hidden">
      <h2 className="px-5 pt-5 font-semibold">Alunos vinculados{schoolClass && ` — ${schoolClass.name}`}</h2>
      <p className="px-5 pt-3 text-xs text-slate-500 sm:hidden">Deslize para ver todas as colunas.</p>
      <div className="relative overflow-x-auto" role="region" aria-label="Lista de alunos" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-5 font-medium">Aluno</th><th className="p-5 font-medium">Vínculo</th><th className="p-5 font-medium">Frequência</th><th className="p-5"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody className="divide-y divide-slate-100">{students.map(u => {
            const enrollment = records.find(e => e.studentId === u.id && e.enrolledAt);
            const attendance = db.attendance.filter(a => db.subjects.some(s => s.id === a.subjectId && s.classId === classId) && a.records[u.id] !== undefined && enrolledForLesson(db, classId, u.id, a.date));
            return <tr key={u.id}>
              <td className="p-5"><div className="flex items-center gap-3"><Avatar name={u.name} /><div><p className="whitespace-nowrap font-semibold">{u.name}</p><p className="mt-1 text-xs text-slate-500">{u.email}</p></div></div></td>
              <td className="p-5"><Badge tone={enrollment?.status === 'ended' ? 'neutral' : 'green'}>{enrollment?.status === 'ended' ? 'Encerrado' : 'Ativo'}</Badge><p className="mt-2 text-xs text-slate-500">{enrollment?.legacy ? 'Matrícula anterior — data não registrada' : enrollment?.enrolledAt ? new Date(enrollment.enrolledAt).toLocaleString('pt-BR') : 'Data não registrada'}</p></td>
              <td className="p-5"><Badge tone="green">{attendance.length ? `${percent(attendance.filter(a => a.records[u.id]).length, attendance.length)}%` : 'Sem registro'}</Badge></td>
              <td className="p-5"><div className="flex flex-wrap items-center gap-2"><Link className="inline-flex min-h-11 items-center whitespace-nowrap font-semibold text-brand-600" href={`/alunos/perfil?id=${u.id}`}>Ver perfil</Link>{role === 'admin' && enrollment?.status === 'active' && <Button variant="ghost" onClick={() => { setError(''); setRemoving(enrollment); }}>Encerrar vínculo</Button>}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!students.length && <Empty title="Nenhum aluno encontrado" description="Altere os filtros. Matrículas pendentes ainda não são participantes ativos." />}
    </Card>
    {role === 'admin' && <Card className="mt-6">
      <h2 className="font-semibold">Matrículas pendentes{history && ' e canceladas'}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Aguardando cadastro ou confirmação simulada do e-mail. Não aparecem na chamada. Endereço incorreto: cancele a pendência e inclua o correto.</p>
      <ul className="mt-4 divide-y divide-slate-100">{pending.map(e => <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-all text-sm font-medium">{e.email}</p><p className="mt-1 text-xs text-slate-500">{e.status === 'cancelled' ? 'Cancelada' : 'Matrícula pendente — aguardando cadastro ou confirmação'} · {new Date(e.createdAt).toLocaleString('pt-BR')}<br />Incluída por {db.users.find(u => u.id === e.createdBy)?.name ?? 'Equipe administrativa'}</p></div>{e.status === 'pending' && <Button variant="secondary" onClick={() => { setError(''); setRemoving(e); }}>Cancelar pendência</Button>}</li>)}</ul>
      {!pending.length && <p className="py-5 text-sm text-slate-500">Nenhuma matrícula pendente com estes filtros.</p>}
    </Card>}
    <Dialog open={enroll} onClose={() => { if (!busy && (!email || window.confirm('Fechar sem concluir a inclusão deste e-mail?'))) setEnroll(false); }} title={`Adicionar aluno em ${schoolClass?.name ?? 'turma indisponível'}`}>
      <form className="space-y-5" onSubmit={async e => {
        e.preventDefault();
        if (busy) return;
        setError('');
        if (problem) { setError(problem); return; }
        if (!reviewed) { setReviewed(true); return; }
        const ok = await mutate(() => {}, person && person.emailConfirmedAt !== null ? 'Vínculo de matrícula conferido. A turma está disponível ao aluno.' : 'Matrícula pendente registrada. Aguarde cadastro ou confirmação simulada do e-mail.', { enrollment: { type: 'add', email, classId } });
        if (ok) setEnroll(false);
        else setError('A inclusão não foi concluída. Confira a mensagem apresentada e tente novamente. O e-mail e a turma foram mantidos.');
      }}>
        <p className="text-sm leading-6 text-slate-600">Destino: <strong>{schoolClass?.name}</strong>. Uma única turma ativa por aluno. Esta operação é local; nenhum convite será enviado.</p>
        <Input label="E-mail do aluno" type="email" required value={email} error={error} onChange={e => { setEmail(e.target.value); setReviewed(false); setError(''); }} maxLength={254} placeholder="aluno@exemplo.com" />
        {reviewed && <div className="rounded-lg bg-slate-50 p-4 text-sm leading-6"><p className="break-all font-semibold">{normalizeEmail(email)}</p>{person ? <p>{person.name} · Conta existente. {person.emailConfirmedAt === null ? 'A matrícula aguardará a confirmação simulada pelo aluno.' : previous?.status === 'active' ? 'O vínculo já existe; confirmar não o duplica.' : 'A confirmação efetiva o vínculo e libera a turma.'}</p> : <p>Não há conta com este e-mail. Será criada somente uma matrícula pendente, aguardando cadastro. Nenhum usuário será criado por esta inclusão.</p>}</div>}
        <Button type="submit" loading={busy}>{reviewed ? person && person.emailConfirmedAt !== null ? 'Confirmar vínculo' : 'Confirmar matrícula pendente' : 'Conferir inclusão'}</Button>
      </form>
    </Dialog>
    <Dialog open={!!removing} onClose={() => { if (!busy) setRemoving(null); }} title={removing?.status === 'pending' ? 'Cancelar matrícula pendente?' : 'Encerrar vínculo com a turma?'}>
      <p className="mb-5 break-words text-sm leading-6 text-slate-600">{removing?.email} · {schoolClass?.name}. {removing?.status === 'pending' ? 'O cadastro posterior não consumirá esta pendência.' : 'O aluno perde o acesso à turma, inclusive em atividades abertas.'} O histórico será preservado para a equipe autorizada. Não há restauração pela interface.</p>
      {removalChanged && <p role="alert" className="mb-4 text-sm text-amber-800">A matrícula mudou. Feche e confira o estado atual antes de continuar.</p>}
      {error && <p role="alert" className="mb-4 text-sm text-rose-700">{error}</p>}
      <Button loading={busy} disabled={removalChanged} onClick={async () => {
        if (!removing || busy || removalChanged) return;
        const ok = await mutate(() => {}, 'Situação da matrícula atualizada. Histórico preservado.', { enrollment: { type: removing.status === 'pending' ? 'cancel' : 'end', id: removing.id }, expected: [{ collection: 'enrollments', id: removing.id, revision: removing.revision ?? 0 }] });
        if (ok) setRemoving(null);
        else setError('Não foi possível concluir. Confira o estado atual e tente novamente.');
      }}>Confirmar {removing?.status === 'pending' ? 'cancelamento' : 'encerramento'}</Button>
    </Dialog>
  </>;
}
