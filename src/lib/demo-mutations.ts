import type { MockDatabase, RecordMeta, User } from '@/models';
import { canAccessSubject, canManageSubject, isActiveUser } from './access.ts';
import { enrolledForLesson, executeEnrollmentCommand, isAssessmentAssigned, reconcileEnrollments, type EnrollmentCommand } from './enrollment.ts';

export interface MutationOptions {
  expected?: { collection: string; id: string; revision: number }[];
  enrollment?: EnrollmentCommand;
}

type Row = Record<string, unknown> & RecordMeta & { id?: string };
type Collection = Exclude<keyof MockDatabase, 'version' | 'audit'>;
const collections: Collection[] = ['users', 'classes', 'subjects', 'modules', 'materials', 'questions', 'assessments', 'attempts', 'topics', 'announcements', 'events', 'attendance', 'progress', 'enrollments'];
const key = (row: Row) => row.id ?? `${row.userId}:${row.materialId}`;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const denied = () => { throw new Error('Sem permissão para alterar este registro. Confira seu acesso e sua atribuição.'); };

function subjectId(db: MockDatabase, collection: Collection, row: Row): string | undefined {
  if (collection === 'subjects') return row.id;
  if (typeof row.subjectId === 'string') return row.subjectId;
  if (typeof row.moduleId === 'string') return db.modules.find(m => m.id === row.moduleId && !m.deletedAt)?.subjectId;
  if (typeof row.assessmentId === 'string') {
    const assessment = db.assessments.find(a => a.id === row.assessmentId && !a.deletedAt);
    return assessment && db.modules.find(m => m.id === assessment.moduleId && !m.deletedAt)?.subjectId;
  }
  if (typeof row.materialId === 'string') {
    const material = db.materials.find(m => m.id === row.materialId && !m.deletedAt);
    return material && db.modules.find(m => m.id === material.moduleId && !m.deletedAt)?.subjectId;
  }
}

function onlyFields(before: Row, after: Row, fields: string[]) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].every(field => equal(before[field], after[field]) || fields.includes(field));
}

function validateStudent(db: MockDatabase, actor: User, collection: Collection, before: Row | undefined, row: Row) {
  if (collection === 'users' && before?.id === actor.id && onlyFields(before, row, ['name']) && typeof row.name === 'string' && row.name.trim()) return;
  const context = subjectId(db, collection, row);
  if (!context || !canAccessSubject(db, actor, context)) return denied();
  if (collection === 'progress' && row.userId === actor.id && (!before || onlyFields(before, row, ['completed', 'lastAccess']))) return;
  if (collection === 'attempts' && row.userId === actor.id) {
    const assessment = db.assessments.find(a => a.id === row.assessmentId && a.status === 'published' && !a.deletedAt);
    if (!assessment) return denied();
    if (!isAssessmentAssigned(db, assessment, actor.id)) throw new Error('Disponível apenas para consulta: o prazo terminou antes da sua matrícula.');
    if (before?.submittedAt || db.attempts.some(a => a.id !== row.id && a.assessmentId === row.assessmentId && a.userId === actor.id && a.submittedAt)) throw new Error('Este questionário já foi enviado. Consulte o resultado individual.');
    if (!before || onlyFields(before, row, ['answers', 'submittedAt'])) return;
  }
  if (collection === 'topics') {
    if (!before && row.authorId === actor.id && Array.isArray(row.replies) && row.replies.length === 0 && Array.isArray(row.readBy) && row.readBy.every(id => id === actor.id)) return;
    if (before && onlyFields(before, row, ['readBy', 'replies'])) {
      const old = db.topics.find(t => t.id === row.id)!;
      const next = row as unknown as typeof old;
      if (!old.readBy.every(id => next.readBy.includes(id)) || next.readBy.some(id => id !== actor.id && !old.readBy.includes(id))) return denied();
      for (const reply of next.replies) {
        const previous = old.replies.find(r => r.id === reply.id);
        if (!previous) { if (reply.authorId !== actor.id || reply.accepted || Object.keys(reply.votes).length) return denied(); }
        else {
          if (reply.authorId !== previous.authorId || reply.body !== previous.body || reply.createdAt !== previous.createdAt) return denied();
          if (reply.accepted !== previous.accepted && old.authorId !== actor.id) return denied();
          for (const id of new Set([...Object.keys(previous.votes), ...Object.keys(reply.votes)])) if (id !== actor.id && previous.votes[id] !== reply.votes[id]) return denied();
        }
      }
      if (old.replies.some(r => !next.replies.some(n => n.id === r.id))) return denied();
      return;
    }
  }
  return denied();
}

