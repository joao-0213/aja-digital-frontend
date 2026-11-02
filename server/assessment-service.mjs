import { randomUUID } from 'node:crypto';
import { hasDelivery } from '../src/lib/activities.ts';
import { canAccessSubject, canManageSubject } from '../src/lib/access.ts';
import { isAssessmentAssigned } from '../src/lib/enrollment.ts';
import { validateComposition } from '../src/lib/question-composition.ts';
import { createCommandService, HttpError } from './command-service.mjs';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const invalid = (message = 'Confira os campos da atividade e das questões.') => fail(422, 'VALIDATION_ERROR', message);
const missing = () => fail(404, 'NOT_FOUND', 'Atividade indisponível.');
const forbidden = () => fail(403, 'FORBIDDEN', 'Seu vínculo não permite alterar esta atividade.');
const conflict = (message, details) => { throw new HttpError(409, 'BUSINESS_CONFLICT', message, details); };
const alive = record => !!record && !record.deletedAt;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function fields(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) invalid();
}

function validId(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) invalid('Informe um identificador válido.');
  return value;
}

function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) invalid(`Confira ${label}.`);
  return required ? value.trim() : value;
}

function deadline(value) {
  if (value === null) return '';
  if (typeof value !== 'string' || value.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) invalid('Informe uma data e horário válidos com fuso de Brasília.');
  return value;
}

function deadlineDTO(value) { return value ? new Date(value).toISOString() : null; }
function deadlineTimeInSaoPaulo(value) {
  if (!value) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  const milliseconds = String(new Date(value).getUTCMilliseconds()).padStart(3, '0');
  return `${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}`;
}

function listQuery(req) {
  const values = new URL(req.url, 'http://localhost').searchParams;
  const allowed = ['page', 'pageSize', 'sort', 'moduleId', 'subjectId', 'status', 'kind'];
  if ([...values.keys()].some(key => !allowed.includes(key) || values.getAll(key).length !== 1)) invalid('Confira os filtros informados.');
  const page = Number(values.get('page') ?? 1), pageSize = Number(values.get('pageSize') ?? 20), sort = values.get('sort') ?? 'id';
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !['id', '-id'].includes(sort)) invalid('Confira a paginação e a ordenação.');
  if (values.has('moduleId')) validId(values.get('moduleId'));
  if (values.has('subjectId')) validId(values.get('subjectId'));
  if (values.has('status') && !['draft', 'published'].includes(values.get('status'))) invalid('Confira o estado da atividade.');
  if (values.has('kind') && !['quiz', 'work'].includes(values.get('kind'))) invalid('Confira a modalidade da atividade.');
  return { values, page, pageSize, sort };
}

function moduleFor(state, actor, id, write = false) {
  const module = state.modules.find(row => row.id === id && alive(row));
  if (!module) missing();
  const subject = state.subjects.find(row => row.id === module.subjectId && alive(row));
  if (!subject) missing();
  const allowed = write ? canManageSubject(state, actor, subject.id) : canAccessSubject(state, actor, subject.id);
  if (!allowed) { if (write) forbidden(); missing(); }
  return { module, subject };
}

function assessmentFor(state, actor, id, write = false) {
  const assessment = state.assessments.find(row => row.id === id && alive(row));
  if (!assessment) missing();
  const context = moduleFor(state, actor, assessment.moduleId, write);
  if (actor.role === 'student' && assessment.status !== 'published') missing();
  return { assessment, ...context };
}

function publicAssessment(row, assigned) {
  const module = row.module;
  const assessment = row.assessment;
  return {
    id: assessment.id, revision: assessment.revision ?? 1,
    createdAt: assessment.createdAt ?? assessment.updatedAt, updatedAt: assessment.updatedAt ?? assessment.createdAt,
    updatedBy: assessment.updatedBy ?? assessment.authorId, moduleId: assessment.moduleId,
    title: assessment.title, description: assessment.description, kind: assessment.kind ?? 'quiz',
    maxGrade: assessment.maxGrade ?? null, deadline: deadlineDTO(assessment.deadline), required: assessment.required !== false,
    allowLate: !!assessment.allowLate, status: 'published', publishedAt: assessment.publishedAt ?? assessment.updatedAt,
    questionCount: (assessment.questionIds ?? []).length, assigned: !!assigned
  };
}

