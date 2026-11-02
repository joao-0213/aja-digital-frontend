'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Plus, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { dateLabel, uid } from '@/lib/utils';
import { forumMatches, forumReplies, forumTarget, validateForumAttachment } from '@/lib/forum';
import { readForumDraft, saveForumDraft } from '@/lib/forum-draft';
import { saveMaterialFiles } from '@/lib/material-files';
import type { ForumTopic } from '@/models';
import { ForumAttachments } from './forum-attachments';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

export function ForumPage() {
  const { user } = useApp();
  const params = useSearchParams();
  return <ForumPageContent key={`${user.id}:${params.toString()}`} />;
}

function ForumPageContent() {
  const {
    db,
    user,
    mutate,
    busy
  } = useApp();
  const publishableSubjects = db.subjects.filter(s => db.classes.some(c => c.id === s.classId && c.active));
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState(params.get('disciplina') ?? 'all');
  const [filter, setFilter] = useState('all');
  const [classId, setClassId] = useState(db.subjects.find(s => s.id === params.get('disciplina'))?.classId ?? db.classes[0]?.id ?? '');
  const [open, setOpen] = useState(!!params.get('questao') || !!params.get('material'));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetSubject, setTargetSubject] = useState(publishableSubjects.find(s => s.id === params.get('disciplina'))?.id ?? publishableSubjects[0]?.id ?? '');
  const [tags, setTags] = useState('');
  const [attachment, setAttachment] = useState<ForumTopic['attachment']>();
  const [uploading, setUploading] = useState(false);
  const [reference, setReference] = useState(params.get('material') ? `material:${params.get('material')}` : params.get('questao') ? `question:${params.get('questao')}` : '');
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const topics = db.topics.filter(t => t.classId === classId && (subject === 'all' || t.subjectId === subject) && forumMatches(t, search) && (filter === 'all' || filter === 'unread' && !t.readBy.includes(user.id) || filter === 'unanswered' && !forumReplies(t).length || filter === 'solved' && forumReplies(t).some(r => r.accepted))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const draftKey = `aja-forum-compose:${user.id}:${params.get('material') ?? params.get('questao') ?? 'new'}`;
  const [loadedKey, setLoadedKey] = useState('');
  useEffect(() => {
    try {
      const restored = readForumDraft({ getItem: key => sessionStorage.getItem(key) }, draftKey);
      if (restored.error) { setDraftError(restored.error); return; }
      const saved = JSON.parse(restored.value ?? 'null');
      if (saved) { setTitle(saved.title ?? ''); setBody(saved.body ?? ''); setTags(saved.tags ?? ''); setAttachment(saved.attachment); setReference(saved.reference ?? ''); setTargetSubject(saved.targetSubject ?? ''); }
    } catch { setDraftError('Não foi possível retomar o rascunho desta sessão.'); return; }
    setLoadedKey(draftKey);
  }, [draftKey]);
  useEffect(() => {
    if (loadedKey !== draftKey) return;
    const storageError = saveForumDraft({ setItem: (key, value) => sessionStorage.setItem(key, value) }, draftKey, JSON.stringify({ title, body, tags, attachment, reference, targetSubject }));
    setDraftError(storageError ?? '');
  }, [draftKey, loadedKey, title, body, tags, attachment, reference, targetSubject]);
  const target = reference ? { type: reference.startsWith('material:') ? 'material' as const : 'question' as const, id: reference.slice(reference.indexOf(':') + 1) } : undefined;
  const resolved = forumTarget(db, { target, subjectId: targetSubject });
  const canPublishHere = db.classes.some(c => c.id === classId && c.active) && publishableSubjects.some(s => s.classId === classId);
  return <>
    <PageHeading eyebrow="Comunidade AJA" title="Fórum de dúvidas" description="Publique dúvidas e consulte as respostas da turma." action={<Button onClick={() => {
      setError('');
      setOpen(true);
    }} disabled={!canPublishHere}><Plus className="size-4" />Nova pergunta</Button>} />
    {!open && draftError && <p role="alert" className="mb-4 text-sm text-rose-700">{draftError}</p>}
    <div className="mb-6 grid gap-3 md:grid-cols-[1fr_220px_200px]">
      <Input aria-label="Buscar no fórum" value={search} onChange={e => setSearch(e.target.value)} placeholder="Busque uma dúvida ou um assunto…" />
      <Select aria-label="Turma do fórum" value={classId} onChange={e => {
        setClassId(e.target.value);
        setSubject('all');
        setTargetSubject(publishableSubjects.find(s => s.classId === e.target.value)?.id ?? '');
      }}>
        {db.classes.map(c => <option key={c.id} value={c.id}>
          {c.name}{!c.active && ' · Encerrada'}
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
        const solved = forumReplies(t).some(r => r.accepted);
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
              <span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-400">{solved && <CheckCircle2 className="size-4 text-emerald-500" />}<MessageSquare className="size-4" />{forumReplies(t).length} respostas</span>
            </div>
          </div>
        </div>
      </Link>;
      })}
      {!topics.length && <Empty title={canPublishHere ? 'A conversa pode começar com você' : 'Nenhuma pergunta disponível'} description={canPublishHere ? 'Nenhuma pergunta encontrada nesta seleção.' : 'Este contexto está disponível apenas para consulta. Selecione uma turma ativa para publicar.'} action={canPublishHere ? <Button onClick={() => setOpen(true)}>Fazer uma pergunta</Button> : undefined} />}
    </div>
    <Dialog open={open} onClose={() => setOpen(false)} title="O que você quer entender melhor?">
      <form onSubmit={async e => {
        e.preventDefault();
        setError('');
        const selected = publishableSubjects.find(s => s.id === targetSubject);
        if (!selected) {
          setError('Selecione uma disciplina.');
          return;
        }
        if (!body.trim()) { setError('Conte sua dúvida antes de publicar.'); return; }
        if (target && !resolved) { setError('Referência indisponível. Confira a disciplina e o alvo ou escolha Sem referência.'); return; }
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
            target,
            attachment
          });
        }, 'Pergunta publicada.', { requirePersistence: true })) {
          setOpen(false);
          setTitle('');
          setBody('');
          setTags('');
          setAttachment(undefined);
          setReference('');
          setFilter('all');
          setSubject('all');
          setClassId(selected.classId);
        }
      }}>
        <fieldset disabled={busy || uploading} className="min-w-0 space-y-4">
        <Input label="Título da pergunta" value={title} onChange={e => setTitle(e.target.value)} required minLength={8} maxLength={180} />
        <Select label="Disciplina" value={targetSubject} onChange={e => setTargetSubject(e.target.value)}>
          {publishableSubjects.map(s => <option key={s.id} value={s.id}>{s.name} · {db.classes.find(c => c.id === s.classId)?.name}</option>)}
        </Select>
        <RichTextEditor label="Conte sua dúvida" placeholder="Explique o que você já tentou e onde encontrou dificuldade." value={body} onChange={setBody} />
        <Input label="Tags (separe por vírgulas, até 5)" value={tags} onChange={e => setTags(e.target.value)} placeholder="funções, gráficos" />
        <Select label="Referência (opcional)" value={reference} onChange={e => setReference(e.target.value)}>
          <option value="">Sem referência</option>
          {db.materials.filter(m => db.modules.some(mod => mod.id === m.moduleId && mod.subjectId === targetSubject)).map(m => <option key={m.id} value={`material:${m.id}`}>Material · {m.title}</option>)}
          {db.questions.map(q => <option key={q.id} value={`question:${q.id}`}>{q.id.toUpperCase()} · {q.topic}</option>)}
        </Select>
        {target && <p className="rounded-lg bg-slate-50 p-3 text-sm">{resolved ? `${resolved.title}: ${resolved.preview}` : 'Referência indisponível. Confira a disciplina ou remova a referência.'}</p>}
        <p className="text-sm text-slate-600">A pergunta e seu anexo ficam visíveis à turma e à equipe autorizada. Evite dados pessoais. Um PDF, PNG, JPEG ou WebP de até 5 MB; arquivo disponível somente neste navegador.</p>
        <Input label="Anexo (opcional)" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={uploading || busy} onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const item = { id: uid('forum-file'), name: file.name, mime: file.type, size: file.size };
          setUploading(true); setError('');
          try { validateForumAttachment(item); await saveMaterialFiles([{ id: item.id, file }]); setAttachment(item); }
          catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível guardar o arquivo. Selecione novamente.'); }
          finally { setUploading(false); }
        }} />
        {uploading && <p role="status">Guardando arquivo…</p>}
        {attachment && <ForumAttachments items={[{ ...attachment, kind: 'file' }]} onRemove={() => setAttachment(undefined)} />}
        {error && <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>}
        {draftError && <p role="alert" className="text-sm text-rose-700">{draftError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Continuar depois</Button><Button variant="ghost" onClick={() => { setTitle(''); setBody(''); setTags(''); setAttachment(undefined); setReference(''); setOpen(false); }}>Descartar</Button>
          <Button type="submit" loading={busy || uploading}>Publicar pergunta</Button>
        </div>
        </fieldset>
      </form>
    </Dialog>
  </>;
}
