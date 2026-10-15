'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Avatar, Badge, Button, Card, Check, Dialog, Empty, Input, PageHeading, Select, Textarea } from '@/components/ui';
import { dateLabel, uid } from '@/lib/utils';
export function AnnouncementsPage() {
  const {
    db,
    user,
    role,
    mutate,
    busy
  } = useApp();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [classId, setClassId] = useState('c1');
  const [subject, setSubject] = useState('');
  const [notify, setNotify] = useState(true);
  const items = db.announcements.filter(a => filter === 'all' || a.classId === filter);
  return <>
    <PageHeading title="Mural de avisos" description="Comunicados e informações das turmas." action={role !== 'student' && <Button onClick={() => setOpen(true)}><Plus className="size-4" />Publicar aviso</Button>} />
    <div className="mb-6 max-w-sm">
      <Select label="Turma" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">Todas as turmas</option>
        {db.classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>
          {c.name}
        </option>)}
      </Select>
    </div>
    <div className="max-w-4xl space-y-5">
      {items.map(a => <Card key={a.id}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone="purple">
            {db.classes.find(c => c.id === a.classId)?.name}
          </Badge>
          {a.subjectId && <Badge>
            {db.subjects.find(s => s.id === a.subjectId)?.name}
          </Badge>}
          <span className="ml-auto text-xs text-slate-400">
            {dateLabel(a.createdAt)}
          </span>
        </div>
        <h2 className="mb-4 text-xl font-semibold">
          {a.title}
        </h2>
        <p className="whitespace-pre-wrap leading-8 text-slate-600">
          {a.body}
        </p>
        <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4">
          <Avatar name={db.users.find(u => u.id === a.authorId)?.name ?? 'Equipe AJA'} size="sm" />
          <span className="text-xs text-slate-500">
            {db.users.find(u => u.id === a.authorId)?.name}
          </span>
          {a.notify && <span className="ml-auto text-xs text-slate-400">Notificação simulada</span>}
        </div>
      </Card>)}
    </div>
    {!items.length && <Empty title="Sem avisos nesta turma" description="As novidades da equipe aparecerão aqui." />}
    <Dialog open={open} onClose={() => setOpen(false)} title="Publicar aviso">
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        if (await mutate(d => {
          d.announcements.unshift({
            id: uid('notice'),
            classId,
            subjectId: subject || undefined,
            authorId: user.id,
            title: title.trim(),
            body: body.trim(),
            createdAt: new Date().toISOString(),
            notify
          });
        }, notify ? 'Aviso publicado. Notificação por e-mail simulada.' : 'Aviso publicado.')) {
          setOpen(false);
          setTitle('');
          setBody('');
        }
      }}>
        <Input label="Título" value={title} onChange={e => setTitle(e.target.value)} required maxLength={150} />
        <Select label="Turma" value={classId} onChange={e => {
          setClassId(e.target.value);
          setSubject('');
        }}>
          {db.classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>
            {c.name}
          </option>)}
        </Select>
        <Select label="Disciplina" value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="">Aviso geral da turma</option>
          {db.subjects.filter(s => s.classId === classId).map(s => <option key={s.id} value={s.id}>
            {s.name}
          </option>)}
        </Select>
        <Textarea label="Mensagem" value={body} onChange={e => setBody(e.target.value)} required rows={6} />
        <Check label="Simular notificação por e-mail para os alunos" checked={notify} onChange={setNotify} />
        <Button type="submit" loading={busy}>Publicar aviso</Button>
      </form>
    </Dialog>
  </>;
}
