import { randomUUID } from 'node:crypto';
import { canAccessSubject, canManageSubject } from '../src/lib/access.ts';
import { createCommandService, HttpError } from './command-service.mjs';
import { fileDTO, visibleFile } from './file-service.mjs';

const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const invalid = message => fail(422, 'VALIDATION_ERROR', message ?? 'Confira os campos ou filtros do fórum.');
const missing = () => fail(404, 'NOT_FOUND', 'Recurso não encontrado.');
const forbidden = () => fail(403, 'FORBIDDEN', 'Seu acesso não permite esta operação.');
const alive = item => !!item && !item.deletedAt;
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function topicFor(state, actor, id) {
  const topic = state.topics.find(row => row.id === id && alive(row));
  if (!topic || !state.subjects.some(row => row.id === topic.subjectId && row.classId === topic.classId && alive(row)) || !canAccessSubject(state, actor, topic.subjectId)) missing();
  return topic;
}
function canPublish(state, actor, topic) {
  return !!state.classes.find(row => row.id === topic.classId && row.active && alive(row)) && canAccessSubject(state, actor, topic.subjectId);
}
function canWithdraw(actor, state, topic) {
  return actor.id === topic.authorId || canManageSubject(state, actor, topic.subjectId);
}
function projectReply(state, actor, reply) {
  const author = state.users.find(row => row.id === reply.authorId);
  return { id: reply.id, revision: reply.revision ?? 1, createdAt: reply.createdAt, updatedAt: reply.updatedAt ?? reply.createdAt, updatedBy: reply.updatedBy ?? reply.authorId, author: { id: reply.authorId, name: author?.name ?? 'Pessoa AJA' }, body: reply.body, voteCount: Object.keys(reply.votes ?? {}).length, votedByMe: !!reply.votes?.[actor.id], accepted: !!reply.accepted };
}
function projectTopic(state, actor, topic) {
  const author = state.users.find(row => row.id === topic.authorId);
  const attachment = topic.attachment?.id ? state.files.find(row => row.id === topic.attachment.id && alive(row)) : undefined;
  const replies = (topic.replies ?? []).filter(alive).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  return { id: topic.id, revision: topic.revision ?? 1, createdAt: topic.createdAt, updatedAt: topic.updatedAt ?? topic.createdAt, updatedBy: topic.updatedBy ?? topic.authorId, classId: topic.classId, subjectId: topic.subjectId, title: topic.title, body: topic.body, tags: topic.tags ?? [], target: topic.target ?? (topic.reference ? { type: 'question', id: topic.reference } : null), attachmentId: attachment?.id ?? null, author: { id: topic.authorId, name: author?.name ?? 'Pessoa AJA' }, replies: replies.map(reply => projectReply(state, actor, reply)), read: (topic.readBy ?? []).includes(actor.id), attachment: attachment ? fileDTO(attachment) : null, legacyReference: topic.reference ?? null, legacyAttachmentName: topic.attachmentName ?? null };
}
function fields(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) invalid();
}
function parseQuery(req) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  if ([...params.keys()].some(key => !['page', 'pageSize', 'sort', 'classId', 'subjectId', 'q', 'unread', 'solved'].includes(key) || params.getAll(key).length !== 1)) invalid();
  const page = Number(params.get('page') ?? 1), pageSize = Number(params.get('pageSize') ?? 20), sort = params.get('sort') ?? '-createdAt';
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !['createdAt', '-createdAt'].includes(sort)) invalid();
  for (const key of ['classId', 'subjectId']) if (params.has(key) && !safeId(params.get(key))) invalid();
  for (const key of ['unread', 'solved']) if (params.has(key) && !['true', 'false'].includes(params.get(key))) invalid();
  return { params, page, pageSize, sort };
}

