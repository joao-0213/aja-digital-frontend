import type { SessionClient } from '../../providers/session-client.ts';
import type { Question } from '../../models/questions.ts';
import type { Subject, TrailModule } from '../../models/academic.ts';
import { HttpError, type HttpRequestOptions } from '../../lib/http-client.ts';

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
export type AttemptQuestionPrompt = Omit<AssessmentSnapshot, 'correct' | 'explanation' | 'origin'>;
export type AttemptQuestionResult = Omit<AssessmentSnapshot, 'origin'>;
export interface AttemptStudent {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  assessmentId: string;
  assessmentTitle: string;
  userId: string;
  studentName: string;
  startedAt: string;
  submittedAt: string | null;
  answers: Record<string, number | null>;
  questionOrder: string[];
  questions: AttemptQuestionPrompt[];
  questionsUpdatedAt: string | null;
}
export interface AttemptStaff extends Omit<AttemptStudent, 'questions'> { questions: AttemptQuestionPrompt[] }
export type AttemptRead = AttemptStudent | AttemptStaff;
export interface AttemptPage { items: AttemptRead[]; page: number; pageSize: number; total: number }
export interface AttemptResult {
  attempt: AttemptStudent;
  receipt: { id: string; resourceId: string; submittedAt: string };
  score: number;
  maxScore: number;
  questions: AttemptQuestionResult[];
}
export type SubmissionAttachment =
  | { kind: 'file'; fileId: string; name: string }
  | { kind: 'link'; name: string; url: string };
export interface WorkFeedback {
  comment: string;
  grade: number | null;
  author: { id: string; name: string };
  createdAt: string;
}
export interface SubmissionReceipt { id: string; resourceId: string; submittedAt: string }
interface SubmissionBase {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  assessmentId: string;
  userId: string;
  attachments: SubmissionAttachment[];
  submittedAt: string | null;
  receipt: SubmissionReceipt | null;
  feedbackPublished: WorkFeedback | null;
  feedbackUpdated: boolean;
}
export interface SubmissionStudent extends SubmissionBase {}
export interface SubmissionStaff extends SubmissionBase {
  studentName: string;
  feedbackDraft: WorkFeedback | null;
  feedbackHistory: WorkFeedback[];
}
export type SubmissionRead = SubmissionStudent | SubmissionStaff;
export interface SubmissionPage { items: SubmissionRead[]; page: number; pageSize: number; total: number }
export interface WorkFileMetadata {
  id: string;
  name: string;
  size: number;
  mime: string;
  purpose: 'work';
  parentId: string;
  status: 'staged' | 'attached';
  downloadUrl: string;
}
type SubmissionFilters = { assessmentId?: string; studentId?: string };
export interface FrozenWorkSubmitIntent { revision: number; key: string }

/** Keeps an ambiguous work submission bound to the exact revision and key. */
export function createWorkSubmitCommand(makeKey: () => string = () => crypto.randomUUID()) {
  let intent: FrozenWorkSubmitIntent | null = null;
  let sending = 0;
  return {
    current: () => intent ? { ...intent } : null,
    freeze(revision: number) {
      if (intent) return { ...intent };
      if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError('A revisão do rascunho salvo é inválida.');
      intent = { revision, key: makeKey() };
      return { ...intent };
    },
    acknowledgeRevisionConflict(revision: number) {
      if (!intent) return;
      if (sending) throw new Error('Aguarde a confirmação do envio atual antes de conferir a revisão.');
      if (!Number.isSafeInteger(revision) || revision <= intent.revision) throw new RangeError('Confira uma revisão mais recente antes de iniciar outra intenção.');
      intent = null;
    },
    async send<T>(run: (frozen: FrozenWorkSubmitIntent) => Promise<T>) {
      if (!intent) throw new Error('Congele a revisão salva antes de enviar.');
      sending++;
      try { return await run({ ...intent }); }
      finally { sending--; }
    }
  };
}
export interface FrozenAttemptSubmitIntent { revision: number; key: string }

