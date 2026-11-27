import { randomUUID } from 'node:crypto';
import { HttpError, createCommandService } from './command-service.mjs';
import { canAccessSubject, canManageSubject } from '../src/lib/access.ts';
import { isAssessmentAssigned } from '../src/lib/enrollment.ts';
import { activityClosed, safeWorkLink, validateWorkFeedback } from '../src/lib/activities.ts';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const invalid = (message = 'Confira os dados da entrega.') => fail(422, 'VALIDATION_ERROR', message);
const missing = () => fail(404, 'NOT_FOUND', 'Entrega indisponível.');
const forbidden = () => fail(403, 'FORBIDDEN', 'Seu vínculo não permite alterar esta entrega.');
const conflict = (message = 'A entrega mudou. Confira a versão atual antes de continuar.') => fail(409, 'REVISION_CONFLICT', message);
const alive = row => !!row && !row.deletedAt;

function fields(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) invalid();
}

function validId(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) invalid('Informe um identificador válido.');
  return value;
}

function validRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) invalid('Informe a revisão atual da entrega.');
}

function cleanName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 || /[\x00-\x1f\x7f]/.test(value)) invalid('Informe um nome de anexo válido.');
  return value.trim();
}

function normalizeAttachmentShape(items) {
  if (!Array.isArray(items) || items.length > 5) invalid('Use até 5 anexos no total, contando arquivos e links.');
  const seen = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid('Confira os anexos da entrega.');
    if (item.kind === 'link') {
      fields(item, ['kind', 'name', 'url'], ['kind', 'name', 'url']);
      const name = cleanName(item.name);
      if (typeof item.url !== 'string' || item.url.length > 4096 || !safeWorkLink(item.url)) invalid('Informe um link HTTP ou HTTPS válido, sem credenciais.');
      const key = `link:${item.url}`;
      if (seen.has(key)) invalid('Há anexos repetidos.');
      seen.add(key);
      return { kind: 'link', name, url: item.url };
    }
    if (item.kind === 'file') {
      fields(item, ['kind', 'fileId', 'name'], ['kind', 'fileId', 'name']);
      const fileId = validId(item.fileId), name = cleanName(item.name);
      if (seen.has(fileId)) invalid('Há anexos repetidos.');
      seen.add(fileId);
      return { kind: 'file', fileId, name };
    }
    return invalid('O anexo deve ser um arquivo preparado ou um link.');
  });
}

function workContext(state, actor, assessmentId, { write = false } = {}) {
  const assessment = state.assessments.find(row => row.id === assessmentId && alive(row) && row.status === 'published' && (row.kind ?? 'quiz') === 'work');
  if (!assessment) missing();
  const module = state.modules.find(row => row.id === assessment.moduleId && alive(row));
  const subject = module && state.subjects.find(row => row.id === module.subjectId && alive(row));
  if (!subject || !canAccessSubject(state, actor, subject.id)) missing();
  if (actor.role === 'student') {
    if (!isAssessmentAssigned(state, assessment, actor.id)) missing();
  } else if (write && !canManageSubject(state, actor, subject.id)) forbidden();
  return { assessment, module, subject };
}

function submissionFor(state, actor, id, { write = false, allowDraftForStaff = false } = {}) {
  const submission = state.submissions?.find(row => row.id === id && alive(row));
  if (!submission) missing();
  const context = workContext(state, actor, submission.assessmentId, { write });
  if (actor.role === 'student') {
    if (submission.userId !== actor.id) missing();
  } else if (!allowDraftForStaff && !submission.submittedAt) missing();
  if (write && actor.role === 'student' && submission.submittedAt) conflict('Este trabalho já foi enviado. Consulte o comprovante.');
  return { submission, ...context };
}

function authorDTO(state, id) {
  const user = state.users.find(row => row.id === id && alive(row));
  return { id: user?.id ?? id ?? 'unknown', name: user?.name ?? 'Equipe' };
}

function feedbackDTO(state, feedback) {
  if (!feedback) return null;
  return {
    comment: typeof feedback.comment === 'string' ? feedback.comment : '',
    grade: Number.isFinite(feedback.grade) ? feedback.grade : null,
    author: authorDTO(state, feedback.authorId),
    createdAt: feedback.createdAt
  };
}

