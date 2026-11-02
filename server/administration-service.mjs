import { randomUUID } from 'node:crypto';
import { createCommandService, HttpError } from './command-service.mjs';
import { selfUser } from './auth-service.mjs';
import { visibleClasses, visibleSubjects, canAccessStudent, isActiveUser } from '../src/lib/access.ts';
import { executeEnrollmentCommand, normalizeEmail, validEmail, enrolledForLesson } from '../src/lib/enrollment.ts';
import { validateClassCode } from '../src/lib/domain.ts';

const deny = () => { throw new HttpError(403, 'FORBIDDEN', 'Operação restrita à administração.'); };
const missing = () => { throw new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado.'); };
const invalid = message => { throw new HttpError(422, 'VALIDATION_ERROR', message); };
const conflict = message => { throw new HttpError(409, 'BUSINESS_CONFLICT', message); };
const adminOnly = (_state, actor) => { if (actor.role !== 'admin') deny(); };
const staffOnly = (_state, actor) => { if (!['admin', 'teacher'].includes(actor.role)) deny(); };
const record = (state, collection, id) => state[collection].find(r => r.id === id && !r.deletedAt) ?? missing();
const meta = row => ({ id: row.id, revision: row.revision, createdAt: row.createdAt ?? row.updatedAt, updatedAt: row.updatedAt, updatedBy: row.updatedBy });
const studentDTO = row => ({ id: row.id, name: row.name, email: row.email, active: row.active !== false });
const text = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function fields(body, allowed, required) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) invalid('Confira os campos informados.');
}
const name = value => { if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 100) invalid('O nome deve ter de 3 a 100 caracteres.'); return value.trim(); };
const email = value => { if (typeof value !== 'string' || value.length > 254 || !validEmail(value)) invalid('Informe um e-mail válido.'); return normalizeEmail(value); };
const memberClasses = (state, actor) => new Set(visibleClasses(state, actor).map(c => c.id));

