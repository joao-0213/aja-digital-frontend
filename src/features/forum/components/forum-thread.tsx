'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ThumbsUp, ThumbsDown, Paperclip } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Empty, LinkButton } from '@/components/ui';
import { cn, dateLabel, uid } from '@/lib/utils';
import { RichText } from '@/components/ui/rich-text';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

export function ForumThread() {
  const {
    db,
    user,
    role,
    mutate,
    busy
  } = useApp();
  const id = useSearchParams().get('id') ?? 't1';
  const topic = db.topics.find(t => t.id === id);
  const [body, setBody] = useState('');
  useEffect(() => {
    if (topic && !topic.readBy.includes(user.id)) void mutate(d => {
      const t = d.topics.find(t => t.id === id);
      if (t && !t.readBy.includes(user.id)) t.readBy.push(user.id);
    });
  }, [id, user.id, mutate]);
  if (!topic) return <Empty title="Pergunta não encontrada" action={<LinkButton href="/forum">Voltar ao fórum</LinkButton>} />;
  const author = db.users.find(u => u.id === topic.authorId);
  const replies = [...topic.replies].sort((a, b) => Number(b.accepted) - Number(a.accepted) || a.createdAt.localeCompare(b.createdAt));
  const canAccept = user.id === topic.authorId || role === 'admin' || role === 'teacher' && db.subjects.find(s => s.id === topic.subjectId)?.teacherId === user.id;
  const vote = async (replyId: string, value: -1 | 1) => void mutate(d => {
    const r = d.topics.find(t => t.id === id)?.replies.find(r => r.id === replyId);
    if (r) {
      if (r.votes[user.id] === value) delete r.votes[user.id];else r.votes[user.id] = value;
    }
  });
  return <div className="mx-auto max-w-4xl">
    <Link href="/forum" className="mb-6 inline-block text-sm font-semibold text-brand-600">Fórum de dúvidas / {db.subjects.find(s => s.id === topic.subjectId)?.name}</Link>
    <Card>
      <div className="mb-5 flex items-center gap-3">
        <Avatar name={author?.name ?? 'Aluno'} />
        <div>
          <p className="text-sm font-semibold">
            {author?.name}
          </p>
          <p className="text-xs text-slate-400">
            {dateLabel(topic.createdAt, {
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
        {topic.replies.some(r => r.accepted) && <span className="ml-auto">
          <Badge tone="green">Resolvida</Badge>
        </span>}
      </div>
      <h1 className="text-2xl font-semibold leading-snug">
        {topic.title}
      </h1>
      <div className="my-5">
        <RichText text={topic.body} />
      </div>
      <div className="flex flex-wrap gap-2">
        {topic.tags.map(t => <Badge key={t}>#{t}</Badge>)}
      </div>
      {topic.reference && <Link href={`/questoes?busca=${encodeURIComponent(db.questions.find(q => q.id === topic.reference)?.topic ?? '')}`} className="mt-5 block text-sm font-semibold text-brand-600">Consultar questão {topic.reference.toUpperCase()}</Link>}
      {topic.attachmentName && <p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><Paperclip className="size-4" />{topic.attachmentName} · anexo simulado</p>}
    </Card>
    <h2 className="mb-4 mt-8 text-lg font-semibold">
      {replies.length}
      {replies.length === 1 ? ' resposta' : ' respostas'}
    </h2>
    <div className="space-y-4">
      {replies.map(r => {
        const u = db.users.find(u => u.id === r.authorId);
        return <Card key={r.id} className={cn(r.accepted && '!border-brand-300 !bg-brand-50/30')}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Avatar name={u?.name ?? 'Aluno'} size="sm" />
          <span className="text-sm font-semibold">
            {u?.name}
          </span>
          {u?.role === 'teacher' && <Badge tone="purple">Professora</Badge>}
          {r.accepted && <span className="ml-auto">
            <Badge tone="green"><CheckCircle2 className="size-3" />Solução aceita</Badge>
          </span>}
        </div>
        <RichText text={r.body} />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="ghost" aria-label="Votar positivamente" aria-pressed={r.votes[user.id] === 1} disabled={busy || r.authorId === user.id} className={cn(r.votes[user.id] === 1 && '!bg-brand-50 !text-brand-600')} onClick={() => void vote(r.id, 1)}>
            <ThumbsUp className="size-4" />
          </Button>
          <span className="text-sm font-semibold">
            {Object.values(r.votes).reduce<number>((a, b) => a + b, 0)}
          </span>
          <Button variant="ghost" aria-label="Votar negativamente" aria-pressed={r.votes[user.id] === -1} disabled={busy || r.authorId === user.id} className={cn(r.votes[user.id] === -1 && '!bg-brand-50 !text-brand-600')} onClick={() => void vote(r.id, -1)}>
            <ThumbsDown className="size-4" />
          </Button>
          {canAccept && <Button variant="ghost" className="ml-auto" loading={busy} onClick={() => void mutate(d => {
              const t = d.topics.find(t => t.id === id)!;
              const was = t.replies.find(reply => reply.id === r.id)?.accepted;
              for (const reply of t.replies) reply.accepted = reply.id === r.id && !was;
            }, r.accepted ? 'Solução desmarcada.' : 'Solução aceita.')}>
            <CheckCircle2 className="size-4" />
            {r.accepted ? 'Desmarcar solução' : 'Aceitar como solução'}
          </Button>}
        </div>
      </Card>;
      })}
    </div>
    <Card className="mt-6">
      <form onSubmit={async e => {
        e.preventDefault();
        if (await mutate(d => {
          d.topics.find(t => t.id === id)!.replies.push({
            id: uid('reply'),
            authorId: user.id,
            body: body.trim(),
            createdAt: new Date().toISOString(),
            votes: {},
            accepted: false
          });
        }, 'Resposta publicada.')) setBody('');
      }}>
        <RichTextEditor label="Sua resposta" placeholder="Compartilhe seu raciocínio. Uma boa explicação ajuda todo mundo." value={body} onChange={setBody} />
        <div className="mt-4 flex justify-end">
          <Button type="submit" loading={busy}>Publicar resposta</Button>
        </div>
      </form>
    </Card>
  </div>;
}
