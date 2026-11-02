import { createCommandService, HttpError } from './command-service.mjs';

const invalid = () => { throw new HttpError(422, 'VALIDATION_ERROR', 'Confira os filtros ou a resposta informada.'); };
const missing = () => { throw new HttpError(404, 'NOT_FOUND', 'Questão indisponível.'); };
const visible = q => q && q.origin !== 'author' && !q.deletedAt;
function dto(q, state) {
  const image = q.image;
  const file = state.files.find(f => f.purpose === 'question' && f.parentId === q.id && f.status === 'attached' && !f.deletedAt && image?.src === `/api/v1/files/${encodeURIComponent(f.id)}/content`);
  const staticImage = typeof image?.src === 'string' && /^\/questions\/[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/.test(image.src);
  return { id: q.id, subject: q.subject, topic: q.topic, difficulty: q.difficulty, institution: q.institution, year: q.year, statement: q.statement, options: q.options, ...((file || staticImage) && typeof image?.alt === 'string' && image.alt.trim() ? { image: { src: image.src, alt: image.alt } } : {}) };
}
const normalized = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const lookup = (state, id) => state.questions.find(q => q.id === id && visible(q)) ?? missing();
const noQuery = req => { if (new URL(req.url, 'http://localhost').searchParams.size) invalid(); };

export function createQuestionService(config, auth) {
  const service = createCommandService({ store: config.store, resolveActor: auth.resolveActor });
  const read = select => service.read({ authorize: () => {}, select, project: value => value });
  const list = read((state, _actor, req) => {
    const p = new URL(req.url, 'http://localhost').searchParams;
    if ([...p.keys()].some(k => !['page', 'pageSize', 'sort', 'q', 'subject', 'topic', 'difficulty', 'institution', 'year'].includes(k) || p.getAll(k).length !== 1)) invalid();
    const page = Number(p.get('page') ?? 1), pageSize = Number(p.get('pageSize') ?? 20), sort = p.get('sort') ?? 'id';
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !['id', '-id', 'createdAt', '-createdAt'].includes(sort) || p.has('difficulty') && !['easy', 'medium', 'hard'].includes(p.get('difficulty')) || p.has('year') && (!/^\d+$/.test(p.get('year')) || !Number.isSafeInteger(Number(p.get('year'))))) invalid();
    const rows = state.questions.filter(q => visible(q) && ['subject', 'topic', 'difficulty', 'institution'].every(k => !p.has(k) || q[k] === p.get(k)) && (!p.has('year') || q.year === Number(p.get('year'))) && (!p.has('q') || normalized(`${q.statement} ${q.topic}`).includes(normalized(p.get('q').trim()))));
    const desc = sort.startsWith('-'), field = desc ? sort.slice(1) : sort;
    rows.sort((a, b) => ((a[field] ?? '').localeCompare(b[field] ?? '') * (desc ? -1 : 1)) || a.id.localeCompare(b.id));
    return { items: rows.slice((page - 1) * pageSize, page * pageSize).map(q => dto(q, state)), page, pageSize, total: rows.length };
  });
  const detail = read((state, _actor, req) => { noQuery(req); return dto(lookup(state, req.params.id), state); });
  const practice = read((state, _actor, req) => {
    noQuery(req); const q = lookup(state, req.params.id), body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Number.isInteger(body.choice) || body.choice < 0 || body.choice >= q.options.length) invalid();
    return { questionId: q.id, choice: body.choice, correct: q.correct, isCorrect: body.choice === q.correct, explanation: q.explanation };
  });
  return { resolve(path) {
    if (path === '/questions') return { methods: { GET: list }, params: {} };
    const match = path.match(/^\/questions\/([^/]{1,384})(?:\/(practice))?$/); if (!match) return null;
    let id; try { id = decodeURIComponent(match[1]); } catch { return null; }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) return null;
    return { methods: match[2] ? { POST: practice } : { GET: detail }, params: { id } };
  } };
}
