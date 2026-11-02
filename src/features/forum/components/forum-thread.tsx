'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ThumbsUp } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Empty, LinkButton, Textarea } from '@/components/ui';
import { cn, dateLabel, uid } from '@/lib/utils';
import { forumReplies, forumTarget } from '@/lib/forum';
import { readForumDraft, saveForumDraft } from '@/lib/forum-draft';
import { ForumAttachments } from './forum-attachments';
import { RichText } from '@/components/ui/rich-text';

export function ForumThread() {
  const { user } = useApp();
  const params = useSearchParams();
  return <ForumThreadContent key={`${user.id}:${params.toString()}`} />;
}

function ForumThreadContent() {
  const {
    db,
    user,
    role,
    mutate,
    busy
  } = useApp();
  const id = useSearchParams().get('id') ?? 't1';
  const topic = db.topics.find(t => t.id === id);
  const canInteract = !!topic && db.classes.some(c => c.id === topic.classId && c.active);
  const [body, setBody] = useState('');
  const [draftReady, setDraftReady] = useState('');
  const [draftError, setDraftError] = useState('');
  const draftKey = `aja-forum-reply:${user.id}:${id}`;
  useEffect(() => {
    const restored = readForumDraft({ getItem: key => sessionStorage.getItem(key) }, draftKey);
    if (restored.error) { setDraftError(restored.error); return; }
    setBody(restored.value ?? '');
    setDraftReady(draftKey);
  }, [draftKey]);
  useEffect(() => {
    if (draftReady === draftKey) setDraftError(saveForumDraft({ setItem: (key, value) => sessionStorage.setItem(key, value) }, draftKey, body) ?? '');
  }, [body, draftKey, draftReady]);
  useEffect(() => {
    if (topic && !topic.readBy.includes(user.id)) void mutate(d => {
      const t = d.topics.find(t => t.id === id);
      if (t && !t.readBy.includes(user.id)) t.readBy.push(user.id);
    });
  }, [id, user.id, mutate, canInteract, topic?.replies.length, topic?.readBy.includes(user.id)]);
  if (!topic) return <Empty title="Pergunta indisponível" description="A pergunta foi retirada ou seu acesso à turma/disciplina foi encerrado." action={<LinkButton href="/forum">Voltar ao fórum</LinkButton>} />;
  const author = db.users.find(u => u.id === topic.authorId);
  const replies = forumReplies(topic);
  const target = forumTarget(db, topic);
  const canAccept = canInteract && (user.id === topic.authorId || role === 'admin' || role === 'teacher' && db.subjects.find(s => s.id === topic.subjectId)?.teacherIds.includes(user.id));
  const vote = async (replyId: string, value: 1) => void mutate(d => {
    const r = d.topics.find(t => t.id === id)?.replies.find(r => r.id === replyId);
    if (r) {
      if (r.votes[user.id] === value) delete r.votes[user.id];else r.votes[user.id] = value;
    }
  }, undefined, { requirePersistence: true });
  return <div className="mx-auto max-w-4xl [overflow-wrap:anywhere]">
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
      {target ? <div className="mt-5 rounded-lg bg-slate-50 p-4"><Link href={target.href} className="font-semibold text-brand-700">{target.title}</Link><p className="mt-2 whitespace-pre-line text-sm text-slate-600">{target.preview}</p></div> : target === null ? <p className="mt-5 text-sm text-amber-800">Referência indisponível: o alvo foi retirado ou não está acessível neste contexto. A conversa continua disponível.</p> : null}
      {topic.attachment && <ForumAttachments items={[{ ...topic.attachment, kind: 'file' }]} />}
      {!topic.attachment && topic.attachmentName && <p className="mt-4 text-sm text-slate-500">{topic.attachmentName} · registro antigo sem arquivo. Peça ao autor para compartilhar novamente.</p>}
      {canInteract && (user.id === topic.authorId || role !== 'student') && <Button className="mt-4" variant="ghost" onClick={() => {
        if (window.confirm('Retirar esta pergunta e suas respostas da consulta? O histórico permanece para auditoria, sem restauração pela interface.')) void mutate(d => { d.topics.find(t => t.id === id)!.deletedAt = new Date().toISOString(); }, 'Pergunta retirada.', { requirePersistence: true });
      }}>Retirar pergunta</Button>}
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
        <p className="mb-3 text-xs text-slate-500">{dateLabel(r.createdAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
        <RichText text={r.body} />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="ghost" aria-label="Votar positivamente" aria-pressed={r.votes[user.id] === 1} disabled={!canInteract || busy || r.authorId === user.id} className={cn(r.votes[user.id] === 1 && '!bg-brand-50 !text-brand-600')} onClick={() => void vote(r.id, 1)}>
            <ThumbsUp className="size-4" />
          </Button>
          <span className="text-sm font-semibold">
            {Object.values(r.votes).reduce<number>((a, b) => a + b, 0)}
          </span>
          {canInteract && (r.authorId === user.id || role !== 'student') && <Button variant="ghost" onClick={() => {
            if (window.confirm('Retirar esta resposta? A solução será desmarcada se necessário. O histórico permanece sem restauração pela interface.')) void mutate(d => { d.topics.find(t => t.id === id)!.replies.find(reply => reply.id === r.id)!.deletedAt = new Date().toISOString(); }, 'Resposta retirada.', { requirePersistence: true });
          }}>Retirar resposta</Button>}
          {canAccept && <Button variant="ghost" className="ml-auto" loading={busy} onClick={() => void mutate(d => {
              const t = d.topics.find(t => t.id === id)!;
              const was = t.replies.find(reply => reply.id === r.id)?.accepted;
              for (const reply of t.replies) reply.accepted = reply.id === r.id && !was;
            }, r.accepted ? 'Solução desmarcada.' : 'Solução aceita.', { requirePersistence: true })}>
            <CheckCircle2 className="size-4" />
            {r.accepted ? 'Desmarcar solução' : 'Aceitar como solução'}
          </Button>}
        </div>
      </Card>;
      })}
    </div>
    {canInteract ? <Card className="mt-6">
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
        }, 'Resposta publicada.', { requirePersistence: true })) setBody('');
      }}>
        <fieldset disabled={busy} className="min-w-0">
        <Textarea label="Sua resposta" placeholder="Compartilhe seu raciocínio. Uma boa explicação ajuda todo mundo." value={body} onChange={e => setBody(e.target.value)} required minLength={10} rows={5} className="text-base leading-7" />
        {draftError && <p role="alert" className="mt-3 text-sm text-rose-700">{draftError}</p>}
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!body.trim()} loading={busy}>Publicar resposta</Button>
        </div>
        </fieldset>
      </form>
    </Card> : <p className="mt-6 text-sm text-slate-500">Esta turma está inativa. O histórico permanece disponível para consulta da equipe autorizada.</p>}
  </div>;
}
