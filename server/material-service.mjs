import { randomUUID } from 'node:crypto';
import { createCommandService, HttpError } from './command-service.mjs';
import { moduleContext, materialContext, missingMaterial, deniedMaterial } from './material-policy.mjs';
import { fileDTO, fileBytes, visibleFile } from './file-service.mjs';
import { moduleDTO, subjectSummary } from './subject-service.mjs';
import { visibleSubjects, canManageSubject } from '../src/lib/access.ts';
import { videoSource } from '../src/lib/material-video.ts';

const invalid = message => { throw new HttpError(422, 'VALIDATION_ERROR', message); };
const meta = row => ({ id: row.id, revision: row.revision, createdAt: row.createdAt ?? row.updatedAt, updatedAt: row.updatedAt, updatedBy: row.updatedBy });
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function fields(body, allowed, required) { if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k)) || required.some(k => !(k in body))) invalid('Confira os campos informados.'); }
function noQuery(req) { if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.'); }
function query(req, filters = [], sorts = ['order', '-order'], paginationOnly = false) {
  const p = new URL(req.url, 'http://localhost').searchParams;
  if ([...p.keys()].some(k => !['page', 'pageSize', ...(!paginationOnly ? ['sort'] : []), ...filters].includes(k) || p.getAll(k).length !== 1)) invalid('Confira os filtros informados.');
  const page = Number(p.get('page') ?? 1), pageSize = Number(p.get('pageSize') ?? 20), sort = p.get('sort') ?? sorts[0];
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !sorts.includes(sort)) invalid('Confira a paginação e a ordenação.');
  for (const key of ['moduleId', 'subjectId', 'materialId']) if (p.has(key) && !safeId(p.get(key))) invalid('Informe um identificador válido.');
  return { page, pageSize, sort, p };
}
function paged(rows, q, project) { return { items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map(project), page: q.page, pageSize: q.pageSize, total: rows.length }; }
const moduleMaterials = (state, id) => state.materials.filter(m => m.moduleId === id && !m.deletedAt).sort((a, b) => a.order - b.order || byId(a, b));
export function materialDTO(material, actor, state, timestamp) {
  const fileId = material.fileId ?? material.localFileId ?? null;
  let file = null;
  if (fileId) {
    try { const record = visibleFile(state, actor, fileId, timestamp); fileBytes(record); file = fileDTO(record); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  return { ...meta(material), moduleId: material.moduleId, title: material.title, kind: material.kind, duration: material.duration, content: material.content, fileId, videoUrl: material.videoUrl ?? null, file, author: { id: material.authorId, name: state.users.find(u => u.id === material.authorId)?.name ?? 'Equipe AJA' }, order: material.order };
}
function values(item, existing) {
  const next = { ...(existing ?? {}), ...item }; delete next.expectedRevision;
  if (typeof next.title !== 'string' || !next.title.trim() || next.title.length > 160) invalid('Informe um título de até 160 caracteres.'); next.title = next.title.trim();
  if (typeof next.duration !== 'number' || !Number.isFinite(next.duration) || next.duration < 1 || next.duration > 600) invalid('Informe um tempo de estudo entre 1 e 600 minutos.');
  if (typeof next.content !== 'string' || next.kind === 'lesson' && !next.content.trim()) invalid('Informe o conteúdo do texto de apoio.'); next.content = next.content.trim();
  if (!['lesson', 'pdf', 'video'].includes(next.kind)) invalid('Informe um tipo de material válido.');
  if (next.kind === 'video') {
    if (!existing || Object.hasOwn(item, 'videoUrl')) { const source = typeof next.videoUrl === 'string' && videoSource(next.videoUrl); if (!source) invalid('Informe um endereço de vídeo HTTPS válido, sem credenciais.'); next.videoUrl = source.url; }
    if (next.fileId) invalid('Vídeo não recebe arquivo PDF.');
  } else if (next.videoUrl) invalid('Somente vídeo recebe endereço de vídeo.');
  if (next.kind === 'pdf' && !safeId(next.fileId ?? next.localFileId)) invalid('Prepare um arquivo PDF válido antes de publicar.');
  if (next.kind === 'lesson' && next.fileId) invalid('Texto de apoio não recebe arquivo PDF.');
  return next;
}

export function createMaterialService(config, auth, files) {
  const now = config.now ?? (() => new Date().toISOString());
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now });
  const routes = new Map();
  const add = (path, method, handler) => { const methods = routes.get(path) ?? {}; methods[method] = handler; routes.set(path, methods); };
  const project = (row, actor, state) => materialDTO(row, actor, state, now());
  add('/materials', 'GET', service.read({ authorize: () => {}, select: (state, actor, req) => {
    const q = query(req, ['moduleId', 'subjectId']);
    if (q.p.has('moduleId')) moduleContext(state, actor, q.p.get('moduleId'));
    const subjectIds = new Set(visibleSubjects(state, actor).map(s => s.id));
    if (q.p.has('subjectId') && !subjectIds.has(q.p.get('subjectId'))) missingMaterial();
    const moduleIds = new Set(state.modules.filter(m => !m.deletedAt && subjectIds.has(m.subjectId) && (!q.p.has('subjectId') || m.subjectId === q.p.get('subjectId'))).map(m => m.id));
    const rows = state.materials.filter(m => !m.deletedAt && moduleIds.has(m.moduleId) && (!q.p.has('moduleId') || m.moduleId === q.p.get('moduleId'))).sort((a, b) => (a.order - b.order) * (q.sort === '-order' ? -1 : 1) || byId(a, b));
    return paged(rows, q, row => project(row, actor, state));
  }, project: dto => dto }));
  add('/materials/{id}', 'GET', service.read({ authorize: (s, a, req) => { materialContext(s, a, req.params.id); }, select: (s, a, req) => { noQuery(req); const context = materialContext(s, a, req.params.id); return { material: project(context.material, a, s), module: moduleDTO(context.module), subject: subjectSummary(s, a, context.subject), canManageContent: canManageSubject(s, a, context.subject.id) }; }, project: dto => dto }));
  const batch = service.command({ operation: 'POST /materials/batch', target: req => req.body?.moduleId, requireIdempotency: true, successStatus: 201,
    authorize: (state, actor, req) => { query(req, [], ['order'], true); fields(req.body, ['moduleId', 'expectedRevision', 'items'], ['moduleId', 'expectedRevision', 'items']); if (!safeId(req.body.moduleId)) invalid('Informe um módulo válido.'); moduleContext(state, actor, req.body.moduleId, true); },
    expected: req => [{ collection: 'modules', id: req.body.moduleId, revision: req.body.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => {
      if (!Array.isArray(req.body.items) || req.body.items.length < 1 || req.body.items.length > 10) invalid('Publique de 1 a 10 materiais por lote.');
      const prepared = req.body.items.map(item => { fields(item, ['moduleId', 'title', 'kind', 'duration', 'content', 'fileId', 'videoUrl'], ['moduleId', 'title', 'kind', 'duration', 'content']); if (item.moduleId !== req.body.moduleId) invalid('Todos os materiais devem pertencer ao módulo informado.'); return values(item); });
      const fileIds = prepared.filter(m => m.kind === 'pdf').map(m => m.fileId);
      if (new Set(fileIds).size !== fileIds.length) invalid('Não repita o mesmo arquivo no lote.');
      const parent = moduleContext(state, actor, req.body.moduleId, true).module;
      const start = Math.max(0, ...moduleMaterials(state, parent.id).map(m => m.order));
      const created = prepared.map((item, index) => {
        const material = { ...item, id: `material-${randomUUID()}`, moduleId: parent.id, createdAt: timestamp, authorId: actor.id, order: start + index + 1 };
        if (item.kind === 'pdf') { const file = files.claim(state, actor, item.fileId, parent.id, material.id, timestamp); material.fileName = file.name; material.fileSize = file.size; }
        state.materials.push(material); return material;
      });
      parent.revision += 1;
      return { createdIds: created.map(m => m.id), q: query(req, [], ['order'], true) };
    }, project: (result, actor, state) => paged(result.createdIds.map(id => materialContext(state, actor, id).material), result.q, row => project(row, actor, state)),
    replayProject: (dto, actor, state) => ({ ...dto, items: dto.items.map(row => project(materialContext(state, actor, row.id).material, actor, state)) })
  });
  add('/materials/batch', 'POST', async (req, res) => {
    // Defer HTTP publication until definite validation failures have cleaned only owned preparation.
    const captured = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    try {
      await files.maintenance(req); await batch(req, captured);
      if ([403, 404, 422].includes(captured.code)) await files.cleanupFailedBatch(req);
      return res.status(captured.code).json(captured.body);
    } catch (error) { return res.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.status ? error.message : 'Não foi possível concluir a publicação.', requestId: randomUUID() } }); }
  });
  add('/materials/{id}', 'PATCH', service.command({ operation: 'PATCH /materials/{id}', target: req => req.params.id,
    authorize: (s, a, req) => { materialContext(s, a, req.params.id, true); }, expected: req => [{ collection: 'materials', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req) => { noQuery(req); fields(req.body, ['expectedRevision', 'title', 'duration', 'content', 'videoUrl'], ['expectedRevision']); const material = materialContext(state, actor, req.params.id, true).material; Object.assign(material, values(req.body, material)); return material; }, project,
    replayProject: (dto, actor, state) => project(materialContext(state, actor, dto.id).material, actor, state)
  }));
  add('/modules/{id}/reorder-materials', 'POST', service.command({ operation: 'POST /modules/{id}/reorder-materials', target: req => req.params.id,
    authorize: (state, actor, req) => {
      moduleContext(state, actor, req.params.id, true); query(req, [], ['order'], true); fields(req.body, ['expectedRevision', 'items'], ['expectedRevision', 'items']);
      if (!Array.isArray(req.body.items) || !req.body.items.length || new Set(req.body.items.map(m => m?.id)).size !== req.body.items.length) invalid('Informe todos os materiais sem repetição.');
      for (const item of req.body.items) { fields(item, ['id', 'expectedRevision'], ['id', 'expectedRevision']); if (!safeId(item.id)) invalid('Informe um identificador válido.'); if (!state.materials.some(m => m.id === item.id && m.moduleId === req.params.id && !m.deletedAt)) deniedMaterial(); }
    }, expected: req => [{ collection: 'modules', id: req.params.id, revision: req.body.expectedRevision }, ...req.body.items.map(item => ({ collection: 'materials', id: item.id, revision: item.expectedRevision }))],
    apply: (state, actor, req) => {
      const rows = moduleMaterials(state, req.params.id); if (rows.length !== req.body.items.length) invalid('A sequência deve conter todos os materiais atuais.'); let changed = false;
      req.body.items.forEach((item, index) => { const row = rows.find(m => m.id === item.id); if (row.order !== index + 1) { row.order = index + 1; changed = true; } });
      if (changed) moduleContext(state, actor, req.params.id, true).module.revision += 1;
      return { id: req.params.id, q: query(req, [], ['order'], true) };
    }, project: (result, actor, state) => paged(moduleMaterials(state, result.id), result.q, row => project(row, actor, state)),
    replayProject: (dto, actor, state, { targetId }) => { moduleContext(state, actor, targetId, true); return paged(moduleMaterials(state, targetId), dto, row => project(row, actor, state)); }
  }));
  const progressDTO = row => ({ ...meta(row), userId: row.userId, materialId: row.materialId, completed: row.completed, lastAccess: row.lastAccess });
  add('/me/progress', 'GET', service.read({ authorize: () => {}, select: (state, actor, req) => {
    const q = query(req, ['subjectId', 'materialId'], ['id', '-id']), subjects = new Set(visibleSubjects(state, actor).map(s => s.id));
    if (q.p.has('subjectId') && !subjects.has(q.p.get('subjectId'))) missingMaterial();
    if (q.p.has('materialId')) materialContext(state, actor, q.p.get('materialId'));
    const modules = new Set(state.modules.filter(m => !m.deletedAt && subjects.has(m.subjectId) && (!q.p.has('subjectId') || m.subjectId === q.p.get('subjectId'))).map(m => m.id));
    const materials = new Set(state.materials.filter(m => !m.deletedAt && modules.has(m.moduleId)).map(m => m.id));
    const rows = state.progress.filter(p => p.userId === actor.id && !p.deletedAt && materials.has(p.materialId) && (!q.p.has('materialId') || p.materialId === q.p.get('materialId'))).sort(byId); if (q.sort === '-id') rows.reverse(); return paged(rows, q, progressDTO);
  }, project: dto => dto }));
  add('/me/progress', 'PATCH', service.command({ operation: 'PATCH /me/progress', target: req => req.body?.materialId,
    authorize: (state, actor, req) => { fields(req.body, ['materialId', 'completed'], ['materialId']); if (!safeId(req.body.materialId) || 'completed' in req.body && req.body.completed !== true) invalid('Informe um material e, para concluir, completed igual a true.'); materialContext(state, actor, req.body.materialId); },
    apply: (state, actor, req, { timestamp }) => { noQuery(req); let row = state.progress.find(p => p.userId === actor.id && p.materialId === req.body.materialId && !p.deletedAt); if (!row) { row = { id: `progress-${randomUUID()}`, userId: actor.id, materialId: req.body.materialId, completed: req.body.completed === true, lastAccess: timestamp, createdAt: timestamp }; state.progress.push(row); } else if (req.body.completed === true) row.completed = true; else if (Date.parse(timestamp) > Date.parse(row.lastAccess)) row.lastAccess = timestamp; return row; }, project: progressDTO,
    replayProject: (dto, actor, state) => progressDTO(state.progress.find(p => p.id === dto.id && p.userId === actor.id && !p.deletedAt) ?? missingMaterial())
  }));
  return {
    resolve(path) {
      if (routes.has(path)) return { methods: routes.get(path), params: {}, acceptsQuery: path === '/materials/batch' };
      const match = path.match(/^\/(materials|modules)\/([^/]{1,384})(?:\/(reorder-materials))?$/); if (!match) return null;
      let id; try { id = decodeURIComponent(match[2]); } catch { return null; } if (!safeId(id)) return null;
      const template = `/${match[1]}/{id}${match[3] ? `/${match[3]}` : ''}`;
      return routes.has(template) ? { methods: routes.get(template), params: { id }, acceptsQuery: match[3] === 'reorder-materials' } : null;
    }
  };
}