export function createForumService(config, auth, files) {
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor });
  const list = service.read({ authorize: () => {}, select: (state, actor, req) => {
    const q = parseQuery(req), search = norm(q.params.get('q')?.trim());
    if (q.params.has('subjectId') && !canAccessSubject(state, actor, q.params.get('subjectId'))) missing();
    const rows = state.topics.filter(topic => alive(topic) && state.subjects.some(subject => subject.id === topic.subjectId && subject.classId === topic.classId && alive(subject)) && canAccessSubject(state, actor, topic.subjectId))
      .filter(topic => (!q.params.has('classId') || topic.classId === q.params.get('classId')) && (!q.params.has('subjectId') || topic.subjectId === q.params.get('subjectId')))
      .filter(topic => !search || norm(`${topic.title} ${topic.body} ${(topic.tags ?? []).join(' ')} ${(topic.replies ?? []).filter(alive).map(reply => reply.body).join(' ')}`).includes(search))
      .filter(topic => !q.params.has('unread') || (q.params.get('unread') === 'true') === !(topic.readBy ?? []).includes(actor.id))
      .filter(topic => !q.params.has('solved') || (q.params.get('solved') === 'true') === (topic.replies ?? []).some(reply => alive(reply) && reply.accepted));
    rows.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') * (q.sort.startsWith('-') ? -1 : 1) || a.id.localeCompare(b.id));
    return { items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map(row => projectTopic(state, actor, row)), page: q.page, pageSize: q.pageSize, total: rows.length };
  }, project: result => result });
  const detail = service.read({ authorize: () => {}, select: (state, actor, req) => {
    if (new URL(req.url, 'http://localhost').searchParams.size) invalid();
    const topic = topicFor(state, actor, req.params.id);
    const result = projectTopic(state, actor, topic);
    if (result.target) {
      if (result.target.type === 'material') {
        const material = state.materials.find(row => row.id === result.target.id && alive(row));
        const module = state.modules.find(row => row.id === material?.moduleId && alive(row));
        result.reference = module?.subjectId === topic.subjectId && canAccessSubject(state, actor, topic.subjectId) ? { title: material.title, preview: material.content.slice(0, 240), href: `/materiais?id=${encodeURIComponent(material.id)}` } : null;
      } else {
        const question = state.questions.find(row => row.id === result.target.id && alive(row) && row.origin !== 'author');
        result.reference = question ? { title: question.topic ?? question.statement.slice(0, 120), preview: question.statement.slice(0, 240), href: `/questoes?id=${encodeURIComponent(question.id)}` } : null;
      }
    }
    return result;
  }, project: value => value });
  const create = service.command({ operation: 'POST /topics', target: req => req.body?.subjectId ?? 'invalid', requireIdempotency: true, successStatus: 201,
    authorize: (state, actor, req) => {
      fields(req.body, ['classId', 'subjectId', 'title', 'body', 'tags', 'target', 'attachmentId'], ['classId', 'subjectId', 'title', 'body', 'tags', 'target', 'attachmentId']);
      const { classId, subjectId, title, body, tags, target, attachmentId } = req.body;
      if (!safeId(classId) || !safeId(subjectId) || !state.classes.some(row => row.id === classId && row.active && alive(row)) || !state.subjects.some(row => row.id === subjectId && row.classId === classId && alive(row)) || !canAccessSubject(state, actor, subjectId)) forbidden();
      if (typeof title !== 'string' || !title.trim() || title.length > 180 || typeof body !== 'string' || !body.trim() || body.length > 20000 || !Array.isArray(tags) || tags.length > 5 || tags.some(tag => typeof tag !== 'string' || tag.length > 40)) invalid();
      if (target !== null && (!target || !['question', 'material'].includes(target.type) || !safeId(target.id))) invalid();
      if (target?.type === 'material') { const material = state.materials.find(row => row.id === target.id && alive(row)); const module = state.modules.find(row => row.id === material?.moduleId && alive(row)); if (module?.subjectId !== subjectId) invalid(); }
      if (target?.type === 'question' && !state.questions.some(row => row.id === target.id && alive(row) && row.origin !== 'author')) invalid();
      if (attachmentId !== null) {
        const file = state.files.find(row => row.id === attachmentId);
        const replay = state.idempotency.some(row => row.actorId === actor.id && row.key === req.headers['idempotency-key'] && row.operation === 'POST /topics');
        const staged = file?.status === 'staged' && (file.contextId ?? file.parentId) === subjectId;
        const attachedReplay = replay && file?.status === 'attached' && file.parentType === 'topic';
        if (!file || file.purpose !== 'forum' || file.authorId !== actor.id || !(staged || attachedReplay)) forbidden();
      }
    },
    apply: (state, actor, req, { timestamp }) => {
      const input = req.body, id = `topic-${randomUUID()}`;
      const topic = { id, classId: input.classId, subjectId: input.subjectId, authorId: actor.id, title: input.title.trim(), body: input.body.trim(), tags: [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))], target: input.target, createdAt: timestamp, replies: [], readBy: [actor.id] };
      if (input.attachmentId) {
        const file = visibleFile(state, actor, input.attachmentId, timestamp);
        file.status = 'attached'; file.parentType = 'topic'; file.parentId = id; topic.attachment = { id: file.id, name: file.name, mime: file.mime, size: file.size };
      }
      state.topics.push(topic); return topic;
    }, project: (row, actor, state) => projectTopic(state, actor, row), replayProject: (dto, actor, state) => projectTopic(state, actor, topicFor(state, actor, dto.id))
  });
  const reply = service.command({ operation: 'POST /topics/{id}/replies', target: req => req.params.id, successStatus: 201, requireIdempotency: true,
    authorize: (state, actor, req) => { const topic = topicFor(state, actor, req.params.id); if (!canPublish(state, actor, topic)) forbidden(); fields(req.body, ['body'], ['body']); if (typeof req.body.body !== 'string' || !req.body.body.trim() || req.body.body.length > 20000) invalid(); },
    apply: (state, actor, req, { timestamp }) => { const topic = topicFor(state, actor, req.params.id); const row = { id: `reply-${randomUUID()}`, authorId: actor.id, body: req.body.body.trim(), createdAt: timestamp, updatedAt: timestamp, updatedBy: actor.id, revision: 1, votes: {}, accepted: false }; topic.replies ??= []; topic.replies.push(row); topic.readBy = [actor.id]; return topic; },
    project: (row, actor, state) => projectTopic(state, actor, row), replayProject: (dto, actor, state) => projectTopic(state, actor, topicFor(state, actor, dto.id))
  });
  const read = service.command({ operation: 'POST /topics/{id}/read', target: req => req.params.id,
    authorize: (state, actor, req) => { const topic = topicFor(state, actor, req.params.id); fields(req.body, []); if (!canPublish(state, actor, topic) && actor.role === 'student') forbidden(); },
    apply: (state, actor, req) => { const topic = topicFor(state, actor, req.params.id); topic.readBy = [...new Set([...(topic.readBy ?? []), actor.id])]; return topic; }, project: (row, actor, state) => projectTopic(state, actor, row), replayProject: (dto, actor, state) => projectTopic(state, actor, topicFor(state, actor, dto.id))
  });
  const solution = service.command({ operation: 'POST /topics/{id}/solution', target: req => req.params.id,
    authorize: (state, actor, req) => { const topic = topicFor(state, actor, req.params.id); if (!canPublish(state, actor, topic) || !(actor.id === topic.authorId || canManageSubject(state, actor, topic.subjectId))) forbidden(); fields(req.body, ['expectedRevision', 'replyId'], ['expectedRevision', 'replyId']); if (!Number.isInteger(req.body.expectedRevision) || ![null, undefined].includes(req.body.replyId) && !safeId(req.body.replyId)) invalid(); },
    expected: req => [{ collection: 'topics', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => { const topic = topicFor(state, actor, req.params.id), reply = req.body.replyId && topic.replies.find(row => row.id === req.body.replyId && alive(row)); if (req.body.replyId && !reply) missing(); for (const row of topic.replies) if (row.accepted !== (row === reply)) { row.accepted = row === reply; row.revision = (row.revision ?? 0) + 1; row.updatedAt = timestamp; row.updatedBy = actor.id; } return topic; },
    project: (row, actor, state) => projectTopic(state, actor, row), replayProject: (dto, actor, state) => projectTopic(state, actor, topicFor(state, actor, dto.id))
  });
  const withdrawTopic = service.command({ operation: 'POST /topics/{id}/withdraw', target: req => req.params.id,
    authorize: (state, actor, req) => { const topic = topicFor(state, actor, req.params.id); if (!canPublish(state, actor, topic) || !canWithdraw(actor, state, topic)) forbidden(); fields(req.body, ['expectedRevision'], ['expectedRevision']); },
    expected: req => [{ collection: 'topics', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, _actor, req, { timestamp }) => { const topic = topicFor(state, _actor, req.params.id); topic.deletedAt = timestamp; return topic; }, project: (row, actor, state) => projectTopic(state, actor, row), replayProject: () => missing()
  });
  const withdrawReply = service.command({ operation: 'POST /topics/{id}/replies/{replyId}/withdraw', target: req => `${req.params.id}:${req.params.replyId}`,
    authorize: (state, actor, req) => { const topic = topicFor(state, actor, req.params.id); if (!canPublish(state, actor, topic)) forbidden(); const reply = topic.replies.find(row => row.id === req.params.replyId && alive(row)); if (!reply) missing(); if (reply.authorId !== actor.id && !canManageSubject(state, actor, topic.subjectId)) forbidden(); fields(req.body, ['expectedRevision'], ['expectedRevision']); },
    expected: req => [{ collection: 'topics', id: req.params.id, revision: req.body?.expectedRevision }],
    apply: (state, actor, req, { timestamp }) => { const topic = topicFor(state, actor, req.params.id), row = topic.replies.find(item => item.id === req.params.replyId && alive(item)); if (!row) missing(); row.deletedAt = timestamp; row.accepted = false; row.revision = (row.revision ?? 0) + 1; row.updatedAt = timestamp; row.updatedBy = actor.id; state.audit.push({ id: randomUUID(), actorId: actor.id, action: 'delete', collection: 'forumReplies', targetId: row.id, createdAt: timestamp }); return topic; },
    project: (row, actor, state) => projectTopic(state, actor, row), replayProject: (dto, actor, state) => projectTopic(state, actor, topicFor(state, actor, dto.id))
  });
  const vote = service.command({ operation: 'POST /topics/{id}/replies/{replyId}/vote', target: req => `${req.params.id}:${req.params.replyId}`,
    authorize: (state, actor, req) => { const topic = topicFor(state, actor, req.params.id); if (!canPublish(state, actor, topic)) forbidden(); const reply = topic.replies.find(row => row.id === req.params.replyId && alive(row)); if (!reply) missing(); if (reply.authorId === actor.id) forbidden(); fields(req.body, ['voted'], ['voted']); if (typeof req.body.voted !== 'boolean') invalid(); },
    apply: (state, actor, req, { timestamp }) => { const topic = topicFor(state, actor, req.params.id), row = topic.replies.find(item => item.id === req.params.replyId && alive(item)); if (!!row.votes[actor.id] !== req.body.voted) { if (req.body.voted) row.votes[actor.id] = 1; else delete row.votes[actor.id]; row.revision = (row.revision ?? 0) + 1; row.updatedAt = timestamp; row.updatedBy = actor.id; } return topic; },
    project: (row, actor, state) => projectTopic(state, actor, row), replayProject: (dto, actor, state) => projectTopic(state, actor, topicFor(state, actor, dto.id))
  });
  return { resolve(path) {
    if (path === '/topics') return { methods: { GET: list, POST: create }, params: {} };
    let match = path.match(/^\/topics\/([^/]{1,384})(?:\/(replies(?:\/([^/]{1,384})(?:\/(vote|withdraw))?)?|read|solution|withdraw))?$/);
    if (!match) return null;
    let id, replyId; try { id = decodeURIComponent(match[1]); replyId = match[3] && decodeURIComponent(match[3]); } catch { return null; }
    if (!safeId(id) || replyId && !safeId(replyId)) return null;
    const params = { id, ...(replyId ? { replyId } : {}) };
    const suffix = match[2];
    const method = suffix === 'read' ? { POST: read } : suffix === 'solution' ? { POST: solution } : suffix === 'withdraw' ? { POST: withdrawTopic } : suffix === 'replies' ? { POST: reply } : match[4] === 'vote' ? { POST: vote } : match[4] === 'withdraw' ? { POST: withdrawReply } : { GET: detail };
    return { methods: method, params };
  } };
}
