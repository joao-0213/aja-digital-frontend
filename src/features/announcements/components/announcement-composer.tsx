'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/providers/app-context';
import { Button, Check, Dialog, Empty, Input, Select, Textarea } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useRecordRevision } from '@/hooks/use-record-revision';
import { canManageSubject } from '@/lib/access';
import { uid } from '@/lib/utils';
import { validateAnnouncement } from '@/lib/announcement-calendar';
import type { Announcement } from '@/models';

export function AnnouncementComposer({ item, subjectId, onClose }: { item?: Announcement; subjectId?: string; onClose: () => void }) {
  const { db, user, role, mutate, busy } = useApp();
  const context = db.subjects.find(s => s.id === subjectId);
  const editingId = item?.id ?? null;
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const initialClass = item?.classId ?? context?.classId ?? db.classes.find(c => c.active && (role === 'admin' || db.subjects.some(s => s.classId === c.id && canManageSubject(db, user, s.id))))?.id ?? '';
  const initialSubject = item?.subjectId ?? context?.id ?? (role === 'teacher' ? db.subjects.find(s => s.classId === initialClass && canManageSubject(db, user, s.id))?.id ?? '' : '');
  const [classId, setClassId] = useState(initialClass);
  const [subject, setSubject] = useState(initialSubject);
  const [notify, setNotify] = useState(item?.notify ?? true);
  const editing = db.announcements.find(a => a.id === editingId);
  const revision = useRecordRevision('announcements', editing);
  const managed = db.subjects.filter(s => canManageSubject(db, user, s.id));
  const classes = db.classes.filter(c => c.active && (role === 'admin' || managed.some(s => s.classId === c.id)));
  const [calendar, setCalendar] = useState(!!item?.occurrence);
  const [date, setDate] = useState(item?.occurrence?.date ?? '');
  const [time, setTime] = useState(item?.occurrence?.time ?? '');
  const [allDay, setAllDay] = useState(item?.occurrence?.allDay ?? false);
  const sending = useRef(false);
  const [error, setError] = useState('');
  const dirty = title !== (item?.title ?? '') || body !== (item?.body ?? '') || notify !== (item?.notify ?? true) || calendar !== !!item?.occurrence || date !== (item?.occurrence?.date ?? '') || time !== (item?.occurrence?.time ?? '') || allDay !== (item?.occurrence?.allDay ?? false) || classId !== initialClass || subject !== initialSubject;
  const close = () => { if (!busy && (!dirty || window.confirm('Descartar as alterações não salvas do aviso?'))) onClose(); };
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <Dialog open onClose={close} title={editingId ? 'Editar aviso' : 'Publicar aviso'}>
      {editingId && !editing ? <Empty title="Aviso indisponível" description="O aviso foi retirado ou sua atribuição mudou. Seu texto não foi publicado." action={<Button onClick={() => onClose()}>Fechar</Button>} /> : <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        if (revision.conflict || sending.current) return;
        const occurrence = calendar ? { date, ...(allDay ? { allDay: true } : { time }) } : undefined;
        try { validateAnnouncement({ id: item?.id ?? 'new', classId, subjectId: subject || undefined, authorId: user.id, title, body, createdAt: '', notify, occurrence }, db); }
        catch (error) { setError(error instanceof Error ? error.message : 'Confira o aviso.'); return; }
        setError('');
        sending.current = true;
        if (await mutate(d => {
          if (editing) Object.assign(d.announcements.find(a => a.id === editing.id)!, { title: title.trim(), body: body.trim(), notify, occurrence });
          else d.announcements.unshift({ id: uid('notice'), classId, subjectId: subject || undefined, authorId: user.id, title: title.trim(), body: body.trim(), createdAt: new Date().toISOString(), notify, occurrence });
        }, `${editing ? 'Aviso atualizado.' : 'Aviso publicado.'}${calendar ? ' Incluído no calendário.' : ''}${notify ? ' Notificação por e-mail simulada.' : ''}`, { ...revision.expected, requirePersistence: true })) onClose();
        sending.current = false;
      }}>
        {revision.conflict && editing && <RecordConflict key={editing.revision} author={db.users.find(u => u.id === editing.updatedBy)?.name ?? 'Equipe AJA'} updatedAt={editing.updatedAt} onReviewed={revision.acknowledge}><p><strong>{editing.title}</strong></p><p>{editing.body}</p><p>Acontecimento: {editing.occurrence ? `${editing.occurrence.date} · ${editing.occurrence.allDay ? 'Dia inteiro' : editing.occurrence.time}` : 'Sem compromisso'}</p><p>Notificação simulada: {editing.notify ? 'Sim' : 'Não'}</p></RecordConflict>}
        <Select label="Turma" value={classId} disabled={!!editing} required onChange={e => { const next = e.target.value; setClassId(next); setSubject(role === 'teacher' ? managed.find(s => s.classId === next)?.id ?? '__select__' : '__select__'); }}><option value="" disabled>Selecione a turma</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select label="Disciplina" value={subject} disabled={!!editing} required={role === 'teacher'} onChange={e => setSubject(e.target.value)}><option value="__select__" disabled>Selecione o destino</option>{role === 'admin' ? <option value="">Toda a turma</option> : <option value="" disabled>Selecione a disciplina</option>}{managed.filter(s => s.classId === classId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        {role === 'teacher' && <p className="text-xs leading-5 text-slate-500">Você publica nas disciplinas atribuídas. Comunicados para toda a turma são publicados pela administração.</p>}
        <Input label="Título" value={title} onChange={e => setTitle(e.target.value)} required maxLength={150} /><Textarea label="Mensagem" value={body} onChange={e => setBody(e.target.value)} required rows={6} />
        <Check label="Adicionar ao calendário" checked={calendar} onChange={setCalendar} />
        <p className="text-sm text-slate-500">O aviso é publicado agora. A data indica quando o acontecimento ocorrerá, no horário de Brasília.</p>
        {calendar && <div className="space-y-3 rounded-lg border border-slate-200 p-4"><Input label="Data do acontecimento" type="date" required value={date} onChange={e => setDate(e.target.value)} /><Check label="Dia inteiro" checked={allDay} onChange={setAllDay} />{!allDay && <Input label="Horário do acontecimento" type="time" required value={time} onChange={e => setTime(e.target.value)} />}</div>}
        {item?.occurrence && !calendar && <p role="status" className="text-sm text-amber-800">Ao salvar, o compromisso sairá do calendário. O aviso será mantido. Se o encontro foi cancelado, explique o motivo na mensagem.</p>}
        <p className="break-words text-sm font-semibold">Para: {db.classes.find(c => c.id === classId)?.name} · {subject === '__select__' ? 'Selecione o destino' : db.subjects.find(s => s.id === subject)?.name ?? 'Toda a turma'}</p>
        <Check label="Simular notificação por e-mail para os alunos" checked={notify} onChange={setNotify} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={close}>Cancelar</Button><Button type="submit" loading={busy} disabled={revision.conflict}>{editing ? 'Salvar aviso' : 'Publicar aviso'}</Button></div>
      </form>}
    </Dialog>
  );
}
