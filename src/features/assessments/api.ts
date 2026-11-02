import type { SessionClient } from '../../providers/session-client.ts';
import type { Question } from '../../models/questions.ts';
import type { Subject, TrailModule } from '../../models/academic.ts';
import { HttpError } from '../../lib/http-client.ts';

export interface AssessmentSnapshot extends Omit<Question, 'image'> {
  origin: 'bank' | 'author';
  image?: { src: string; alt: string } | null;
}
export interface AssessmentBase {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  moduleId: string;
  title: string;
  description: string;
  kind: 'quiz' | 'work';
  maxGrade: number | null;
  deadline: string | null;
  required: boolean;
  allowLate: boolean;
  status: 'draft' | 'published';
  publishedAt: string | null;
}
export interface AssessmentStaff extends AssessmentBase {
  questionIds: string[];
  questions: AssessmentSnapshot[];
  hasSubmissions: boolean;
}
export interface AssessmentStudent extends Omit<AssessmentBase, 'status' | 'publishedAt'> {
  status: 'published';
  publishedAt: string;
  questionCount: number;
  assigned: boolean;
}
export type AssessmentRead = AssessmentStaff | AssessmentStudent;
export interface AssessmentPage { items: AssessmentRead[]; page: number; pageSize: number; total: number }
export type AssessmentQuestionEntry =
  | { source: 'bank'; questionId: string }
  | { source: 'authored'; clientKey: string; questionId: string | null; question: Omit<AssessmentSnapshot, 'id' | 'origin'> };
export interface AssessmentFields {
  moduleId: string;
  title: string;
  description: string;
  kind: 'quiz' | 'work';
  maxGrade: number | null;
  deadline: string | null;
  required: boolean;
  allowLate: boolean;
  questions: AssessmentQuestionEntry[];
  confirmResetDrafts?: boolean;
}
export type AssessmentCreate = Omit<AssessmentFields, 'confirmResetDrafts'>;
export type AssessmentEdit = Partial<AssessmentFields> & { expectedRevision: number };
export interface AssessmentSubject extends Subject {
  className: string;
  teachers: { id: string; name: string }[];
  canManageContent: boolean;
  hasUpdates: boolean;
  publicationIds: string[];
}
export interface AssessmentContext { modules: TrailModule[]; subjects: AssessmentSubject[] }
export interface AssessmentOverview extends AssessmentContext { assessments: AssessmentRead[] }

type Filters = { subjectId?: string; moduleId?: string; status?: 'draft' | 'published'; kind?: 'quiz' | 'work' };
type AssessmentClient = Pick<SessionClient, 'request'> & Partial<Pick<SessionClient, 'getSnapshot'>>;

