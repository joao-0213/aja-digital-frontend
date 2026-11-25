'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { AssessmentRead, SubmissionAttachment, SubmissionRead, SubmissionStaff, SubmissionStudent, WorkFeedback, WorkFileMetadata } from '../api';
import { createAssessmentsApi } from '../api';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useSession } from '@/providers/app-context';
import { HttpError } from '@/lib/http-client';
import { RecordConflict } from '@/components/shared/record-conflict';
import { Badge, Button, Card, Dialog, Empty, ErrorState, Input, LinkButton, PageHeading, Skeleton } from '@/components/ui';
import { countLabel } from '@/lib/utils';
import { resolveWorkUploadBatch, type WorkUploadIntent } from '../work-upload-batch';
import { ActivityConditions } from './activity-conditions';
import { WorkAttachments } from './work-attachments';
import { FeedbackEditor } from './feedback-editor';

type LocalAttachment = SubmissionAttachment;
type LocalRecovery = { revision: number; attachments: LocalAttachment[]; uploads: Record<string, WorkUploadIntent>; submit?: { revision: number; key: string } | null };
type SaveCommand = { key: string; attachments: SubmissionAttachment[] };
type PatchCommand = { revision: number; attachments: SubmissionAttachment[] };
const MAX_BYTES = 10 * 1024 * 1024;

function isStaffSubmission(value: SubmissionRead): value is SubmissionStaff { return 'feedbackHistory' in value; }
function isStudentSubmission(value: SubmissionRead): value is SubmissionStudent { return !('feedbackHistory' in value); }
function sameAttachments(left: SubmissionAttachment[], right: SubmissionAttachment[]) { return JSON.stringify(left) === JSON.stringify(right); }
async function digestFile(file: File) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  return Array.from(hash, value => value.toString(16).padStart(2, '0')).join('');
}
function safeRecoveryRead(key: string): LocalRecovery | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as LocalRecovery | null;
    if (!value || !Number.isSafeInteger(value.revision) || !Array.isArray(value.attachments) || typeof value.uploads !== 'object') return null;
    return value;
  } catch { return null; }
}

