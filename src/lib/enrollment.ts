import type { Assessment, Enrollment, MockDatabase, User } from '@/models';

export type EnrollmentCommand =
  | { type: 'add'; classId: string; email: string }
  | { type: 'register'; id: string; name: string; email: string }
  | { type: 'confirm' }
  | { type: 'cancel' | 'end'; id: string };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
const available = (user: User) => user.active !== false && !user.deletedAt;

/** The compatibility list remains persisted; dated records describe the lifecycle. */
export function activeEnrollment(db: MockDatabase, studentId: string, classId: string) {
  return db.enrollments?.find(e => e.studentId === studentId && e.classId === classId && e.status === 'active' && !e.deletedAt);
}

export function isAssessmentAssigned(db: MockDatabase, assessment: Assessment, studentId: string): boolean {
  const subjectId = db.modules.find(m => m.id === assessment.moduleId)?.subjectId;
  const classId = db.subjects.find(s => s.id === subjectId)?.classId;
  if (!classId) return false;
  const enrollment = activeEnrollment(db, studentId, classId);
  return enrollment ? !enrollment.unassignedAssessmentIds.includes(assessment.id) : !!db.classes.find(c => c.id === classId && c.active && !c.deletedAt && c.studentIds.includes(studentId));
}

/** Date-only records use the local lesson day, including the enrollment day. */
export function enrolledForLesson(db: MockDatabase, classId: string, studentId: string, date: string): boolean {
  const history = db.enrollments?.filter(e => e.classId === classId && e.studentId === studentId && e.enrolledAt) ?? [];
  if (!history.length) return !!db.classes.find(c => c.id === classId && c.studentIds.includes(studentId));
  const day = (timestamp: string) => {
    const value = new Date(timestamp);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  };
  return history.some(e => (e.legacy || day(e.enrolledAt!) <= date) && (!e.endedAt || day(e.endedAt) >= date));
}

function activate(db: MockDatabase, enrollment: Enrollment, student: User, now: string) {
  const destination = db.classes.find(c => c.id === enrollment.classId && c.active && !c.deletedAt);
  if (!destination) throw new Error('Turma indisponível para matrícula. Solicite a regularização à administração.');
  if (!available(student)) throw new Error('Conta inativa ou excluída. Solicite a regularização à administração.');
  if (student.role !== 'student') throw new Error('Este e-mail pertence a uma conta com outro cargo. A inclusão não altera o cargo para aluno.');
  const other = db.classes.find(c => c.id !== destination.id && c.active && !c.deletedAt && c.studentIds.includes(student.id));
  if (other) throw new Error(`O aluno já tem vínculo ativo em ${other.name}. Regularize esse vínculo antes de incluir em outra turma; não há transferência automática.`);
  if (student.emailConfirmedAt === null) return;
  enrollment.studentId = student.id;
  enrollment.status = 'active';
  enrollment.enrolledAt = now;
  const modules = new Set(db.modules.filter(m => db.subjects.some(s => s.id === m.subjectId && s.classId === destination.id)).map(m => m.id));
  enrollment.unassignedAssessmentIds = db.assessments.filter(a => modules.has(a.moduleId) && !a.deletedAt && a.status === 'published' && a.deadline && new Date(a.deadline).getTime() <= new Date(now).getTime()).map(a => a.id);
  if (!destination.studentIds.includes(student.id)) destination.studentIds.push(student.id);
}

