'use client';

import { useMemo, useRef, useState } from 'react';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { RecordConflict } from '@/components/shared/record-conflict';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { useSession } from '@/providers/app-context';
import { HttpError } from '@/lib/http-client';
import { brazilDateTimeLabel } from '@/lib/utils';
import { createAssessmentsApi, type AssessmentRead, type SubmissionStaff, type WorkFeedback } from '../api';

function feedbackMatches(value: SubmissionStaff['feedbackDraft'], comment: string, grade: number | null) {
  return value?.comment === comment.trim() && value.grade === grade;
}

function PublishedFeedback({ feedback, maxGrade }: { feedback: WorkFeedback | null; maxGrade: number | null }) {
  return <section role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-4">
    <h3 className="font-semibold">{feedback ? 'Feedback disponível' : 'Entregue — aguardando feedback'}</h3>
    {feedback && <>
      <p className="mt-2 text-xs text-slate-500">{feedback.author.name} · {brazilDateTimeLabel(feedback.createdAt)}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{feedback.comment}</p>
      <p className="mt-2 text-sm font-semibold">{feedback.grade == null ? 'Sem nota' : `Nota: ${feedback.grade} / ${maxGrade ?? '—'}`}</p>
    </>}
  </section>;
}

export function FeedbackEditor({ activity, submission: initialSubmission, onPublished }: { activity: AssessmentRead; submission: SubmissionStaff; onPublished?: () => void }) {
  const { client, sessionKey, status } = useSession();
  const api = useMemo(() => createAssessmentsApi(client), [client]);
  const [submission, setSubmission] = useState(initialSubmission);
  const [comment, setComment] = useState(initialSubmission.feedbackDraft?.comment ?? '');
  const [grade, setGrade] = useState(initialSubmission.feedbackDraft?.grade == null ? '' : String(initialSubmission.feedbackDraft.grade));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<SubmissionStaff | null>(null);
  const publishIntent = useRef<{ revision: number; key: string } | null>(null);
  const savedComment = submission.feedbackDraft?.comment ?? '';
  const savedGrade = submission.feedbackDraft?.grade == null ? '' : String(submission.feedbackDraft.grade);
  const hasUnsaved = comment !== savedComment || grade !== savedGrade;
  useUnsavedChanges(hasUnsaved);
  const current = () => status === 'authenticated' && client.getSnapshot().status === 'authenticated' && client.getSnapshot().sessionKey === sessionKey;
  const parsedGrade = grade === '' ? null : Number(grade);

  const inspectCurrent = async (localComment: string, localGrade: number | null) => {
    const latest = await api.readSubmission(submission.id, sessionKey);
    if (!current()) return;
    if (!('feedbackHistory' in latest)) throw new Error('O retorno docente atual não está disponível nesta sessão.');
    if (feedbackMatches(latest.feedbackDraft, localComment, localGrade)) {
      setSubmission(latest);
      return;
    }
    setConflict(latest);
  };

  const saveDraft = async (publish: boolean) => {
    if (busy || conflict || status !== 'authenticated') return;
    setBusy(true); setError('');
    try {
      let latest = submission;
      if (hasUnsaved || !submission.feedbackDraft && (comment.trim() || parsedGrade !== null)) {
        try {
          latest = await api.saveFeedback(submission.id, { expectedRevision: submission.revision, comment, grade: parsedGrade }, sessionKey);
          if (!current()) return;
          setSubmission(latest);
        } catch (cause: unknown) {
          if (cause instanceof HttpError && cause.kind === 'conflict') {
            await inspectCurrent(comment, parsedGrade);
            setError('Outro docente alterou este retorno. Confira a versão atual; seu texto local foi preservado.');
            return;
          }
          // PATCH has no replay key. Read latest state before deciding whether it committed.
          try {
            latest = await api.readSubmission(submission.id, sessionKey) as SubmissionStaff;
            if (!current()) return;
            if (!feedbackMatches(latest.feedbackDraft, comment, parsedGrade)) {
              setConflict(latest);
              setError('Não foi possível confirmar o salvamento. Confira a versão atual antes de tentar novamente. Seu texto local foi preservado.');
              return;
            }
            setSubmission(latest);
          } catch (readCause: unknown) { if (current()) throw readCause; return; }
        }
      }
      if (publish) {
        if (parsedGrade !== null && (!Number.isFinite(parsedGrade) || parsedGrade < 0 || typeof activity.maxGrade === 'number' && parsedGrade > activity.maxGrade)) {
          setError(`A nota deve estar entre 0 e ${activity.maxGrade ?? 0}.`); return;
        }
        if (!comment.trim() && parsedGrade === null) { setError('Escreva um comentário ou informe uma nota antes de publicar.'); return; }
        publishIntent.current ??= { revision: latest.revision, key: crypto.randomUUID() };
        const frozen = publishIntent.current;
        let published: SubmissionStaff;
        try { published = await api.publishFeedback(submission.id, frozen.revision, frozen.key, sessionKey); }
        catch (cause: unknown) {
          if (cause instanceof HttpError && cause.kind === 'conflict') {
            const currentSubmission = await api.readSubmission(submission.id, sessionKey);
            if (!current()) return;
            if ('feedbackHistory' in currentSubmission) setConflict(currentSubmission);
            publishIntent.current = null;
            setError('Outro docente publicou ou alterou o retorno. Confira a revisão e o histórico antes de publicar novamente; seu texto local foi preservado.');
            return;
          }
          throw cause;
        }
        if (!current()) return;
        setSubmission(published);
        publishIntent.current = null;
        onPublished?.();
      }
    } catch (cause: unknown) {
      if (current()) setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o retorno.');
    } finally { if (current()) setBusy(false); }
  };

  return <Card className="mt-5 space-y-4">
    <h2 className="font-semibold">Retorno individual</h2>
    <PublishedFeedback feedback={submission.feedbackPublished} maxGrade={activity.maxGrade} />
    {submission.feedbackDraft && <p role="status" className="text-sm text-amber-800">Rascunho privado · {submission.feedbackDraft.author.name} · {brazilDateTimeLabel(submission.feedbackDraft.createdAt)}</p>}
    {conflict && <RecordConflict author={conflict.feedbackDraft?.author.name ?? conflict.feedbackPublished?.author.name ?? 'Equipe docente'} updatedAt={conflict.updatedAt} onReviewed={() => { setSubmission(conflict); setConflict(null); publishIntent.current = null; }}>
      <p>Rascunho atual: {conflict.feedbackDraft?.comment ?? 'Sem rascunho'} · Nota: {conflict.feedbackDraft?.grade ?? 'Sem nota'}</p>
      <p>Publicado: {conflict.feedbackPublished?.comment ?? 'Ainda não publicado'} · Nota: {conflict.feedbackPublished?.grade ?? 'Sem nota'}</p>
      <p>Histórico: {conflict.feedbackHistory.length} publicação(ões).</p>
    </RecordConflict>}
    <Textarea label="Comentário privado" value={comment} onChange={event => setComment(event.target.value)} maxLength={10000} disabled={busy || !!conflict} />
    {typeof activity.maxGrade === 'number'
      ? <Input label={`Nota opcional (0 a ${activity.maxGrade})`} type="number" min="0" max={activity.maxGrade} step="any" value={grade} onChange={event => setGrade(event.target.value)} disabled={busy || !!conflict} />
      : grade !== ''
        ? <div className="space-y-2"><p className="text-sm text-amber-800">Este rascunho antigo contém nota, mas a atividade não possui escala.</p><Button variant="secondary" disabled={busy || !!conflict} onClick={() => setGrade('')}>Remover nota</Button></div>
        : <p className="text-sm text-slate-500">Esta atividade recebe retorno sem nota.</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button variant="secondary" loading={busy} disabled={!!conflict} onClick={() => void saveDraft(false)}>Salvar rascunho de retorno</Button><Button loading={busy} disabled={!!conflict} onClick={() => void saveDraft(true)}>Publicar retorno</Button></div>
    {submission.feedbackHistory.length > 0 && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">Histórico de publicações</summary><ol className="space-y-4">{submission.feedbackHistory.map((feedback, index) => <li key={`${feedback.createdAt}:${index}`} className="whitespace-pre-wrap border-t border-slate-200 pt-3 [overflow-wrap:anywhere]">{brazilDateTimeLabel(feedback.createdAt)} · {feedback.author.name}<p>{feedback.comment}</p><p>{feedback.grade == null ? 'Sem nota' : `${feedback.grade} / ${activity.maxGrade ?? '—'}`}</p></li>)}</ol></details>}
  </Card>;
}