export function createAssessmentsApi(client: AssessmentClient) {
  const sessionFence = (sessionKey?: string, signal?: AbortSignal) => () => {
    const state = client.getSnapshot?.();
    if (signal?.aborted || state && (state.status !== 'authenticated' || state.sessionKey !== sessionKey)) throw new HttpError('cancelled', 'A sessão desta consulta mudou ou a consulta foi cancelada.');
  };
  const currentSessionKey = () => client.getSnapshot?.().sessionKey;
  const pageParams = (page: number, filters: Filters = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: '100' });
    for (const key of ['subjectId', 'moduleId', 'status', 'kind'] as const) if (filters[key]) params.set(key, filters[key]!);
    return params;
  };
  const list = (filters: Filters, page: number, signal?: AbortSignal) => client.request<AssessmentPage>(`/assessments?${pageParams(page, filters)}`, { signal });
  const read = (id: string, signal?: AbortSignal) => client.request<AssessmentRead>(`/assessments/${encodeURIComponent(id)}`, { signal });
  const create = (fields: AssessmentCreate, intent: string, signal?: AbortSignal) => client.request<AssessmentStaff>('/assessments', { method: 'POST', json: fields, headers: { 'Idempotency-Key': intent }, ...(signal ? { signal } : {}) });
  const edit = (id: string, fields: Partial<AssessmentFields>, revision: number, signal?: AbortSignal) => client.request<AssessmentRead>(`/assessments/${encodeURIComponent(id)}`, { method: 'PATCH', json: { ...fields, expectedRevision: revision }, ...(signal ? { signal } : {}) });
  const publish = (id: string, revision: number, intent = crypto.randomUUID(), signal?: AbortSignal) => client.request<AssessmentRead>(`/assessments/${encodeURIComponent(id)}/publish`, { method: 'POST', json: { expectedRevision: revision }, headers: { 'Idempotency-Key': intent }, ...(signal ? { signal } : {}) });
  const readForSession = async (id: string, sessionKey: string | undefined, signal?: AbortSignal) => {
    const guard = sessionFence(sessionKey, signal); guard();
    const assessment = await read(id, signal); guard();
    return assessment;
  };
  const createFields = (fields: AssessmentFields): AssessmentCreate => Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'confirmResetDrafts')) as AssessmentCreate;

  async function all(filters: Filters = {}, signal?: AbortSignal, sessionKey = currentSessionKey()) {
    const guard = sessionFence(sessionKey, signal), items: AssessmentRead[] = [];
    for (let page = 1; ; page++) {
      guard(); const result = await list(filters, page, signal); guard();
      items.push(...result.items);
      if (items.length >= result.total || !result.items.length) return items;
    }
  }

  async function allModules(signal?: AbortSignal, sessionKey = currentSessionKey()) {
    const guard = sessionFence(sessionKey, signal), items: TrailModule[] = [];
    for (let page = 1; ; page++) {
      guard(); const result = await client.request<{ items: TrailModule[]; total: number }>(`/modules?page=${page}&pageSize=100&sort=order`, { signal }); guard();
      items.push(...result.items);
      if (items.length >= result.total || !result.items.length) return items;
    }
  }

  async function allSubjects(signal?: AbortSignal, sessionKey = currentSessionKey()) {
    const guard = sessionFence(sessionKey, signal), items: AssessmentSubject[] = [];
    for (let page = 1; ; page++) {
      guard(); const result = await client.request<{ items: AssessmentSubject[]; total: number }>(`/subjects?page=${page}&pageSize=100`, { signal }); guard();
      items.push(...result.items);
      if (items.length >= result.total || !result.items.length) return items;
    }
  }

  async function context(signal?: AbortSignal, sessionKey = currentSessionKey()): Promise<AssessmentContext> {
    const guard = sessionFence(sessionKey, signal); guard();
    const [modules, subjects] = await Promise.all([allModules(signal, sessionKey), allSubjects(signal, sessionKey)]);
    guard(); return { modules, subjects };
  }

  async function overview(filters: Filters = {}, signal?: AbortSignal, sessionKey = currentSessionKey()): Promise<AssessmentOverview> {
    const guard = sessionFence(sessionKey, signal); guard();
    const [assessments, pageContext] = await Promise.all([all(filters, signal, sessionKey), context(signal, sessionKey)]);
    guard(); return { ...pageContext, assessments };
  }

  async function builder(id: string | undefined, signal?: AbortSignal, sessionKey = currentSessionKey()) {
    const guard = sessionFence(sessionKey, signal); guard();
    const [pageContext, assessment] = await Promise.all([
      context(signal, sessionKey), id ? read(id, signal) : Promise.resolve(undefined)
    ]);
    guard(); return { ...pageContext, assessment };
  }

  async function saveAndPublish(input: { id?: string; revision: number; fields: AssessmentFields }, sessionKey: string | undefined, intent: string, onCreated?: (assessment: AssessmentStaff) => void | Promise<void>) {
    const guard = sessionFence(sessionKey); guard();
    let assessment: AssessmentRead;
    if (input.id) {
      assessment = await edit(input.id, input.fields, input.revision); guard();
    } else {
      assessment = await create(createFields(input.fields), intent); guard();
      await onCreated?.(assessment as AssessmentStaff); guard();
    }
    if (assessment.status === 'draft') { assessment = await publish(assessment.id, assessment.revision, `${intent}-publish`); guard(); }
    return assessment;
  }

  async function saveDraft(input: { id?: string; revision: number; fields: AssessmentFields }, sessionKey: string | undefined, intent: string, onCreated?: (assessment: AssessmentStaff) => void | Promise<void>) {
    const guard = sessionFence(sessionKey); guard();
    let assessment: AssessmentRead;
    if (input.id) assessment = await edit(input.id, input.fields, input.revision);
    else assessment = await create(createFields(input.fields), intent);
    guard();
    if (!input.id) { await onCreated?.(assessment as AssessmentStaff); guard(); }
    return assessment;
  }

  return { list, all, read, readForSession, create, edit, publish, context, overview, builder, saveAndPublish, saveDraft };
}
