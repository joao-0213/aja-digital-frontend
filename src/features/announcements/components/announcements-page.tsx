'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  LinkButton,
  PageHeading,
  Select
} from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { brazilDateTimeLabel, dateLabel } from '@/lib/utils';
import type { AnnouncementDto } from '../api';
import { announcementKeys, useAnnouncementsApi } from '../hooks/use-announcements';
import { AnnouncementComposer } from './announcement-composer';
import { WithdrawAnnouncementDialog } from './withdraw-announcement-dialog';

export function AnnouncementsPage() {
  const { client, sessionKey, user } = useSession();
  const api = useAnnouncementsApi();
  const [filter, setFilter] = useState('all');
  const [composing, setComposing] = useState<AnnouncementDto | 'new' | null>(null);
  const [withdrawing, setWithdrawing] = useState<AnnouncementDto | null>(null);
  const [actionError, setActionError] = useState('');
  const options = useHttpQuery(
    { sessionKey, key: announcementKeys.options },
    useCallback((signal) => api.options(signal), [api])
  );
  const notices = useHttpQuery(
    { sessionKey, key: ['announcements', 'list', filter] },
    useCallback(
      (signal) => api.all(filter === 'all' ? {} : { classId: filter }, signal),
      [api, filter]
    ),
    { keepPreviousData: true }
  );
  const canManage = (item: AnnouncementDto) =>
    user?.role === 'admin' ||
    (!!item.subjectId &&
      !!options.data?.subjects.find((subject) => subject.id === item.subjectId)?.canManageContent);
  return (
    <>
      <LinkButton secondary href="/" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar ao painel
      </LinkButton>
      <PageHeading
        title="Mural de avisos"
        action={
          user?.role !== 'student' && (
            <Button onClick={() => setComposing('new')}>
              <Plus aria-hidden="true" className="size-4" />
              Publicar aviso
            </Button>
          )
        }
      />
      <div className="mb-6 max-w-sm">
        <Select label="Turma" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Todas as turmas</option>
          {options.data?.classes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </Select>
      </div>
      {notices.loading && (
        <p role="status" className="mb-4 text-sm text-slate-500">
          Carregando avisos…
        </p>
      )}
      {notices.error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {notices.error.message}{' '}
          <button
            type="button"
            className="font-bold underline underline-offset-4"
            onClick={notices.retry}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {actionError}
        </p>
      )}
      <div className="max-w-4xl space-y-5">
        {notices.data?.map((item) => (
          <div key={item.id} id={`aviso-${item.id}`} className="scroll-mt-6">
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="purple">
                  {options.data?.classes.find((row) => row.id === item.classId)?.name ??
                    item.classId}
                </Badge>
                {item.subjectId && (
                  <Badge>
                    {options.data?.subjects.find((row) => row.id === item.subjectId)?.name ??
                      item.subjectId}
                  </Badge>
                )}
                <span className="ml-auto text-xs text-slate-400">{dateLabel(item.createdAt)}</span>
              </div>
              <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{item.title}</h2>
              {item.occurrence && (
                <p className="mt-2.5 inline-flex items-center rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-800">
                  Acontecimento: {dateLabel(item.occurrence.date)} ·{' '}
                  {item.occurrence.allDay ? 'Dia inteiro' : item.occurrence.time} (Brasília)
                </p>
              )}
              <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600 [overflow-wrap:anywhere]">
                {item.body}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <Avatar name={item.author.name} size="sm" />
                <span className="text-xs text-slate-500">{item.author.name}</span>
                {item.notify && (
                  <span className="ml-auto text-xs text-slate-400">Enviado por e-mail</span>
                )}
              </div>
              {item.updatedAt !== item.createdAt && (
                <p className="mt-3 text-xs text-slate-500">
                  Última alteração: {item.updatedAt && brazilDateTimeLabel(item.updatedAt)}
                </p>
              )}
              {canManage(item) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => setComposing(item)}>
                    <Pencil aria-hidden="true" className="size-4" />
                    Editar aviso
                  </Button>
                  <Button
                    variant="ghost"
                    className="!text-rose-700 hover:!bg-rose-50"
                    disabled={notices.loading}
                    onClick={() => setWithdrawing(item)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Retirar aviso
                  </Button>
                </div>
              )}
            </Card>
          </div>
        ))}
      </div>
      {!notices.loading && !notices.error && !notices.data?.length && (
        <Empty
          title="Sem avisos nesta turma"
          description="As novidades da equipe aparecerão aqui."
        />
      )}
      {composing && (
        <AnnouncementComposer
          item={composing === 'new' ? undefined : composing}
          onClose={() => {
            setComposing(null);
            void client.invalidateQueries(['announcements']);
            void client.invalidateQueries(['calendar']);
            void client.invalidateQueries(['dashboard']);
          }}
        />
      )}
      <WithdrawAnnouncementDialog
        item={withdrawing}
        onClose={() => setWithdrawing(null)}
        onWithdraw={(item) => api.withdraw(item.id, item.revision)}
        onWithdrawn={() => {
          void client.invalidateQueries(['announcements']);
          void client.invalidateQueries(['calendar']);
          void client.invalidateQueries(['dashboard']);
        }}
        onError={setActionError}
      />
    </>
  );
}
