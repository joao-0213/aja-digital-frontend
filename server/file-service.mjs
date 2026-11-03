import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createCommandService, HttpError } from './command-service.mjs';
import { moduleContext, materialContext, missingMaterial, deniedMaterial } from './material-policy.mjs';
import { canAccessSubject } from '../src/lib/access.ts';
import { isAssessmentAssigned } from '../src/lib/enrollment.ts';
import { activityClosed } from '../src/lib/activities.ts';
import { validateUpload } from '../src/lib/domain.ts';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const STAGING_MS = 86400000;
const hash = value => createHash('sha256').update(value).digest('hex');
const invalid = message => { throw new HttpError(422, 'VALIDATION_ERROR', message); };
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const fixtureNames = new Set(['proporcoes.pdf', 'grupos.png']);

export function fileBytes(file) {
  let bytes;
  if (typeof file.bytesBase64 === 'string') bytes = Buffer.from(file.bytesBase64, 'base64');
  else if (fixtureNames.has(file.fixture)) {
    const filename = new URL(`./fixtures/${file.fixture}`, import.meta.url);
    try { if (fs.lstatSync(filename).isSymbolicLink()) missingMaterial(); bytes = fs.readFileSync(filename); } catch { missingMaterial(); }
  } else missingMaterial();
  if (bytes.length !== file.size || file.contentHash && hash(bytes) !== file.contentHash) missingMaterial();
  return bytes;
}
export function fileDTO(file) {
  if (!file || file.deletedAt || !['material', 'work', 'forum', 'question'].includes(file.purpose)) missingMaterial();
  return { id: file.id, name: file.name, size: file.size, mime: file.mime, purpose: file.purpose, parentId: file.parentId, status: file.status, downloadUrl: `/api/v1/files/${encodeURIComponent(file.id)}/content` };
}
function uploadParent(state, actor, purpose, id, timestamp) {
  if (!safeId(id)) invalid('Informe o contexto do arquivo.');
  if (purpose === 'material') return moduleContext(state, actor, id, true);
  if (purpose === 'work') {
    const assessment = state.assessments.find(a => a.id === id && !a.deletedAt && a.kind === 'work' && a.status === 'published');
    if (!assessment) missingMaterial();
    const context = moduleContext(state, actor, assessment.moduleId);
    if (actor.role !== 'student' || !isAssessmentAssigned(state, assessment, actor.id) || activityClosed(assessment, timestamp)) deniedMaterial();
    return context;
  }
  if (purpose === 'forum') {
    const subject = state.subjects.find(s => s.id === id && !s.deletedAt);
    if (!subject) missingMaterial();
    if (!canAccessSubject(state, actor, id) || !state.classes.some(c => c.id === subject.classId && c.active && !c.deletedAt)) deniedMaterial();
    return { subject };
  }
  invalid('Informe uma finalidade de arquivo válida.');
}
export function visibleFile(state, actor, id, timestamp) {
  const file = state.files.find(f => f.id === id && !f.deletedAt);
  if (!file || !['material', 'work', 'forum', 'question'].includes(file.purpose)) missingMaterial();
  if (file.status === 'staged') {
    if (file.authorId !== actor.id || Date.parse(file.expiresAt) <= Date.parse(timestamp)) missingMaterial();
    try { uploadParent(state, actor, file.purpose, file.contextId ?? file.parentId, timestamp); } catch { missingMaterial(); }
  } else if (file.status === 'attached') {
    if (file.purpose === 'material') {
      const { material } = materialContext(state, actor, file.parentId);
      if ((material.fileId ?? material.localFileId) !== file.id) missingMaterial();
    } else if (file.purpose === 'work') {
      const submission = state.submissions.find(s => s.id === file.parentId && !s.deletedAt);
      if (!submission || !submission.attachments.some(a => a.kind === 'file' && (a.fileId ?? a.id) === id)) missingMaterial();
      const assessment = state.assessments.find(a => a.id === submission.assessmentId && a.kind === 'work' && !a.deletedAt);
      if (!assessment) missingMaterial(); moduleContext(state, actor, assessment.moduleId);
      if (actor.role === 'student' && assessment.status !== 'published') missingMaterial();
      if (actor.role === 'student' ? submission.userId !== actor.id || !isAssessmentAssigned(state, assessment, actor.id) : !submission.submittedAt) missingMaterial();
    } else if (file.purpose === 'question') {
      const question = state.questions.find(q => q.id === file.parentId && !q.deletedAt && q.origin !== 'author');
      const source = `/api/v1/files/${encodeURIComponent(file.id)}/content`;
      const currentQuestionImage = question?.image?.src === source;
      const assessmentSnapshotImage = state.assessments.some(assessment => {
        if (assessment.deletedAt || actor.role === 'student' && assessment.status !== 'published') return false;
        if (!(assessment.questions ?? []).some(snapshot => snapshot.id === file.parentId && snapshot.origin !== 'author' && snapshot.image?.src === source)) return false;
        const module = state.modules.find(row => row.id === assessment.moduleId && !row.deletedAt);
        const subject = state.subjects.find(row => row.id === module?.subjectId && !row.deletedAt);
        return !!subject && canAccessSubject(state, actor, subject.id);
      });
      if (!currentQuestionImage && !assessmentSnapshotImage) missingMaterial();
    } else {
      const topic = state.topics.find(t => t.id === file.parentId && !t.deletedAt);
      if (!topic || topic.attachment?.id !== id || !state.subjects.some(s => s.id === topic.subjectId && s.classId === topic.classId && !s.deletedAt) || !canAccessSubject(state, actor, topic.subjectId)) missingMaterial();
    }
  } else missingMaterial();
  return file;
}
function removePrepared(state, file, actorId, timestamp, reason) {
  delete file.bytesBase64;
  file.deletedAt = timestamp; file.cleanupReason = reason;
  file.revision = (file.revision ?? 0) + 1; file.updatedAt = timestamp; file.updatedBy = actorId;
  state.audit.push({ id: randomUUID(), actorId, action: 'delete', collection: 'files', targetId: file.id, createdAt: timestamp });
}
function safeName(value) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > 255 || /[/\\\x00-\x1f\x7f]/.test(value) || /%(?:0[0ad]|2f|5c)/i.test(value) || ['.', '..'].includes(value)) invalid('Informe um nome de arquivo seguro, sem caminhos ou controles.');
  return value;
}
function signature(bytes, mime) {
  if (mime === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (mime === 'image/png') return bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.subarray(12, 16).toString() === 'IHDR';
  if (mime === 'image/jpeg') return bytes.length >= 4 && bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}
function validateFile(bytes, name, mime, purpose) {
  safeName(name);
  if (purpose === 'material') {
    if (!validateUpload({ type: mime, size: bytes.length }, ['application/pdf'], MAX_FILE_BYTES) || !/\.pdf$/i.test(name) || !signature(bytes, mime)) invalid('Envie um PDF válido, não vazio, de até 10 MiB.');
  } else if (purpose === 'forum') {
    const extensions = { 'application/pdf': /\.pdf$/i, 'image/png': /\.png$/i, 'image/jpeg': /\.jpe?g$/i, 'image/webp': /\.webp$/i };
    if (!validateUpload({ type: mime, size: bytes.length }, Object.keys(extensions), 5 * 1024 * 1024) || !extensions[mime].test(name) || !signature(bytes, mime)) invalid('Envie PDF, PNG, JPEG ou WebP válido de até 5 MiB.');
  } else if (purpose === 'work') { if (bytes.length > MAX_FILE_BYTES) invalid('O arquivo deve ter até 10 MiB.'); }
  else invalid('Informe uma finalidade válida.');
}
async function readMultipart(req) {
  const limit = MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES;
  const length = req.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) invalid('O envio excede o limite de arquivo e envelope multipart.');
  const bytes = await new Promise((resolve, reject) => {
    let size = 0, chunks = [], rejected = false;
    req.on('data', chunk => { size += chunk.length; if (size > limit) { if (!rejected) { rejected = true; chunks = []; reject(new HttpError(422, 'VALIDATION_ERROR', 'O envio excede o limite permitido.')); } } else if (!rejected) chunks.push(chunk); });
    req.once('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    req.once('aborted', () => reject(new HttpError(422, 'VALIDATION_ERROR', 'O envio foi interrompido.')));
    req.once('error', reject);
  });
  const contentType = req.headers['content-type'] ?? '';
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean);
  if (!boundary || boundary.length > 200) invalid('Confira o formulário de envio.');
  // Inspect raw part headers before the native parser normalizes path-like filenames.
  for (const part of bytes.toString('latin1').split(`--${boundary}`).slice(1)) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd);
    const filename = headers.match(/(?:^|;)\s*filename="([^"]*)"/im)?.[1];
    if (filename !== undefined) safeName(Buffer.from(filename, 'latin1').toString('utf8'));
  }
  let form;
  try { form = await new Request('http://127.0.0.1/upload', { method: 'POST', headers: { 'Content-Type': contentType }, body: bytes }).formData(); } catch { invalid('Não foi possível ler o formulário de envio.'); }
  const allowed = ['purpose', 'parentId', 'file'];
  if ([...form.keys()].some(key => !allowed.includes(key)) || allowed.some(key => form.getAll(key).length !== 1)) invalid('Envie exatamente uma finalidade, um contexto e um arquivo.');
  const file = form.get('file'), purpose = form.get('purpose'), parentId = form.get('parentId');
  if (!file || typeof file === 'string' || typeof purpose !== 'string' || typeof parentId !== 'string') invalid('Confira os campos do arquivo.');
  const buffer = Buffer.from(await file.arrayBuffer());
  let mime = file.type.toLowerCase().split(';')[0];
  if ((!mime || mime === 'application/octet-stream') && /\.pdf$/i.test(file.name) && signature(buffer, 'application/pdf')) mime = 'application/pdf';
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) invalid('Informe o tipo do arquivo.');
  validateFile(buffer, file.name, mime, purpose);
  return { buffer, fields: { purpose, parentId, name: file.name, mime, size: buffer.length, contentHash: hash(buffer) } };
}

