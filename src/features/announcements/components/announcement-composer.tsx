'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Check, Dialog, Input, Select, Textarea } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpEditor } from '@/hooks/use-http-editor';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { announcementSubjectAfterClassChange, initialAnnouncementFields } from '../announcement-form';
import { getOrCreateAnnouncementIntent } from '../announcement-intent';
import { createAnnouncementsApi, type AnnouncementDto, type AnnouncementFields } from '../api';

export function AnnouncementComposer({ item, subjectId, onClose }: { item?: AnnouncementDto; subjectId?: string; onClose: () => void }) {
  const { client, sessionKey, user } = useSession();
  const api = useMemo(() => createAnnouncementsApi(client), [client]);
  const fields = useMemo(() => initialAnnouncementFields(item, subjectId), [item, subjectId]);
  const context = `announcement:${user?.id ?? ''}:${item?.id ?? subjectId ?? 'general'}`;
  const restored = client.readDraft<{ fields: AnnouncementFields }>(context);
  const { fields: value, expectedRevision, busy, conflicted, latest, blocked, error, editor, clear } = useHttpEditor<AnnouncementFields, AnnouncementDto>(fields, item?.revision ?? 0, context);
  const [calendar, setCalendar] = useState(!!(restored?.fields ?? fields).occurrence);
  const options = useHttpQuery({ sessionKey, key: 'announcement-options' }, useCallback(signal => api.options(signal), [api]));
  useEffect(() => {
    const contextSubject = options.data?.subjects.find(subject => subject.id === subjectId);
    if (contextSubject && !value.classId) editor.change({ ...value, classId: contextSubject.classId, subjectId: contextSubject.id });
  }, [editor, options.data, subjectId, value]);
  const set = <K extends keyof AnnouncementFields>(key: K, next: AnnouncementFields[K]) => editor.change({ ...value, [key]: next });
  const close = () => { if (busy) return; if (JSON.stringify(value) === JSON.stringify(fields) || window.confirm('Descartar as alterações não salvas do aviso?')) { clear(); onClose(); } };
  const subjectOptions = options.data?.subjects.filter(subject => subject.classId === value.classId) ?? [];
  return <Dialog open onClose={close} title={item ? 'Editar aviso' : 'Publicar aviso'}>
    {item && (latest || blocked) && <RecordConflict author={latest?.author.name ?? 'Equipe AJA'} updatedAt={latest?.updatedAt} onReviewed={() => editor.acknowledge()}><p><strong>{latest?.title ?? item.title}</strong></p><p>{latest?.body ?? item.body}</p><p>Acontecimento: {latest?.occurrence ? `${latest.occurrence.date} · ${latest.occurrence.allDay ? 'Dia inteiro' : latest.occurrence.time}` : 'Sem compromisso'}</p><p>Notificação local: {latest?.notify ? 'Sim' : 'Não'}</p></RecordConflict>}
    {options.error && <p role="alert" className="text-sm text-red-700">{options.error.message} <button type="button" className="font-semibold underline" onClick={options.retry}>Tentar novamente</button></p>}
    {restored && <p role="status" className="text-sm text-brand-700">Composição retomada nesta sessão. Confira o público antes de salvar.</p>}
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      const occurrence = calendar ? value.occurrence : null;
      if (calendar && !occurrence) return;
      const submitted = { ...value, occurrence };
      const fingerprint = JSON.stringify(submitted);
      const intent = item ? undefined : getOrCreateAnnouncementIntent(client, context, sessionKey, fingerprint);
      const saved = await editor.submit(
        (draft, revision) => item ? api.edit(item.id, draft, revision) : api.create({ ...draft, occurrence }, intent!),
        item ? () => api.read(item.id) : undefined
      );
      if (saved) { clear(); onClose(); }
    }}>
      <fieldset disabled={busy || blocked} className="space-y-4">
        <Select label="Turma" value={value.classId} disabled={!!item} required onChange={event => { const selected = event.target.value; editor.change({ ...value, classId: selected, subjectId: announcementSubjectAfterClassChange(value.subjectId, options.data?.subjects ?? [], selected, subjectId) }); }}>
          <option value="">Selecione a turma</option>{options.data?.classes.filter(row => row.active && !row.deletedAt).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </Select>
        <Select label="Disciplina" value={value.subjectId ?? ''} disabled={!!item} required={user?.role === 'teacher'} onChange={event => set('subjectId', event.target.value || null)}>
          <option value="">Toda a turma</option>{subjectOptions.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </Select>
        {user?.role === 'teacher' && <p className="text-xs leading-5 text-slate-500">Você publica nas disciplinas atribuídas. Avisos para toda a turma são publicados pela administração.</p>}
        <Input label="Título" value={value.title} onChange={event => set('title', event.target.value)} required maxLength={150} />
        <Textarea label="Mensagem" value={value.body} onChange={event => set('body', event.target.value)} required rows={6} />
        <Check label="Adicionar ao calendário" checked={calendar} onChange={enabled => { setCalendar(enabled); if (!enabled) set('occurrence', null); else if (!value.occurrence) set('occurrence', { date: '', time: '', allDay: false }); }} />
        <p className="text-sm text-slate-500">O aviso é publicado agora. A data indica quando o acontecimento ocorrerá, no horário de Brasília.</p>
        {calendar && <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <Input label="Data do acontecimento" type="date" required value={value.occurrence?.date ?? ''} onChange={event => set('occurrence', { date: event.target.value, allDay: value.occurrence?.allDay ?? false, ...(!value.occurrence?.allDay ? { time: value.occurrence?.time ?? '' } : {}) })} />
          <Check label="Dia inteiro" checked={!!value.occurrence?.allDay} onChange={allDay => set('occurrence', { date: value.occurrence?.date ?? '', allDay, ...(!allDay ? { time: value.occurrence?.time ?? '' } : {}) })} />
          {!value.occurrence?.allDay && <Input label="Horário do acontecimento" type="time" required value={value.occurrence?.time ?? ''} onChange={event => set('occurrence', { date: value.occurrence?.date ?? '', time: event.target.value, allDay: false })} />}
        </div>}
        {item?.occurrence && !calendar && <p role="status" className="text-sm text-amber-800">Ao salvar, o compromisso sairá do calendário. O aviso será mantido.</p>}
        <p className="break-words text-sm font-semibold">Para: {(options.data?.classes.find(row => row.id === value.classId)?.name ?? value.classId) || 'Selecione a turma'} · {subjectOptions.find(subject => subject.id === value.subjectId)?.name ?? 'Toda a turma'}</p>
        <Check label="Solicitar notificação local para os alunos" checked={value.notify} onChange={enabled => set('notify', enabled)} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={close}>Cancelar</Button><Button type="submit" loading={busy} disabled={conflicted}>{item ? 'Salvar aviso' : 'Publicar aviso'}</Button></div>
      </fieldset>
    </form>
  </Dialog>;
}
