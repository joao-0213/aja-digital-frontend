import type { ForumTopic, MockDatabase, User } from '@/models';
import { canAccessSubject } from './access.ts';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const deny = () => { throw new Error('Sem permissão para alterar esta conversa. Confira seu vínculo e sua atribuição.'); };
export const forumReplies = (topic: ForumTopic) => topic.replies.filter(r => !r.deletedAt).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
export function forumMatches(topic: ForumTopic, search: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return normalize([topic.title, topic.body, ...topic.tags, ...forumReplies(topic).map(r => r.body)].join(' ')).includes(normalize(search.trim()));
}
export function forumTarget(db: MockDatabase, topic: Pick<ForumTopic, 'target' | 'reference' | 'subjectId'>) {
  const target = topic.target ?? (topic.reference ? { type: 'question' as const, id: topic.reference } : undefined);
  if (!target) return undefined;
  if (target.type === 'question') {
    const q = db.questions.find(q => q.id === target.id && !q.deletedAt);
    return q ? { title: `Questão ${q.id.toUpperCase()} · ${q.topic}`, preview: q.statement, href: `/questoes?id=${encodeURIComponent(q.id)}` } : null;
  }
  const m = db.materials.find(m => m.id === target.id && !m.deletedAt && db.modules.some(mod => mod.id === m.moduleId && mod.subjectId === topic.subjectId && !mod.deletedAt));
  return m ? { title: m.title, preview: m.content.slice(0, 240), href: `/materiais?id=${encodeURIComponent(m.id)}` } : null;
}
export function validateForumAttachment(item: NonNullable<ForumTopic['attachment']>) {
  if (!item.id.startsWith('forum-file-') || !item.name.trim() || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(item.mime) || !Number.isFinite(item.size) || item.size <= 0 || item.size > 5 * 1024 * 1024) throw new Error('Escolha um PDF, PNG, JPEG ou WebP de até 5 MB.');
}
/** Shared checks for every persona, always against the current state. */
export function validateForum(db: MockDatabase, actor: User, before: ForumTopic | undefined, next: ForumTopic, now: string) {
  if (!canAccessSubject(db, actor, next.subjectId) || !db.classes.some(c => c.id === next.classId && !c.deletedAt) || !db.subjects.some(s => s.id === next.subjectId && s.classId === next.classId)) return deny();
  if (!db.classes.some(c => c.id === next.classId && c.active) && (!before || !same({ ...before, readBy: [] }, { ...next, readBy: [] }))) return deny();
  const manager = actor.role === 'admin' || actor.role === 'teacher';
  if (!next.title.trim() || !next.body.trim()) throw new Error('Informe título e texto da pergunta.');
  if (!before) {
    if (next.authorId !== actor.id || next.replies.length || next.readBy.some(id => id !== actor.id)) return deny();
    if ((next.target || next.reference) && !forumTarget(db, next)) throw new Error('Referência indisponível. Confira a questão ou o material.');
    if (next.attachment) validateForumAttachment(next.attachment);
  } else {
    for (const field of new Set([...Object.keys(before), ...Object.keys(next)])) {
      if (!['replies', 'readBy', 'deletedAt'].includes(field) && !same(before[field as keyof ForumTopic], next[field as keyof ForumTopic])) return deny();
    }
    if (next.deletedAt && !before.deletedAt && actor.id !== before.authorId && !manager) return deny();
    if (next.readBy.some(id => id !== actor.id && !before.readBy.includes(id)) || before.readBy.some(id => id !== actor.id && !next.readBy.includes(id))) return deny();
  }
  if (new Set(next.replies.map(r => r.id)).size !== next.replies.length || before?.replies.some(r => !next.replies.some(n => n.id === r.id))) return deny();
  for (const r of next.replies) {
    const old = before?.replies.find(p => p.id === r.id);
    if (old && same(old, r)) continue;
    if (old?.deletedAt) return deny();
    if (!old) {
      if (r.authorId !== actor.id || !r.body.trim() || !Number.isFinite(Date.parse(r.createdAt)) || r.accepted || r.deletedAt || Object.keys(r.votes).length) return deny();
      r.createdAt = now;
    } else {
      for (const field of new Set([...Object.keys(old), ...Object.keys(r)])) if (!['votes', 'accepted', 'deletedAt'].includes(field) && !same(old[field as keyof typeof old], r[field as keyof typeof r])) return deny();
      if (r.deletedAt && actor.id !== r.authorId && !manager) return deny();
      if (r.accepted !== old.accepted && actor.id !== before?.authorId && !manager) return deny();
      for (const id of new Set([...Object.keys(old.votes), ...Object.keys(r.votes)])) if (r.votes[id] !== old.votes[id] && (id !== actor.id || r.authorId === actor.id || r.votes[id] !== undefined && r.votes[id] !== 1)) return deny();
    }
    if (r.deletedAt) r.accepted = false;
    r.updatedAt = now; r.updatedBy = actor.id; r.revision = (old?.revision ?? 0) + 1;
  }
  if (next.replies.filter(r => r.accepted && !r.deletedAt).length > 1) throw new Error('A conversa só pode ter uma solução aceita.');
  if (before && next.replies.some(r => !before.replies.some(p => p.id === r.id))) next.readBy = [actor.id];
}