/** Revalidate permissions and revisions against the latest database, not a component's stale copy. */
export function applyDemoMutation(current: MockDatabase, actorId: string, recipe: (draft: MockDatabase) => void, options: MutationOptions = {}, now = new Date().toISOString()): MockDatabase {
  const actor = options.enrollment?.type === 'register' ? { id: actorId, name: 'Cadastro público da demo', email: '', role: 'student' as const } : current.users.find(u => u.id === actorId);
  if (!isActiveUser(actor)) throw new Error('Sua conta está inativa ou foi excluída. Solicite a regularização à administração.');
  for (const expected of options.expected ?? []) {
    if (!collections.includes(expected.collection as Collection)) throw new Error('Registro indisponível para edição.');
    const record = (current[expected.collection as Collection] as unknown as Row[]).find(row => key(row) === expected.id);
    if (!record || record.deletedAt) throw new Error('O registro foi retirado. Seu preenchimento foi preservado.');
    if ((record.revision ?? 0) !== expected.revision) {
      const author = current.users.find(u => u.id === record.updatedBy)?.name ?? 'outro participante';
      const moment = record.updatedAt ? new Date(record.updatedAt).toLocaleString('pt-BR') : 'momento não registrado';
      throw new Error(`O registro foi alterado por ${author} em ${moment}. Confira a versão atual antes de salvar novamente. Seu preenchimento foi preservado.`);
    }
  }
  const draft = structuredClone(current);
  recipe(draft);
  if (options.enrollment) {
    if (!equal(current, draft)) return denied();
    executeEnrollmentCommand(draft, actor, options.enrollment, now);
  }
  if (!equal(current.audit, draft.audit) || draft.version !== current.version) return denied();
  const changes: { collection: Collection; before?: Row; after: Row }[] = [];
  for (const collection of collections) {
    const previous = (current[collection] ?? []) as unknown as Row[];
    const next = (draft[collection] ?? []) as unknown as Row[];
    if (previous.some(row => !next.some(item => key(item) === key(row)))) throw new Error('Use exclusão lógica; o histórico deve ser preservado.');
    if (new Set(next.map(key)).size !== next.length) throw new Error('Este registro já existe. Recarregue e confira os dados.');
    for (const row of next) {
      const before = previous.find(item => key(item) === key(row));
      if (before && equal(before, row)) continue;
      if (before?.deletedAt) throw new Error('Registro excluído indisponível. Não há restauração pela interface.');
      if (before && ['revision', 'updatedAt', 'updatedBy'].some(field => !equal(before[field], row[field]))) return denied();
      if (!options.enrollment && collection === 'enrollments') return denied();
      if (!options.enrollment && collection === 'users' && before && !equal(before.emailConfirmedAt, row.emailConfirmedAt)) throw new Error('Use a confirmação simulada na própria conta.');
      if (options.enrollment) { /* typed commands validate their own complete, atomic effect */ }
      else if (collection === 'users' && !before && row.role === 'student' && Object.keys(row).every(field => ['id', 'name', 'email', 'role'].includes(field))) {
        // Public, local demo self-registration never grants a role or class membership.
        row.emailConfirmedAt = null;
      } else if (actor.role === 'student') validateStudent(current, actor, collection, before, row);
      else if (actor.role === 'teacher') {
        if (collection === 'users' && before?.id === actor.id && onlyFields(before, row, ['name'])) { /* own minimal profile */ }
        else if (collection === 'progress' && row.userId === actor.id && canAccessSubject(current, actor, subjectId(current, collection, row) ?? '')) { /* own reading state */ }
        else if (['modules', 'materials', 'assessments', 'announcements', 'topics', 'attendance'].includes(collection)) {
          if (!canManageSubject(current, actor, subjectId(draft, collection, row) ?? '')) return denied();
          if (before && !canManageSubject(current, actor, subjectId(current, collection, before) ?? '')) return denied();
        } else if (collection === 'questions' && !before && draft.assessments.some(a => a.questionIds.includes(String(row.id)) && canManageSubject(current, actor, subjectId(draft, 'assessments', a as unknown as Row) ?? ''))) { /* legacy authoring, isolated in PP05 */ }
        else return denied();
      }
      if (before && before.authorId !== row.authorId) throw new Error('A autoria original deve ser preservada.');
      if (!before && ['materials', 'assessments', 'announcements', 'topics'].includes(collection)) row.authorId = actor.id;
      if (collection === 'attempts' && before?.submittedAt) throw new Error('Este questionário já foi enviado. O conteúdo e a data devem ser preservados.');
      if (['announcements', 'topics'].includes(collection) && row.subjectId && draft.subjects.find(s => s.id === row.subjectId)?.classId !== row.classId) throw new Error('A disciplina não pertence à turma selecionada. Confira o destino.');
      if (['materials', 'assessments'].includes(collection) && !draft.modules.some(m => m.id === row.moduleId && !m.deletedAt)) throw new Error('O módulo de destino está indisponível.');
      if (collection === 'attendance') {
        const subject = draft.subjects.find(s => s.id === row.subjectId && !s.deletedAt);
        const schoolClass = draft.classes.find(c => c.id === subject?.classId && !c.deletedAt);
        if (!schoolClass || Object.keys(row.records as object).some(id => !enrolledForLesson(draft, schoolClass.id, id, String(row.date)))) throw new Error('A chamada só pode registrar alunos vinculados na data da aula, sem faltas anteriores à matrícula.');
      }
      if (collection === 'assessments' && before && current.attempts.some(a => a.assessmentId === row.id && a.submittedAt) && !onlyFields(before, row, ['title', 'description', 'deadline', 'deletedAt'])) throw new Error('Já existe uma entrega. Apenas título, instruções e prazo podem mudar.');
      changes.push({ collection, before, after: row });
    }
  }
  if (!draft.users.some(u => u.role === 'admin' && isActiveUser(u))) throw new Error('Não é possível remover o último administrador ativo.');
  const emails = draft.users.map(u => u.email.trim().toLowerCase());
  if (new Set(emails).size !== emails.length) throw new Error('Este e-mail já está cadastrado.');
  if (draft.users.some(u => !u.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email))) throw new Error('Informe nome e e-mail válidos.');
  if (draft.users.some(u => !['student', 'teacher', 'admin'].includes(u.role) || u.active !== undefined && typeof u.active !== 'boolean')) throw new Error('Informe um papel global e um estado de conta válidos.');
  for (const person of draft.users) {
    const before = current.users.find(u => u.id === person.id);
    if (before && before.email !== person.email) person.emailConfirmedAt = null;
  }
  reconcileEnrollments(current, draft, actor, now);
  // Lifecycle effects are derived after permission checks and audited like explicit changes.
  for (const collection of ['enrollments', 'classes'] as const) {
    for (const row of draft[collection] ?? []) {
      const before = current[collection]?.find(item => item.id === row.id);
      if (!equal(before, row) && !changes.some(c => c.collection === collection && c.after.id === row.id)) changes.push({ collection, before: before as unknown as Row, after: row as unknown as Row });
    }
  }
  // Removing a role or account ends its assignments while leaving authored records intact.
  for (const subject of draft.subjects) {
    const before = current.subjects.find(s => s.id === subject.id);
    const oldIds = before?.teacherIds ?? [];
    const invalid = subject.teacherIds.filter(id => !draft.users.some(u => u.id === id && u.role === 'teacher' && isActiveUser(u)));
    if (invalid.some(id => !oldIds.includes(id))) throw new Error('Atribua apenas docentes com conta ativa.');
    subject.teacherIds = [...new Set(subject.teacherIds.filter(id => !invalid.includes(id)))];
    if (!draft.classes.some(c => c.id === subject.classId && !c.deletedAt)) throw new Error('Turma indisponível.');
    if (before && !equal(before.teacherIds, subject.teacherIds) && !changes.some(change => change.collection === 'subjects' && change.after.id === subject.id)) changes.push({ collection: 'subjects', before: before as unknown as Row, after: subject as unknown as Row });
  }
  for (const change of changes.filter(item => item.collection === 'assessments' && item.before && !equal(item.before.questionIds, item.after.questionIds))) {
    for (const attempt of draft.attempts.filter(a => a.assessmentId === change.after.id && !a.submittedAt)) {
      const before = current.attempts.find(a => a.id === attempt.id);
      attempt.answers = {};
      attempt.questionOrder = [...(change.after.questionIds as string[])];
      attempt.questionsUpdatedAt = now;
      if (!changes.some(item => item.collection === 'attempts' && item.after.id === attempt.id)) changes.push({ collection: 'attempts', before: before as unknown as Row, after: attempt as unknown as Row });
    }
  }
  for (const change of changes) {
    change.after.revision = (change.before?.revision ?? 0) + 1;
    change.after.updatedAt = now;
    change.after.updatedBy = actor.id;
    draft.audit.push({ id: `audit-${globalThis.crypto.randomUUID()}`, actorId: actor.id, action: !change.before ? 'create' : change.after.deletedAt ? 'delete' : 'update', collection: change.collection, targetId: key(change.after), createdAt: now });
  }
  for (const subject of draft.subjects) {
    const previous = current.subjects.find(s => s.id === subject.id)?.teacherIds ?? [];
    for (const id of new Set([...previous, ...subject.teacherIds])) {
      const had = previous.includes(id);
      const has = subject.teacherIds.includes(id);
      if (had !== has) draft.audit.push({ id: `audit-${globalThis.crypto.randomUUID()}`, actorId: actor.id, action: has ? 'create' : 'delete', collection: 'teachingAssignments', targetId: `${subject.id}:${id}`, createdAt: now });
    }
  }
  return draft;
}
