'use client';

import { useCallback, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Avatar, Button, Card, Dialog, Empty } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { dateLabel } from '@/lib/utils';
import { AnnouncementComposer, announcementsPath, canManageAnnouncementItem, createAnnouncementsApi, type AnnouncementDto } from '@/features/announcements';
import type { SubjectSummary } from '../api';

function truncateAnnouncementTitle(title: string, maxLength = 80) {
  return title.length > maxLength ? `${title.slice(0, maxLength).trimEnd()}…` : title;
}

export function SubjectWall({ subject }: { subject: SubjectSummary }) {
  const { client, sessionKey, user } = useSession();
  const api = useMemo(() => createAnnouncementsApi(client), [client]);
  const query = useHttpQuery({ sessionKey, key: `subject-announcements:${subject.id}` }, useCallback(signal => api.all({ subjectId: subject.id }, signal), [api, subject.id]));
  const [composing, setComposing] = useState<AnnouncementDto | 'new' | null>(null);
  const [withdrawing, setWithdrawing] = useState<AnnouncementDto | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const confirmWithdraw = async () => {
    if (!withdrawing || withdrawBusy) return;
    setWithdrawBusy(true);
    try {
      await api.withdraw(withdrawing.id, withdrawing.revision);
      await query.invalidate();
      setActionError('');
      setWithdrawing(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível retirar o aviso.');
      setWithdrawing(null);
    } finally {
      setWithdrawBusy(false);
    }
  };
  return <section aria-label="Mural da disciplina" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Mural da disciplina</h2><p className="mt-1 text-sm text-slate-600">Avisos da turma e desta disciplina.</p></div>{subject.canManageContent && <Button onClick={() => setComposing('new')}>Publicar aviso</Button>}</div>
    {query.loading && <p role="status" className="text-sm text-slate-500">Carregando avisos…</p>}
    {query.error && <p role="alert" className="text-sm text-red-700">{query.error.message} <button type="button" className="font-bold underline underline-offset-4" onClick={query.retry}>Tentar novamente</button></p>}
    {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
    {query.data?.map(item => <Card key={item.id}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500"><Avatar name={item.author.name} size="sm" /><span>{item.author.name}</span><span>·</span><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time><span className="ml-auto">{item.subjectId ? 'Aviso da disciplina' : 'Aviso da turma'}</span></div>
      {item.occurrence && <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm">Acontecimento: {dateLabel(item.occurrence.date)} · {item.occurrence.allDay ? 'Dia inteiro' : item.occurrence.time} (Brasília)</p>}
      <h3 className="text-lg font-semibold [overflow-wrap:anywhere]">{item.title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600 [overflow-wrap:anywhere]">{item.body}</p>
      {canManageAnnouncementItem(user?.role, subject.canManageContent, item.subjectId, subject.id) && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3"><Button variant="ghost" onClick={() => setComposing(item)}><Pencil aria-hidden="true" className="size-4" />Editar</Button><Button variant="ghost" onClick={() => setWithdrawing(item)}><Trash2 aria-hidden="true" className="size-4" />Retirar</Button></div>}
    </Card>)}
    {!query.loading && !query.error && !query.data?.length && <Empty title="Nenhum aviso nesta disciplina" description="Os avisos publicados para a turma aparecerão aqui." />}
    {user?.role === 'admin' && <Link href={announcementsPath} className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Gerenciar avisos de todas as turmas</Link>}
    {composing && <AnnouncementComposer key={composing === 'new' ? 'new' : composing.id} item={composing === 'new' ? undefined : composing} subjectId={subject.id} onClose={() => { setComposing(null); void query.invalidate(); }} />}
    <Dialog open={!!withdrawing} onClose={() => { if (!withdrawBusy) setWithdrawing(null); }} title="Retirar aviso">
      {withdrawing && <>
        <p className="mb-5 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">Retirar “<strong className="text-slate-900">{truncateAnnouncementTitle(withdrawing.title)}</strong>” das consultas? O registro e a autoria serão preservados.</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={withdrawBusy} onClick={() => setWithdrawing(null)}>Cancelar</Button>
          <Button variant="danger" loading={withdrawBusy} onClick={() => void confirmWithdraw()}>Retirar aviso</Button>
        </div>
      </>}
    </Dialog>
  </section>;
}
