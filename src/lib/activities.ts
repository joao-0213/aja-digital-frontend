import type { Assessment, MockDatabase, WorkAttachment } from '@/models';

/** Local deadline inputs have a fixed, visible product timezone, independent of device. */
export function deadlineTime(value: string): number {
  if (!value) return Infinity;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00-03:00` : /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}-03:00`);
}
export const isLate = (activity: Assessment, timestamp: string) => !!activity.deadline && Date.parse(timestamp) >= deadlineTime(activity.deadline);
export const activityClosed = (activity: Assessment, now: string) => !activity.allowLate && isLate(activity, now);
export const hasDelivery = (db: MockDatabase, id: string) => db.attempts.some(t => t.assessmentId === id && t.submittedAt) || (db.submissions ?? []).some(t => t.assessmentId === id && t.submittedAt);
export const hasSubmitted = (db: MockDatabase, id: string, userId: string) => db.attempts.some(t => t.assessmentId === id && t.userId === userId && t.submittedAt) || (db.submissions ?? []).some(t => t.assessmentId === id && t.userId === userId && t.submittedAt);

export function safeWorkLink(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; } catch { return false; }
}
export function validateAttachments(items: WorkAttachment[]) {
  if (items.length > 5) throw new Error('Use até 5 anexos no total, contando arquivos e links.');
  if (new Set(items.map(a => a.id)).size !== items.length) throw new Error('Há anexos repetidos.');
  for (const a of items) {
    if (!a.id || !a.name.trim()) throw new Error('Informe o nome do anexo.');
    if (a.kind === 'link') { if (!safeWorkLink(a.url)) throw new Error('Informe um link HTTP ou HTTPS válido, sem credenciais.'); }
    else if (a.kind !== 'file' || !Number.isFinite(a.size) || a.size < 0 || a.size > 10 * 1024 * 1024) throw new Error('Cada arquivo pode ter até 10 MB.');
  }
}
export function saveWork(db: MockDatabase, assessmentId: string, userId: string, id: string, attachments: WorkAttachment[], submit: boolean, now: string) {
  const a = db.assessments.find(a => a.id === assessmentId && !a.deletedAt && a.status === 'published' && a.kind === 'work');
  if (!a) throw new Error('Atividade indisponível: retirada ou sem acesso.');
  if (hasSubmitted(db, assessmentId, userId)) throw new Error('Este trabalho já foi enviado. Consulte o comprovante.');
  validateAttachments(attachments);
  if (submit && !attachments.length) throw new Error('Adicione pelo menos um arquivo ou link para enviar.');
  if (submit && activityClosed(a, now)) throw new Error('Prazo encerrado. Seus anexos foram preservados.');
  db.submissions ??= [];
  const existing = db.submissions.find(s => s.assessmentId === assessmentId && s.userId === userId);
  if (existing?.deletedAt) throw new Error('Entrega indisponível. Não há reabertura de envio.');
  if (existing) { existing.attachments = structuredClone(attachments); if (submit) existing.submittedAt = now; }
  else db.submissions.push({ id, assessmentId, userId, attachments: structuredClone(attachments), ...(submit && { submittedAt: now }), feedbackHistory: [] });
}
export function saveFeedback(db: MockDatabase, id: string, comment: string, grade: number | undefined, publish: boolean, authorId: string, now: string) {
  const submission = db.submissions?.find(s => s.id === id && s.submittedAt && !s.deletedAt);
  const a = db.assessments.find(a => a.id === submission?.assessmentId);
  if (!submission || !a) throw new Error('Entrega indisponível.');
  if (grade !== undefined && (a.maxGrade === undefined || !Number.isFinite(grade) || grade < 0 || grade > a.maxGrade)) throw new Error('A nota deve estar entre zero e o máximo da atividade.');
  if (publish && !comment.trim() && grade === undefined) throw new Error('Escreva um comentário ou informe uma nota antes de publicar.');
  const feedback = { comment: comment.trim(), ...(grade !== undefined && { grade }), authorId, createdAt: now };
  if (publish) {
    submission.feedbackPublished = feedback;
    submission.feedbackHistory.push(feedback);
    delete submission.feedbackDraft;
  } else submission.feedbackDraft = feedback;
}