export function enrollmentDTO(row, _actor, state) {
  return { ...meta(row), classId: row.classId, className: state.classes.find(c => c.id === row.classId)?.name ?? null, email: row.email, studentId: row.studentId ?? null, status: row.status, createdBy: row.createdBy, enrolledAt: row.enrolledAt ?? null, endedAt: row.endedAt ?? null, legacy: row.legacy ?? false, unassignedAssessmentIds: row.unassignedAssessmentIds };
}
function classDTO(row, actor) {
  return { ...meta(row), name: row.name, code: row.code, year: row.year, shift: row.shift, active: row.active, ...(actor.role !== 'student' ? { studentIds: row.studentIds } : {}) };
}
function query(req, allowed) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const keys = [...params.keys()];
  if (keys.some(k => !['page', 'pageSize', 'sort', ...allowed].includes(k) || params.getAll(k).length !== 1)) invalid('Confira os filtros informados.');
  const page = Number(params.get('page') ?? 1), pageSize = Number(params.get('pageSize') ?? 20), sort = params.get('sort') ?? 'id';
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !['id', '-id'].includes(sort)) invalid('Confira a paginação informada.');
  if (params.has('active') && !['true', 'false'].includes(params.get('active'))) invalid('Informe um estado de conta válido.');
  if (params.has('role') && !['student', 'teacher', 'admin'].includes(params.get('role'))) invalid('Informe um cargo válido.');
  if (params.has('status')) { const statuses = params.get('status').split(','); if (new Set(statuses).size !== statuses.length || statuses.some(value => !['pending', 'active', 'ended', 'cancelled'].includes(value))) invalid('Informe uma situação de matrícula válida.'); }
  if (params.has('history') && !['true', 'false'].includes(params.get('history'))) invalid('Informe um filtro de histórico válido.');
  for (const key of ['classId', 'studentId']) if (params.has(key) && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(params.get(key))) invalid('Informe um identificador válido.');
  return { params, page, pageSize, sort };
}
function paged(rows, q, project) {
  const sorted = [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (q.sort === '-id') sorted.reverse();
  return { items: sorted.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map(project), page: q.page, pageSize: q.pageSize, total: rows.length };
}

export function createAdministrationService(config, auth) {
  const now = config.now ?? (() => new Date().toISOString());
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now });
  const routes = new Map();
  const add = (path, method, handler) => { const methods = routes.get(path) ?? {}; methods[method] = handler; routes.set(path, methods); };
  const read = (path, authorize, select) => add(path, 'GET', service.read({ authorize, select: (s, a, req) => { if (path.includes('{id}') && new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.'); return select(s, a, req); }, project: result => result }));
  const command = (path, method, collection, apply, { create = false, idempotent = false, project = collection === 'users' ? selfUser : collection === 'classes' ? classDTO : enrollmentDTO } = {}) => {
    const operation = `${method} ${path}`;
    add(path, method, service.command({ operation, target: req => req.params.id ?? path, authorize: adminOnly, expected: req => create ? [] : [{ collection, id: req.params.id, revision: req.body?.expectedRevision }], requireIdempotency: idempotent, successStatus: create ? 201 : 200,
      apply, project, replayProject: (dto, actor, state) => project(state[collection].find(r => r.id === dto.id) ?? missing(), actor, state) }));
  };
  read('/users', adminOnly, (s, a, req) => {
    const q = query(req, ['q', 'role', 'active']), p = q.params;
    return paged(s.users.filter(u => !u.deletedAt && (!p.has('q') || text(`${u.name} ${u.email}`).includes(text(p.get('q')))) && (!p.has('role') || u.role === p.get('role')) && (!p.has('active') || (u.active !== false) === (p.get('active') === 'true'))), q, selfUser);
  });
  read('/users/{id}', adminOnly, (s, _a, req) => selfUser(record(s, 'users', req.params.id)));
  command('/users', 'POST', 'users', (s, actor, req, { timestamp }) => {
    fields(req.body, ['name', 'email', 'role'], ['name', 'email', 'role']);
    const displayName = name(req.body.name), address = email(req.body.email);
    if (!['teacher', 'admin'].includes(req.body.role)) invalid('Cadastre somente docente ou administrador.');
    if (s.users.some(u => normalizeEmail(u.email) === address)) conflict('Este e-mail já está cadastrado.');
    const user = { id: `user-${randomUUID()}`, name: displayName, email: address, role: req.body.role, active: true, emailConfirmedAt: null, createdAt: timestamp, updatedBy: actor.id };
    s.users.push(user); auth.provisionAccount(s, user, timestamp); return user;
  }, { create: true, idempotent: true });
  function lifecycle(s, actor, user, before, timestamp) {
    if (!s.users.some(u => u.role === 'admin' && isActiveUser(u))) conflict('Não é possível remover o último administrador ativo.');
    const changedAccess = before.role !== user.role || !isActiveUser(user) || before.email !== user.email;
    if (changedAccess) for (const session of s.sessions.filter(v => v.userId === user.id && !v.revokedAt)) session.revokedAt = timestamp;
    if (before.email !== user.email) user.emailConfirmedAt = null;
    if (before.role === 'teacher' && (user.role !== 'teacher' || !isActiveUser(user))) {
      for (const subject of s.subjects) subject.teacherIds = subject.teacherIds.filter(id => id !== user.id);
    }
    if (before.role === 'student' && (user.role !== 'student' || !isActiveUser(user))) {
      for (const e of s.enrollments.filter(e => e.studentId === user.id && !e.deletedAt && ['pending', 'active'].includes(e.status))) {
        executeEnrollmentCommand(s, actor, { type: e.status === 'pending' ? 'cancel' : 'end', id: e.id }, timestamp);
      }
    }
  }
  command('/users/{id}', 'PATCH', 'users', (s, actor, req, { timestamp }) => {
    fields(req.body, ['expectedRevision', 'name', 'email'], ['expectedRevision']);
    const user = record(s, 'users', req.params.id), before = structuredClone(user);
    if (user.role !== 'teacher' || !isActiveUser(user)) conflict('Este docente não está disponível para edição.');
    if ('name' in req.body) user.name = name(req.body.name);
    if ('email' in req.body) { const address = email(req.body.email); if (s.users.some(u => u.id !== user.id && normalizeEmail(u.email) === address)) conflict('Este e-mail já está cadastrado.'); user.email = address; }
    lifecycle(s, actor, user, before, timestamp); return user;
  });
  for (const action of ['role', 'deactivate', 'withdraw']) command(`/users/{id}/${action}`, 'POST', 'users', (s, actor, req, { timestamp }) => {
    fields(req.body, ['expectedRevision', ...(action === 'role' ? ['role'] : [])], ['expectedRevision', ...(action === 'role' ? ['role'] : [])]);
    const user = record(s, 'users', req.params.id), before = structuredClone(user);
    if (action === 'role') { if (!['student', 'teacher', 'admin'].includes(req.body.role)) invalid('Informe um cargo válido.'); user.role = req.body.role; }
    else { user.active = false; if (action === 'withdraw') user.deletedAt = timestamp; }
    lifecycle(s, actor, user, before, timestamp); return user;
  });
  read('/classes', () => {}, (s, a, req) => { const q = query(req, ['active', 'q']), p = q.params; return paged(visibleClasses(s, a).filter(c => (!p.has('active') || c.active === (p.get('active') === 'true')) && (!p.has('q') || text(`${c.name} ${c.code}`).includes(text(p.get('q'))))), q, row => classDTO(row, a)); });
  read('/classes/{id}', () => {}, (s, a, req) => classDTO(visibleClasses(s, a).find(c => c.id === req.params.id) ?? missing(), a));
  function classFields(s, req, existing) {
    fields(req.body, ['name', 'code', 'year', 'shift', ...(existing ? ['expectedRevision'] : [])], existing ? ['expectedRevision'] : ['name', 'code', 'year', 'shift']);
    const next = { ...(existing ?? {}), ...req.body };
    next.name = name(next.name);
    if (typeof next.code !== 'string') invalid('Informe um código de turma.');
    const error = validateClassCode(next.code, s.classes, existing?.id);
    if (error) { if (s.classes.some(c => c.id !== existing?.id && c.code.toLowerCase() === next.code.trim().toLowerCase())) conflict(error); invalid(error); }
    next.code = next.code.trim().toUpperCase();
    if (!Number.isInteger(next.year) || next.year < 1900 || next.year > 2200 || !['Manhã', 'Tarde', 'Noite'].includes(next.shift)) invalid('Confira ano e turno da turma.');
    delete next.expectedRevision; return next;
  }
  command('/classes', 'POST', 'classes', (s, _a, req, { timestamp }) => { const c = { ...classFields(s, req), id: `class-${randomUUID()}`, active: true, studentIds: [], createdAt: timestamp }; s.classes.push(c); return c; }, { create: true, idempotent: true });
  command('/classes/{id}', 'PATCH', 'classes', (s, _a, req) => { const c = record(s, 'classes', req.params.id); Object.assign(c, classFields(s, req, c)); return c; });
  for (const action of ['close', 'reopen']) command(`/classes/{id}/${action}`, 'POST', 'classes', (s, actor, req, { timestamp }) => {
    fields(req.body, ['expectedRevision'], ['expectedRevision']); const c = record(s, 'classes', req.params.id);
    c.active = action === 'reopen';
    if (action === 'close') {
      for (const e of s.enrollments.filter(e => e.classId === c.id && !e.deletedAt && ['active', 'pending'].includes(e.status))) executeEnrollmentCommand(s, actor, { type: e.status === 'pending' ? 'cancel' : 'end', id: e.id }, timestamp);
      for (const id of c.studentIds) {
        const student = s.users.find(u => u.id === id && u.role === 'student');
        if (student && !s.enrollments.some(e => e.classId === c.id && e.studentId === id)) s.enrollments.push({ id: `enrollment-${randomUUID()}`, classId: c.id, studentId: id, email: student.email, status: 'ended', legacy: true, createdAt: timestamp, endedAt: timestamp, createdBy: actor.id, unassignedAssessmentIds: [] });
      }
      c.studentIds = [];
    }
    return c;
  }, { idempotent: true });
  function scopeEnrollments(s, a) {
    const classes = memberClasses(s, a);
    return s.enrollments.filter(e => a.role === 'admin' || a.role === 'student' ? a.role === 'admin' || e.studentId === a.id || e.status === 'pending' && e.email === a.email : classes.has(e.classId) && (!!e.enrolledAt || e.legacy === true));
  }
  read('/enrollments', () => {}, (s, a, req) => {
    const q = query(req, ['classId', 'studentId', 'status', 'q']), p = q.params;
    if (p.has('classId') && !memberClasses(s, a).has(p.get('classId'))) missing();
    return paged(scopeEnrollments(s, a).filter(e => (!p.has('classId') || e.classId === p.get('classId')) && (!p.has('studentId') || e.studentId === p.get('studentId')) && (!p.has('status') || p.get('status').split(',').includes(e.status)) && (!p.has('q') || text(`${e.email} ${s.users.find(u => u.id === e.studentId)?.name ?? ''}`).includes(text(p.get('q'))))), q, e => enrollmentDTO(e, a, s));
  });
  read('/enrollments/{id}', adminOnly, (s, a, req) => enrollmentDTO(s.enrollments.find(e => e.id === req.params.id) ?? missing(), a, s));
  read('/enrollments/preview', adminOnly, (s, a, req) => {
    const p = new URL(req.url, 'http://localhost').searchParams;
    if ([...p.keys()].some(k => !['classId', 'email'].includes(k) || p.getAll(k).length > 1) || !p.has('classId') || !p.has('email')) invalid('Informe turma e e-mail.');
    const address = email(p.get('email')), classId = p.get('classId'); record(s, 'classes', classId);
    const account = s.users.find(u => normalizeEmail(u.email) === address);
    const existing = s.enrollments.find(e => e.classId === classId && e.email === address);
    const other = account && s.classes.find(c => c.id !== classId && c.active && !c.deletedAt && c.studentIds.includes(account.id));
    let message = null;
    try { executeEnrollmentCommand(structuredClone(s), a, { type: 'add', classId, email: address }, now()); } catch (error) { message = error.message; }
    return { email: address, classId, account: account ? selfUser(account) : null, existingEnrollment: existing ? enrollmentDTO(existing, a, s) : null, otherClass: other ? { id: other.id, name: other.name } : null, canEnroll: !message, message };
  });
  function enrollmentCommand(s, actor, command, timestamp) { try { executeEnrollmentCommand(s, actor, command, timestamp); } catch (error) { conflict(error.message); } }
  command('/enrollments', 'POST', 'enrollments', (s, a, req, { timestamp }) => { fields(req.body, ['classId', 'email'], ['classId', 'email']); if (typeof req.body.classId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(req.body.classId)) invalid('Informe uma turma válida.'); const address = email(req.body.email); record(s, 'classes', req.body.classId); enrollmentCommand(s, a, { type: 'add', classId: req.body.classId, email: address }, timestamp); return s.enrollments.find(e => e.classId === req.body.classId && e.email === address); }, { create: true, idempotent: true });
  for (const action of ['activate', 'cancel', 'end']) command(`/enrollments/{id}/${action}`, 'POST', 'enrollments', (s, a, req, { timestamp }) => {
    fields(req.body, ['expectedRevision'], ['expectedRevision']); const e = record(s, 'enrollments', req.params.id);
    if (action === 'activate') { if (e.status !== 'pending') conflict('A matrícula não está pendente.'); const user = s.users.find(u => normalizeEmail(u.email) === e.email); if (!isActiveUser(user) || user.role !== 'student' || user.emailConfirmedAt === null) conflict('A matrícula aguarda uma conta de aluno ativa e e-mail confirmado.'); enrollmentCommand(s, a, { type: 'add', classId: e.classId, email: e.email }, timestamp); }
    else enrollmentCommand(s, a, { type: action, id: e.id }, timestamp);
    return e;
  }, { idempotent: true });
  const subjectIds = (s, a) => new Set(visibleSubjects(s, a).map(v => v.id));
  const assessmentVisible = (s, ids, assessmentId) => s.assessments.some(a => a.id === assessmentId && !a.deletedAt && s.modules.some(m => m.id === a.moduleId && !m.deletedAt && ids.has(m.subjectId)));
  function attendance(s, a, studentId, classId) { const ids = subjectIds(s, a); return s.attendance.filter(l => ids.has(l.subjectId) && (!classId || s.subjects.find(v => v.id === l.subjectId)?.classId === classId) && l.records[studentId] !== undefined && enrolledForLesson(s, s.subjects.find(v => v.id === l.subjectId).classId, studentId, l.date)); }
  read('/students', staffOnly, (s, a, req) => {
    const q = query(req, ['classId', 'q', 'history']), p = q.params, classId = p.get('classId');
    if (classId && !memberClasses(s, a).has(classId)) missing();
    const history = p.get('history') === 'true';
    const currentClass = classId && s.classes.find(c => c.id === classId);
    const contextual = id => s.enrollments.filter(e => e.classId === classId && e.studentId === id && (e.enrolledAt || e.legacy === true));
    const rows = s.users.filter(u => u.role === 'student' && !u.deletedAt && canAccessStudent(s, a, u.id) && (!classId || currentClass?.studentIds.includes(u.id) || history && contextual(u.id).length > 0) && (!p.has('q') || text(`${u.name} ${u.email}`).includes(text(p.get('q')))));
    return paged(rows, q, u => {
      const lessons = attendance(s, a, u.id, classId);
      const entries = contextual(u.id).sort((x, y) => {
        const xActive = x.status === 'active' && !x.deletedAt, yActive = y.status === 'active' && !y.deletedAt;
        return Number(yActive) - Number(xActive) || (y.createdAt ?? '').localeCompare(x.createdAt ?? '') || x.id.localeCompare(y.id);
      });
      return { ...studentDTO(u), attendance: { present: lessons.filter(r => r.records[u.id]).length, total: lessons.length }, enrollment: classId && entries.length ? enrollmentDTO(entries[0], a, s) : null };
    });
  });
  read('/students/{id}', staffOnly, (s, a, req) => {
    const user = s.users.find(u => u.id === req.params.id && u.role === 'student' && !u.deletedAt); if (!user || !canAccessStudent(s, a, user.id)) missing();
    const ids = subjectIds(s, a);
    const feedback = f => f ? { comment: f.comment, grade: f.grade ?? null, author: { id: f.authorId, name: s.users.find(u => u.id === f.authorId)?.name ?? 'Equipe AJA' }, createdAt: f.createdAt } : null;
    return { student: studentDTO(user), enrollments: scopeEnrollments(s, a).filter(e => e.studentId === user.id).map(e => enrollmentDTO(e, a, s)),
      attendance: attendance(s, a, user.id).map(l => ({ ...meta(l), subjectId: l.subjectId, date: l.date, time: l.time, present: l.records[user.id] ?? null })),
      attempts: s.attempts.filter(v => v.userId === user.id && !v.deletedAt && v.submittedAt && assessmentVisible(s, ids, v.assessmentId)).map(v => ({ ...meta(v), assessmentId: v.assessmentId, userId: v.userId, startedAt: v.startedAt, submittedAt: v.submittedAt, answers: v.answers, questionOrder: v.questionOrder, questions: (v.questions ?? []).map(q => ({ id: q.id, subject: q.subject, topic: q.topic, difficulty: q.difficulty, institution: q.institution, year: q.year, statement: q.statement, options: q.options, image: q.image ?? null })), questionsUpdatedAt: v.questionsUpdatedAt ?? null })),
      submissions: s.submissions.filter(v => v.userId === user.id && !v.deletedAt && v.submittedAt && assessmentVisible(s, ids, v.assessmentId)).map(v => ({ ...meta(v), assessmentId: v.assessmentId, userId: v.userId, attachments: v.attachments.map(f => f.kind === 'file' ? { kind: 'file', fileId: f.id, name: f.name } : { kind: 'link', name: f.name, url: f.url }), submittedAt: v.submittedAt, receipt: v.receipt ? { id: v.receipt, resourceId: v.id, submittedAt: v.submittedAt } : null, feedbackPublished: feedback(v.feedbackPublished), feedbackUpdated: v.feedbackUpdated ?? false, feedbackDraft: feedback(v.feedbackDraft), feedbackHistory: v.feedbackHistory.map(feedback) })) };
  });
  return {
    resolve(path) {
      if (routes.has(path)) return { methods: routes.get(path), params: {} };
      const match = path.match(/^\/(users|classes|students|enrollments)\/([^/]{1,384})(?:\/(role|deactivate|activate|withdraw|close|reopen|cancel|end))?$/);
      if (!match) return null;
      let id;
      try { id = decodeURIComponent(match[2]); } catch { return null; }
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) return null;
      const template = `/${match[1]}/{id}${match[3] ? `/${match[3]}` : ''}`;
      return routes.has(template) ? { methods: routes.get(template), params: { id } } : null;
    }
  };
}
