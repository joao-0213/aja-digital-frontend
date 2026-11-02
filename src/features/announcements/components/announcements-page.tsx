'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Check, Dialog, Empty, Input, PageHeading, Select, Textarea } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useRecordRevision } from '@/hooks/use-record-revision';
import { canManageSubject } from '@/lib/access';
import { dateLabel, uid } from '@/lib/utils';
import type { Announcement } from '@/models';

export function AnnouncementsPage() {
  const { db, user, role, mutate, busy } = useApp();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [notify, setNotify] = useState(true);
  const editing = db.announcements.find(a => a.id === editingId);
  const revision = useRecordRevision('announcements', editing);
  const managed = db.subjects.filter(s => canManageSubject(db, user, s.id));
  const classes = db.classes.filter(c => c.active && (role === 'admin' || managed.some(s => s.classId === c.id)));
  const canManage = (a: Announcement) => role === 'admin' || !!a.subjectId && canManageSubject(db, user, a.subjectId);
  const start = (item?: Announcement) => {
    const target = item?.classId ?? classes[0]?.id ?? '';
    setEditingId(item?.id ?? null);
    revision.capture(item);
    setTitle(item?.title ?? ''); setBody(item?.body ?? ''); setClassId(target);
    setSubject(item?.subjectId ?? (role === 'teacher' ? managed.find(s => s.classId === target)?.id ?? '' : ''));
    setNotify(item?.notify ?? true); setOpen(true);
  };
  const dirty = editing ? title !== editing.title || body !== editing.body || subject !== (editing.subjectId ?? '') || notify !== editing.notify : !!title || !!body;
  const close = () => { if (!busy && (!dirty || window.confirm('Descartar as alterações não salvas do aviso?'))) setOpen(false); };
  const items = db.announcements.filter(a => filter === 'all' || a.classId === filter);
  return <>
    <PageHeading title="Mural de avisos" description="Comunicados e informações das turmas." action={role !== 'student' && <Button disabled={!classes.length} onClick={() => start()}><Plus className="size-4" />Publicar aviso</Button>} />
    <div className="mb-6 max-w-sm"><Select label="Turma" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todas as turmas</option>{db.classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
    <div className="max-w-4xl space-y-5">
      {items.map(a => <Card key={a.id}>
        <div className="mb-4 flex flex-wrap items-center gap-2"><Badge tone="purple">{db.classes.find(c => c.id === a.classId)?.name}</Badge>{a.subjectId && <Badge>{db.subjects.find(s => s.id === a.subjectId)?.name}</Badge>}<span className="ml-auto text-xs text-slate-400">{dateLabel(a.createdAt)}</span></div>
        <h2 className="mb-4 text-xl font-semibold">{a.title}</h2><p className="whitespace-pre-wrap break-words leading-8 text-slate-600">{a.body}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><Avatar name={db.users.find(u => u.id === a.authorId)?.name ?? 'Equipe AJA'} size="sm" /><span className="text-xs text-slate-500">{db.users.find(u => u.id === a.authorId)?.name ?? 'Equipe AJA'}</span>{a.notify && <span className="ml-auto text-xs text-slate-400">Notificação simulada</span>}</div>
        {a.updatedAt && <p className="mt-3 text-xs text-slate-500">Última alteração: {db.users.find(u => u.id === a.updatedBy)?.name ?? 'Equipe AJA'} · {new Date(a.updatedAt).toLocaleString('pt-BR')}</p>}
        {canManage(a) && <div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" onClick={() => start(a)}><Pencil className="size-4" />Editar aviso</Button><Button variant="ghost" disabled={busy} onClick={async () => {
          if (window.confirm('Retirar este aviso das consultas? O registro e a autoria serão preservados; não há restauração pela interface.')) await mutate(d => { d.announcements.find(item => item.id === a.id)!.deletedAt = new Date().toISOString(); }, 'Aviso retirado.', { expected: [{ collection: 'announcements', id: a.id, revision: a.revision ?? 0 }] });
        }}><Trash2 className="size-4" />Retirar aviso</Button></div>}
      </Card>)}
    </div>
    {!items.length && <Empty title="Sem avisos nesta turma" description="As novidades da equipe aparecerão aqui." />}
    <Dialog open={open} onClose={close} title={editingId ? 'Editar aviso' : 'Publicar aviso'}>
      {editingId && !editing ? <Empty title="Aviso indisponível" description="O aviso foi retirado ou sua atribuição mudou. Seu texto não foi publicado." action={<Button onClick={() => setOpen(false)}>Fechar</Button>} /> : <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        if (revision.conflict) return;
        if (await mutate(d => {
          if (editing) Object.assign(d.announcements.find(a => a.id === editing.id)!, { title: title.trim(), body: body.trim(), notify });
          else d.announcements.unshift({ id: uid('notice'), classId, subjectId: subject || undefined, authorId: user.id, title: title.trim(), body: body.trim(), createdAt: new Date().toISOString(), notify });
        }, editing ? 'Aviso atualizado.' : notify ? 'Aviso publicado. Notificação por e-mail simulada.' : 'Aviso publicado.', editing ? revision.expected : undefined)) { setOpen(false); setTitle(''); setBody(''); }
      }}>
        {revision.conflict && editing && <RecordConflict key={editing.revision} author={db.users.find(u => u.id === editing.updatedBy)?.name ?? 'Equipe AJA'} updatedAt={editing.updatedAt} onReviewed={revision.acknowledge}><p><strong>{editing.title}</strong></p><p>{editing.body}</p><p>Notificação simulada: {editing.notify ? 'Sim' : 'Não'}</p></RecordConflict>}
        <Select label="Turma" value={classId} disabled={!!editing} required onChange={e => { const next = e.target.value; setClassId(next); setSubject(role === 'teacher' ? managed.find(s => s.classId === next)?.id ?? '' : ''); }}><option value="" disabled>Selecione a turma</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select label="Disciplina" value={subject} disabled={!!editing} required={role === 'teacher'} onChange={e => setSubject(e.target.value)}>{role === 'admin' ? <option value="">Aviso geral da turma</option> : <option value="" disabled>Selecione a disciplina</option>}{managed.filter(s => s.classId === classId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        {role === 'teacher' && <p className="text-xs leading-5 text-slate-500">Você publica nas disciplinas atribuídas. Comunicados para toda a turma são publicados pela administração.</p>}
        <Input label="Título" value={title} onChange={e => setTitle(e.target.value)} required maxLength={150} /><Textarea label="Mensagem" value={body} onChange={e => setBody(e.target.value)} required rows={6} />
        <Check label="Simular notificação por e-mail para os alunos" checked={notify} onChange={setNotify} />
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={close}>Cancelar</Button><Button type="submit" loading={busy} disabled={revision.conflict}>{editing ? 'Salvar aviso' : 'Publicar aviso'}</Button></div>
      </form>}
    </Dialog>
  </>;
}