function FeedbackPublication({ feedback, maxGrade }: { feedback: WorkFeedback | null; maxGrade: number | null }) {
  return <Card className="mt-5"><h2 className="font-semibold">{feedback ? 'Feedback disponível' : 'Entregue — aguardando feedback'}</h2>{feedback && <>
    <p className="mt-3 text-xs text-slate-500">{feedback.author.name} · {new Date(feedback.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
    <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{feedback.comment}</p>
    <p className="mt-3 text-sm font-semibold">{feedback.grade == null ? 'Sem nota' : `Nota: ${feedback.grade} / ${maxGrade ?? '—'}`}</p>
  </>}</Card>;
}

export function WorkActivity({ activity }: { activity: AssessmentRead }) {
  const { client, sessionKey, resourceEpoch, status, user, sessionId } = useSession();
  const params = useSearchParams();
  const selectedId = params.get('entrega');
  const api = useMemo(() => createAssessmentsApi(client), [client]);
  const submissions = useHttpQuery({ sessionKey, key: `work-submissions:${activity.id}:${resourceEpoch}` }, useCallback(signal => api.allSubmissions({ assessmentId: activity.id }, signal, sessionKey), [activity.id, api, sessionKey]), status === 'authenticated');

  if (status === 'loading' || submissions.loading) return <Skeleton />;
  if (status !== 'authenticated' || !user) return <Empty title="Entre para consultar a entrega" action={<LinkButton href="/questionarios">Ver atividades</LinkButton>} />;
  if (submissions.error) return <ErrorState message={submissions.error.message} retry={() => void submissions.retry()} />;
  const rows = submissions.data ?? [];
  const subjectHref = `/questionarios`;
  if (user.role === 'student') {
    const own = rows.find(row => row.userId === user.id);
    if (selectedId && own?.id !== selectedId) return <Empty title="Entrega indisponível neste contexto" action={<LinkButton href="/questionarios">Ver atividades</LinkButton>} />;
    if (!('assigned' in activity) || !activity.assigned) return <><LinkButton secondary href={subjectHref} className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar para atividades</LinkButton><Card><p role="status" className="text-sm leading-7">Somente consulta — esta atividade não foi atribuída à sua matrícula. Ela não pode ser enviada nesta sessão.</p></Card></>;
    return <>
      <LinkButton secondary href={subjectHref} className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar para atividades</LinkButton>
      <PageHeading eyebrow="Entrega de trabalho" title={activity.title} description={activity.description} />
      <ActivityConditions activity={activity} />
      <WorkStudent key={`${activity.id}:${user.id}`} activity={activity} initialSubmission={own && isStudentSubmission(own) ? own : null} userId={user.id} sessionId={sessionId ?? ''} />
      <div className="mt-6"><LinkButton secondary href={subjectHref}><ArrowLeft aria-hidden="true" className="size-4" />Voltar para atividades</LinkButton></div>
    </>;
  }

  const selected = rows.find(row => row.id === selectedId && isStaffSubmission(row)) as SubmissionStaff | undefined;
  const filtered = rows.filter(isStaffSubmission);
  return <>
    <LinkButton secondary href={subjectHref} className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar para atividades</LinkButton>
    <PageHeading eyebrow="Acompanhamento individual" title={activity.title} description={activity.description} action={<LinkButton secondary href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>Editar atividade</LinkButton>} />
    <ActivityConditions activity={activity} />
    <Card><h2 className="mb-4 font-semibold">Entregas concluídas</h2>
      {filtered.length ? <ul className="divide-y divide-slate-200">{filtered.map(submission => <li key={submission.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
        <span>{submission.studentName}<span className="mt-1 block text-xs text-slate-500">{submission.feedbackPublished ? 'Feedback disponível' : 'Entregue — aguardando feedback'} · {submission.submittedAt && new Date(submission.submittedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></span>
        <LinkButton secondary aria-label={`Consultar entrega de ${submission.studentName}`} href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}&entrega=${encodeURIComponent(submission.id)}`}>Consultar entrega</LinkButton>
      </li>)}</ul> : <p className="text-sm leading-6 text-slate-600">Ainda não há entregas concluídas. Rascunhos dos alunos permanecem privados.</p>}
    </Card>
    {selected && <><Card className="mt-5"><h2 className="font-semibold">Entrega de {selected.studentName}</h2><p className="mt-3 text-sm">Comprovante {selected.receipt?.id ?? 'indisponível'} · {selected.submittedAt && new Date(selected.submittedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p><WorkAttachments items={selected.attachments} /></Card>
      <FeedbackEditor key={selected.id} activity={activity} submission={selected} onPublished={() => { void submissions.invalidate(); }} />
    </>}
    {selectedId && !selected && <p role="status" className="mt-5 text-sm">Entrega indisponível neste contexto.</p>}
    <div className="mt-6"><LinkButton secondary href={subjectHref}>Ver atividades</LinkButton></div>
  </>;
}

function WorkStudent({ activity, initialSubmission, userId, sessionId }: { activity: AssessmentRead; initialSubmission: SubmissionStudent | null; userId: string; sessionId: string }) {
  const { client, sessionKey, status } = useSession();
  const api = useMemo(() => createAssessmentsApi(client), [client]);
  const ownerKey = `aja-work-v1:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}:${encodeURIComponent(activity.id)}`;
  const serverRevision = initialSubmission?.revision ?? 0;
  const [recoveryBundle] = useState(() => {
    if (typeof window === 'undefined') return { key: `${ownerKey}:revision:${serverRevision}`, data: null as LocalRecovery | null };
    const key = window.sessionStorage.getItem(ownerKey) || `${ownerKey}:revision:${serverRevision}`;
    return { key, data: safeRecoveryRead(key) };
  });
  const [recovery] = useState(recoveryBundle.data);
  const recoveryMatches = recovery && recovery.revision === (initialSubmission?.revision ?? 0) && !initialSubmission?.submittedAt;
  const recoveryKey = useRef(recoveryMatches ? recoveryBundle.key : `${ownerKey}:revision:${serverRevision}`);
  const [submission, setSubmission] = useState<SubmissionStudent | null>(initialSubmission);
  const [items, setItems] = useState<LocalAttachment[]>(() => recoveryMatches ? recovery.attachments : initialSubmission?.attachments ?? []);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [uploads, setUploads] = useState<Record<string, WorkUploadIntent>>(() => recoveryMatches ? recovery.uploads : {});
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [conflict, setConflict] = useState<SubmissionStudent | null>(null);
  const [notice, setNotice] = useState(recovery && !recoveryMatches ? 'Há uma recuperação local de outra revisão. Ela foi mantida sem substituir o estado atual do servidor.' : '');
  const uploadCommands = useRef(new Map<string, WorkUploadIntent>());
  const prepareCommand = useRef<SaveCommand | null>(null);
  const patchCommand = useRef<PatchCommand | null>(null);
  const submitIntent = useRef<{ revision: number; key: string } | null>(recoveryMatches ? recovery?.submit ?? null : null);
  const submissionId = useRef<string | null>(initialSubmission?.id ?? null);
  const ambiguousPrepare = useRef(false);
  const ambiguousPatch = useRef(false);
  const isAssigned = 'assigned' in activity && activity.assigned;
  const isSubmitted = !!submission?.submittedAt;
  const isDirty = !submission || !sameAttachments(items.filter(item => item.kind !== 'file' || !item.fileId.startsWith('local:')), submission.attachments) || Object.keys(uploads).length > 0;
  useUnsavedChanges((isDirty || !!link.trim()) && !isSubmitted);

  const current = () => status === 'authenticated' && client.getSnapshot().status === 'authenticated' && client.getSnapshot().sessionKey === sessionKey;
  const persistRecovery = (nextItems = items, nextUploads = uploads, revision = submission?.revision ?? 0) => {
    try {
      const storageKey = `${ownerKey}:revision:${revision}`;
      recoveryKey.current = storageKey;
      window.sessionStorage.setItem(storageKey, JSON.stringify({ revision, attachments: nextItems, uploads: nextUploads, submit: submitIntent.current } satisfies LocalRecovery));
      window.sessionStorage.setItem(ownerKey, storageKey);
    } catch { /* O servidor continua sendo a fonte do rascunho. */ }
  };
  useEffect(() => { if (!isSubmitted) persistRecovery(); }, [items, uploads, submission?.revision, isSubmitted]);

  const addFiles = async (selected: File[]) => {
    setError('');
    const nextItems = [...items], nextFiles = { ...files }, nextUploads = { ...uploads };
    try {
      for (const file of selected) {
        if (file.size > MAX_BYTES) throw new Error('Cada arquivo deve ter até 10 MiB.');
        const digest = await digestFile(file);
        if (!current()) return;
        const recovered = Object.entries(nextUploads).find(([id, intent]) => !nextFiles[id] && intent.name === file.name && intent.size === file.size && intent.type === file.type && intent.digest === digest);
        if (recovered) { nextFiles[recovered[0]] = file; continue; }
        if (nextItems.length >= 5) throw new Error('Adicione até 5 arquivos e links no total.');
        const id = `local:${crypto.randomUUID()}`;
        const key = crypto.randomUUID();
        nextItems.push({ kind: 'file', fileId: id, name: file.name });
        nextFiles[id] = file;
        nextUploads[id] = { key, name: file.name, size: file.size, type: file.type, digest };
      }
      setItems(nextItems); setFiles(nextFiles); setUploads(nextUploads); persistRecovery(nextItems, nextUploads);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Confira os arquivos selecionados.'); }
  };

  const addLink = () => {
    try {
      const parsed = new URL(link.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use um link HTTP ou HTTPS sem credenciais.');
      if (items.length >= 5) throw new Error('Adicione até 5 arquivos e links no total.');
      const next = [...items, { kind: 'link' as const, name: 'Link do trabalho', url: parsed.href }];
      setItems(next); setLink(''); persistRecovery(next, uploads);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Informe um link válido.'); }
  };

  const remove = (id: string) => {
    if (busy || conflict) return;
    const next = items.filter(item => item.kind === 'file' ? item.fileId !== id : item.url !== id);
    setItems(next);
    const nextFiles = { ...files }, nextUploads = { ...uploads };
    delete nextFiles[id]; delete nextUploads[id];
    setFiles(nextFiles); setUploads(nextUploads); persistRecovery(next, nextUploads);
  };

  const resolveUploads = async (snapshot: LocalAttachment[]) => {
    const resolved = await resolveWorkUploadBatch([...snapshot], files, uploads, async (localId, intent, file) => {
      const confirmedDigest = await digestFile(file);
      if (confirmedDigest !== intent.digest) throw new Error(`O arquivo “${intent.name}” não corresponde ao envio que aguarda confirmação.`);
      if (!current()) throw new HttpError('cancelled', 'A sessão mudou durante o envio do arquivo.');
      const body = new FormData(); body.set('purpose', 'work'); body.set('parentId', activity.id); body.set('file', file, intent.name);
      uploadCommands.current.set(localId, intent);
      let staged: WorkFileMetadata;
      try { staged = await api.uploadWorkFile(body, intent.key, sessionKey); }
      catch (cause: unknown) {
        if (cause instanceof HttpError && cause.kind === 'validation') uploadCommands.current.delete(localId);
        throw cause;
      }
      if (!current()) throw new HttpError('cancelled', 'A sessão mudou durante o envio do arquivo.');
      return staged;
    }, (resolved, localId) => {
      setFiles(resolved.files); setUploads(resolved.uploads); setItems(resolved.items);
      persistRecovery(resolved.items, resolved.uploads, submission?.revision ?? 0);
      uploadCommands.current.delete(localId);
    });
    return resolved.items;
  };

  const inspectLatest = async (expected?: SubmissionAttachment[]) => {
    const id = submission?.id ?? submissionId.current;
    if (!id) return null;
    const latest = await api.readSubmission(id, sessionKey);
    if (!current()) return null;
    const student = latest as SubmissionStudent;
    if (student.submittedAt) { submissionId.current = student.id; setSubmission(student); setConflict(null); submitIntent.current = null; return student; }
    if (expected && sameAttachments(student.attachments, expected)) { submissionId.current = student.id; setSubmission(student); setConflict(null); ambiguousPatch.current = false; return student; }
    setConflict(student);
    return student;
  };

  const saveDraft = async (snapshot = items): Promise<SubmissionStudent | null> => {
    if (!isAssigned || isSubmitted || busy || conflict || ambiguousPatch.current || !current()) return null;
    if (submission && !isDirty && !ambiguousPatch.current && !ambiguousPrepare.current) return submission;
    setBusy(true); setError('');
    try {
      const resolved = await resolveUploads([...snapshot]);
      if (!resolved.length && !submission) { /* An empty private preparation is allowed; only submit rejects it. */ }
      let saved: SubmissionStudent;
      if (!submission) {
        if (prepareCommand.current && ambiguousPrepare.current) {
          saved = await api.prepareSubmission(activity.id, prepareCommand.current.attachments, prepareCommand.current.key, sessionKey) as SubmissionStudent;
        } else {
          const command = { key: crypto.randomUUID(), attachments: structuredClone(resolved) };
          prepareCommand.current = command; ambiguousPrepare.current = false;
          saved = await api.prepareSubmission(activity.id, command.attachments, command.key, sessionKey) as SubmissionStudent;
        }
        ambiguousPrepare.current = false;
      } else {
        const command = patchCommand.current && ambiguousPatch.current ? patchCommand.current : { revision: submission.revision, attachments: structuredClone(resolved) };
        patchCommand.current = command;
        try { saved = await api.updateSubmission(submission.id, command.revision, command.attachments, sessionKey) as SubmissionStudent; }
        catch (cause: unknown) {
          if (cause instanceof HttpError && cause.kind === 'conflict') {
            const latest = await inspectLatest(command.attachments);
            if (latest && !latest.submittedAt && sameAttachments(latest.attachments, command.attachments)) {
              patchCommand.current = null;
              setError('Rascunho confirmado na revisão atual.');
              return latest;
            }
            setError('O rascunho mudou em outra sessão. Confira a versão atual antes de tentar salvar de novo.');
            return null;
          }
          ambiguousPatch.current = true;
          setError('O estado do salvamento é incerto. Consulte a versão atual antes de repetir; seus arquivos e links foram preservados.');
          return null;
        }
      }
      if (!current()) return null;
      submissionId.current = saved.id;
      setSubmission(saved); setItems(saved.attachments); setFiles({}); setUploads({}); setConflict(null); patchCommand.current = null; prepareCommand.current = null;
      recoveryKey.current = `${ownerKey}:revision:${saved.revision}`;
      setConfirm(false); persistRecovery(saved.attachments, {}, saved.revision);
      return saved;
    } catch (cause: unknown) {
      if (!current()) return null;
      if (!submission && prepareCommand.current) ambiguousPrepare.current = true;
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o rascunho. O conteúdo local foi preservado.');
      return null;
    } finally { if (current()) setBusy(false); }
  };

  const reviewUncertainSave = async () => {
    if (!ambiguousPatch.current || !submission || busy) return;
    setBusy(true); setError('');
    try {
      const latest = await inspectLatest(patchCommand.current?.attachments);
      if (latest && !latest.submittedAt && !conflict && sameAttachments(latest.attachments, patchCommand.current?.attachments ?? [])) {
        patchCommand.current = null;
        setError('Rascunho confirmado no servidor.');
      } else if (latest && !latest.submittedAt) setError('A versão do servidor foi carregada. Confira a revisão para preservar sua edição local.');
    } catch (cause: unknown) { if (current()) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a revisão atual.'); }
    finally { if (current()) setBusy(false); }
  };

  const acknowledgeConflict = () => {
    if (!conflict) return;
    setSubmission(conflict); setConflict(null); patchCommand.current = null; ambiguousPatch.current = false;
    if (submitIntent.current && conflict.revision > submitIntent.current.revision) submitIntent.current = null;
    setNotice('Versão atual conferida. Sua seleção local foi mantida e poderá ser salva sobre a revisão confirmada.');
  };

  const sendSubmit = async (frozen: { revision: number; key: string }) => {
    const id = submission?.id ?? submissionId.current;
    if (!id || busy || !current()) return;
    setBusy(true); setError('');
    try {
      const result = await api.submitWork(id, frozen.revision, frozen.key, sessionKey) as SubmissionStudent;
      if (!current()) return;
      submissionId.current = result.id; setSubmission(result); setItems(result.attachments); setConfirm(false); setConflict(null); submitIntent.current = null;
      try { window.sessionStorage.removeItem(ownerKey); } catch { /* O comprovante continua no servidor. */ }
    } catch (cause: unknown) {
      if (!current()) return;
      if (cause instanceof HttpError && cause.kind === 'conflict') {
        try {
          const latest = await api.readSubmission(id, sessionKey) as SubmissionStudent;
          if (!current()) return;
          if (latest.submittedAt) { submissionId.current = latest.id; setSubmission(latest); setItems(latest.attachments); submitIntent.current = null; }
          else { setConflict(latest); setError('Outra sessão alterou o rascunho. Confira a versão atual antes de criar um novo envio.'); }
        } catch (readCause: unknown) { if (current()) setError(readCause instanceof Error ? readCause.message : 'Não foi possível consultar o estado do envio.'); }
      } else setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a entrega. Tente novamente o mesmo envio.');
    } finally { if (current()) setBusy(false); }
  };

  const submit = async () => {
    if (busy || conflict || !isAssigned || isSubmitted || !current()) return;
    if (link.trim()) { setError('Adicione o link à lista antes de salvar ou enviar.'); return; }
    if (submitIntent.current) { await sendSubmit(submitIntent.current); return; }
    if (!items.length) { setError('Adicione pelo menos um arquivo ou link antes de enviar.'); return; }
    let saved = submission;
    if (isDirty) saved = await saveDraft(items);
    if (!saved || !current()) return;
    const frozen = { revision: saved.revision, key: crypto.randomUUID() };
    submitIntent.current = frozen;
    persistRecovery(saved.attachments, {}, saved.revision);
    await sendSubmit(frozen);
  };

  const retryPrepare = async () => { if (ambiguousPrepare.current && !busy) await saveDraft(items); };
  const canSubmit = isAssigned && !isSubmitted && !busy && !conflict && (items.length > 0 || !!submitIntent.current);
  const frozenPending = ambiguousPrepare.current || ambiguousPatch.current || !!submitIntent.current || uploadCommands.current.size > 0;

  if (!isAssigned) return <Card><p role="status" className="text-sm leading-7">Somente consulta — esta atividade não foi atribuída a você. O serviço valida matrícula e prazo ao salvar e ao enviar.</p></Card>;
  if (submission?.submittedAt) return <>
    <Card><Badge tone="green">Entrega confirmada</Badge><h2 className="mt-4 font-semibold">Comprovante de entrega</h2><p className="mt-3 text-sm [overflow-wrap:anywhere]">{activity.title} · {new Date(submission.receipt?.submittedAt ?? submission.submittedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)</p><p className="mt-2 text-sm">Comprovante {submission.receipt?.id ?? 'indisponível'} · {countLabel(submission.attachments.length, 'anexo', 'anexos')}</p><p className="mt-3 text-sm text-slate-500">Envio único confirmado. Os anexos não podem ser substituídos.</p><WorkAttachments items={submission.attachments} /></Card>
    <FeedbackPublication feedback={submission.feedbackPublished} maxGrade={activity.maxGrade} />
  </>;

  return <Card className="space-y-4">
    <h2 className="font-semibold">Preparar entrega</h2><p className="text-sm leading-7 text-slate-600">Até 5 arquivos e links no total. Cada arquivo pode ter até 10 MiB; arquivo vazio é permitido. Salvar rascunho não envia a atividade.</p>
    {notice && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
    {conflict && <RecordConflict author="sua conta em outra sessão" updatedAt={conflict.updatedAt} onReviewed={acknowledgeConflict}><p>Revisão atual: {conflict.revision}</p><p>Anexos salvos: {conflict.attachments.map(item => item.name).join(', ') || 'Nenhum'}</p><p>Sua seleção local continua preservada: {items.map(item => item.name).join(', ') || 'Nenhum'}</p></RecordConflict>}
    <Input label="Adicionar arquivos" type="file" multiple disabled={busy || !!conflict || frozenPending} onChange={event => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    {Object.entries(uploads).filter(([id]) => !files[id]).map(([id, upload]) => <p key={id} role="status" className="text-xs text-amber-800">Selecione novamente “{upload.name}” para repetir o mesmo envio de arquivo.</p>)}
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (link.trim() && !busy && !conflict && !frozenPending) addLink(); }}><div className="min-w-0 flex-1"><Input label="Link do trabalho" type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://" disabled={busy || !!conflict || frozenPending} /></div><Button type="submit" variant="secondary" disabled={!link.trim() || busy || !!conflict || frozenPending}>Adicionar link</Button></form>
    <WorkAttachments items={items} files={files} onRemove={busy || !!conflict || frozenPending ? undefined : remove} />
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <p role="status" className="text-xs text-slate-500">{isDirty ? 'Alterações locais ainda não salvas.' : submission ? `Rascunho salvo · revisão ${submission.revision} · não enviado.` : 'Não entregue.'}</p>
    <div className="flex flex-wrap gap-3"><Button variant="secondary" loading={busy} disabled={!!conflict || ambiguousPatch.current || ambiguousPrepare.current} onClick={() => void saveDraft()}>Salvar rascunho</Button><Button disabled={!canSubmit || ambiguousPatch.current || uploadCommands.current.size > 0} onClick={() => setConfirm(true)}>{submitIntent.current ? 'Tentar confirmar o mesmo envio' : 'Conferir e enviar'}</Button>{ambiguousPatch.current && <Button variant="secondary" loading={busy} onClick={() => void reviewUncertainSave()}>Consultar salvamento</Button>}{ambiguousPrepare.current && <Button variant="secondary" loading={busy} onClick={() => void retryPrepare()}>Repetir a mesma preparação</Button>}</div>
    <Dialog open={confirm} onClose={() => { if (!busy) setConfirm(false); }} title="Confirmar entrega única">
      <p className="text-sm leading-7 [overflow-wrap:anywhere]">Enviar {items.length === 1 ? 'este 1 anexo' : `estes ${items.length} anexos`} para {activity.title}? A entrega fica registrada uma única vez e os anexos não poderão ser substituídos.</p><WorkAttachments items={items} files={files} />
      <div className="mt-5 flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Voltar à preparação</Button><Button loading={busy} disabled={!canSubmit} onClick={() => void submit()}>{submitIntent.current ? 'Confirmar o mesmo envio' : 'Confirmar envio único'}</Button></div>
    </Dialog>
  </Card>;
}
