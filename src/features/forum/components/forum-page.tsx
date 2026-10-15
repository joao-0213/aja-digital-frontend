'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Plus, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { dateLabel, textMatch, uid } from '@/lib/utils';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

export function ForumPage() {
  const {
    db,
    user,
    mutate,
    busy
  } = useApp();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState(params.get('disciplina') ?? 'all');
  const [filter, setFilter] = useState('all');
  const [classId, setClassId] = useState('c1');
  const [open, setOpen] = useState(!!params.get('questao'));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetSubject, setTargetSubject] = useState(params.get('disciplina') ?? 's1');
  const [tags, setTags] = useState('');
  const [attachment, setAttachment] = useState('');
  const [reference, setReference] = useState(params.get('questao') ?? '');
  const [error, setError] = useState('');
  const topics = db.topics.filter(t => t.classId === classId && (subject === 'all' || t.subjectId === subject) && textMatch(t.title + ' ' + t.body + ' ' + t.tags.join(' '), search) && (filter === 'all' || filter === 'unread' && !t.readBy.includes(user.id) || filter === 'unanswered' && !t.replies.length || filter === 'solved' && t.replies.some(r => r.accepted))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <>
    <PageHeading eyebrow="Comunidade AJA" title="Fórum de dúvidas" description="Publique dúvidas e consulte as respostas da turma." action={<Button onClick={() => {
      setError('');
      setOpen(true);
    }}><Plus className="size-4" />Nova pergunta</Button>} />
    <div className="mb-6 grid gap-3 md:grid-cols-[1fr_220px_200px]">
      <Input aria-label="Buscar no fórum" value={search} onChange={e => setSearch(e.target.value)} placeholder="Busque uma dúvida ou um assunto…" />
      <Select aria-label="Turma do fórum" value={classId} onChange={e => {
        setClassId(e.target.value);
        setSubject('all');
        setTargetSubject(db.subjects.find(s => s.classId === e.target.value)?.id ?? '');
      }}>
        {db.classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>
          {c.name}
        </option>)}
      </Select>
      <Select aria-label="Disciplina do fórum" value={subject} onChange={e => setSubject(e.target.value)}>
        <option value="all">Todas as disciplinas</option>
        {db.subjects.filter(s => s.classId === classId).map(s => <option key={s.id} value={s.id}>
          {s.name}
        </option>)}
      </Select>
    </div>
    <div className="mb-6 flex flex-wrap gap-2">
      {[['all', 'Todas'], ['unread', 'Não lidas'], ['unanswered', 'Sem resposta'], ['solved', 'Resolvidas']].map(([id, label]) => <Button key={id} variant={filter === id ? 'primary' : 'secondary'} onClick={() => setFilter(id)}>
        {label}
      </Button>)}
    </div>
    <div className="space-y-4">
      {topics.map(t => {
        const author = db.users.find(u => u.id === t.authorId);
        const solved = t.replies.some(r => r.accepted);
        return <Link key={t.id} href={`/forum/topico?id=${t.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-200 sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar name={author?.name ?? 'Aluno'} />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>
                {author?.name}
              </span>
              <span>· {dateLabel(t.createdAt)}</span>
              <Badge tone="purple">
                {db.subjects.find(s => s.id === t.subjectId)?.name}
              </Badge>
              {!t.readBy.includes(user.id) && <Badge tone="blue">Não lida</Badge>}
            </div>
            <h2 className="text-base font-semibold leading-7 sm:text-lg">
              {t.title}
            </h2>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
              {t.body}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {t.tags.map(tag => <Badge key={tag}>#{tag}</Badge>)}
              <span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-400">{solved && <CheckCircle2 className="size-4 text-emerald-500" />}<MessageSquare className="size-4" />{t.replies.length} respostas</span>
            </div>
          </div>
        </div>
      </Link>;
      })}
      {!topics.length && <Empty title="A conversa pode começar com você" description="Nenhuma pergunta encontrada nesta seleção." action={<Button onClick={() => setOpen(true)}>Fazer uma pergunta</Button>} />}
    </div>
    <Dialog open={open} onClose={() => setOpen(false)} title="O que você quer entender melhor?">
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        setError('');
        const selected = db.subjects.find(s => s.id === targetSubject);
        if (!selected) {
          setError('Selecione uma disciplina.');
          return;
        }
        if (await mutate(d => {
          d.topics.unshift({
            id: uid('topic'),
            classId: selected.classId,
            subjectId: targetSubject,
            authorId: user.id,
            title: title.trim(),
            body: body.trim(),
            tags: [...new Set(tags.split(',').map(t => t.trim()).filter(Boolean))].slice(0, 5),
            createdAt: new Date().toISOString(),
            replies: [],
            readBy: [user.id],
            reference: reference || undefined,
            attachmentName: attachment || undefined
          });
        }, 'Pergunta publicada.')) {
          setOpen(false);
          setTitle('');
          setBody('');
          setTags('');
          setAttachment('');
          setReference('');
          setFilter('all');
          setSubject('all');
          setClassId(selected.classId);
        }
      }}>
        <Input label="Título da pergunta" value={title} onChange={e => setTitle(e.target.value)} required minLength={8} maxLength={180} />
        <Select label="Disciplina" value={targetSubject} onChange={e => setTargetSubject(e.target.value)}>
          {db.subjects.map(s => <option key={s.id} value={s.id}>{s.name} · {db.classes.find(c => c.id === s.classId)?.name}</option>)}
        </Select>
        <RichTextEditor label="Conte sua dúvida" placeholder="Explique o que você já tentou e onde encontrou dificuldade." value={body} onChange={setBody} />
        <Input label="Tags (separe por vírgulas, até 5)" value={tags} onChange={e => setTags(e.target.value)} placeholder="funções, gráficos" />
        <Select label="Referenciar uma questão (opcional)" value={reference} onChange={e => setReference(e.target.value)}>
          <option value="">Sem referência</option>
          {db.questions.map(q => <option key={q.id} value={q.id}>{q.id.toUpperCase()} · {q.topic}</option>)}
        </Select>
        <Input label="Anexo de exemplo (somente o nome será salvo)" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => {
          const file = e.target.files?.[0];
          if (file && file.size > 5 * 1024 * 1024) {
            setError('Escolha um arquivo de até 5 MB.');
            e.target.value = '';
            return;
          }
          setAttachment(file?.name ?? '');
          setError('');
        }} />
        {error && <p className="text-sm text-rose-600">
          {error}
        </p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" loading={busy}>Publicar pergunta</Button>
        </div>
      </form>
    </Dialog>
  </>;
}
