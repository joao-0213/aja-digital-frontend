import { createHash, randomUUID } from 'node:crypto';
import { synchronous } from './synchronous.mjs';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

const fail = (status, code, message, details) => { throw new HttpError(status, code, message, details); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Policies/selectors are explicit trusted handlers, not arbitrary client recipes. */
export function createCommandService({ store, resolveActor, now = () => new Date().toISOString() }) {
  function actorFor(req, state) {
    const id = synchronous(resolveActor(req, state));
    const actor = state.users.find(user => user.id === id);
    if (!actor || actor.active === false || actor.deletedAt) fail(401, 'SESSION_REQUIRED', 'Entre novamente para continuar.');
    return actor;
  }
  function guard(handler, successStatus = 200) {
    return async (req, res) => {
      try { res.status(successStatus).json(await handler(req)); }
      catch (error) {
        const status = error.status ?? 500;
        const body = { code: error.code ?? 'INTERNAL_ERROR', message: error.status ? error.message : 'Não foi possível concluir a operação.', requestId: randomUUID() };
        if (error.details && status !== 401 && status !== 403) body.details = error.details;
        res.status(status).json({ error: body });
      }
    };
  }
  return {
    read({ authorize, select, project }) {
      return guard(req => store.transact(state => {
        const actor = actorFor(req, state);
        synchronous(authorize(state, actor, req));
        const record = synchronous(select(state, actor, req));
        if (!record) fail(404, 'NOT_FOUND', 'Recurso não encontrado.');
        return synchronous(project(structuredClone(record), actor, state));
      }));
    },
    command({ operation, target, authorize, expected = () => [], apply, project, replayProject, requireIdempotency = false, successStatus = 200 }) {
      return guard(req => store.transact(state => {
        const actor = actorFor(req, state);
        synchronous(authorize(state, actor, req));
        const targetId = synchronous(target(req));
        const key = req.headers['idempotency-key'];
        if (requireIdempotency && !key || key !== undefined && (typeof key !== 'string' || key.length < 8 || key.length > 128)) fail(422, 'VALIDATION_ERROR', 'Informe uma chave de operação válida.');
        if (key && typeof replayProject !== 'function') throw new Error('Idempotent handlers must provide an explicit replay projection.');
        const fingerprint = createHash('sha256').update(JSON.stringify(canonical(req.body ?? {}))).digest('hex');
        const timestamp = now();
        state.idempotency = state.idempotency.filter(item => Date.parse(item.expiresAt ?? new Date(Date.parse(item.createdAt) + 86400000).toISOString()) > Date.parse(timestamp));
        const previous = key && state.idempotency.find(item => item.actorId === actor.id && item.key === key);
        if (previous) {
          if (previous.operation !== operation || previous.targetId !== targetId || previous.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada para outra operação.');
          // Store only the original DTO, never a private raw command result.
          // Field-sensitive handlers can reduce/rebuild this DTO from current state.
          return synchronous(replayProject(structuredClone(previous.result), actor, state, { targetId, timestamp }));
        }
        for (const item of synchronous(expected(req))) {
          if (!Number.isInteger(item.revision) || item.revision < 1) fail(422, 'VALIDATION_ERROR', 'Informe a revisão do registro.');
          const record = state[item.collection]?.find(row => row.id === item.id);
          if (!record || record.deletedAt) fail(404, 'NOT_FOUND', 'Recurso não encontrado.');
          if (record.revision !== item.revision) fail(409, 'REVISION_CONFLICT', 'O registro foi alterado. Confira a versão atual.', { currentRevision: record.revision });
        }
        const before = structuredClone(state);
        const result = synchronous(apply(state, actor, req, { timestamp }));
        for (const [collection, rows] of Object.entries(state)) {
          if (!Array.isArray(rows) || ['audit', 'idempotency'].includes(collection)) continue;
          for (const row of rows) {
            const old = before[collection]?.find(value => value.id === row.id);
            if (!equal(old, row)) {
              row.revision = (old?.revision ?? 0) + 1;
              row.updatedAt = timestamp;
              row.updatedBy = actor.id;
              state.audit.push({ id: randomUUID(), actorId: actor.id, action: !old ? 'create' : row.deletedAt ? 'delete' : 'update', collection, targetId: row.id, createdAt: timestamp });
            }
          }
        }
        const response = synchronous(project(result, actor, state));
        if (key) state.idempotency.push({ id: randomUUID(), actorId: actor.id, actorRole: actor.role, key, operation, targetId, fingerprint, result: structuredClone(response), createdAt: timestamp, expiresAt: new Date(Date.parse(timestamp) + 86400000).toISOString() });
        return response;
      }), successStatus);
    }
  };
}