/** Freeze the submit body and key after the final autosave; retries replay only that POST. */
export function createAttemptSubmitCommand(makeKey: () => string = () => crypto.randomUUID()) {
  let intent: FrozenAttemptSubmitIntent | null = null;
  let preparing: Promise<FrozenAttemptSubmitIntent> | null = null;
  let pendingSends = 0;
  return {
    current: () => intent ? { ...intent } : null,
    acknowledgeRevisionConflict(reviewedRevision: number) {
      if (!intent) return;
      if (preparing || pendingSends > 0) throw new Error('Wait for the current submit request before reviewing its revision.');
      if (!Number.isSafeInteger(reviewedRevision) || reviewedRevision <= intent.revision) throw new RangeError('The reviewed revision must be newer than the frozen submit revision.');
      intent = null;
    },
    async submit<T>(prepare: () => Promise<number>, send: (frozen: FrozenAttemptSubmitIntent) => Promise<T>) {
      if (!intent) {
        preparing ??= (async () => {
          const revision = await prepare();
          if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError('A revisão salva da tentativa é inválida.');
          intent = { revision, key: makeKey() };
          return intent;
        })().finally(() => { preparing = null; });
        await preparing;
      }
      pendingSends++;
      try { return await send({ ...intent! }); }
      finally { pendingSends--; }
    }
  };
}
type AttemptFilters = { assessmentId?: string; studentId?: string };
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
  const attemptPageParams = (page: number, filters: AttemptFilters = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: '100' });
    if (filters.assessmentId) params.set('assessmentId', filters.assessmentId);
    if (filters.studentId) params.set('studentId', filters.studentId);
    return params;
  };
  const submissionPageParams = (page: number, filters: SubmissionFilters = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: '100' });
    if (filters.assessmentId) params.set('assessmentId', filters.assessmentId);
    if (filters.studentId) params.set('studentId', filters.studentId);
    return params;
  };
  const requestForSession = async <T>(path: string, options: HttpRequestOptions | undefined, sessionKey: string | undefined) => {
    const guard = sessionFence(sessionKey, options?.signal);
    guard();
    const result = await client.request<T>(path, options);
    guard();
    return result;
  };
  const attemptPage = (filters: AttemptFilters, page: number, sessionKey: string | undefined, signal?: AbortSignal) =>
    requestForSession<AttemptPage>(`/attempts?${attemptPageParams(page, filters)}`, { signal }, sessionKey);
  const readAttempt = (id: string, signal?: AbortSignal, sessionKey = currentSessionKey()) =>
    requestForSession<AttemptRead>(`/attempts/${encodeURIComponent(id)}`, { signal }, sessionKey);
  const startAttempt = (assessmentId: string, intent: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<AttemptStudent>('/attempts', { method: 'POST', json: { assessmentId }, headers: { 'Idempotency-Key': intent }, ...(signal ? { signal } : {}) }, sessionKey);
  const saveAttemptAnswers = (id: string, revision: number, answers: Record<string, number | null>, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<AttemptStudent>(`/attempts/${encodeURIComponent(id)}/answers`, { method: 'PATCH', json: { expectedRevision: revision, answers: structuredClone(answers) }, ...(signal ? { signal } : {}) }, sessionKey);
  const submitAttempt = (id: string, revision: number, intent: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<AttemptResult>(`/attempts/${encodeURIComponent(id)}/submit`, { method: 'POST', json: { expectedRevision: revision }, headers: { 'Idempotency-Key': intent }, ...(signal ? { signal } : {}) }, sessionKey);
  const readAttemptResult = (id: string, signal?: AbortSignal, sessionKey = currentSessionKey()) =>
    requestForSession<AttemptResult>(`/attempts/${encodeURIComponent(id)}/result`, { signal }, sessionKey);
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

  async function allAttempts(filters: AttemptFilters = {}, signal?: AbortSignal, sessionKey = currentSessionKey()) {
    const guard = sessionFence(sessionKey, signal), items: AttemptRead[] = [];
    for (let page = 1; ; page++) {
      guard(); const result = await attemptPage(filters, page, sessionKey, signal); guard();
      items.push(...result.items);
      if (items.length >= result.total || !result.items.length) return items;
    }
  }

  async function allSubmissions(filters: SubmissionFilters = {}, signal?: AbortSignal, sessionKey = currentSessionKey()) {
    const guard = sessionFence(sessionKey, signal), items: SubmissionRead[] = [];
    for (let page = 1; ; page++) {
      guard(); const result = await requestForSession<SubmissionPage>(`/submissions?${submissionPageParams(page, filters)}`, { signal }, sessionKey); guard();
      items.push(...result.items);
      if (items.length >= result.total || !result.items.length) return items;
    }
  }

  const readSubmission = (id: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<SubmissionRead>(`/submissions/${encodeURIComponent(id)}`, { signal }, sessionKey);
  const prepareSubmission = (assessmentId: string, attachments: SubmissionAttachment[], intent: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<SubmissionRead>('/submissions', { method: 'POST', json: { assessmentId, attachments: structuredClone(attachments) }, headers: { 'Idempotency-Key': intent }, ...(signal ? { signal } : {}) }, sessionKey);
  const updateSubmission = (id: string, revision: number, attachments: SubmissionAttachment[], sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<SubmissionRead>(`/submissions/${encodeURIComponent(id)}`, { method: 'PATCH', json: { expectedRevision: revision, attachments: structuredClone(attachments) }, ...(signal ? { signal } : {}) }, sessionKey);
  const submitWork = (id: string, revision: number, intent: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<SubmissionStudent | SubmissionStaff>(`/submissions/${encodeURIComponent(id)}/submit`, { method: 'POST', json: { expectedRevision: revision }, headers: { 'Idempotency-Key': intent }, ...(signal ? { signal } : {}) }, sessionKey);
  const saveFeedback = (id: string, input: { expectedRevision: number; comment: string; grade: number | null }, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<SubmissionStaff>(`/submissions/${encodeURIComponent(id)}/feedback`, { method: 'PATCH', json: { ...input }, ...(signal ? { signal } : {}) }, sessionKey);
  const publishFeedback = (id: string, revision: number, intent: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<SubmissionStaff>(`/submissions/${encodeURIComponent(id)}/publish-feedback`, { method: 'POST', json: { expectedRevision: revision }, headers: { 'Idempotency-Key': intent }, ...(signal ? { signal } : {}) }, sessionKey);
  const uploadWorkFile = (body: FormData, intent: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<WorkFileMetadata>('/files', { method: 'POST', body, headers: { 'Idempotency-Key': intent }, ...(signal ? { signal } : {}) }, sessionKey);
  const readWorkFile = (id: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<WorkFileMetadata>(`/files/${encodeURIComponent(id)}`, { signal }, sessionKey);
  const readWorkFileContent = (id: string, inline: boolean, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<Blob>(`/files/${encodeURIComponent(id)}/content?disposition=${inline ? 'inline' : 'attachment'}`, { responseType: 'blob', signal }, sessionKey);
  const discardWorkFile = (id: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<void>(`/files/${encodeURIComponent(id)}/discard`, { method: 'POST', json: {}, ...(signal ? { signal } : {}) }, sessionKey);

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

  return { list, all, read, readForSession, create, edit, publish, context, overview, builder, saveAndPublish, saveDraft, attemptPage, allAttempts, readAttempt, startAttempt, saveAttemptAnswers, submitAttempt, readAttemptResult, allSubmissions, readSubmission, prepareSubmission, updateSubmission, submitWork, saveFeedback, publishFeedback, uploadWorkFile, readWorkFile, readWorkFileContent, discardWorkFile };
}
