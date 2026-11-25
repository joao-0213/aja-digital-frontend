'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, LinkButton, PageHeading, Select } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { dateLabel } from '@/lib/utils';
import { createAnnouncementsApi, type AnnouncementDto } from '../api';
import { AnnouncementComposer } from './announcement-composer';
import { WithdrawAnnouncementDialog } from './withdraw-announcement-dialog';

export function AnnouncementsPage() {
  const { client, sessionKey, user } = useSession();
  const api = useMemo(() => createAnnouncementsApi(client), [client]);
  const [filter, setFilter] = useState('all');
  const [composing, setComposing] = useState<AnnouncementDto | 'new' | null>(null);
  const [withdrawing, setWithdrawing] = useState<AnnouncementDto | null>(null);
  const [actionError, setActionError] = useState('');
  const options = useHttpQuery({ sessionKey, key: 'announcement-options' }, useCallback(signal => api.options(signal), [api]));
  const notices = useHttpQuery({ sessionKey, key: `announcements:${filter}` }, useCallback(signal => api.all(filter === 'all' ? {} : { classId: filter }, signal), [api, filter]));
  const canManage = (item: AnnouncementDto) => user?.role === 'admin' || !!item.subjectId && !!options.data?.subjects.find(subject => subject.id === item.subjectId)?.canManageContent;
  return <>
    <LinkButton secondary href="/" className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar ao painel</LinkButton>
    <PageHeading title="Mural de avisos" description="Comunicados e informações das turmas." action={user?.role !== 'student' && <Button onClick={() => setComposing('new')}><Plus aria-hidden="true" className="size-4" />Publicar aviso</Button>} />
    <div className="mb-6 max-w-sm"><Select label="Turma" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todas as turmas</option>{options.data?.classes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></div>
    {notices.loading && <p role="status" className="mb-4 text-sm text-slate-500">Carregando avisos…</p>}
    {notices.error && <p role="alert" className="mb-4 text-sm text-red-700">{notices.error.message} <button type="button" className="font-bold underline underline-offset-4" onClick={notices.retry}>Tentar novamente</button></p>}
    {actionError && <p role="alert" className="mb-4 text-sm text-red-700">{actionError}</p>}
    <div className="max-w-4xl space-y-5">
      {notices.data?.map(item => <div key={item.id} id={`aviso-${item.id}`} className="scroll-mt-6"><Card>
        <div className="mb-4 flex flex-wrap items-center gap-2"><Badge tone="purple">{options.data?.classes.find(row => row.id === item.classId)?.name ?? item.classId}</Badge>{item.subjectId && <Badge>{options.data?.subjects.find(row => row.id === item.subjectId)?.name ?? item.subjectId}</Badge>}<span className="ml-auto text-xs text-slate-400">{dateLabel(item.createdAt)}</span></div>
        {item.occurrence && <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">Acontecimento: {dateLabel(item.occurrence.date)} · {item.occurrence.allDay ? 'Dia inteiro' : item.occurrence.time} (Brasília)</p>}
        <h2 className="mb-4 text-xl font-semibold [overflow-wrap:anywhere]">{item.title}</h2><p className="whitespace-pre-wrap leading-8 text-slate-600 [overflow-wrap:anywhere]">{item.body}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><Avatar name={item.author.name} size="sm" /><span className="text-xs text-slate-500">{item.author.name}</span>{item.notify && <span className="ml-auto text-xs text-slate-400">Notificação solicitada à caixa local</span>}</div>
        {item.updatedAt !== item.createdAt && <p className="mt-3 text-xs text-slate-500">Última alteração: {item.updatedAt && new Date(item.updatedAt).toLocaleString('pt-BR')}</p>}
        {canManage(item) && <div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setComposing(item)}><Pencil aria-hidden="true" className="size-4" />Editar aviso</Button><Button variant="ghost" disabled={notices.loading} onClick={() => setWithdrawing(item)}><Trash2 aria-hidden="true" className="size-4" />Retirar aviso</Button></div>}
      </Card></div>)}
    </div>
    {!notices.loading && !notices.error && !notices.data?.length && <Empty title="Sem avisos nesta turma" description="As novidades da equipe aparecerão aqui." />}
    {composing && <AnnouncementComposer item={composing === 'new' ? undefined : composing} onClose={() => { setComposing(null); notices.invalidate(); }} />}
    <WithdrawAnnouncementDialog
      item={withdrawing}
      onClose={() => setWithdrawing(null)}
      onWithdraw={item => api.withdraw(item.id, item.revision)}
      onWithdrawn={() => notices.invalidate()}
      onError={setActionError}
    />
  </>;
}