function resolvedQuestion(question) {
  return {
    id: question.id, origin: question.origin === 'author' ? 'author' : 'bank', subject: question.subject,
    topic: question.topic, difficulty: question.difficulty, institution: question.institution, year: question.year,
    statement: question.statement, options: [...question.options], image: question.image ? { src: question.image.src, alt: question.image.alt } : null,
    correct: question.correct, explanation: question.explanation
  };
}

function staffAssessment(row, state) {
  const assessment = row.assessment;
  return {
    id: assessment.id, revision: assessment.revision ?? 1,
    createdAt: assessment.createdAt ?? assessment.updatedAt, updatedAt: assessment.updatedAt ?? assessment.createdAt,
    updatedBy: assessment.updatedBy ?? assessment.authorId, moduleId: assessment.moduleId,
    title: assessment.title, description: assessment.description, kind: assessment.kind ?? 'quiz',
    maxGrade: assessment.maxGrade ?? null, deadline: deadlineDTO(assessment.deadline), required: assessment.required !== false,
    allowLate: !!assessment.allowLate, status: assessment.status, publishedAt: assessment.publishedAt ?? null,
    questionIds: [...(assessment.questionIds ?? [])],
    questions: (assessment.questions ?? []).map(resolvedQuestion),
    hasSubmissions: hasDelivery(state, assessment.id)
  };
}

function projectAssessment(state, actor, assessment) {
  const context = moduleFor(state, actor, assessment.moduleId);
  if (actor.role === 'student') return publicAssessment({ assessment, module: context.module }, isAssessmentAssigned(state, assessment, actor.id));
  return staffAssessment({ assessment, module: context.module }, state);
}

function authoredSnapshot(value, id) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const allowed = ['subject', 'topic', 'difficulty', 'institution', 'year', 'statement', 'options', 'image', 'correct', 'explanation'];
  fields(value, allowed, allowed);
  if (!['easy', 'medium', 'hard'].includes(value.difficulty) || !Number.isSafeInteger(value.year) || value.year < 0 || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 20 || !Number.isInteger(value.correct) || value.correct < 0 || value.correct >= value.options.length) invalid('Confira as alternativas e o gabarito da questão autoral.');
  const question = {
    id, origin: 'author', subject: text(value.subject, 'a disciplina da questão', 120, true),
    topic: text(value.topic, 'o assunto da questão', 160, true), difficulty: value.difficulty,
    institution: text(value.institution, 'a instituição da questão', 120, true), year: value.year,
    statement: text(value.statement, 'o enunciado', 10000, true), options: value.options.map(option => text(option, 'as alternativas', 2000, true)),
    correct: value.correct, explanation: text(value.explanation, 'a explicação do gabarito', 10000, true)
  };
  if (value.image !== null) {
    if (!value.image || typeof value.image !== 'object' || Array.isArray(value.image) || Object.keys(value.image).some(key => !['src', 'alt'].includes(key)) || typeof value.image.src !== 'string' || !/^\/questions\/[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/.test(value.image.src) || typeof value.image.alt !== 'string' || !value.image.alt.trim()) invalid('Use uma imagem do acervo validado com descrição.');
    question.image = { src: value.image.src, alt: value.image.alt.trim() };
  }
  return question;
}

function snapshotQuestions(state, entries, current) {
  if (!Array.isArray(entries) || entries.length > 100) invalid('Informe uma lista de até 100 questões ordenadas.');
  const saved = current?.questions ?? [];
  const ids = [];
  const questions = [];
  const clientKeys = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid();
    if (entry.source === 'bank') {
      fields(entry, ['source', 'questionId'], ['source', 'questionId']);
      const id = validId(entry.questionId);
      if (ids.includes(id)) invalid('Não repita questões na composição.');
      const previous = saved.find(question => question.id === id && question.origin !== 'author');
      const question = previous ?? state.questions.find(item => item.id === id && item.origin !== 'author' && !item.deletedAt);
      if (!question) missing();
      ids.push(id); questions.push(structuredClone({ ...question, origin: 'bank' }));
      continue;
    }
    if (entry.source !== 'authored') invalid();
    fields(entry, ['source', 'clientKey', 'questionId', 'question'], ['source', 'clientKey', 'questionId', 'question']);
    const clientKey = validId(entry.clientKey);
    if (clientKeys.has(clientKey)) invalid('Não repita chaves de questão autoral.');
    clientKeys.add(clientKey);
    let id;
    if (entry.questionId === null) id = `author-${randomUUID()}`;
    else {
      id = validId(entry.questionId);
      if (!saved.some(question => question.id === id && question.origin === 'author')) invalid('A questão autoral não pertence a esta atividade.');
    }
    if (ids.includes(id)) invalid('Não repita questões na composição.');
    ids.push(id); questions.push(authoredSnapshot(entry.question, id));
  }
  try { validateComposition(questions, ids); }
  catch (error) { invalid(error.message); }
  return { ids, questions };
}