function attachmentDTO(items = []) {
  return items.map(item => item.kind === 'file'
    ? { kind: 'file', fileId: item.fileId ?? item.id ?? item.localFileId, name: item.name }
    : { kind: 'link', name: item.name, url: item.url });
}

function receiptDTO(submission) {
  if (!submission.submittedAt) return null;
  const id = typeof submission.receipt === 'string' ? submission.receipt : submission.receipt?.id ?? `receipt-${submission.id}`;
  return { id, resourceId: submission.id, submittedAt: submission.submittedAt };
}

function submissionDTO(state, submission, actor) {
  const common = {
    id: submission.id,
    revision: submission.revision ?? 1,
    createdAt: submission.createdAt ?? submission.submittedAt ?? submission.updatedAt,
    updatedAt: submission.updatedAt ?? submission.submittedAt ?? submission.createdAt,
    updatedBy: submission.updatedBy ?? submission.userId,
    assessmentId: submission.assessmentId,
    userId: submission.userId,
    attachments: attachmentDTO(submission.attachments),
    submittedAt: submission.submittedAt ?? null,
    receipt: receiptDTO(submission),
    feedbackPublished: feedbackDTO(state, submission.feedbackPublished),
    feedbackUpdated: (submission.feedbackHistory ?? []).length > 1
  };
  if (actor.role === 'student') return common;
  return {
    ...common,
    studentName: authorDTO(state, submission.userId).name,
    feedbackDraft: feedbackDTO(state, submission.feedbackDraft),
    feedbackHistory: (submission.feedbackHistory ?? []).map(item => feedbackDTO(state, item))
  };
}

function listQuery(req) {
  const values = new URL(req.url, 'http://localhost').searchParams;
  const allowed = ['page', 'pageSize', 'sort', 'assessmentId', 'studentId'];
  if ([...values.keys()].some(key => !allowed.includes(key) || values.getAll(key).length !== 1)) invalid('Confira os filtros de entregas.');
  const page = Number(values.get('page') ?? 1), pageSize = Number(values.get('pageSize') ?? 20), sort = values.get('sort') ?? 'id';
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !['id', '-id'].includes(sort)) invalid('Confira a paginação e a ordenação.');
  if (values.has('assessmentId')) validId(values.get('assessmentId'));
  if (values.has('studentId')) validId(values.get('studentId'));
  return { values, page, pageSize, sort };
}

function validateFeedbackCommand(body, assessment) {
  fields(body, ['expectedRevision', 'comment', 'grade'], ['expectedRevision', 'comment', 'grade']);
  validRevision(body.expectedRevision);
  if (body.grade !== null && typeof body.grade !== 'number') invalid('A nota deve estar entre zero e o máximo da atividade.');
  const issue = validateWorkFeedback(assessment, body.comment, body.grade === null ? undefined : body.grade, false);
  if (issue) invalid(issue);
}

function feedbackIsEmpty(feedback) {
  return !feedback || !feedback.comment?.trim() && feedback.grade == null;
}

