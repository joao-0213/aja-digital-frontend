'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/providers/app-context';
import { Avatar, Card, Empty, PageHeading } from '@/components/ui';
import { canAccessStudent } from '@/lib/access';

export function StudentDetails() {
  const { db, role, user } = useApp();
  const id = useSearchParams().get('id') ?? 'u1';
  const student = db.users.find(u => u.id === id && u.role === 'student');
  if (role === 'student') return <Empty title="Acesso reservado à equipe pedagógica" />;
  if (!student || !canAccessStudent(db, user, id)) return <Empty title="Aluno indisponível neste contexto" description="Consulte somente alunos das disciplinas atribuídas a você." />;
  const enrollments = db.enrollments.filter(e => e.studentId === id && e.enrolledAt);
  return <>
    <Link href="/alunos" className="mb-5 inline-block text-sm font-semibold text-brand-600">Alunos / Perfil</Link>
    <PageHeading title={student.name} description="Dados cadastrais e matrículas do aluno." />
    <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <Avatar name={student.name} size="lg" />
        <h2 className="mt-5 text-lg font-semibold">{student.name}</h2>
        <p className="mt-2 break-all text-sm text-slate-500">{student.email}</p>
      </Card>
      <Card>
        <h2 className="mb-5 font-semibold">Matrículas</h2>
        {enrollments.map(e => <p key={e.id} className="py-2 text-sm leading-6 text-slate-600">{db.classes.find(c => c.id === e.classId)?.name ?? 'Turma indisponível'} · {e.status === 'active' ? 'Ativo' : 'Encerrado'}<br />{e.legacy ? 'Matrícula anterior — data não registrada' : `Efetivada em ${new Date(e.enrolledAt!).toLocaleString('pt-BR')}`}{e.endedAt && ` · Encerrada em ${new Date(e.endedAt).toLocaleString('pt-BR')}`}</p>)}
        {!enrollments.length && <p className="text-sm text-slate-500">Nenhuma matrícula neste contexto.</p>}
      </Card>
    </div>
  </>;
}