function activityFields(body, create = false) {
  const allowed = ['moduleId', 'title', 'description', 'kind', 'maxGrade', 'deadline', 'required', 'allowLate', 'questions', 'expectedRevision', 'confirmResetDrafts'];
  fields(body, allowed, create ? ['moduleId', 'title', 'description', 'kind', 'maxGrade', 'deadline', 'required', 'allowLate', 'questions'] : ['expectedRevision']);
  if (create && ('expectedRevision' in body || 'confirmResetDrafts' in body)) invalid();
  if ('expectedRevision' in body && (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1)) invalid('Informe a revisão atual da atividade.');
  if ('confirmResetDrafts' in body && typeof body.confirmResetDrafts !== 'boolean') invalid();
  const next = {};
  for (const key of ['moduleId', 'title', 'description', 'kind', 'required', 'allowLate']) if (key in body) next[key] = body[key];
  if ('moduleId' in next) validId(next.moduleId);
  if ('title' in next) next.title = text(next.title, 'o título', 150, true);
  if ('description' in next) next.description = text(next.description, 'as orientações', 10000);
  if ('kind' in next && !['quiz', 'work'].includes(next.kind)) invalid('Selecione questionário ou entrega de trabalho.');
  if ('required' in next && typeof next.required !== 'boolean' || 'allowLate' in next && typeof next.allowLate !== 'boolean') invalid();
  if ('maxGrade' in body) {
    if (body.maxGrade !== null && (typeof body.maxGrade !== 'number' || !Number.isFinite(body.maxGrade) || body.maxGrade <= 0 || body.maxGrade > 10000)) invalid('Informe uma nota máxima positiva.');
    next.maxGrade = body.maxGrade ?? undefined;
  }
  if ('deadline' in body) next.deadline = deadline(body.deadline);
  if ('questions' in body) next.composition = null;
  return next;
}

function normalizeAssessmentFields(state, actor, body, current) {
  const next = activityFields(body, !current);
  const moduleId = next.moduleId ?? current?.moduleId;
  const { module } = moduleFor(state, actor, moduleId, true);
  const kind = next.kind ?? current?.kind ?? 'quiz';
  const maxGrade = Object.hasOwn(next, 'maxGrade') ? next.maxGrade : current?.maxGrade;
  const deadlineValue = Object.hasOwn(next, 'deadline') ? next.deadline : current?.deadline ?? '';
  const allowLate = Object.hasOwn(next, 'allowLate') ? next.allowLate : !!current?.allowLate;
  if (allowLate && !deadlineValue) invalid('Aceitar atraso exige definir um prazo.');
  if (kind === 'quiz' && maxGrade !== undefined) invalid('Questionário usa um ponto por questão, sem nota máxima de trabalho.');
  if (kind === 'work' && Object.hasOwn(next, 'questions') && body.questions.length) invalid('Entrega de trabalho não contém questões.');
  const composition = Object.hasOwn(body, 'questions') ? snapshotQuestions(state, body.questions, current) : undefined;
  const questionIds = composition?.ids ?? [...(current?.questionIds ?? [])];
  const questions = composition?.questions ?? structuredClone(current?.questions ?? []);
  if (kind === 'quiz' && !questionIds.length) invalid('Adicione pelo menos uma questão ao questionário.');
  if (kind === 'work' && questionIds.length) invalid('Entrega de trabalho não contém questões.');
  return {
    module, moduleId, title: next.title ?? current?.title, description: next.description ?? current?.description,
    kind, maxGrade, deadline: deadlineValue, required: Object.hasOwn(next, 'required') ? next.required : current?.required !== false,
    allowLate, questionIds, questions, changedQuestions: !equal(current?.questionIds ?? [], questionIds) || !equal((current?.questions ?? []).map(resolvedQuestion), questions.map(resolvedQuestion))
  };
}

function hasSubmittedDelivery(state, id) {
  return state.attempts.some(row => row.assessmentId === id && row.submittedAt && !row.deletedAt) || (state.submissions ?? []).some(row => row.assessmentId === id && row.submittedAt && !row.deletedAt);
}

