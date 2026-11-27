'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ThumbsUp } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import { useHttpQuery } from '@/hooks/use-http-query';
import { HttpError } from '@/lib/http-client';
import { Avatar, Badge, Button, Card, Dialog, Empty, LinkButton, Textarea } from '@/components/ui';
import { ErrorState } from '@/components/ui/error-state';
import { cn, countLabel, dateLabel } from '@/lib/utils';
import { forumReplyDraftKey, readForumDraft, saveForumDraft } from '../lib/forum-draft';
import { RichText } from '@/components/ui/rich-text';
import { createForumApi } from '../api';
import { ForumAttachments } from './forum-attachments';
import { toErrorMessage } from '@/lib/errors';

export function ForumThread() {
  const { user } = useSession();
  const id = useSearchParams().get('id') ?? '';
  return <ForumThreadContent key={`${user?.id ?? ''}:${id}`} />;
}

function ForumThreadContent() {
  const { client, sessionKey, user } = useSession();
  const id = useSearchParams().get('id') ?? '';
  const api = useMemo(() => createForumApi(client), [client]);
  const query = useHttpQuery(
    { sessionKey, key: `forum-topic:${id}` },
    useCallback((signal) => api.read(id, signal), [api, id]),
    !!user && !!id
  );
  const topic = query.data;
  const draftKey = user ? forumReplyDraftKey(user.id, id) : '';
  const [body, setBody] = useState('');
  const [pendingReply, setPendingReply] = useState<{ key: string; body: string }>();
  const [loadedKey, setLoadedKey] = useState('');
  const [draftError, setDraftError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<
    { kind: 'topic' } | { kind: 'reply'; replyId: string } | null
  >(null);
  const options = useHttpQuery(
    { sessionKey, key: 'forum-options' },
    useCallback((signal) => api.options(signal), [api]),
    !!user
  );
  const activeClass =
    !!topic && !!options.data?.classes.find((row) => row.id === topic.classId && row.active);
  const canManage =
    !!topic &&
    (user?.role === 'admin' ||
      !!options.data?.subjects.find((row) => row.id === topic.subjectId)?.canManageContent);
  const canResolve = !!topic && (user?.id === topic.author.id || canManage);

  useEffect(() => {
    if (!draftKey || loadedKey === draftKey) return;
    const restored = readForumDraft({ getItem: (key) => sessionStorage.getItem(key) }, draftKey);
    if (restored.error) {
      setDraftError(restored.error);
      return;
    }
    const text = restored.value ?? '';
    try {
      const saved = JSON.parse(text) as {
        body?: string;
        pendingReply?: { key: string; body: string };
      };
      if (saved && typeof saved === 'object' && typeof saved.body === 'string') {
        setBody(saved.body);
        setPendingReply(saved.pendingReply);
      } else setBody(text);
    } catch {
      setBody(text);
    }
    setLoadedKey(draftKey);
  }, [draftKey, loadedKey]);
  useEffect(() => {
    if (loadedKey === draftKey && draftKey)
      setDraftError(
        saveForumDraft(
          { setItem: (key, value) => sessionStorage.setItem(key, value) },
          draftKey,
          JSON.stringify({ body, pendingReply })
        ) ?? ''
      );
  }, [body, draftKey, loadedKey, pendingReply]);
  // Read markers are server-owned and are set once for each unread topic.
  const hasTopic = !!topic;
  const topicRead = topic?.read;
  const { invalidate, loading: queryLoading } = query;
  useEffect(() => {
    if (hasTopic && !topicRead && !queryLoading)
      void api
        .markRead(id)
        .then(() => {
          invalidate();
        })
        .catch((cause) =>
          setError(toErrorMessage(cause, 'Não foi possível marcar a conversa como lida.'))
        );
  }, [api, id, hasTopic, topicRead, queryLoading, invalidate]);

  const updateTopic = async (action: () => Promise<unknown>, clearReply = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      if (clearReply) {
        setBody('');
        setPendingReply(undefined);
        if (draftKey) sessionStorage.removeItem(draftKey);
      }
      query.invalidate();
    } catch (cause) {
      if (
        clearReply &&
        cause instanceof HttpError &&
        ['forbidden', 'not-found', 'validation', 'conflict'].includes(cause.kind)
      )
        setPendingReply(undefined);
      setError(
        toErrorMessage(
          cause,
          'Não foi possível salvar a alteração. Tente novamente para conferir o resultado.'
        )
      );
    } finally {
      setBusy(false);
    }
  };
  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    if (!topic || !body.trim()) return;
    const intent = pendingReply ?? { key: crypto.randomUUID(), body: body.trim() };
    setPendingReply(intent);
    if (draftKey)
      saveForumDraft(
        { setItem: (key, value) => sessionStorage.setItem(key, value) },
        draftKey,
        JSON.stringify({ body: intent.body, pendingReply: intent })
      );
    void updateTopic(() => api.reply(id, intent.body, intent.key), true);
  };
  if (query.loading)
    return (
      <p role="status" className="text-sm text-slate-500">
        Carregando conversa…
      </p>
    );
  if (query.error)
    return (
      <>
        <LinkButton secondary href="/forum" className="mb-5">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar ao fórum
        </LinkButton>
        <ErrorState message={query.error.message} retry={query.retry} />
      </>
    );
  if (!topic)
    return (
      <Empty
        title="Pergunta indisponível"
        description="A pergunta foi retirada ou seu acesso à turma/disciplina foi encerrado."
        action={<LinkButton href="/forum">Voltar ao fórum</LinkButton>}
      />
    );
  const solved = topic.replies.some((reply) => reply.accepted);
  return (
    <div className="mx-auto max-w-4xl [overflow-wrap:anywhere]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <LinkButton secondary href="/forum">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar ao fórum
        </LinkButton>
        <span className="text-sm text-slate-500">
          Fórum de dúvidas /{' '}
          {options.data?.subjects.find((row) => row.id === topic.subjectId)?.name ??
            topic.subjectId}
        </span>
      </div>
      <Card>
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={topic.author.name} />
          <div>
            <p className="text-sm font-semibold">{topic.author.name}</p>
            <p className="text-xs text-slate-400">
              {dateLabel(topic.createdAt, {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          {solved && (
            <span className="ml-auto">
              <Badge tone="green">Resolvida</Badge>
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold leading-snug">{topic.title}</h1>
        <div className="my-5">
          <RichText text={topic.body} />
        </div>
        <div className="flex flex-wrap gap-2">
          {topic.tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
        {topic.reference ? (
          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <Link
              href={topic.reference.href}
              className="font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
            >
              {topic.reference.title}
            </Link>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
              {topic.reference.preview}
            </p>
          </div>
        ) : (
          topic.target && (
            <p className="mt-5 text-sm text-amber-800">
              Referência indisponível: o conteúdo não está disponível neste contexto. A conversa
              continua disponível.
            </p>
          )
        )}
        {topic.attachment && (
          <ForumAttachments
            item={topic.attachment}
            readContent={(fileId, inline) => api.readFileContent(fileId, inline)}
          />
        )}
        {!topic.attachment && topic.legacyAttachmentName && (
          <p className="mt-4 text-sm text-slate-500">
            {topic.legacyAttachmentName} · registro antigo sem arquivo. Peça ao autor para
            compartilhar novamente.
          </p>
        )}
        {activeClass && (user?.id === topic.author.id || canManage) && (
          <Button
            className="mt-4 !text-rose-700 hover:!bg-rose-50"
            variant="ghost"
            disabled={busy}
            onClick={() => setWithdrawTarget({ kind: 'topic' })}
          >
            Retirar pergunta
          </Button>
        )}
      </Card>
      <h2 className="mb-4 mt-8 text-lg font-semibold">
        {countLabel(topic.replies.length, 'resposta', 'respostas')}
      </h2>
      <div className="space-y-4">
        {topic.replies.map((reply) => (
          <Card
            key={reply.id}
            className={cn(reply.accepted && '!border-brand-300 !bg-brand-50/30')}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Avatar name={reply.author.name} size="sm" />
              <span className="text-sm font-semibold">{reply.author.name}</span>
              {reply.accepted && (
                <span className="ml-auto">
                  <Badge tone="green">
                    <CheckCircle2 aria-hidden="true" className="size-3" />
                    Solução aceita
                  </Badge>
                </span>
              )}
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {dateLabel(reply.createdAt, {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
            <RichText text={reply.body} />
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                aria-label="Votar positivamente"
                aria-pressed={reply.votedByMe}
                disabled={!activeClass || busy || reply.author.id === user?.id}
                className={cn(reply.votedByMe && '!bg-brand-50 !text-brand-600')}
                onClick={() => void updateTopic(() => api.vote(id, reply.id, !reply.votedByMe))}
              >
                <ThumbsUp aria-hidden="true" className="size-4" />
              </Button>
              <span className="text-sm font-semibold">{reply.voteCount}</span>
              {activeClass && (reply.author.id === user?.id || canManage) && (
                <Button
                  variant="ghost"
                  className="!text-rose-700 hover:!bg-rose-50"
                  disabled={busy}
                  onClick={() => setWithdrawTarget({ kind: 'reply', replyId: reply.id })}
                >
                  Retirar resposta
                </Button>
              )}
              {canResolve && activeClass && (
                <Button
                  variant="ghost"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() =>
                    void updateTopic(() =>
                      api.solution(id, reply.accepted ? null : reply.id, topic.revision)
                    )
                  }
                >
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  {reply.accepted ? 'Desmarcar solução' : 'Aceitar como solução'}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {activeClass ? (
        <Card className="mt-6">
          <form onSubmit={submitReply}>
            <fieldset disabled={busy || !!pendingReply} className="min-w-0">
              <Textarea
                label="Sua resposta"
                placeholder="Escreva sua resposta…"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
                minLength={10}
                rows={5}
                className="text-base leading-7"
              />
              {draftError && (
                <p role="alert" className="mt-3 text-sm text-rose-700">
                  {draftError}
                </p>
              )}
            </fieldset>
            {error && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={!body.trim() || busy} loading={busy}>
                {pendingReply ? 'Tentar publicar novamente' : 'Publicar resposta'}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-slate-500">Esta turma está inativa.</p>
      )}
      {error && !activeClass && (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Dialog
        open={!!withdrawTarget}
        onClose={() => {
          if (!busy) setWithdrawTarget(null);
        }}
        title={withdrawTarget?.kind === 'topic' ? 'Retirar pergunta?' : 'Retirar resposta?'}
      >
        {withdrawTarget && (
          <>
            <p className="mb-5 text-sm leading-6 text-slate-600">
              {withdrawTarget.kind === 'topic'
                ? 'Retirar esta pergunta e suas respostas da consulta? O histórico permanece para auditoria.'
                : 'Retirar esta resposta? A solução será desmarcada e o histórico será preservado.'}
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" disabled={busy} onClick={() => setWithdrawTarget(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={async () => {
                  const target = withdrawTarget;
                  await updateTopic(() =>
                    target.kind === 'topic'
                      ? api.withdrawTopic(id, topic.revision)
                      : api.withdrawReply(id, target.replyId, topic.revision)
                  );
                  setWithdrawTarget(null);
                }}
              >
                {withdrawTarget.kind === 'topic' ? 'Retirar pergunta' : 'Retirar resposta'}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
