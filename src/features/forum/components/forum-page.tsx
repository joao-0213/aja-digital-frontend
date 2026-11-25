'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, MessageSquare, Plus } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import { useHttpQuery } from '@/hooks/use-http-query';
import { HttpError } from '@/lib/http-client';
import { Avatar, Badge, Button, Dialog, Empty, Input, LinkButton, PageHeading, Select, Textarea } from '@/components/ui';
import { countLabel, dateLabel } from '@/lib/utils';
import { forumComposeDraftKeys, readForumComposeDraft, saveForumComposeDraft } from '@/lib/forum-draft';
import { ForumAttachments } from './forum-attachments';
import { createForumApi, type ForumAttachmentDto, type ForumFilter, type ForumTopicFields } from '../api';

type LegacyForumAttachment = { id: string; name: string; mime: string; size: number };
type ComposeDraft = { title: string; body: string; tags: string; reference: string; targetSubject?: string; subjectId?: string; attachment?: ForumAttachmentDto | LegacyForumAttachment; legacyAttachment?: LegacyForumAttachment; pendingCreate?: { key: string; fields: ForumTopicFields } };

export function ForumPage() {
  const { user } = useSession();
  const params = useSearchParams();
  const context = params.get('material') ? `material:${params.get('material')}` : params.get('questao') ? `question:${params.get('questao')}` : 'new';
  return <ForumPageContent key={`${user?.id ?? ''}:${context}`} />;
}