export function createAssessmentService(config, auth) {
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor, now: config.now });
  const routes = new Map();
  const add = (path, method, handler) => { const methods = routes.get(path) ?? {}; methods[method] = handler; routes.set(path, methods); };
  const read = (path, authorize, select) => add(path, 'GET', service.read({ authorize, select, project: (value, actor, state) => value?.items ? { ...value, items: value.items.map(item => projectAssessment(state, actor, item.assessment)) } : projectAssessment(state, actor, value) }));

  read('/assessments', (state, actor, req) => {
    const query = listQuery(req), { values } = query;
    if (values.has('subjectId')) {
      const subject = state.subjects.find(row => row.id === values.get('subjectId') && alive(row));
      if (!subject || !canAccessSubject(state, actor, subject.id)) missing();
    }
    if (values.has('moduleId')) moduleFor(state, actor, values.get('moduleId'));
    if (values.has('subjectId') && values.has('moduleId') && state.modules.find(row => row.id === values.get('moduleId'))?.subjectId !== values.get('subjectId')) invalid('O módulo não pertence à disciplina informada.');
  }, (state, actor, req) => {
    const query = listQuery(req), { values, page, pageSize, sort } = query;
    const accessible = new Set(state.subjects.filter(subject => alive(subject) && canAccessSubject(state, actor, subject.id)).map(subject => subject.id));
    const modules = new Map(state.modules.filter(row => alive(row) && accessible.has(row.subjectId)).map(row => [row.id, row]));
    const rows = state.assessments.filter(row => alive(row) && modules.has(row.moduleId) && (actor.role !== 'student' || row.status === 'published') && (!values.has('moduleId') || row.moduleId === values.get('moduleId')) && (!values.has('subjectId') || modules.get(row.moduleId).subjectId === values.get('subjectId')) && (!values.has('status') || row.status === values.get('status')) && (!values.has('kind') || (row.kind ?? 'quiz') === values.get('kind')));
    const desc = sort.startsWith('-'), field = desc ? sort.slice(1) : sort;
    rows.sort((a, b) => {
      const left = a[field] ?? '', right = b[field] ?? '';
      const primary = field === 'id' ? String(left).localeCompare(String(right)) : String(left).localeCompare(String(right));
      return primary * (desc ? -1 : 1) || a.id.localeCompare(b.id);
    });
    const items = rows.slice((page - 1) * pageSize, page * pageSize).map(assessment => ({ assessment, module: modules.get(assessment.moduleId) }));
    return { items, page, pageSize, total: rows.length };
  });

  read('/assessments/{id}', (state, actor, req) => { assessmentFor(state, actor, req.params.id); }, (state, actor, req) => {
    if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.');
    return assessmentFor(state, actor, req.params.id).assessment;
  });

  add('/assessments', 'POST', service.command({
    operation: 'POST /assessments', target: req => req.body?.moduleId, requireIdempotency: true, successStatus: 201,
    authorize: (state, actor, req) => {
      if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.');
      const moduleId = validId(req.body?.moduleId); moduleFor(state, actor, moduleId, true);
      activityFields(req.body, true);
    },
    apply: (state, actor, req, { timestamp }) => {
      const input = normalizeAssessmentFields(state, actor, req.body, undefined);
      const assessment = {
        id: `assessment-${randomUUID()}`, moduleId: input.moduleId, title: input.title, description: input.description,
        kind: input.kind, ...(input.maxGrade !== undefined && { maxGrade: input.maxGrade }), deadline: input.deadline,
        required: input.required, allowLate: input.allowLate, questionIds: input.questionIds, questions: input.questions,
        status: 'draft', authorId: actor.id, createdAt: timestamp
      };
      state.assessments.push(assessment);
      return assessment;
    },
    project: (assessment, actor, state) => projectAssessment(state, actor, assessment),
    replayProject: (dto, actor, state) => {
      const row = state.assessments.find(item => item.id === dto.id && alive(item));
      if (!row) missing();
      assessmentFor(state, actor, row.id, true);
      return projectAssessment(state, actor, row);
    }
  }));

  add('/assessments/{id}', 'PATCH', service.command({
    operation: 'PATCH /assessments/{id}', target: req => req.params.id,
    authorize: (state, actor, req) => {
      const current = assessmentFor(state, actor, req.params.id, true).assessment;
      if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.');
      activityFields(req.body, false);
      if ('moduleId' in (req.body ?? {})) moduleFor(state, actor, validId(req.body.moduleId), true);
      return current;
    },
    expected: req => [{ collection: 'assessments', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => {
      const current = state.assessments.find(row => row.id === req.params.id && alive(row)) ?? missing();
      const input = normalizeAssessmentFields(state, actor, req.body, current);
      const delivered = hasSubmittedDelivery(state, current.id);
      if (delivered) {
        const structuralChange = input.moduleId !== current.moduleId || input.kind !== (current.kind ?? 'quiz') || input.required !== (current.required !== false) || input.allowLate !== !!current.allowLate || !equal(input.maxGrade ?? null, current.maxGrade ?? null) || input.questions.length !== (current.questions ?? []).length || !equal(input.questionIds, current.questionIds) || input.changedQuestions;
        if (structuralChange || !!input.deadline !== !!current.deadline || deadlineTimeInSaoPaulo(input.deadline) !== deadlineTimeInSaoPaulo(current.deadline)) conflict('Já existe uma entrega. Preserve a modalidade, o módulo, as condições, as questões, a presença e o horário do prazo; título, orientações e a data do prazo atual podem mudar.');
      }
      if (!delivered && input.changedQuestions && req.body.confirmResetDrafts !== true) conflict('Confirme a alteração das questões para reiniciar os rascunhos existentes.');
      if (input.changedQuestions) {
        for (const attempt of state.attempts.filter(row => row.assessmentId === current.id && !row.submittedAt && !row.deletedAt)) {
          attempt.answers = {}; attempt.questionOrder = [...input.questionIds]; attempt.questions = structuredClone(input.questions); attempt.questionsUpdatedAt = timestamp;
        }
      }
      Object.assign(current, {
        moduleId: input.moduleId, title: input.title, description: input.description, kind: input.kind,
        ...(input.maxGrade === undefined ? { maxGrade: undefined } : { maxGrade: input.maxGrade }), deadline: input.deadline,
        required: input.required, allowLate: input.allowLate, questionIds: input.questionIds, questions: input.questions
      });
      if (current.status === 'published') current.publishedAt ??= timestamp;
      return current;
    },
    project: (assessment, actor, state) => projectAssessment(state, actor, assessment),
    replayProject: (dto, actor, state) => {
      const row = state.assessments.find(item => item.id === dto.id && alive(item));
      if (!row) missing();
      assessmentFor(state, actor, row.id, true);
      return projectAssessment(state, actor, row);
    }
  }));

  add('/assessments/{id}/publish', 'POST', service.command({
    operation: 'POST /assessments/{id}/publish', target: req => req.params.id, requireIdempotency: true,
    authorize: (state, actor, req) => {
      assessmentFor(state, actor, req.params.id, true);
      if (new URL(req.url, 'http://localhost').searchParams.size) invalid('Esta operação não aceita filtros.');
      fields(req.body, ['expectedRevision'], ['expectedRevision']);
      if (!Number.isSafeInteger(req.body.expectedRevision) || req.body.expectedRevision < 1) invalid('Informe a revisão atual da atividade.');
    },
    expected: req => [{ collection: 'assessments', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => {
      const current = state.assessments.find(row => row.id === req.params.id && alive(row)) ?? missing();
      if (current.status === 'published') conflict('Esta atividade já foi publicada. Edite os campos permitidos no registro atual.');
      moduleFor(state, actor, current.moduleId, true);
      if (!current.title?.trim() || current.kind === 'quiz' && !current.questionIds?.length || current.kind === 'work' && current.questionIds?.length) invalid('Confira o título e a composição antes de publicar.');
      try { validateComposition(current.questions ?? [], current.questionIds ?? []); }
      catch (error) { invalid(error.message); }
      current.status = 'published'; current.publishedAt = timestamp;
      return current;
    },
    project: (assessment, actor, state) => projectAssessment(state, actor, assessment),
    replayProject: (dto, actor, state) => {
      const row = state.assessments.find(item => item.id === dto.id && alive(item));
      if (!row) missing();
      assessmentFor(state, actor, row.id, true);
      return projectAssessment(state, actor, row);
    }
  }));

  return {
    resolve(path) {
      if (routes.has(path)) return { methods: routes.get(path), params: {}, acceptsQuery: path === '/assessments' };
      const match = path.match(/^\/assessments\/([^/]{1,384})(?:\/(publish))?$/);
      if (!match) return null;
      let id; try { id = decodeURIComponent(match[1]); } catch { return null; }
      if (!idPattern.test(id)) return null;
      const template = `/assessments/{id}${match[2] ? '/publish' : ''}`;
      return routes.has(template) ? { methods: routes.get(template), params: { id }, acceptsQuery: false } : null;
    }
  };
}
