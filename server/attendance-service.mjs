import { randomUUID } from 'node:crypto';
import { canAccessStudent, canAccessSubject, canManageSubject } from '../src/lib/access.ts';
import { enrolledForLesson } from '../src/lib/enrollment.ts';
import { createCommandService, HttpError } from './command-service.mjs';

const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const invalid = message => fail(422, 'VALIDATION_ERROR', message);
const missing = () => fail(404, 'NOT_FOUND', 'Recurso não encontrado.');
const conflict = message => fail(409, 'BUSINESS_CONFLICT', message);
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const alive = row => !!row && !row.deletedAt;
const meta = row => ({ id: row.id, revision: row.revision, createdAt: row.createdAt ?? row.updatedAt, updatedAt: row.updatedAt ?? row.createdAt, updatedBy: row.updatedBy ?? row.authorId });

function fields(body, allowed, required) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) invalid('Confira os campos informados.');
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function pageQuery(query) {
  const number = (name, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    const value = query.get(name);
    if (value === null) return fallback;
    if (!/^\d+$/.test(value)) invalid('Confira a paginação solicitada.');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) invalid('Confira a paginação solicitada.');
    return parsed;
  };
  return { page: number('page', 1), pageSize: number('pageSize', 20, 100) };
}

function page(items, pagination) {
  const start = (pagination.page - 1) * pagination.pageSize;
  return { items: items.slice(start, start + pagination.pageSize), page: pagination.page, pageSize: pagination.pageSize, total: items.length };
}

function parseLessonQuery(req, required = true, paginated = false) {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const allowed = ['subjectId', 'date', 'time', 'studentId', ...(paginated ? ['page', 'pageSize'] : [])];
  if ([...query.keys()].some(key => !allowed.includes(key) || query.getAll(key).length !== 1)) invalid('Confira os filtros da chamada.');
  const subjectId = query.get('subjectId');
  const date = query.get('date');
  const time = query.get('time');
  const studentId = query.get('studentId');
  if (studentId) {
    if (!safeId(studentId) || subjectId || date || time) invalid('Informe um identificador de aluno sem outros filtros.');
    return { studentId };
  }
  if (!subjectId && !date && !time && !required) return {};
  if (!safeId(subjectId) || !parseDate(date) || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) invalid('Informe disciplina, data civil e horário válidos.');
  return { subjectId, date, time, ...pageQuery(query) };
}

function parseAttendanceQuery(req) {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const allowed = ['subjectId', 'studentId', 'from', 'to', 'page', 'pageSize', 'sort'];
  if ([...query.keys()].some(key => !allowed.includes(key) || query.getAll(key).length !== 1)) invalid('Confira os filtros da frequência.');
  const subjectId = query.get('subjectId') ?? undefined;
  const studentId = query.get('studentId') ?? undefined;
  const from = query.get('from') ?? undefined;
  const to = query.get('to') ?? undefined;
  const sort = query.get('sort') ?? 'date';
  if (subjectId && !safeId(subjectId) || studentId && !safeId(studentId)) invalid('Informe um identificador válido.');
  if (from && !parseDate(from) || to && !parseDate(to) || from && to && from > to) invalid('Informe um intervalo de datas válido.');
  if (sort !== 'date' && sort !== '-date') invalid('Informe uma ordenação válida.');
  return { subjectId, studentId, from, to, sort, ...pageQuery(query) };
}

