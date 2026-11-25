'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import { Avatar, Card, Empty, LinkButton, PageHeading, Skeleton, ErrorState } from '@/components/ui';
import { dateLabel } from '@/lib/utils';
import { useHttpQuery } from '@/hooks/use-http-query';
import { createStudentsApi } from '../api';

export function StudentDetails() {
  const { client, user, sessionKey, resourceEpoch } = useSession();
  const id = useSearchParams().get('id') ?? '';
  const api = useMemo(() => createStudentsApi(client), [client]);
  const allowed = !!user && user.role !== 'student' && !!id;
  const query = useHttpQuery({ sessionKey, key: `student:${id}:${resourceEpoch}` }, useCallback(signal => api.read(id, signal), [api, id]), allowed);
  if (user?.role === 'student') return <Empty title="Acesso reservado à equipe pedagógica" />;
  if (!id) return <Empty title="Selecione um aluno" description="Volte à lista de alunos para abrir um perfil." action={<LinkButton secondary href="/alunos"><ArrowLeft aria-hidden="true" className="size-4" />Voltar aos alunos</LinkButton>} />;
  if (query.loading) return <Skeleton />;
  if (query.error) return <><LinkButton secondary href="/alunos" className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar aos alunos</LinkButton><ErrorState message={query.error.message} retry={() => void query.retry()} /></>;
  const detail = query.data;
  if (!detail) return <Empty title="Aluno indisponível neste contexto" action={<LinkButton secondary href="/alunos"><ArrowLeft aria-hidden="true" className="size-4" />Voltar aos alunos</LinkButton>} />;
  return <><LinkButton secondary href="/alunos" className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar aos alunos</LinkButton><PageHeading title={detail.student.name} description="Dados cadastrais, matrículas e histórico de frequência do aluno." /><div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]"><Card><Avatar name={detail.student.name} size="lg" /><h2 className="mt-5 text-lg font-semibold [overflow-wrap:anywhere]">{detail.student.name}</h2><p className="mt-2 break-all text-sm text-slate-500">{detail.student.email}</p></Card><Card><h2 className="mb-5 font-semibold">Matrículas</h2>{detail.enrollments.map(item => <p key={item.id} className="py-2 text-sm leading-6 text-slate-600">{item.className ?? 'Turma indisponível'} · {item.status === 'active' ? 'Ativo' : item.status === 'pending' ? 'Pendente' : item.status === 'cancelled' ? 'Cancelado' : 'Encerrado'}<br />{item.legacy ? 'Matrícula anterior — data não registrada' : item.enrolledAt ? `Efetivada em ${new Date(item.enrolledAt).toLocaleString('pt-BR')}` : 'Data de efetivação não registrada'}{item.endedAt && ` · Encerrada em ${new Date(item.endedAt).toLocaleString('pt-BR')}`}</p>)}{!detail.enrollments.length && <p className="text-sm text-slate-500">Nenhuma matrícula neste contexto.</p>}</Card></div><Card className="mt-6"><h2 className="mb-4 font-semibold">Histórico de frequência</h2>{detail.attendance.length ? <ul className="divide-y divide-slate-100">{detail.attendance.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span>{item.subjectName} · {dateLabel(item.date)} às {item.time}</span><strong className={item.present ? 'text-emerald-700' : 'text-rose-700'}>{item.present ? 'Presente' : 'Ausente'}</strong></li>)}</ul> : <p className="text-sm text-slate-500">Nenhuma marcação de frequência neste contexto.</p>}</Card></>;
}
