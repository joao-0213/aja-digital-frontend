'use client';

import { useState } from 'react';
import type { Assessment, WorkSubmission } from '@/models';
import { useApp } from '@/providers/app-context';
import { useRecordRevision } from '@/hooks/use-record-revision';
import { RecordConflict } from '@/components/shared/record-conflict';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { saveFeedback } from '@/lib/activities';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

export function FeedbackEditor({ activity, submission }: { activity: Assessment; submission: WorkSubmission }) {
  const { db, user, mutate, busy } = useApp();
  const initial = submission.feedbackDraft ?? submission.feedbackPublished;
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [grade, setGrade] = useState(initial?.grade === undefined ? '' : String(initial.grade));
  const [error, setError] = useState('');
  const revision = useRecordRevision('submissions', submission);
  useUnsavedChanges(comment !== (initial?.comment ?? '') || grade !== (initial?.grade === undefined ? '' : String(initial.grade)));
  const save = async (publish: boolean) => {
    setError('');
    if (revision.conflict) { setError('Confira a versão atual antes de salvar.'); return; }
    const ok = await mutate(d => saveFeedback(d, submission.id, comment, grade === '' ? undefined : Number(grade), publish, user.id, new Date().toISOString()), publish ? 'Retorno publicado para o aluno.' : 'Rascunho de retorno salvo; ainda não publicado.', { ...revision.expected, requirePersistence: true });
    if (ok) revision.capture({ id: submission.id, revision: (submission.revision ?? 0) + 1 });
  };
  return <Card className="mt-5 space-y-4">
    <h2 className="font-semibold">Retorno individual</h2>
    <p className="text-sm leading-6 text-slate-600">Comentário e nota são privados. Salvar rascunho não mostra alterações ao aluno; publicar libera ambos juntos. Durante uma correção, o retorno publicado anterior continua visível.</p>
    {submission.updatedAt && <p className="text-xs text-slate-500">Última alteração: {db.users.find(u => u.id === submission.updatedBy)?.name ?? 'Equipe'} · {new Date(submission.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
    {submission.feedbackDraft && <p role="status" className="text-sm text-amber-800">Rascunho — não publicado</p>}
    {revision.conflict && <RecordConflict key={submission.revision} author={db.users.find(u => u.id === submission.updatedBy)?.name ?? 'Equipe'} updatedAt={submission.updatedAt} onReviewed={revision.acknowledge}><p>Rascunho atual: {submission.feedbackDraft?.comment ?? 'Sem rascunho'} · Nota: {submission.feedbackDraft?.grade ?? 'Sem nota'}</p><p>Publicado: {submission.feedbackPublished?.comment ?? 'Ainda não publicado'} · Nota: {submission.feedbackPublished?.grade ?? 'Sem nota'}</p></RecordConflict>}
    <Textarea label="Comentário privado" value={comment} onChange={e => setComment(e.target.value)} maxLength={10000} />
    {activity.maxGrade !== undefined ? <Input label={`Nota opcional (0 a ${activity.maxGrade})`} type="number" min="0" max={activity.maxGrade} step="any" value={grade} onChange={e => setGrade(e.target.value)} /> : <p className="text-sm text-slate-500">Esta atividade recebe retorno sem nota.</p>}
    <p className="text-xs text-slate-500">Deixar a nota vazia significa sem nota; zero é uma nota válida.</p>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button variant="secondary" loading={busy} disabled={revision.conflict} onClick={() => void save(false)}>Salvar rascunho de retorno</Button><Button loading={busy} disabled={revision.conflict} onClick={() => void save(true)}>Publicar retorno</Button></div>
    {submission.feedbackHistory.length > 0 && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">Histórico de publicações</summary><ol className="space-y-4">{submission.feedbackHistory.map((f, index) => <li key={index} className="whitespace-pre-wrap border-t border-slate-200 pt-3">{new Date(f.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {db.users.find(u => u.id === f.authorId)?.name ?? 'Equipe'}<p>{f.comment}</p><p>{f.grade === undefined ? 'Sem nota' : `${f.grade} / ${activity.maxGrade}`}</p></li>)}</ol></details>}
  </Card>;
}