function ForumPageContent() {
  const { client, sessionKey, user } = useSession();
  const params = useSearchParams();
  const api = useMemo(() => createForumApi(client), [client]);
  const options = useHttpQuery({ sessionKey, key: 'forum-options' }, useCallback(signal => api.options(signal), [api]), !!user);
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState(params.get('disciplina') ?? 'all');
  const [classId, setClassId] = useState('all');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(!!params.get('questao') || !!params.get('material'));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [reference, setReference] = useState(params.get('material') ? `material:${params.get('material')}` : params.get('questao') ? `question:${params.get('questao')}` : '');
  const [targetSubject, setTargetSubject] = useState(params.get('disciplina') ?? '');
  const [attachment, setAttachment] = useState<ForumAttachmentDto>();
  const [legacyAttachment, setLegacyAttachment] = useState<LegacyForumAttachment>();
  const [draftKey, setDraftKey] = useState('');
  const [draftError, setDraftError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<ComposeDraft['pendingCreate']>();
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const materialId = params.get('material');
  const questionId = params.get('questao');
  const context = materialId ? `material:${materialId}` : questionId ? `question:${questionId}` : 'new';
  const composeKeys = user ? forumComposeDraftKeys(user.id, materialId, questionId) : undefined;
  const composeKey = composeKeys?.current ?? '';
  const filters: ForumFilter = { ...(classId !== 'all' ? { classId } : {}), ...(subjectId !== 'all' ? { subjectId } : {}), ...(search.trim() ? { q: search.trim() } : {}), ...(filter === 'unread' ? { unread: true } : {}), ...(filter === 'solved' ? { solved: true } : {}), sort: '-createdAt' };
  const topics = useHttpQuery({ sessionKey, key: `forum:${JSON.stringify(filters)}` }, useCallback(signal => api.all(filters, signal), [api, JSON.stringify(filters)]), !!user);
  const activeSubjects = (options.data?.subjects ?? []).filter(item => options.data?.classes.some(row => row.id === item.classId && row.active));
  const activeClasses = options.data?.classes ?? [];
  const visibleSubjects = options.data?.subjects ?? [];
  const canPublish = !!user && activeSubjects.some(item => classId === 'all' || item.classId === classId);
  const composition = () => ({ title, body, tags, reference, targetSubject, ...(attachment ? { attachment } : legacyAttachment ? { attachment: legacyAttachment } : {}) });

  useEffect(() => {
    if (!targetSubject && activeSubjects[0]) setTargetSubject(activeSubjects[0].id);
  }, [targetSubject, activeSubjects]);

  // Drafts contain text and a staged-file ID only; the server remains the source of attachment bytes.
  useEffect(() => {
    if (!composeKey || draftKey === composeKey || typeof window === 'undefined') return;
    const storage = { getItem: (key: string) => window.sessionStorage.getItem(key) };
    const restored = readForumComposeDraft(storage, composeKey);
    if (restored.error) { setDraftError(restored.error); return; }
    const saved = restored.value as ComposeDraft | null;
    if (saved) {
      setTitle(saved.title ?? ''); setBody(saved.body ?? ''); setTags(saved.tags ?? ''); setReference(saved.reference ?? ''); setTargetSubject(saved.targetSubject ?? saved.subjectId ?? targetSubject); setPendingCreate(saved.pendingCreate);
      const previousAttachment = saved.attachment ?? saved.legacyAttachment;
      if (previousAttachment) {
        const legacy = { id: previousAttachment.id, name: previousAttachment.name, mime: previousAttachment.mime, size: previousAttachment.size };
        setLegacyAttachment(legacy);
        if ('downloadUrl' in previousAttachment) void api.readFile(previousAttachment.id).then(item => { setAttachment(item); setLegacyAttachment(undefined); }).catch(() => {});
      }
    }
    setDraftKey(composeKey);
  }, [api, composeKey, draftKey]);
  useEffect(() => {
    if (typeof window === 'undefined' || !composeKey || draftKey !== composeKey) return;
    const failure = saveForumComposeDraft({ setItem: (key, value) => window.sessionStorage.setItem(key, value) }, composeKey, { ...composition(), pendingCreate });
    setDraftError(failure ?? '');
  }, [composeKey, draftKey, title, body, tags, reference, targetSubject, attachment, legacyAttachment, pendingCreate]);

  const chooseFile = async (file?: File) => {
    if (!file || !targetSubject) return;
    setBusy(true); setError('');
    try {
      if (file.size < 1 || file.size > 5 * 1024 * 1024 || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Escolha um PDF, PNG, JPEG ou WebP de até 5 MB.');
      setAttachment(await api.upload(targetSubject, file, crypto.randomUUID())); setLegacyAttachment(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o anexo.'); }
    finally { setBusy(false); }
  };
  const removeFile = async () => {
    if (!attachment || busy) return;
    setBusy(true);
    try { await api.discardFile(attachment.id); setAttachment(undefined); setFileInputVersion(current => current + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível remover o anexo.'); }
    finally { setBusy(false); }
  };
  const publish = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const subject = activeSubjects.find(item => item.id === targetSubject && (classId === 'all' || item.classId === classId));
    if (!subject) { setError('Selecione uma disciplina ativa.'); return; }
    const target = reference ? { type: reference.startsWith('material:') ? 'material' as const : 'question' as const, id: reference.slice(reference.indexOf(':') + 1) } : null;
    if (target && !target.id.trim()) { setError('Confira a referência escolhida.'); return; }
    const fields: ForumTopicFields = pendingCreate?.fields ?? { classId: subject.classId, subjectId: subject.id, title: title.trim(), body: body.trim(), tags: [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 5), target, attachmentId: attachment?.id ?? null };
    const intent = pendingCreate ?? { key: crypto.randomUUID(), fields };
    setPendingCreate(intent);
    if (composeKey) saveForumComposeDraft({ setItem: (key, value) => window.sessionStorage.setItem(key, value) }, composeKey, { ...composition(), pendingCreate: intent });
    setBusy(true);
    try {
      await api.create(fields, intent.key);
      if (composeKey) window.sessionStorage.removeItem(composeKey);
      setOpen(false); setTitle(''); setBody(''); setTags(''); setReference(''); setAttachment(undefined); setLegacyAttachment(undefined); setPendingCreate(undefined); setDraftKey(''); topics.invalidate();
    } catch (cause) {
      if (cause instanceof HttpError && ['forbidden', 'not-found', 'validation', 'conflict'].includes(cause.kind)) setPendingCreate(undefined);
      setError(cause instanceof Error ? cause.message : 'Não foi possível publicar a pergunta. Tente novamente para conferir o resultado.');
    }
    finally { setBusy(false); }
  };

  const requestedSubject = params.get('disciplina');
  const backHref = materialId ? `/materiais?id=${encodeURIComponent(materialId)}` : requestedSubject ? `/disciplinas/detalhes?id=${encodeURIComponent(requestedSubject)}` : '/';
  const backLabel = materialId ? 'Voltar ao material' : requestedSubject ? 'Voltar à disciplina' : 'Voltar ao painel';
  return <>
    <LinkButton secondary href={backHref} className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />{backLabel}</LinkButton>
    <PageHeading title="Fórum de dúvidas" action={<Button onClick={() => { setOpen(true); setError(''); }} disabled={!canPublish}><Plus aria-hidden="true" className="size-4" />Nova pergunta</Button>} />
    {options.error && <p role="alert" className="mb-4 text-sm text-rose-700">{options.error.message} <button type="button" onClick={options.retry} className="font-bold underline underline-offset-4">Tentar novamente</button></p>}
    <div className="mb-6 grid gap-3 md:grid-cols-[1fr_220px_220px_200px]">
      <Input aria-label="Buscar no fórum" value={search} onChange={event => setSearch(event.target.value)} placeholder="Busque uma dúvida ou um assunto…" />
      <Select aria-label="Turma do fórum" value={classId} onChange={event => { setClassId(event.target.value); setSubjectId('all'); }}><option value="all">Todas as turmas</option>{activeClasses.map(item => <option key={item.id} value={item.id}>{item.name}{!item.active ? ' · Encerrada' : ''}</option>)}</Select>
      <Select aria-label="Disciplina do fórum" value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="all">Todas as disciplinas</option>{visibleSubjects.filter(item => classId === 'all' || item.classId === classId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <Select aria-label="Filtrar conversas" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todas as perguntas</option><option value="unread">Não lidas</option><option value="unanswered">Sem respostas</option><option value="solved">Resolvidas</option></Select>
    </div>
    <div className="max-w-4xl space-y-3">
      {topics.loading && <p role="status" className="text-sm text-slate-500">Carregando perguntas…</p>}
      {topics.error && <p role="alert" className="text-sm text-rose-700">{topics.error.message} <button type="button" onClick={topics.retry} className="font-bold underline underline-offset-4">Tentar novamente</button></p>}
      {(topics.data ?? []).filter(topic => filter !== 'unanswered' || topic.replies.length === 0).map(topic => {
        const solved = topic.replies.some(reply => reply.accepted);
        return <Link key={topic.id} href={`/forum/topico?id=${encodeURIComponent(topic.id)}`} className="block min-w-0 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-200 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2"><Badge>{activeSubjects.find(item => item.id === topic.subjectId)?.name ?? topic.subjectId}</Badge><span className="text-xs text-slate-400">{dateLabel(topic.createdAt)}</span>{solved && <Badge tone="green"><CheckCircle2 aria-hidden="true" className="size-3" />Resolvida</Badge>}{!topic.read && <Badge tone="purple">Nova</Badge>}</div>
          <h2 className="text-lg font-semibold text-slate-800 [overflow-wrap:anywhere]">{topic.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{topic.body}</p>
          {topic.target && <p className="mt-3 text-xs text-brand-700 [overflow-wrap:anywhere]">Sobre {topic.target.type === 'material' ? 'material' : 'questão'} · {topic.target.id}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2"><Avatar name={topic.author.name} size="sm" /><span className="text-xs text-slate-500 [overflow-wrap:anywhere]">{topic.author.name}</span><span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-400"><MessageSquare aria-hidden="true" className="size-4" />{countLabel(topic.replies.length, 'resposta', 'respostas')}</span></div>
        </Link>;
      })}
    </div>
    {!topics.loading && !topics.error && !(topics.data ?? []).some(topic => filter !== 'unanswered' || topic.replies.length === 0) && <Empty title="Sem perguntas nesta seleção" description="As dúvidas publicadas aparecerão aqui." />}
    {draftError && !open && <p role="alert" className="mt-4 text-sm text-rose-700">{draftError}</p>}
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} title="Fazer uma pergunta">
      <form onSubmit={event => void publish(event)} className="space-y-4">
        <fieldset disabled={busy || !!pendingCreate} className="space-y-4">
        <Select label="Disciplina" value={targetSubject} onChange={event => { setTargetSubject(event.target.value); if (attachment) void removeFile(); }} required><option value="">Selecione uma disciplina</option>{activeSubjects.filter(item => classId === 'all' || item.classId === classId).map(item => <option key={item.id} value={item.id}>{item.name} · {activeClasses.find(row => row.id === item.classId)?.name}</option>)}</Select>
        <Input label="Título da pergunta" value={title} onChange={event => setTitle(event.target.value)} required minLength={8} maxLength={180} />
        <Textarea label="Conte sua dúvida" value={body} onChange={event => setBody(event.target.value)} required minLength={10} rows={5} />
        <Input label="Tags (opcional, separadas por vírgulas)" value={tags} onChange={event => setTags(event.target.value)} />
        {reference && <div className="rounded-lg bg-slate-50 p-3 text-sm">Referência: {reference.replace(':', ' · ')} <Button variant="ghost" type="button" onClick={() => setReference('')}>Remover</Button></div>}
        <Input key={fileInputVersion} label="Anexo (opcional)" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy || !targetSubject} onChange={event => void chooseFile(event.target.files?.[0])} />
        <p className="text-xs leading-5 text-slate-500">PDF, PNG, JPEG ou WebP (até 5 MB).</p>
        {attachment && <ForumAttachments item={attachment} readContent={(id, inline) => api.readFileContent(id, inline)} onRemove={() => void removeFile()} />}
        {legacyAttachment && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">O anexo legado “{legacyAttachment.name}” foi preservado no rascunho local e não será enviado automaticamente. Selecione o arquivo novamente para anexá-lo a esta publicação. <Button type="button" variant="ghost" onClick={() => setLegacyAttachment(undefined)}>Remover da composição</Button></p>}
        {draftError && <p role="alert" className="text-sm text-rose-700">{draftError}</p>}
        </fieldset>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || !targetSubject} loading={busy}>{pendingCreate ? 'Tentar publicar novamente' : 'Publicar pergunta'}</Button></div>
      </form>
    </Dialog>
  </>;
}
