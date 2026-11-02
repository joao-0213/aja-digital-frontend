'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Empty, PageHeading, Select } from '@/components/ui';
import { AnnouncementComposer } from './announcement-composer';
import { canManageSubject } from '@/lib/access';
import { dateLabel } from '@/lib/utils';
import type { Announcement } from '@/models';

export function AnnouncementsPage() {
  const { db, user, role, mutate, busy } = useApp();
  const [filter, setFilter] = useState('all');
  const [composing, setComposing] = useState<Announcement | 'new' | null>(null);
  const start = (item?: Announcement) => setComposing(item ?? 'new');
  const classes = db.classes.filter(c => c.active && (role === 'admin' || db.subjects.some(s => s.classId === c.id && canManageSubject(db, user, s.id))));
  const canManage = (a: Announcement) => role === 'admin' || !!a.subjectId && canManageSubject(db, user, a.subjectId);
  const items = db.announcements.filter(a => filter === 'all' || a.classId === filter);
  return <>
    <PageHeading title="Mural de avisos" description="Comunicados e informações das turmas." action={role !== 'student' && <Button disabled={!classes.length} onClick={() => start()}><Plus className="size-4" />Publicar aviso</Button>} />
    <div className="mb-6 max-w-sm"><Select label="Turma" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todas as turmas</option>{db.classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
    <div className="max-w-4xl space-y-5">
      {items.map(a => <div key={a.id} id={`aviso-${a.id}`} className="scroll-mt-6"><Card>
        <div className="mb-4 flex flex-wrap items-center gap-2"><Badge tone="purple">{db.classes.find(c => c.id === a.classId)?.name}</Badge>{a.subjectId && <Badge>{db.subjects.find(s => s.id === a.subjectId)?.name}</Badge>}<span className="ml-auto text-xs text-slate-400">{dateLabel(a.createdAt)}</span></div>
        {a.occurrence && <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">Acontecimento: {dateLabel(a.occurrence.date)} · {a.occurrence.allDay ? 'Dia inteiro' : a.occurrence.time} (Brasília)</p>}
        <h2 className="mb-4 text-xl font-semibold">{a.title}</h2><p className="whitespace-pre-wrap break-words leading-8 text-slate-600">{a.body}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><Avatar name={db.users.find(u => u.id === a.authorId)?.name ?? 'Equipe AJA'} size="sm" /><span className="text-xs text-slate-500">{db.users.find(u => u.id === a.authorId)?.name ?? 'Equipe AJA'}</span>{a.notify && <span className="ml-auto text-xs text-slate-400">Notificação simulada</span>}</div>
        {a.updatedAt && <p className="mt-3 text-xs text-slate-500">Última alteração: {db.users.find(u => u.id === a.updatedBy)?.name ?? 'Equipe AJA'} · {new Date(a.updatedAt).toLocaleString('pt-BR')}</p>}
        {canManage(a) && <div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" onClick={() => start(a)}><Pencil className="size-4" />Editar aviso</Button><Button variant="ghost" disabled={busy} onClick={async () => {
          if (window.confirm(`Retirar este aviso das consultas? ${a.occurrence ? 'O compromisso também sairá do calendário. Se o encontro foi cancelado, comunique o motivo na mensagem antes da retirada. ' : ''}O registro e a autoria serão preservados; não há restauração pela interface.`)) await mutate(d => { d.announcements.find(item => item.id === a.id)!.deletedAt = new Date().toISOString(); }, 'Aviso retirado.', { requirePersistence: true, expected: [{ collection: 'announcements', id: a.id, revision: a.revision ?? 0 }] });
        }}><Trash2 className="size-4" />Retirar aviso</Button></div>}
      </Card></div>)}
    </div>
    {!items.length && <Empty title="Sem avisos nesta turma" description="As novidades da equipe aparecerão aqui." />}
    {composing && <AnnouncementComposer item={composing === 'new' ? undefined : composing} onClose={() => setComposing(null)} />}
  </>;
}