function compareAttendanceDate(sort) {
  const direction = sort === '-date' ? -1 : 1;
  return (a, b) => direction * a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

function lessonFor(state, subjectId, date, time) {
  return state.attendance.find(item => item.subjectId === subjectId && item.date === date && item.time === time) ?? null;
}

function subjectFor(state, actor, subjectId, writing = false) {
  if (actor.role === 'student' || !canAccessSubject(state, actor, subjectId)) missing();
  const subject = state.subjects.find(item => item.id === subjectId && alive(item));
  if (!subject) missing();
  const schoolClass = state.classes.find(item => item.id === subject.classId && alive(item));
  if (!schoolClass) missing();
  if (writing && !canManageSubject(state, actor, subjectId)) missing();
  return { subject, schoolClass };
}

function eligibleStudents(state, subject, date) {
  return state.users
    .filter(user => user.role === 'student' && enrolledForLesson(state, subject.classId, user.id, date))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function attendanceDTO(row) {
  return { ...meta(row), subjectId: row.subjectId, date: row.date, time: row.time, records: { ...row.records } };
}

function attendanceStudentDTO(row, studentId) {
  return { ...meta(row), subjectId: row.subjectId, date: row.date, time: row.time, present: row.records[studentId] };
}

function studentAttendanceVisible(state, row, studentId) {
  const classId = state.subjects.find(subject => subject.id === row.subjectId)?.classId;
  return !!classId && row.records?.[studentId] !== undefined && enrolledForLesson(state, classId, studentId, row.date);
}

function validateRecords(records, state, subject, date) {
  if (!records || typeof records !== 'object' || Array.isArray(records) || Object.values(records).some(value => typeof value !== 'boolean')) invalid('Informe as marcações de frequência.');
  const eligible = new Set(eligibleStudents(state, subject, date).map(user => user.id));
  const ids = Object.keys(records);
  if (!ids.length || ids.some(id => !safeId(id) || !eligible.has(id))) conflict('A matrícula ou elegibilidade mudou. Atualize a chamada antes de salvar.');
  if (ids.length !== eligible.size || [...eligible].some(id => !Object.hasOwn(records, id))) conflict('A lista de alunos elegíveis mudou. Atualize a chamada antes de salvar.');
  return { ...records };
}

export function createAttendanceService(config, auth) {
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now: config.now ?? (() => new Date().toISOString()) });
  const routes = new Map();
  const add = (path, method, handler) => { const methods = routes.get(path) ?? {}; methods[method] = handler; routes.set(path, methods); };
  const read = (path, authorize, select, project = value => value) => add(path, 'GET', service.read({ authorize, select, project }));

  read('/attendance/eligible', (_state, actor, req) => {
    const query = parseLessonQuery(req, true, true);
    const { subject, schoolClass } = subjectFor(_state, actor, query.subjectId);
    return { subject, schoolClass, date: query.date, time: query.time };
  }, (state, actor, req) => {
    const query = parseLessonQuery(req, true, true);
    const { subject } = subjectFor(state, actor, query.subjectId);
    const candidates = eligibleStudents(state, subject, query.date).map(user => ({ id: user.id, name: user.name, eligible: true, reason: null }));
    return page(candidates, query);
  });

  read('/attendance', (state, actor, req) => {
    const query = parseAttendanceQuery(req);
    if (actor.role === 'student') {
      if (!query.studentId || query.studentId !== actor.id) fail(403, 'FORBIDDEN', 'Consulta restrita ao próprio histórico do aluno.');
      return query;
    }
    if (query.studentId) {
      if (query.subjectId) subjectFor(state, actor, query.subjectId);
      const studentExists = state.users.some(user => user.id === query.studentId && user.role === 'student' && alive(user));
      if (!studentExists || !canAccessStudent(state, actor, query.studentId)) missing();
      return query;
    }
    if (query.subjectId) subjectFor(state, actor, query.subjectId);
    return query;
  }, (state, actor, req) => {
    const query = parseAttendanceQuery(req);
    const rows = state.attendance.filter(row => {
      if (!alive(row) || query.subjectId && row.subjectId !== query.subjectId || query.from && row.date < query.from || query.to && row.date > query.to) return false;
      if (query.studentId) {
        if (!studentAttendanceVisible(state, row, query.studentId)) return false;
        if (actor.role !== 'student' && !canAccessSubject(state, actor, row.subjectId)) return false;
      } else if (actor.role === 'student' || !canAccessSubject(state, actor, row.subjectId)) return false;
      return true;
    }).sort(compareAttendanceDate(query.sort));
    const items = query.studentId
      ? rows.map(row => ({ ...meta(row), subjectId: row.subjectId, date: row.date, time: row.time, present: row.records[query.studentId] }))
      : rows.map(attendanceDTO);
    return page(items, query);
  });

  read('/attendance/{id}', (state, actor, req) => {
    if (!safeId(req.params.id)) invalid('Informe um identificador válido.');
    const row = state.attendance.find(item => item.id === req.params.id && alive(item));
    if (!row) missing();
    if (actor.role === 'student') {
      if (!studentAttendanceVisible(state, row, actor.id)) missing();
      return row;
    }
    subjectFor(state, actor, row.subjectId);
    return row;
  }, (state, _actor, req) => state.attendance.find(item => item.id === req.params.id && alive(item)), (row, actor) => actor.role === 'student' ? attendanceStudentDTO(row, actor.id) : attendanceDTO(row));

  add('/attendance', 'POST', service.command({ operation: 'POST /attendance', target: req => `${req.body?.subjectId}|${req.body?.date}|${req.body?.time}`, requireIdempotency: true, successStatus: 201,
    authorize: (state, actor, req) => {
      fields(req.body, ['subjectId', 'date', 'time', 'records'], ['subjectId', 'date', 'time', 'records']);
      if (!safeId(req.body.subjectId) || !parseDate(req.body.date) || typeof req.body.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.time)) invalid('Informe disciplina, data civil e horário válidos.');
      subjectFor(state, actor, req.body.subjectId, true);
      validateRecords(req.body.records, state, state.subjects.find(item => item.id === req.body.subjectId), req.body.date);
    },
    apply: (state, actor, req, { timestamp }) => {
      const existing = lessonFor(state, req.body.subjectId, req.body.date, req.body.time);
      if (existing) conflict(existing.deletedAt ? 'Esta chamada foi retirada e não pode ser recriada.' : 'Já existe uma chamada para esta aula. Consulte a versão atual antes de gravar.');
      const row = { id: `attendance-${randomUUID()}`, subjectId: req.body.subjectId, date: req.body.date, time: req.body.time, records: validateRecords(req.body.records, state, state.subjects.find(item => item.id === req.body.subjectId), req.body.date), createdAt: timestamp, updatedBy: actor.id };
      state.attendance.push(row);
      return row;
    }, project: attendanceDTO, replayProject: (dto, _actor, state) => {
      const row = state.attendance.find(item => item.id === dto.id && alive(item));
      if (!row) missing();
      return attendanceDTO(row);
    }
  }));

  add('/attendance/{id}', 'PATCH', service.command({ operation: 'PATCH /attendance/{id}', target: req => req.params.id,
    authorize: (state, actor, req) => {
      if (!safeId(req.params.id)) invalid('Informe um identificador válido.');
      fields(req.body, ['expectedRevision', 'records'], ['expectedRevision', 'records']);
      const row = state.attendance.find(item => item.id === req.params.id && alive(item));
      if (!row) missing();
      const { subject } = subjectFor(state, actor, row.subjectId, true);
      validateRecords(req.body.records, state, subject, row.date);
    }, expected: req => [{ collection: 'attendance', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, _actor, req) => {
      const row = state.attendance.find(item => item.id === req.params.id && alive(item)) ?? missing();
      const subject = state.subjects.find(item => item.id === row.subjectId && alive(item)) ?? missing();
      row.records = validateRecords(req.body.records, state, subject, row.date);
      return row;
    }, project: attendanceDTO, replayProject: (dto, actor, state) => {
      const row = state.attendance.find(item => item.id === dto.id && alive(item));
      if (!row) missing();
      subjectFor(state, actor, row.subjectId);
      return attendanceDTO(row);
    }
  }));

  return { resolve(path) {
    if (routes.has(path)) return { methods: routes.get(path), params: {} };
    const match = path.match(/^\/attendance\/([^/]+)$/);
    if (!match) return undefined;
    let id;
    try { id = decodeURIComponent(match[1]); } catch { return undefined; }
    return routes.has('/attendance/{id}') ? { methods: routes.get('/attendance/{id}'), params: { id } } : undefined;
  } };
}
