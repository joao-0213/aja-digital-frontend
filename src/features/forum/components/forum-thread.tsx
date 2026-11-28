'use client';

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ThumbsUp } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import { HttpError } from '@/lib/http-client';
import { useHttpQuery } from '@/hooks/use-http-query';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  Empty,
  ErrorState,
  LinkButton,
  RichText,
  Skeleton,
  Textarea
} from '@/components/ui';
import { cn, countLabel, dateLabel } from '@/lib/utils';
import { forumKeys, useForumApi } from '../hooks/use-forum';
import { useForumReply } from '../hooks/use-forum-reply';
import { ForumAttachments } from './forum-attachments';
import { toErrorMessage } from '@/lib/errors';

export function ForumThread() {
  const { user } = useSession();
  const id = useSearchParams().get('id') ?? '';
  return <ForumThreadContent key={`${user?.id ?? ''}:${id}`} />;
}

function ForumThreadContent() {
  const { notify } = useApp();
  const { client, sessionKey, user } = useSession();
  const router = useRouter();
  const id = useSearchParams().get('id') ?? '';
  const api = useForumApi();
  const query = useHttpQuery(
    { sessionKey, key: forumKeys.detail(id) },
    useCallback((signal) => api.read(id, signal), [api, id]),
    !!user && !!id
  );
  const topic = query.data;
  const invalidateForum = useCallback(() => {
    void client.invalidateQueries(['forum']);
  }, [client]);
  const replyState = useForumReply({
    userId: user?.id,
    topicId: id,
    onInvalidate: invalidateForum
  });
  const options = useHttpQuery(
    { sessionKey, key: ['forum', 'options'] },
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

  // Read markers are server-owned and are set once for each unread topic.
  const hasTopic = !!topic;
  const topicRead = topic?.read;
  const { loading: queryLoading } = query;
  useEffect(() => {
    if (hasTopic && !topicRead && !queryLoading)
      void api
        .markRead(id)
        .then(() => {
          void client.invalidateQueries(['forum']);
        })
        .catch((cause) =>
          replyState.setError(
            toErrorMessage(cause, 'Não foi possível marcar a conversa como lida.')
          )
        );
  }, [api, client, id, hasTopic, topicRead, queryLoading, replyState.setError]);

  if (query.loading) return <Skeleton />;
  if (query.error) {
    if (query.error instanceof HttpError && query.error.status === 404) {
      return (
        <Empty
          title="Pergunta indisponível"
          description="A pergunta foi retirada ou seu acesso à turma/disciplina foi encerrado."
          action={<LinkButton href="/forum">Voltar ao fórum</LinkButton>}
        />
      );
    }
    return (
      <>
        <LinkButton secondary href="/forum" className="mb-5">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar ao fórum
        </LinkButton>
        <ErrorState message={query.error.message} retry={query.retry} />
      </>
    );
  }
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
            className="mt-4"
            variant="danger-ghost"
            disabled={replyState.busy}
            onClick={() => replyState.setWithdrawTarget({ kind: 'topic' })}
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
                disabled={!activeClass || replyState.busy || reply.author.id === user?.id}
                className={cn(reply.votedByMe && '!bg-brand-50 !text-brand-600')}
                onClick={() =>
                  void replyState.updateTopic(() => api.vote(id, reply.id, !reply.votedByMe))
                }
              >
                <ThumbsUp aria-hidden="true" className="size-4" />
              </Button>
              <span className="text-sm font-semibold">{reply.voteCount}</span>
              {activeClass && (reply.author.id === user?.id || canManage) && (
                <Button
                  variant="danger-ghost"
                  disabled={replyState.busy}
                  onClick={() => replyState.setWithdrawTarget({ kind: 'reply', replyId: reply.id })}
                >
                  Retirar resposta
                </Button>
              )}
              {canResolve && activeClass && (
                <Button
                  variant="ghost"
                  className="ml-auto"
                  disabled={replyState.busy}
                  onClick={() =>
                    void replyState.updateTopic(() =>
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
          <form onSubmit={(event) => replyState.submitReply(event, !!topic)}>
            <fieldset disabled={replyState.busy || !!replyState.pendingReply} className="min-w-0">
              <Textarea
                label="Sua resposta"
                placeholder="Escreva sua resposta…"
                value={replyState.body}
                onChange={(event) => replyState.setBody(event.target.value)}
                required
                minLength={10}
                rows={5}
                className="text-base leading-7"
              />
              {replyState.draftError && (
                <p role="alert" className="mt-3 text-sm text-rose-700">
                  {replyState.draftError}
                </p>
              )}
            </fieldset>
            {replyState.error && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                {replyState.error}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                type="submit"
                disabled={!replyState.body.trim() || replyState.busy}
                loading={replyState.busy}
              >
                {replyState.pendingReply ? 'Tentar publicar novamente' : 'Publicar resposta'}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-slate-500">Esta turma está inativa.</p>
      )}
      {replyState.error && !activeClass && (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {replyState.error}
        </p>
      )}
      <Dialog
        open={!!replyState.withdrawTarget}
        onClose={() => {
          if (!replyState.busy) replyState.setWithdrawTarget(null);
        }}
        title={
          replyState.withdrawTarget?.kind === 'topic' ? 'Retirar pergunta?' : 'Retirar resposta?'
        }
      >
        {replyState.withdrawTarget && (
          <>
            <p className="mb-5 text-sm leading-6 text-slate-600">
              {replyState.withdrawTarget.kind === 'topic'
                ? 'Retirar esta pergunta e suas respostas da consulta? O histórico permanece para auditoria.'
                : 'Retirar esta resposta? A solução será desmarcada e o histórico será preservado.'}
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="secondary"
                disabled={replyState.busy}
                onClick={() => replyState.setWithdrawTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={replyState.busy}
                onClick={async () => {
                  const target = replyState.withdrawTarget;
                  if (!target) return;
                  const ok = await replyState.updateTopic(() =>
                    target.kind === 'topic'
                      ? api.withdrawTopic(id, topic.revision)
                      : api.withdrawReply(id, target.replyId, topic.revision)
                  );
                  replyState.setWithdrawTarget(null);
                  if (ok && target.kind === 'topic') {
                    notify('Pergunta retirada.');
                    router.replace('/forum');
                  }
                }}
              >
                {replyState.withdrawTarget.kind === 'topic'
                  ? 'Retirar pergunta'
                  : 'Retirar resposta'}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