export function createFileService(config, auth) {
  const now = config.now ?? (() => new Date().toISOString());
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now });
  async function maintenance(req) {
    return config.store.transact(state => {
      const actorId = auth.resolveActor(req, state), timestamp = now();
      // Trusted expiry policy includes abandoned owners; explicit discard remains owner-only.
      for (const file of state.files.filter(f => !f.deletedAt && f.status === 'staged' && Date.parse(f.expiresAt) <= Date.parse(timestamp))) removePrepared(state, file, actorId, timestamp, 'expired');
      return actorId;
    });
  }
  function responseError(res, error) { return res.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.status ? error.message : 'Não foi possível concluir a operação.', requestId: randomUUID() } }); }
  const upload = service.command({ operation: 'POST /files', target: req => `${req.body.purpose}:${req.body.parentId}`, requireIdempotency: true, successStatus: 201,
    authorize: (state, actor, req) => {
      uploadParent(state, actor, req.body.purpose, req.body.parentId, now());
      const prior = state.files.find(f => f.authorId === actor.id && f.uploadIntentKey === req.headers['idempotency-key']);
      if (prior) { if (prior.uploadFingerprint !== hash(JSON.stringify(req.body))) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Esta intenção já foi usada para outro arquivo.'); if (prior.deletedAt || prior.status === 'staged' && Date.parse(prior.expiresAt) <= Date.parse(now())) missingMaterial(); }
    },
    apply: (state, actor, req, { timestamp }) => {
      const prior = state.files.find(f => f.authorId === actor.id && f.uploadIntentKey === req.headers['idempotency-key']);
      if (prior) return visibleFile(state, actor, prior.id, timestamp);
      const file = { id: `file-${randomUUID()}`, ...req.body, parentType: req.body.purpose === 'material' ? 'module' : req.body.purpose === 'work' ? 'assessment' : 'subject', contextId: req.body.parentId, authorId: actor.id, status: 'staged', bytesBase64: req.uploadBuffer.toString('base64'), createdAt: timestamp, expiresAt: new Date(Date.parse(timestamp) + STAGING_MS).toISOString(), uploadIntentKey: req.headers['idempotency-key'], uploadFingerprint: hash(JSON.stringify(req.body)) };
      state.files.push(file); return file;
    }, project: fileDTO, replayProject: (dto, actor, state) => fileDTO(visibleFile(state, actor, dto.id, now()))
  });
  const metadata = service.read({ authorize: () => {}, select: (state, actor, req) => { if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.'); const file = visibleFile(state, actor, req.params.id, now()); fileBytes(file); return file; }, project: fileDTO });
  const discard = service.command({ operation: 'POST /files/{id}/discard', target: req => req.params.id, successStatus: 204,
    authorize: (state, actor, req) => { const file = state.files.find(f => f.id === req.params.id); if (!file || file.authorId !== actor.id) missingMaterial(); if (file.status !== 'staged') throw new HttpError(409, 'BUSINESS_CONFLICT', 'Arquivo anexado não pode ser descartado.'); },
    apply: (state, actor, req, { timestamp }) => { if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length) invalid('Esta operação não recebe campos.'); const file = state.files.find(f => f.id === req.params.id && !f.deletedAt) ?? missingMaterial(); delete file.bytesBase64; file.deletedAt = timestamp; file.cleanupReason = 'discarded'; return null; }, project: () => null, replayProject: () => null
  });
  const wrap = handler => async (req, res) => { try { await maintenance(req); return await handler(req, res); } catch (error) { return responseError(res, error); } };
  return {
    async cleanupFailedBatch(req) {
      return config.store.transact(state => {
        const actorId = auth.resolveActor(req, state), timestamp = now();
        const ids = new Set(Array.isArray(req.body?.items) ? req.body.items.map(item => item?.fileId).filter(id => typeof id === 'string') : []);
        for (const file of state.files.filter(f => ids.has(f.id) && f.authorId === actorId && f.purpose === 'material' && f.status === 'staged' && !f.deletedAt && (f.contextId ?? f.parentId) === req.body.moduleId)) removePrepared(state, file, actorId, timestamp, 'failed-publication');
      });
    },
    maintenance,
    claim(state, actor, id, moduleId, materialId, timestamp) {
      const file = state.files.find(f => f.id === id && !f.deletedAt) ?? missingMaterial();
      if (file.status !== 'staged') throw new HttpError(409, 'BUSINESS_CONFLICT', 'Este arquivo já foi anexado.');
      if (file.authorId !== actor.id || file.purpose !== 'material' || (file.contextId ?? file.parentId) !== moduleId || Date.parse(file.expiresAt) <= Date.parse(timestamp)) missingMaterial();
      fileBytes(file); file.status = 'attached'; file.parentType = 'material'; file.parentId = materialId; return file;
    },
    validateWork(state, actor, id, assessmentId, submissionId, timestamp) {
      const file = state.files.find(row => row.id === id && !row.deletedAt) ?? missingMaterial();
      const assessment = state.assessments.find(row => row.id === assessmentId && !row.deletedAt && row.status === 'published' && row.kind === 'work');
      if (!assessment || actor.role !== 'student' || !isAssessmentAssigned(state, assessment, actor.id)) missingMaterial();
      moduleContext(state, actor, assessment.moduleId);
      const contextId = file.contextId ?? (file.status === 'staged' ? file.parentId : file.parentType === 'submission' ? file.contextId : undefined);
      if (file.authorId !== actor.id || file.purpose !== 'work' || contextId !== assessmentId) missingMaterial();
      if (file.status === 'staged') {
        if (Date.parse(file.expiresAt) <= Date.parse(timestamp)) missingMaterial();
      } else if (file.status === 'attached') {
        const existing = submissionId && state.submissions.find(row => row.id === submissionId && !row.deletedAt);
        if (!existing || !existing.attachments.some(item => item.kind === 'file' && (item.fileId ?? item.id) === id) || file.parentId !== submissionId) missingMaterial();
      } else missingMaterial();
      fileBytes(file);
      return file;
    },
    claimWork(state, actor, id, assessmentId, submissionId, timestamp) {
      const file = this.validateWork(state, actor, id, assessmentId, submissionId, timestamp);
      if (file.status === 'attached') return file;
      file.status = 'attached'; file.parentType = 'submission'; file.parentId = submissionId; file.contextId = assessmentId;
      return file;
    },
    resolve(path) {
      if (path === '/files') return { methods: { POST: wrap(async (req, res) => { const parsed = await readMultipart(req); req.uploadBuffer = parsed.buffer; req.body = parsed.fields; return upload(req, res); }) }, params: {}, multipartUpload: true };
      const match = path.match(/^\/files\/([^/]{1,384})(?:\/(content|discard))?$/); if (!match) return null;
      let id; try { id = decodeURIComponent(match[1]); } catch { return null; } if (!safeId(id)) return null;
      const methods = match[2] === 'discard' ? { POST: wrap(discard) } : match[2] === 'content' ? { GET: wrap(async (req, res) => {
        const result = await config.store.transact(state => { const actorId = auth.resolveActor(req, state), actor = state.users.find(u => u.id === actorId), file = visibleFile(state, actor, id, now()); const params = new URL(req.url, 'http://localhost').searchParams; if ([...params.keys()].some(k => k !== 'disposition' || params.getAll(k).length !== 1) || params.has('disposition') && !['inline', 'attachment'].includes(params.get('disposition'))) invalid('Confira a disposição do arquivo.'); return { file: fileDTO(file), bytes: fileBytes(file), disposition: params.get('disposition') ?? 'attachment' }; });
        const bytes = Buffer.from(result.bytes), preview = signature(bytes, result.file.mime), disposition = preview && result.disposition === 'inline' ? 'inline' : 'attachment';
        const quoted = result.file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, value => `\\${value}`);
        res.setHeader('Content-Type', preview ? result.file.mime : 'application/octet-stream'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Disposition', `${disposition}; filename="${quoted}"; filename*=UTF-8''${encodeURIComponent(result.file.name).replace(/['()*]/g, value => '%' + value.charCodeAt(0).toString(16).toUpperCase())}`); res.status(200).end(bytes);
      }) } : { GET: wrap(metadata) };
      return { methods, params: { id }, acceptsQuery: match[2] === 'content' };
    }
  };
}
