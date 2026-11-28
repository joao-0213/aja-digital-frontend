'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Check, Dialog, Input, Select, Textarea } from '@/components/ui';
import { ConfirmAlert } from '@/components/shared/confirm-alert';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpEditor } from '@/hooks/use-http-editor';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useApp, useSession } from '@/providers/app-context';
import { countLabel } from '@/lib/utils';
import {
  announcementSubjectAfterClassChange,
  brasiliaMinTimeForDate,
  brasiliaTodayDate,
  initialAnnouncementFields,
  isOccurrenceInPast
} from '../lib/announcement-form';
import { getOrCreateAnnouncementIntent } from '../lib/announcement-intent';
import type { AnnouncementDto, AnnouncementFields } from '../api';
import { useAnnouncementsApi } from '../hooks/use-announcements';

const ALL_CLASSES = '__all__';

export function AnnouncementComposer({
  item,
  subjectId,
  classId,
  defaultCalendar = false,
  onClose
}: {
  item?: AnnouncementDto;
  subjectId?: string;
  classId?: string;
  defaultCalendar?: boolean;
  onClose: () => void;
}) {
  const { client, sessionKey, user } = useSession();
  const { notify } = useApp();
  const api = useAnnouncementsApi();
  const fields = useMemo(() => {
    const base = initialAnnouncementFields(item, subjectId, classId);
    if (!item && defaultCalendar && !base.occurrence)
      return { ...base, occurrence: { date: '', time: '', allDay: false } };
    return base;
  }, [item, subjectId, classId, defaultCalendar]);
  const context = `announcement:${user?.id ?? ''}:${item?.id ?? subjectId ?? (defaultCalendar ? 'calendar' : 'general')}`;
  const restored = client.readDraft<{ fields: AnnouncementFields }>(context);
  const {
    fields: value,
    dirty,
    busy,
    conflicted,
    latest,
    blocked,
    error,
    editor,
    clear
  } = useHttpEditor<AnnouncementFields, AnnouncementDto>(fields, item?.revision ?? 0, context);
  const [calendar, setCalendar] = useState(
    !!(restored?.fields ?? fields).occurrence || defaultCalendar
  );
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const options = useHttpQuery(
    { sessionKey, key: ['announcements', 'options'] },
    useCallback((signal) => api.options(signal), [api])
  );
  useEffect(() => {
    const contextSubject = options.data?.subjects.find((subject) => subject.id === subjectId);
    if (contextSubject && !value.classId)
      editor.change({ ...value, classId: contextSubject.classId, subjectId: contextSubject.id });
  }, [editor, options.data, subjectId, value]);
  const set = <K extends keyof AnnouncementFields>(key: K, next: AnnouncementFields[K]) => {
    setLocalError('');
    editor.change({ ...value, [key]: next });
  };
  const activeClasses = options.data?.classes.filter((row) => row.active && !row.deletedAt) ?? [];
  const canBroadcastAll =
    !item && !subjectId && user?.role === 'admin' && activeClasses.length >= 2;
  const isAllClasses = canBroadcastAll && value.classId === ALL_CLASSES;
  const isBusy = busy || broadcasting;
  const hasRealChanges = item
    ? dirty
    : value.title.trim() !== '' ||
      value.body.trim() !== '' ||
      (!defaultCalendar && calendar) ||
      (defaultCalendar && !!value.occurrence?.date) ||
      (!subjectId && !!value.classId);
  const close = () => {
    if (isBusy) return;
    if (confirmingClose) {
      setConfirmingClose(false);
      return;
    }
    if (!hasRealChanges) {
      clear();
      onClose();
      return;
    }
    setConfirmingClose(true);
  };
  const enforceFutureOccurrence =
    !item || JSON.stringify(value.occurrence) !== JSON.stringify(item.occurrence ?? null);
  const today = brasiliaTodayDate(nowMs);
  const minDate = enforceFutureOccurrence ? today : undefined;
  const minTime =
    enforceFutureOccurrence && value.occurrence?.date
      ? brasiliaMinTimeForDate(value.occurrence.date, nowMs)
      : undefined;
  const occurrenceInPast =
    calendar && enforceFutureOccurrence && isOccurrenceInPast(value.occurrence, nowMs);
  const subjectOptions = isAllClasses
    ? []
    : (options.data?.subjects.filter((subject) => subject.classId === value.classId) ?? []);
  return (
    <Dialog
      open
      onClose={close}
      title={
        item ? 'Editar aviso' : defaultCalendar ? 'Novo evento no calendário' : 'Publicar aviso'
      }
    >
      {item && (latest || blocked) && (
        <RecordConflict
          author={latest?.author.name ?? 'Equipe AJA'}
          updatedAt={latest?.updatedAt}
          onReviewed={() => editor.acknowledge()}
        >
          <p>
            <strong>{latest?.title ?? item.title}</strong>
          </p>
          <p>{latest?.body ?? item.body}</p>
          <p>
            Acontecimento:{' '}
            {latest?.occurrence
              ? `${latest.occurrence.date} · ${latest.occurrence.allDay ? 'Dia inteiro' : latest.occurrence.time}`
              : 'Sem compromisso'}
          </p>
          <p>Notificar por e-mail: {latest?.notify ? 'Sim' : 'Não'}</p>
        </RecordConflict>
      )}
      {options.error && (
        <p role="alert" className="text-sm text-red-700">
          {options.error.message}{' '}
          <button
            type="button"
            className="font-bold underline underline-offset-4"
            onClick={options.retry}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {restored && (
        <p role="status" className="text-sm text-brand-700">
          Composição retomada nesta sessão. Confira o público antes de salvar.
        </p>
      )}
      {confirmingClose ? (
        <ConfirmAlert
          message="Descartar as alterações não salvas do aviso?"
          cancelLabel="Continuar editando"
          confirmLabel="Descartar alterações"
          onCancel={() => setConfirmingClose(false)}
          onConfirm={() => {
            clear();
            onClose();
          }}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const occurrence = calendar ? value.occurrence : null;
            if (calendar && !occurrence) return;
            const currentMs = Date.now();
            setNowMs(currentMs);
            if (calendar && enforceFutureOccurrence && isOccurrenceInPast(occurrence, currentMs)) {
              setLocalError(
                'A data e o horário do acontecimento não podem ser anteriores ao momento atual.'
              );
              return;
            }
            setLocalError('');
            const submitted = { ...value, occurrence };
            const fingerprint = JSON.stringify(submitted);
            const intent = item
              ? undefined
              : getOrCreateAnnouncementIntent(client, context, sessionKey, fingerprint);
            if (isAllClasses && intent) {
              setBroadcasting(true);
              let publishedCount = 0;
              const failedNames: string[] = [];
              try {
                for (const targetClass of activeClasses) {
                  try {
                    await api.create(
                      { ...submitted, classId: targetClass.id, subjectId: null },
                      `${intent}:${targetClass.id}`
                    );
                    publishedCount += 1;
                  } catch {
                    failedNames.push(targetClass.name);
                  }
                }
                if (!failedNames.length) {
                  clear();
                  notify(
                    `Aviso publicado para ${countLabel(publishedCount, 'turma ativa', 'turmas ativas')}.`
                  );
                  onClose();
                } else {
                  setLocalError(
                    `Não foi possível publicar em ${failedNames.join(', ')}. Tente novamente para concluir as turmas restantes sem duplicar as já enviadas.`
                  );
                }
              } finally {
                setBroadcasting(false);
              }
              return;
            }
            const saved = await editor.submit(
              (draft, revision) =>
                item
                  ? api.edit(item.id, draft, revision)
                  : api.create({ ...draft, occurrence }, intent!),
              item ? () => api.read(item.id) : undefined
            );
            if (saved) {
              clear();
              onClose();
            }
          }}
        >
          <fieldset disabled={isBusy || blocked} className="space-y-4">
            <Select
              label="Turma"
              value={value.classId}
              disabled={!!item}
              required
              onChange={(event) => {
                const selected = event.target.value;
                setLocalError('');
                editor.change({
                  ...value,
                  classId: selected,
                  subjectId:
                    selected === ALL_CLASSES
                      ? null
                      : announcementSubjectAfterClassChange(
                          value.subjectId,
                          options.data?.subjects ?? [],
                          selected,
                          subjectId
                        )
                });
              }}
            >
              <option value="">Selecione a turma</option>
              {canBroadcastAll && (
                <option value={ALL_CLASSES}>Todas as turmas ativas ({activeClasses.length})</option>
              )}
              {activeClasses.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
            <Select
              label="Disciplina"
              value={isAllClasses ? '' : (value.subjectId ?? '')}
              disabled={!!item || isAllClasses}
              required={user?.role === 'teacher'}
              onChange={(event) => set('subjectId', event.target.value || null)}
            >
              <option value="">{isAllClasses ? 'Todas as turmas ativas' : 'Toda a turma'}</option>
              {subjectOptions.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
            <Input
              label="Título"
              value={value.title}
              onChange={(event) => set('title', event.target.value)}
              required
              maxLength={150}
            />
            <Textarea
              label="Mensagem"
              value={value.body}
              onChange={(event) => set('body', event.target.value)}
              required
              rows={6}
            />
            <Check
              label="Adicionar ao calendário"
              checked={calendar}
              onChange={(enabled) => {
                setNowMs(Date.now());
                setLocalError('');
                setCalendar(enabled);
                if (!enabled) set('occurrence', null);
                else if (!value.occurrence)
                  set('occurrence', { date: '', time: '', allDay: false });
              }}
            />
            {calendar && (
              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <Input
                  label="Data do acontecimento"
                  type="date"
                  min={minDate}
                  required
                  value={value.occurrence?.date ?? ''}
                  onFocus={() => setNowMs(Date.now())}
                  onChange={(event) => {
                    setNowMs(Date.now());
                    set('occurrence', {
                      date: event.target.value,
                      allDay: value.occurrence?.allDay ?? false,
                      ...(!value.occurrence?.allDay ? { time: value.occurrence?.time ?? '' } : {})
                    });
                  }}
                  error={
                    occurrenceInPast &&
                    (value.occurrence?.allDay || (value.occurrence?.date ?? '') < today)
                      ? 'A data do acontecimento não pode estar no passado.'
                      : undefined
                  }
                />
                <Check
                  label="Dia inteiro"
                  checked={!!value.occurrence?.allDay}
                  onChange={(allDay) => {
                    setNowMs(Date.now());
                    set('occurrence', {
                      date: value.occurrence?.date ?? '',
                      allDay,
                      ...(!allDay ? { time: value.occurrence?.time ?? '' } : {})
                    });
                  }}
                />
                {!value.occurrence?.allDay && (
                  <Input
                    label="Horário do acontecimento"
                    type="time"
                    min={minTime}
                    required
                    value={value.occurrence?.time ?? ''}
                    onFocus={() => setNowMs(Date.now())}
                    onChange={(event) => {
                      setNowMs(Date.now());
                      set('occurrence', {
                        date: value.occurrence?.date ?? '',
                        time: event.target.value,
                        allDay: false
                      });
                    }}
                    error={
                      occurrenceInPast && value.occurrence?.date === today
                        ? 'O horário do acontecimento não pode ser anterior ao momento atual.'
                        : undefined
                    }
                  />
                )}
              </div>
            )}
            {item?.occurrence && !calendar && (
              <p role="status" className="text-sm text-amber-800">
                Ao salvar, o compromisso sairá do calendário. O aviso será mantido.
              </p>
            )}
            <Check
              label="Notificar alunos por e-mail"
              checked={value.notify}
              onChange={(enabled) => set('notify', enabled)}
            />
            {(localError || error) && (
              <p role="alert" className="text-sm text-red-700">
                {localError || error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" loading={isBusy} disabled={conflicted}>
                {item ? 'Salvar aviso' : isAllClasses ? 'Publicar para todas' : 'Publicar aviso'}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </Dialog>
  );
}
