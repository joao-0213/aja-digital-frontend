import { randomUUID } from 'node:crypto';
import { createCommandService, HttpError } from './command-service.mjs';
import { canAccessSubject, canManageSubject, isActiveUser, visibleSubjects, visibleClasses } from '../src/lib/access.ts';
import { subjectPublications, hasUnseenPublications } from '../src/lib/subject-updates.ts';

const invalid = message => { throw new HttpError(422, 'VALIDATION_ERROR', message); };
const missing = () => { throw new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado.'); };
const forbidden = () => { throw new HttpError(403, 'FORBIDDEN', 'Seu acesso não permite alterar este contexto.'); };
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const meta = row => ({ id: row.id, revision: row.revision, createdAt: row.createdAt ?? row.updatedAt, updatedAt: row.updatedAt, updatedBy: row.updatedBy });
const subjectDTO = row => ({ ...meta(row), classId: row.classId, name: row.name, teacherIds: row.teacherIds, color: row.color, icon: row.icon ?? 'book', description: row.description });
const moduleDTO = row => ({ ...meta(row), subjectId: row.subjectId, title: row.title, description: row.description, order: row.order });
const alive = row => !row.deletedAt;
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const sortModules = rows => [...rows].sort((a, b) => a.order - b.order || compareId(a, b));
function fields(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) invalid('Confira os campos informados.');
}
function string(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) invalid(`Confira ${label}.`);
  return value.trim();
}
function validId(value) { if (typeof value !== 'string' || !idPattern.test(value)) invalid('Informe um identificador válido.'); return value; }
function params(req, filters, sorts = ['id', '-id']) {
  const values = new URL(req.url, 'http://localhost').searchParams;
  if ([...values.keys()].some(key => !['page', 'pageSize', 'sort', ...filters].includes(key) || values.getAll(key).length !== 1)) invalid('Confira os filtros informados.');
  const page = Number(values.get('page') ?? 1), pageSize = Number(values.get('pageSize') ?? 20), sort = values.get('sort') ?? sorts[0];
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !sorts.includes(sort)) invalid('Confira a paginação e a ordenação.');
  for (const key of ['classId', 'subjectId']) if (values.has(key)) validId(values.get(key));
  return { values, page, pageSize, sort };
}
function noQuery(req) { if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.'); }
function orderQuery(req) { const query = params(req, [], ['id']); if (query.values.has('sort')) invalid('Esta operação aceita somente page e pageSize.'); return query; }
function page(rows, query, project) { return { items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(project), page: query.page, pageSize: query.pageSize, total: rows.length }; }
function scopedSubject(state, actor, id, write = false) {
  const subject = state.subjects.find(s => s.id === id && alive(s));
  if (!subject) missing();
  if (write ? !canManageSubject(state, actor, id) : !canAccessSubject(state, actor, id)) { if (write) forbidden(); missing(); }
  return subject;
}
function scopedModule(state, actor, id, write = false) {
  const module = state.modules.find(m => m.id === id && alive(m));
  if (!module) missing();
  scopedSubject(state, actor, module.subjectId, write);
  return module;
}
const modulesFor = (state, id) => sortModules(state.modules.filter(m => m.subjectId === id && alive(m)));
function projections(state, actor, subject) {
  const modules = modulesFor(state, subject.id), ids = new Set(modules.map(m => m.id));
  const materials = state.materials.filter(m => alive(m) && ids.has(m.moduleId));
  const assessments = state.assessments.filter(a => alive(a) && ids.has(a.moduleId) && (actor.role !== 'student' || a.status === 'published'));
  const announcements = state.announcements.filter(a => alive(a) && a.classId === subject.classId && (!a.subjectId || a.subjectId === subject.id));
  // Reuse identity rules only after projecting live, authorized sources. No payload leaves this function.
  const publicationIds = subjectPublications({ ...state, modules, materials, assessments, announcements }, subject.id);
  return { modules, materials, assessments, announcements, publicationIds };
}
function visitDTO(state, actor, subject) {
  const publicationIds = projections(state, actor, subject).publicationIds;
  const visit = state.visits.find(v => v.userId === actor.id && v.subjectId === subject.id);
  const seenPublicationIds = [...new Set(visit?.seenPublicationIds ?? [])].filter(id => publicationIds.includes(id)).sort();
  return { subjectId: subject.id, seenAt: visit?.seenAt ?? visit?.visitedAt ?? null, seenPublicationIds, publicationIds, hasUpdates: hasUnseenPublications(publicationIds, seenPublicationIds) };
}
function summary(state, actor, subject) {
  const visit = visitDTO(state, actor, subject);
  return { ...subjectDTO(subject), className: state.classes.find(c => c.id === subject.classId)?.name ?? 'Turma indisponível', teachers: subject.teacherIds.map(id => ({ id, name: state.users.find(u => u.id === id)?.name ?? 'Docente indisponível' })), canManageContent: canManageSubject(state, actor, subject.id), hasUpdates: visit.hasUpdates, publicationIds: visit.publicationIds };
}

export function createSubjectService(config, auth) {
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now: config.now });
  const routes = new Map();
  const add = (path, method, handler) => { const methods = routes.get(path) ?? {}; methods[method] = handler; routes.set(path, methods); };
  const read = (path, authorize, select) => add(path, 'GET', service.read({ authorize, select, project: value => value }));
  const administrator = (_s, actor) => { if (actor.role !== 'admin') forbidden(); };
  function subjectFields(state, body, existing) {
    const allowed = ['classId', 'name', 'teacherIds', 'color', 'icon', 'description'];
    fields(body, [...allowed, ...(existing ? ['expectedRevision'] : [])], existing ? ['expectedRevision'] : ['classId', 'name', 'teacherIds', 'color', 'description']);
    const next = { ...(existing ?? { icon: 'book' }), ...body }; delete next.expectedRevision;
    validId(next.classId);
    if (!state.classes.some(c => c.id === next.classId && alive(c))) missing();
    next.name = string(next.name, 'o nome da disciplina', 100, true); next.description = string(next.description, 'a descrição', 10000);
    if (!['violet', 'blue', 'amber', 'green'].includes(next.color) || !['book', 'calculator', 'atom', 'flask', 'leaf', 'globe', 'languages', 'landmark', 'palette', 'graduation'].includes(next.icon)) invalid('Confira a cor e o ícone.');
    if ('teacherIds' in body) {
      if (!Array.isArray(next.teacherIds) || next.teacherIds.length > 100 || new Set(next.teacherIds).size !== next.teacherIds.length) invalid('Confira a equipe docente.');
      for (const id of next.teacherIds) { validId(id); if (!state.users.some(u => u.id === id && u.role === 'teacher' && isActiveUser(u))) invalid('Selecione somente docentes com conta ativa. Remova as seleções indisponíveis.'); }
    }
    return next;
  }
  function assignmentAudit(state, actor, subject, previous, timestamp) {
    for (const id of new Set([...previous, ...subject.teacherIds])) if (previous.includes(id) !== subject.teacherIds.includes(id)) state.audit.push({ id: randomUUID(), actorId: actor.id, action: subject.teacherIds.includes(id) ? 'create' : 'delete', collection: 'teachingAssignments', targetId: `${subject.id}:${id}`, createdAt: timestamp });
  }
  read('/subjects', () => {}, (state, actor, req) => {
    const query = params(req, ['classId', 'q']);
    if (query.values.has('classId') && !visibleClasses(state, actor).some(c => c.id === query.values.get('classId'))) missing();
    const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const rows = visibleSubjects(state, actor).filter(s => (!query.values.has('classId') || s.classId === query.values.get('classId')) && (!query.values.has('q') || normalized(`${s.name} ${s.description}`).includes(normalized(query.values.get('q'))))).sort(compareId);
    if (query.sort === '-id') rows.reverse();
    return page(rows, query, subject => summary(state, actor, subject));
  });
  read('/subjects/{id}', (s, a, req) => { scopedSubject(s, a, req.params.id); }, (s, a, req) => {
    noQuery(req); const subject = scopedSubject(s, a, req.params.id), sources = projections(s, a, subject);
    return { subject: summary(s, a, subject), modules: sources.modules.map(moduleDTO), projections: { materials: { count: sources.materials.length }, assessments: { count: sources.assessments.length }, announcements: { count: sources.announcements.length } } };
  });
  add('/subjects', 'POST', service.command({ operation: 'POST /subjects', target: () => '/subjects', authorize: administrator, requireIdempotency: true, successStatus: 201,
    apply: (state, actor, req, { timestamp }) => { noQuery(req); const subject = { ...subjectFields(state, req.body), id: `subject-${randomUUID()}`, createdAt: timestamp }; state.subjects.push(subject); assignmentAudit(state, actor, subject, [], timestamp); return subject; }, project: subjectDTO,
    replayProject: (dto, actor, state) => subjectDTO(scopedSubject(state, actor, dto.id))
  }));
  add('/subjects/{id}', 'PATCH', service.command({ operation: 'PATCH /subjects/{id}', target: req => req.params.id, authorize: administrator,
    expected: req => [{ collection: 'subjects', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => { noQuery(req); const subject = state.subjects.find(s => s.id === req.params.id && alive(s)) ?? missing(); const old = [...subject.teacherIds]; Object.assign(subject, subjectFields(state, req.body, subject)); assignmentAudit(state, actor, subject, old, timestamp); return subject; }, project: subjectDTO,
    replayProject: (dto, actor, state) => subjectDTO(scopedSubject(state, actor, dto.id))
  }));
  read('/modules', () => {}, (state, actor, req) => {
    const query = params(req, ['subjectId'], ['order', '-order']);
    if (query.values.has('subjectId')) scopedSubject(state, actor, query.values.get('subjectId'));
    const subjectIds = new Set(visibleSubjects(state, actor).map(s => s.id));
    const rows = state.modules.filter(m => alive(m) && subjectIds.has(m.subjectId) && (!query.values.has('subjectId') || m.subjectId === query.values.get('subjectId'))).sort((a, b) => (a.order - b.order) * (query.sort === '-order' ? -1 : 1) || compareId(a, b));
    return page(rows, query, moduleDTO);
  });
  read('/modules/{id}', (s, a, req) => { scopedModule(s, a, req.params.id); }, (s, a, req) => { noQuery(req); return moduleDTO(scopedModule(s, a, req.params.id)); });
  add('/modules', 'POST', service.command({ operation: 'POST /modules', target: req => req.body?.subjectId, requireIdempotency: true, successStatus: 201,
    authorize: (state, actor, req) => { fields(req.body, ['subjectId', 'title', 'description'], ['subjectId', 'title', 'description']); validId(req.body.subjectId); scopedSubject(state, actor, req.body.subjectId, true); },
    apply: (state, _actor, req, { timestamp }) => { noQuery(req); const subject = scopedSubject(state, _actor, req.body.subjectId, true); const module = { id: `module-${randomUUID()}`, subjectId: subject.id, title: string(req.body.title, 'o título do módulo', 160, true), description: string(req.body.description, 'a descrição', 10000), order: Math.max(0, ...modulesFor(state, subject.id).map(m => m.order)) + 1, createdAt: timestamp }; state.modules.push(module); subject.revision += 1; return module; }, project: moduleDTO,
    replayProject: (dto, actor, state) => moduleDTO(scopedModule(state, actor, dto.id))
  }));
  add('/modules/{id}', 'PATCH', service.command({ operation: 'PATCH /modules/{id}', target: req => req.params.id, authorize: (s, a, req) => { scopedModule(s, a, req.params.id, true); },
    expected: req => [{ collection: 'modules', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req) => { noQuery(req); fields(req.body, ['expectedRevision', 'title', 'description'], ['expectedRevision']); const module = scopedModule(state, actor, req.params.id, true); if ('title' in req.body) module.title = string(req.body.title, 'o título do módulo', 160, true); if ('description' in req.body) module.description = string(req.body.description, 'a descrição', 10000); return module; }, project: moduleDTO,
    replayProject: (dto, actor, state) => moduleDTO(scopedModule(state, actor, dto.id))
  }));
  add('/subjects/{id}/reorder-modules', 'POST', service.command({ operation: 'POST /subjects/{id}/reorder-modules', target: req => req.params.id,
    authorize: (state, actor, req) => {
      scopedSubject(state, actor, req.params.id, true);
      orderQuery(req); fields(req.body, ['expectedRevision', 'items'], ['expectedRevision', 'items']);
      if (!Array.isArray(req.body.items) || !req.body.items.length || new Set(req.body.items.map(item => item?.id)).size !== req.body.items.length) invalid('Informe a sequência completa de módulos sem repetição.');
      for (const item of req.body.items) { fields(item, ['id', 'expectedRevision'], ['id', 'expectedRevision']); validId(item.id); if (!state.modules.some(m => m.id === item.id && m.subjectId === req.params.id && alive(m))) forbidden(); }
    },
    expected: req => [{ collection: 'subjects', id: req.params.id, revision: req.body.expectedRevision }, ...req.body.items.map(item => ({ collection: 'modules', id: item.id, revision: item.expectedRevision }))],
    apply: (state, actor, req) => {
      const query = orderQuery(req), modules = modulesFor(state, req.params.id);
      if (modules.length !== req.body.items.length) invalid('A sequência deve conter todos os módulos atuais.');
      let changed = false;
      req.body.items.forEach((item, index) => { const module = modules.find(m => m.id === item.id); if (module.order !== index + 1) { module.order = index + 1; changed = true; } });
      if (changed) scopedSubject(state, actor, req.params.id, true).revision += 1;
      return { subjectId: req.params.id, query };
    }, project: (result, _actor, state) => page(modulesFor(state, result.subjectId), result.query, moduleDTO),
    replayProject: (dto, actor, state, { targetId }) => { scopedSubject(state, actor, targetId, true); return page(modulesFor(state, targetId), dto, moduleDTO); }
  }));
  read('/subjects/{id}/visits', (s, a, req) => { scopedSubject(s, a, req.params.id); }, (s, a, req) => { noQuery(req); return visitDTO(s, a, scopedSubject(s, a, req.params.id)); });
  add('/subjects/{id}/visits', 'POST', service.command({ operation: 'POST /subjects/{id}/visits', target: req => req.params.id, requireIdempotency: true,
    authorize: (s, a, req) => { scopedSubject(s, a, req.params.id); },
    apply: (state, actor, req, { timestamp }) => {
      noQuery(req); fields(req.body, ['publicationIds'], ['publicationIds']);
      if (!Array.isArray(req.body.publicationIds) || new Set(req.body.publicationIds).size !== req.body.publicationIds.length || req.body.publicationIds.some(id => typeof id !== 'string' || !/^(material|notice|assessment):[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id))) invalid('Confira as publicações observadas.');
      const subject = scopedSubject(state, actor, req.params.id), current = projections(state, actor, subject).publicationIds;
      if (req.body.publicationIds.some(id => !current.includes(id))) invalid('As publicações informadas não estão disponíveis neste contexto.');
      let visit = state.visits.find(v => v.userId === actor.id && v.subjectId === subject.id);
      if (!visit) { visit = { id: `visit-${randomUUID()}`, userId: actor.id, subjectId: subject.id, createdAt: timestamp, seenPublicationIds: [] }; state.visits.push(visit); }
      visit.seenPublicationIds = [...new Set([...(visit.seenPublicationIds ?? []), ...req.body.publicationIds])].sort();
      visit.seenAt = timestamp;
      return visit;
    }, project: (visit, actor, state) => visitDTO(state, actor, scopedSubject(state, actor, visit.subjectId)),
    replayProject: (dto, actor, state) => visitDTO(state, actor, scopedSubject(state, actor, dto.subjectId))
  }));
  return {
    resolve(path) {
      if (routes.has(path)) return { methods: routes.get(path), params: {}, acceptsQuery: false };
      const match = path.match(/^\/(subjects|modules)\/([^/]{1,384})(?:\/(visits|reorder-modules))?$/);
      if (!match) return null;
      let id; try { id = decodeURIComponent(match[2]); } catch { return null; }
      if (!idPattern.test(id)) return null;
      const template = `/${match[1]}/{id}${match[3] ? `/${match[3]}` : ''}`;
      return routes.has(template) ? { methods: routes.get(template), params: { id }, acceptsQuery: match[1] === 'subjects' && match[3] === 'reorder-modules' } : null;
    }
  };
}

export { moduleDTO, summary as subjectSummary };