export function createWorkService(config, auth, files) {
  const now = config.now ?? (() => new Date().toISOString());
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now });
  const list = service.read({
    authorize: (state, actor, req) => {
      const { values } = listQuery(req);
      if (actor.role === 'student' && values.has('studentId') && values.get('studentId') !== actor.id) missing();
      if (values.has('assessmentId')) workContext(state, actor, values.get('assessmentId'));
      if (values.has('studentId') && actor.role !== 'student' && !state.users.some(row => row.id === values.get('studentId') && row.role === 'student' && alive(row))) missing();
    },
    select: (state, actor, req) => {
      const { values, page, pageSize, sort } = listQuery(req);
      const visible = new Set(state.assessments.filter(row => {
        if (!alive(row) || row.status !== 'published' || (row.kind ?? 'quiz') !== 'work') return false;
        if (values.has('assessmentId') && row.id !== values.get('assessmentId')) return false;
        try { workContext(state, actor, row.id); return true; } catch (error) { if (error instanceof HttpError && [403, 404].includes(error.status)) return false; throw error; }
      }).map(row => row.id));
      const studentId = actor.role === 'student' ? actor.id : values.get('studentId');
      const rows = (state.submissions ?? []).filter(row => alive(row) && visible.has(row.assessmentId)
        && (actor.role === 'student' || !!row.submittedAt)
        && (!studentId || row.userId === studentId));
      rows.sort((left, right) => left.id.localeCompare(right.id) * (sort === '-id' ? -1 : 1) || left.id.localeCompare(right.id));
      return { items: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length };
    },
    project: (page, actor, state) => ({ ...page, items: page.items.map(row => submissionDTO(state, row, actor)) })
  });

  const prepare = service.command({
    operation: 'POST /submissions', target: req => req.body?.assessmentId, requireIdempotency: true, successStatus: 201,
    authorize: (state, actor, req) => {
      if (actor.role !== 'student') forbidden();
      if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita parâmetros de consulta.');
      fields(req.body, ['assessmentId', 'attachments'], ['assessmentId', 'attachments']);
      const assessmentId = validId(req.body.assessmentId);
      workContext(state, actor, assessmentId);
      normalizeAttachmentShape(req.body.attachments);
      const current = (state.submissions ?? []).find(row => alive(row) && row.assessmentId === assessmentId && row.userId === actor.id);
      if (current?.submittedAt && JSON.stringify(attachmentDTO(current.attachments)) !== JSON.stringify(normalizeAttachmentShape(req.body.attachments))) conflict('Este trabalho já foi enviado. Consulte o comprovante.');
      return current;
    },
    apply: (state, actor, req, { timestamp }) => {
      const assessment = workContext(state, actor, req.body.assessmentId).assessment;
      const attachments = normalizeAttachmentShape(req.body.attachments);
      for (const item of attachments) if (item.kind === 'file') files.validateWork(state, actor, item.fileId, assessment.id, null, timestamp);
      state.submissions ??= [];
      const current = state.submissions.find(row => alive(row) && row.assessmentId === assessment.id && row.userId === actor.id);
      if (current) {
        if (current.submittedAt) return current;
        if (JSON.stringify(attachmentDTO(current.attachments)) !== JSON.stringify(attachments)) conflict('Já existe um rascunho. Consulte-o antes de salvar outra preparação.');
        return current;
      }
      const submission = { id: `submission-${randomUUID()}`, assessmentId: assessment.id, userId: actor.id, attachments, feedbackHistory: [], createdAt: timestamp };
      state.submissions.push(submission);
      return submission;
    },
    project: (submission, actor, state) => submissionDTO(state, submission, actor),
    replayProject: (dto, actor, state) => {
      const { submission } = submissionFor(state, actor, dto.id, { allowDraftForStaff: false });
      return submissionDTO(state, submission, actor);
    }
  });

  const readItem = service.read({
    authorize: (state, actor, req) => { if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.'); submissionFor(state, actor, req.params.id); },
    select: (state, actor, req) => submissionFor(state, actor, req.params.id).submission,
    project: (submission, actor, state) => submissionDTO(state, submission, actor)
  });

  const update = service.command({
    operation: 'PATCH /submissions/{id}', target: req => req.params.id,
    authorize: (state, actor, req) => {
      if (actor.role !== 'student') forbidden();
      if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita parâmetros de consulta.');
      const { submission, assessment } = submissionFor(state, actor, req.params.id, { write: true });
      fields(req.body, ['expectedRevision', 'attachments'], ['expectedRevision']);
      validRevision(req.body.expectedRevision);
      if (req.body.attachments !== undefined) normalizeAttachmentShape(req.body.attachments);
      return { submission, assessment };
    },
    expected: req => [{ collection: 'submissions', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => {
      const { submission, assessment } = submissionFor(state, actor, req.params.id, { write: true });
      if (req.body.attachments !== undefined) {
        const attachments = normalizeAttachmentShape(req.body.attachments);
        for (const item of attachments) if (item.kind === 'file') files.validateWork(state, actor, item.fileId, assessment.id, submission.id, timestamp);
        submission.attachments = attachments;
      }
      return submission;
    },
    project: (submission, actor, state) => submissionDTO(state, submission, actor)
  });

  const submit = service.command({
    operation: 'POST /submissions/{id}/submit', target: req => req.params.id, requireIdempotency: true,
    authorize: (state, actor, req) => {
      if (actor.role !== 'student') forbidden();
      if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita parâmetros de consulta.');
      const { submission } = submissionFor(state, actor, req.params.id);
      fields(req.body, ['expectedRevision'], ['expectedRevision']);
      validRevision(req.body.expectedRevision);
      return submission;
    },
    expected: req => [{ collection: 'submissions', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => {
      const { submission, assessment } = submissionFor(state, actor, req.params.id);
      if (submission.submittedAt) return submission;
      workContext(state, actor, assessment.id);
      if (activityClosed(assessment, timestamp)) conflict('O prazo encerrou antes da confirmação. O rascunho foi preservado.');
      const attachments = normalizeAttachmentShape(submission.attachments ?? []);
      if (!attachments.length) invalid('Adicione pelo menos um arquivo ou link para enviar.');
      for (const item of attachments) if (item.kind === 'file') files.claimWork(state, actor, item.fileId, assessment.id, submission.id, timestamp);
      submission.attachments = attachments;
      submission.submittedAt = timestamp;
      submission.receipt = `receipt-${randomUUID()}`;
      return submission;
    },
    project: (submission, actor, state) => submissionDTO(state, submission, actor),
    replayProject: (dto, actor, state) => {
      const { submission } = submissionFor(state, actor, dto.id);
      return submissionDTO(state, submission, actor);
    }
  });

  const saveFeedback = service.command({
    operation: 'PATCH /submissions/{id}/feedback', target: req => req.params.id,
    authorize: (state, actor, req) => {
      if (actor.role === 'student') forbidden();
      if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita parâmetros de consulta.');
      const context = submissionFor(state, actor, req.params.id, { write: true });
      validateFeedbackCommand(req.body, context.assessment);
      return context;
    },
    expected: req => [{ collection: 'submissions', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => {
      const { submission, assessment } = submissionFor(state, actor, req.params.id, { write: true });
      validateFeedbackCommand(req.body, assessment);
      submission.feedbackDraft = { comment: req.body.comment.trim(), ...(req.body.grade !== null && { grade: req.body.grade }), authorId: actor.id, createdAt: timestamp };
      return submission;
    },
    project: (submission, actor, state) => submissionDTO(state, submission, actor)
  });

  const publishFeedback = service.command({
    operation: 'POST /submissions/{id}/publish-feedback', target: req => req.params.id, requireIdempotency: true,
    authorize: (state, actor, req) => {
      if (actor.role === 'student') forbidden();
      if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita parâmetros de consulta.');
      const context = submissionFor(state, actor, req.params.id, { write: true });
      fields(req.body, ['expectedRevision'], ['expectedRevision']);
      validRevision(req.body.expectedRevision);
      return context;
    },
    expected: req => [{ collection: 'submissions', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => {
      const { submission, assessment } = submissionFor(state, actor, req.params.id, { write: true });
      const source = submission.feedbackDraft ?? submission.feedbackPublished;
      if (feedbackIsEmpty(source)) invalid('Escreva um comentário ou informe uma nota antes de publicar.');
      const issue = validateWorkFeedback(assessment, source.comment, source.grade, true);
      if (issue) invalid(issue);
      const published = { comment: source.comment.trim(), ...(source.grade !== undefined && { grade: source.grade }), authorId: actor.id, createdAt: timestamp };
      submission.feedbackPublished = published;
      submission.feedbackHistory ??= [];
      submission.feedbackHistory.push(structuredClone(published));
      delete submission.feedbackDraft;
      return submission;
    },
    project: (submission, actor, state) => submissionDTO(state, submission, actor),
    replayProject: (dto, actor, state) => {
      const { submission } = submissionFor(state, actor, dto.id, { write: true });
      return submissionDTO(state, submission, actor);
    }
  });

  return {
    resolve(path) {
      if (path === '/submissions') return { methods: { GET: list, POST: prepare }, params: {} };
      const match = path.match(/^\/submissions\/([^/]{1,384})(?:\/(submit|feedback|publish-feedback))?$/);
      if (!match) return null;
      let id;
      try { id = decodeURIComponent(match[1]); } catch { return null; }
      if (!idPattern.test(id)) return null;
      const action = match[2];
      const methods = action === 'submit' ? { POST: submit } : action === 'feedback' ? { PATCH: saveFeedback } : action === 'publish-feedback' ? { POST: publishFeedback } : { GET: readItem, PATCH: update };
      return { methods, params: { id } };
    }
  };
}
