'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { percent, textMatch } from '@/lib/utils';

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