/** Only this command surface can confirm email or consume a pending reservation. */
export function executeEnrollmentCommand(db: MockDatabase, actor: User, command: EnrollmentCommand, now: string) {
  db.enrollments ??= [];
  if (command.type === 'register') {
    const email = normalizeEmail(command.email);
    if (!validEmail(email) || command.name.trim().length < 3 || command.name.trim().length > 100) throw new Error('Informe nome e e-mail válidos.');
    if (db.users.some(u => normalizeEmail(u.email) === email)) throw new Error('Este e-mail já está cadastrado. Entre na conta existente ou solicite regularização; ela não será reativada pelo cadastro.');
    if (db.users.some(u => u.id === command.id)) throw new Error('Este cadastro já existe. Entre para retomar a confirmação.');
    db.users.push({ id: command.id, name: command.name.trim(), email, role: 'student', emailConfirmedAt: null });
    return;
  }
  if (command.type === 'confirm') {
    if (actor.role !== 'student') throw new Error('A confirmação deve ser feita na própria conta de aluno.');
    const student = db.users.find(u => u.id === actor.id)!;
    const pending = db.enrollments.filter(e => e.status === 'pending' && !e.deletedAt && e.email === normalizeEmail(student.email));
    if (pending.length > 1) throw new Error('Há pendências em mais de uma turma. Peça ao administrador para cancelar o destino incorreto e tente novamente. Sua conta foi preservada.');
    student.emailConfirmedAt ??= now;
    if (pending[0]) activate(db, pending[0], student, now);
    return;
  }
  if (actor.role !== 'admin') throw new Error('Somente a administração pode gerenciar matrículas.');
  if (command.type === 'add') {
    const email = normalizeEmail(command.email);
    if (!validEmail(email)) throw new Error('Informe um e-mail válido.');
    const destination = db.classes.find(c => c.id === command.classId && c.active && !c.deletedAt);
    if (!destination) throw new Error('Esta turma está inativa ou indisponível.');
    const student = db.users.find(u => normalizeEmail(u.email) === email);
    if (student && (!available(student) || student.role !== 'student')) throw new Error('Esta conta está inativa, excluída ou tem outro cargo. A inclusão não altera seu estado ou cargo.');
    const previous = db.enrollments.find(e => e.classId === command.classId && e.email === email);
    if (previous) {
      if (previous.status === 'cancelled' || previous.status === 'ended' || previous.deletedAt) throw new Error('Matrícula encerrada ou cancelada neste destino. Não há restauração pela interface.');
      if (student && previous.status === 'pending') activate(db, previous, student, now);
      return;
    }
    const enrollment: Enrollment = { id: `enrollment-${globalThis.crypto.randomUUID()}`, classId: command.classId, email, status: 'pending', createdAt: now, createdBy: actor.id, unassignedAssessmentIds: [] };
    db.enrollments.push(enrollment);
    if (student) activate(db, enrollment, student, now);
    return;
  }
  const enrollment = db.enrollments.find(e => e.id === command.id);
  if (!enrollment || enrollment.deletedAt) throw new Error('Matrícula indisponível. Não há restauração pela interface.');
  if (command.type === 'cancel' && enrollment.status !== 'pending' || command.type === 'end' && enrollment.status !== 'active') throw new Error('A matrícula mudou. Confira o estado atual antes de continuar.');
  closeEnrollment(db, enrollment, now);
}

function closeEnrollment(db: MockDatabase, enrollment: Enrollment, now: string) {
  enrollment.status = enrollment.status === 'pending' ? 'cancelled' : 'ended';
  enrollment.endedAt = now;
  enrollment.deletedAt = now;
  const schoolClass = db.classes.find(c => c.id === enrollment.classId);
  if (schoolClass && enrollment.studentId) schoolClass.studentIds = schoolClass.studentIds.filter(id => id !== enrollment.studentId);
}

/** Preserve existing callers while enforcing the same membership invariant on every write. */
export function reconcileEnrollments(current: MockDatabase, draft: MockDatabase, actor: User, now: string) {
  draft.enrollments ??= [];
  for (const enrollment of draft.enrollments) {
    const schoolClass = draft.classes.find(c => c.id === enrollment.classId);
    const student = draft.users.find(u => u.id === enrollment.studentId);
    if ((enrollment.status === 'pending' || enrollment.status === 'active') && (!schoolClass?.active || schoolClass.deletedAt || enrollment.status === 'active' && (!student || !available(student) || student.role !== 'student' || !schoolClass.studentIds.includes(student.id)))) closeEnrollment(draft, enrollment, now);
  }
  for (const schoolClass of draft.classes) {
    const previous = current.classes.find(c => c.id === schoolClass.id);
    for (const studentId of [...schoolClass.studentIds]) {
      const student = draft.users.find(u => u.id === studentId);
      if (!student || !available(student) || student.role !== 'student') throw new Error('A matrícula exige uma conta de aluno ativa.');
      if (!schoolClass.active || schoolClass.deletedAt) continue;
      if (student.emailConfirmedAt === null && !previous?.studentIds.includes(studentId)) throw new Error('Confirme o e-mail em etapa simulada antes de acessar a turma.');
      if (draft.classes.some(c => c.id !== schoolClass.id && c.active && !c.deletedAt && c.studentIds.includes(studentId))) throw new Error('O aluno já tem outra turma ativa. Regularize o vínculo; não há transferência automática.');
      if (!activeEnrollment(draft, studentId, schoolClass.id) && !previous?.studentIds.includes(studentId)) {
        if (draft.enrollments.some(e => e.classId === schoolClass.id && (e.studentId === studentId || e.email === normalizeEmail(student.email)) && e.deletedAt)) throw new Error('Vínculo excluído: não há restauração pela interface.');
        const enrollment: Enrollment = { id: `enrollment-${globalThis.crypto.randomUUID()}`, classId: schoolClass.id, email: normalizeEmail(student.email), status: 'pending', createdAt: now, createdBy: actor.id, unassignedAssessmentIds: [] };
        draft.enrollments.push(enrollment);
        activate(draft, enrollment, student, now);
      }
    }
  }
}
