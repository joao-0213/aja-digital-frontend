import { randomUUID } from 'node:crypto';
import { canAccessSubject, canManageSubject, isActiveUser, visibleClasses, visibleSubjects } from '../src/lib/access.ts';
import { isAssessmentAssigned } from '../src/lib/enrollment.ts';
import { createCommandService, HttpError } from './command-service.mjs';

const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const invalid = message => fail(422, 'VALIDATION_ERROR', message);
const missing = () => fail(404, 'NOT_FOUND', 'Recurso não encontrado.');
const forbidden = () => fail(403, 'FORBIDDEN', 'Seu acesso não permite publicar neste contexto.');
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const alive = row => !!row && !row.deletedAt;
const compareId = (a, b) => a.id.localeCompare(b.id);
function fields(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) invalid('Confira os campos informados.');
}
function query(req, allowedFilters, sorts) {
  const values = new URL(req.url, 'http://localhost').searchParams;
  if ([...values.keys()].some(key => !['page', 'pageSize', 'sort', ...allowedFilters].includes(key) || values.getAll(key).length !== 1)) invalid('Confira os filtros informados.');
  const page = Number(values.get('page') ?? 1), pageSize = Number(values.get('pageSize') ?? 20), sort = values.get('sort') ?? sorts[0];
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !sorts.includes(sort)) invalid('Confira a paginação e a ordenação.');
  return { values, page, pageSize, sort };
}
function page(rows, q) { return { items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page, pageSize: q.pageSize, total: rows.length }; }
function visibleNotice(state, actor, notice) {
  if (!alive(notice)) return false;
  if (notice.subjectId) return canAccessSubject(state, actor, notice.subjectId) && state.subjects.find(subject => subject.id === notice.subjectId)?.classId === notice.classId;
  return visibleClasses(state, actor).some(schoolClass => schoolClass.id === notice.classId);
}
function noticeDTO(state, notice) {
  const author = state.users.find(user => user.id === notice.authorId);
  return { id: notice.id, revision: notice.revision, createdAt: notice.createdAt, updatedAt: notice.updatedAt ?? notice.createdAt, updatedBy: notice.updatedBy ?? notice.authorId, classId: notice.classId, subjectId: notice.subjectId ?? null, title: notice.title, body: notice.body, notify: notice.notify, occurrence: notice.occurrence ?? null, author: { id: notice.authorId, name: author?.name ?? 'Equipe AJA' } };
}
function enqueueNotifications(state, notice, timestamp, frontendOrigin) {
  if (!notice.notify) return;
  const subject = notice.subjectId && state.subjects.find(item => item.id === notice.subjectId);
  const recipients = state.users.filter(user => user.role === 'student' && isActiveUser(user) && (subject ? canAccessSubject(state, user, subject.id) : visibleClasses(state, user).some(item => item.id === notice.classId)) && user.email);
  for (const recipient of recipients) state.outbox.push({ id: randomUUID(), userId: recipient.id, purpose: 'announcement', email: recipient.email, url: `${frontendOrigin}/avisos#aviso-${notice.id}`, createdAt: timestamp });
}
function validateOccurrence(value) {
  if (value === null) return null;
  fields(value, ['date', 'time', 'allDay'], ['date', 'allDay']);
  const parsed = typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? new Date(`${value.date}T12:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.date || typeof value.allDay !== 'boolean') invalid('Informe uma data e duração válidas para o acontecimento.');
  if (value.allDay ? 'time' in value : typeof value.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) invalid('Informe o horário ou marque Dia inteiro.');
  return value.allDay ? { date: value.date, allDay: true } : { date: value.date, time: value.time, allDay: false };
}
function validateAnnouncement(body, state, actor, existing) {
  const allowed = ['classId', 'subjectId', 'title', 'body', 'notify', 'occurrence', ...(existing ? ['expectedRevision'] : [])];
  fields(body, allowed, existing ? ['expectedRevision'] : ['classId', 'subjectId', 'title', 'body', 'notify', 'occurrence']);
  const next = { ...(existing ?? {}), ...body };
  if (existing) delete next.expectedRevision;
  if (!safeId(next.classId) || typeof next.subjectId !== 'string' && next.subjectId !== null) invalid('Informe a turma e o público do aviso.');
  const schoolClass = state.classes.find(row => row.id === next.classId && alive(row) && row.active);
  if (!schoolClass) missing();
  const subject = next.subjectId ? state.subjects.find(row => row.id === next.subjectId && alive(row) && row.classId === schoolClass.id) : null;
  if (next.subjectId && !subject) invalid('A disciplina não pertence à turma selecionada.');
  if (actor.role === 'admin') { if (subject && !canManageSubject(state, actor, subject.id)) forbidden(); }
  else if (actor.role !== 'teacher' || !subject || !canManageSubject(state, actor, subject.id)) forbidden();
  if (typeof next.title !== 'string' || !next.title.trim() || next.title.length > 150 || typeof next.body !== 'string' || !next.body.trim() || next.body.length > 20000 || typeof next.notify !== 'boolean') invalid('Informe título, mensagem e opção de notificação válidos.');
  return { classId: schoolClass.id, subjectId: subject?.id ?? null, title: next.title.trim(), body: next.body.trim(), notify: next.notify, occurrence: validateOccurrence(next.occurrence) };
}
function localTime(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function createAnnouncementService(config, auth) {
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now: config.now });
  const routes = new Map();
  const add = (path, method, handler) => { const methods = routes.get(path) ?? {}; methods[method] = handler; routes.set(path, methods); };
  const read = (path, authorize, select, project = value => value) => add(path, 'GET', service.read({ authorize, select, project }));
  const parseId = req => { if (!safeId(req.params.id)) invalid('Informe um identificador válido.'); return req.params.id; };
  read('/announcements', () => {}, (state, actor, req) => {
    const q = query(req, ['classId', 'subjectId', 'q'], ['createdAt', '-createdAt']);
    if (q.values.has('classId') && !visibleClasses(state, actor).some(item => item.id === q.values.get('classId'))) missing();
    if (q.values.has('subjectId') && !canAccessSubject(state, actor, q.values.get('subjectId'))) missing();
    const subject = q.values.has('subjectId') ? state.subjects.find(item => item.id === q.values.get('subjectId')) : null;
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    const rows = state.announcements.filter(item => visibleNotice(state, actor, item) && (!q.values.has('classId') || item.classId === q.values.get('classId')) && (!subject || item.subjectId === subject.id || !item.subjectId && item.classId === subject.classId) && (!q.values.has('q') || normalize(`${item.title} ${item.body}`).includes(normalize(q.values.get('q'))))).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') * (q.sort === '-createdAt' ? -1 : 1) || compareId(a, b));
    return { rows, q: { page: q.page, pageSize: q.pageSize } };
  }, (result, _actor, state) => ({ ...page(result.rows, result.q), items: page(result.rows, result.q).items.map(row => noticeDTO(state, row)) }));
  read('/announcements/{id}', (state, actor, req) => { const row = state.announcements.find(item => item.id === parseId(req)); if (!visibleNotice(state, actor, row)) missing(); }, (state, actor, req) => state.announcements.find(item => item.id === parseId(req) && visibleNotice(state, actor, item)), (row, _actor, state) => noticeDTO(state, row));
  add('/announcements', 'POST', service.command({ operation: 'POST /announcements', target: () => '/announcements', requireIdempotency: true, successStatus: 201,
    authorize: (state, actor, req) => { validateAnnouncement(req.body, state, actor); },
    apply: (state, actor, req, { timestamp }) => {
      const notice = { ...validateAnnouncement(req.body, state, actor), id: `notice-${randomUUID()}`, authorId: actor.id, createdAt: timestamp };
      state.announcements.push(notice);
      enqueueNotifications(state, notice, timestamp, config.frontendOrigin);
      return notice;
    }, project: (row, _actor, state) => noticeDTO(state, row), replayProject: (dto, actor, state) => { const row = state.announcements.find(item => item.id === dto.id); if (!visibleNotice(state, actor, row)) missing(); return noticeDTO(state, row); }
  }));
  add('/announcements/{id}', 'PATCH', service.command({ operation: 'PATCH /announcements/{id}', target: req => req.params.id, authorize: (state, actor, req) => { parseId(req); const row = state.announcements.find(item => item.id === req.params.id && alive(item)); if (!row) missing(); if (actor.role !== 'admin' && (!row.subjectId || !canManageSubject(state, actor, row.subjectId))) forbidden(); validateAnnouncement(req.body, state, actor, row); }, expected: req => [{ collection: 'announcements', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => { const row = state.announcements.find(item => item.id === req.params.id && alive(item)) ?? missing(); Object.assign(row, validateAnnouncement(req.body, state, actor, row)); enqueueNotifications(state, row, timestamp, config.frontendOrigin); return row; }, project: (row, _actor, state) => noticeDTO(state, row), replayProject: (dto, actor, state) => { const row = state.announcements.find(item => item.id === dto.id); if (!visibleNotice(state, actor, row)) missing(); return noticeDTO(state, row); }
  }));
  add('/announcements/{id}/withdraw', 'POST', service.command({ operation: 'POST /announcements/{id}/withdraw', target: req => req.params.id, successStatus: 204, authorize: (state, actor, req) => { parseId(req); const row = state.announcements.find(item => item.id === req.params.id && alive(item)); if (!row) missing(); if (actor.role !== 'admin' && (!row.subjectId || !canManageSubject(state, actor, row.subjectId))) forbidden(); fields(req.body, ['expectedRevision'], ['expectedRevision']); }, expected: req => [{ collection: 'announcements', id: req.params.id, revision: req.body?.expectedRevision }], apply: (state, _actor, req, { timestamp }) => { const row = state.announcements.find(item => item.id === req.params.id && alive(item)) ?? missing(); row.deletedAt = timestamp; return row; }, project: () => undefined, replayProject: () => undefined
  }));
  read('/calendar', () => {}, (state, actor, req) => {
    const q = query(req, ['from', 'to', 'subjectId'], ['date', '-date']);
    const from = q.values.get('from'), to = q.values.get('to');
    const validDate = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(from) || !validDate(to) || from && to && from > to) invalid('Confira o intervalo de datas.');
    if (q.values.has('subjectId') && !canAccessSubject(state, actor, q.values.get('subjectId'))) missing();
    const subject = q.values.has('subjectId') ? state.subjects.find(item => item.id === q.values.get('subjectId')) : null;
    const notices = state.announcements.filter(row => visibleNotice(state, actor, row) && row.occurrence && (!subject || row.subjectId === subject.id || !row.subjectId && row.classId === subject.classId)).filter(row => (!from || row.occurrence.date >= from) && (!to || row.occurrence.date <= to)).map(row => ({ id: `notice-${row.id}`, title: row.title, kind: 'event', date: row.occurrence.date, time: row.occurrence.allDay ? null : row.occurrence.time, allDay: !!row.occurrence.allDay, description: row.body, subjectId: row.subjectId ?? null, source: 'announcement', sourceId: row.id, href: `/avisos#aviso-${row.id}` }));
    const visible = visibleSubjects(state, actor), subjectIds = new Set(visible.map(subject => subject.id));
    const modules = new Map(state.modules.filter(module => alive(module) && subjectIds.has(module.subjectId)).map(module => [module.id, module.subjectId]));
    const assessments = state.assessments.filter(item => alive(item) && item.status === 'published' && item.deadline && modules.has(item.moduleId) && (actor.role !== 'student' || isAssessmentAssigned(state, item, actor.id))).map(item => {
      const subjectId = modules.get(item.moduleId), { date, time } = localTime(item.deadline);
      return { id: `activity-${item.id}`, title: item.title, kind: 'exam', date, time, allDay: false, description: item.description ?? '', subjectId, source: 'assessment', sourceId: item.id, href: `/questionarios/responder?id=${encodeURIComponent(item.id)}` };
    }).filter(item => (!from || item.date >= from) && (!to || item.date <= to) && (!q.values.has('subjectId') || item.subjectId === q.values.get('subjectId')));
    const direction = q.sort === '-date' ? -1 : 1;
    const rows = [...notices, ...assessments].sort((a, b) => direction * a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return { rows, q: { page: q.page, pageSize: q.pageSize } };
  }, result => page(result.rows, result.q));
  return { resolve(path) { if (path === '/announcements' || path === '/calendar') return { methods: routes.get(path), params: {} }; const match = path.match(/^\/announcements\/([^/]+)(\/withdraw)?$/); if (!match) return undefined; const key = match[2] ? '/announcements/{id}/withdraw' : '/announcements/{id}'; return { methods: routes.get(key), params: { id: decodeURIComponent(match[1]) } }; } };
}
