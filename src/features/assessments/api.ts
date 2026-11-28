import type { SessionClient } from '@/providers/session-client';
import type { TrailModule } from '@/models/academic';
import { HttpError, type HttpRequestOptions } from '@/lib/http-client';
import { collectAllPages } from '@/lib/http-pagination';
import {
  toAssessmentCreate,
  type AssessmentContext,
  type AssessmentCreate,
  type AssessmentFields,
  type AssessmentOverview,
  type AssessmentPage,
  type AssessmentRead,
  type AssessmentStaff,
  type AssessmentSubject
} from './lib/assessment-contracts';
import type {
  AttemptPage,
  AttemptRead,
  AttemptResult,
  AttemptStudent
} from './lib/attempt-contracts';
import type {
  SubmissionAttachment,
  SubmissionPage,
  SubmissionRead,
  SubmissionStaff,
  SubmissionStudent,
  WorkFileMetadata
} from './lib/submission-contracts';

export {
  isStaffAssessment,
  toAssessmentCreate,
  type AssessmentBase,
  type AssessmentContext,
  type AssessmentCreate,
  type AssessmentEdit,
  type AssessmentFields,
  type AssessmentOverview,
  type AssessmentPage,
  type AssessmentQuestionEntry,
  type AssessmentRead,
  type AssessmentSnapshot,
  type AssessmentStaff,
  type AssessmentStudent,
  type AssessmentSubject
} from './lib/assessment-contracts';
export {
  isStudentAttempt,
  type AttemptPage,
  type AttemptQuestionPrompt,
  type AttemptQuestionResult,
  type AttemptRead,
  type AttemptResult,
  type AttemptStaff,
  type AttemptStudent
} from './lib/attempt-contracts';
export {
  isStaffSubmission,
  isStudentSubmission,
  type SubmissionAttachment,
  type SubmissionPage,
  type SubmissionRead,
  type SubmissionReceipt,
  type SubmissionStaff,
  type SubmissionStudent,
  type WorkFeedback,
  type WorkFileMetadata
} from './lib/submission-contracts';

type SubmissionFilters = { assessmentId?: string; studentId?: string };
type AttemptFilters = { assessmentId?: string; studentId?: string };

type Filters = {
  subjectId?: string;
  moduleId?: string;
  status?: 'draft' | 'published';
  kind?: 'quiz' | 'work';
};
type AssessmentClient = Pick<SessionClient, 'request'> &
  Partial<Pick<SessionClient, 'getSnapshot'>>;

export function createAssessmentsApi(client: AssessmentClient) {
  const sessionFence = (sessionKey?: string, signal?: AbortSignal) => () => {
    const state = client.getSnapshot?.();
    if (
      signal?.aborted ||
      (state && (state.status !== 'authenticated' || state.sessionKey !== sessionKey))
    )
      throw new HttpError(
        'cancelled',
        'A sessão desta consulta mudou ou a consulta foi cancelada.'
      );
  };
  const currentSessionKey = () => client.getSnapshot?.().sessionKey;
  const pageParams = (page: number, filters: Filters = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: '100' });
    for (const key of ['subjectId', 'moduleId', 'status', 'kind'] as const)
      if (filters[key]) params.set(key, filters[key]!);
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
  const requestForSession = async <T>(
    path: string,
    options: HttpRequestOptions | undefined,
    sessionKey: string | undefined
  ) => {
    const guard = sessionFence(sessionKey, options?.signal);
    guard();
    const result = await client.request<T>(path, options);
    guard();
    return result;
  };
  const attemptPage = (
    filters: AttemptFilters,
    page: number,
    sessionKey: string | undefined,
    signal?: AbortSignal
  ) =>
    requestForSession<AttemptPage>(
      `/attempts?${attemptPageParams(page, filters)}`,
      { signal },
      sessionKey
    );
  const readAttempt = (id: string, signal?: AbortSignal, sessionKey = currentSessionKey()) =>
    requestForSession<AttemptRead>(`/attempts/${encodeURIComponent(id)}`, { signal }, sessionKey);
  const startAttempt = (
    assessmentId: string,
    intent: string,
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<AttemptStudent>(
      '/attempts',
      {
        method: 'POST',
        json: { assessmentId },
        headers: { 'Idempotency-Key': intent },
        ...(signal ? { signal } : {})
      },
      sessionKey
    );
  const saveAttemptAnswers = (
    id: string,
    revision: number,
    answers: Record<string, number | null>,
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<AttemptStudent>(
      `/attempts/${encodeURIComponent(id)}/answers`,
      {
        method: 'PATCH',
        json: { expectedRevision: revision, answers: structuredClone(answers) },
        ...(signal ? { signal } : {})
      },
      sessionKey
    );
  const submitAttempt = (
    id: string,
    revision: number,
    intent: string,
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<AttemptResult>(
      `/attempts/${encodeURIComponent(id)}/submit`,
      {
        method: 'POST',
        json: { expectedRevision: revision },
        headers: { 'Idempotency-Key': intent },
        ...(signal ? { signal } : {})
      },
      sessionKey
    );
  const readAttemptResult = (id: string, signal?: AbortSignal, sessionKey = currentSessionKey()) =>
    requestForSession<AttemptResult>(
      `/attempts/${encodeURIComponent(id)}/result`,
      { signal },
      sessionKey
    );
  const list = (filters: Filters, page: number, signal?: AbortSignal) =>
    client.request<AssessmentPage>(`/assessments?${pageParams(page, filters)}`, { signal });
  const read = (id: string, signal?: AbortSignal) =>
    client.request<AssessmentRead>(`/assessments/${encodeURIComponent(id)}`, { signal });
  const create = (fields: AssessmentCreate, intent: string, signal?: AbortSignal) =>
    client.request<AssessmentStaff>('/assessments', {
      method: 'POST',
      json: fields,
      headers: { 'Idempotency-Key': intent },
      ...(signal ? { signal } : {})
    });
  const edit = (
    id: string,
    fields: Partial<AssessmentFields>,
    revision: number,
    signal?: AbortSignal
  ) =>
    client.request<AssessmentStaff>(`/assessments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: { ...fields, expectedRevision: revision },
      ...(signal ? { signal } : {})
    });
  const publish = (
    id: string,
    revision: number,
    intent = crypto.randomUUID(),
    signal?: AbortSignal
  ) =>
    client.request<AssessmentStaff>(`/assessments/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      json: { expectedRevision: revision },
      headers: { 'Idempotency-Key': intent },
      ...(signal ? { signal } : {})
    });
  const readForSession = async (
    id: string,
    sessionKey: string | undefined,
    signal?: AbortSignal
  ) => {
    const guard = sessionFence(sessionKey, signal);
    guard();
    const assessment = await read(id, signal);
    guard();
    return assessment;
  };

  function all(filters: Filters = {}, signal?: AbortSignal, sessionKey = currentSessionKey()) {
    return collectAllPages((page, pageSignal) => list(filters, page, pageSignal), {
      signal,
      assertCurrent: sessionFence(sessionKey, signal)
    });
  }

  function allAttempts(
    filters: AttemptFilters = {},
    signal?: AbortSignal,
    sessionKey = currentSessionKey()
  ) {
    return collectAllPages(
      (page, pageSignal) => attemptPage(filters, page, sessionKey, pageSignal),
      {
        signal,
        assertCurrent: sessionFence(sessionKey, signal)
      }
    );
  }

  function allSubmissions(
    filters: SubmissionFilters = {},
    signal?: AbortSignal,
    sessionKey = currentSessionKey()
  ) {
    return collectAllPages(
      (page, pageSignal) =>
        requestForSession<SubmissionPage>(
          `/submissions?${submissionPageParams(page, filters)}`,
          { signal: pageSignal },
          sessionKey
        ),
      {
        signal,
        assertCurrent: sessionFence(sessionKey, signal)
      }
    );
  }

  const readSubmission = (id: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<SubmissionRead>(
      `/submissions/${encodeURIComponent(id)}`,
      { signal },
      sessionKey
    );
  const prepareSubmission = (
    assessmentId: string,
    attachments: SubmissionAttachment[],
    intent: string,
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<SubmissionStudent>(
      '/submissions',
      {
        method: 'POST',
        json: { assessmentId, attachments: structuredClone(attachments) },
        headers: { 'Idempotency-Key': intent },
        ...(signal ? { signal } : {})
      },
      sessionKey
    );
  const updateSubmission = (
    id: string,
    revision: number,
    attachments: SubmissionAttachment[],
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<SubmissionStudent>(
      `/submissions/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        json: { expectedRevision: revision, attachments: structuredClone(attachments) },
        ...(signal ? { signal } : {})
      },
      sessionKey
    );
  const submitWork = (
    id: string,
    revision: number,
    intent: string,
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<SubmissionStudent>(
      `/submissions/${encodeURIComponent(id)}/submit`,
      {
        method: 'POST',
        json: { expectedRevision: revision },
        headers: { 'Idempotency-Key': intent },
        ...(signal ? { signal } : {})
      },
      sessionKey
    );
  const saveFeedback = (
    id: string,
    input: { expectedRevision: number; comment: string; grade: number | null },
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<SubmissionStaff>(
      `/submissions/${encodeURIComponent(id)}/feedback`,
      { method: 'PATCH', json: { ...input }, ...(signal ? { signal } : {}) },
      sessionKey
    );
  const publishFeedback = (
    id: string,
    revision: number,
    intent: string,
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<SubmissionStaff>(
      `/submissions/${encodeURIComponent(id)}/publish-feedback`,
      {
        method: 'POST',
        json: { expectedRevision: revision },
        headers: { 'Idempotency-Key': intent },
        ...(signal ? { signal } : {})
      },
      sessionKey
    );
  const uploadWorkFile = (
    body: FormData,
    intent: string,
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<WorkFileMetadata>(
      '/files',
      {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': intent },
        ...(signal ? { signal } : {})
      },
      sessionKey
    );
  const readWorkFile = (id: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<WorkFileMetadata>(`/files/${encodeURIComponent(id)}`, { signal }, sessionKey);
  const readWorkFileContent = (
    id: string,
    inline: boolean,
    sessionKey = currentSessionKey(),
    signal?: AbortSignal
  ) =>
    requestForSession<Blob>(
      `/files/${encodeURIComponent(id)}/content?disposition=${inline ? 'inline' : 'attachment'}`,
      { responseType: 'blob', signal },
      sessionKey
    );
  const discardWorkFile = (id: string, sessionKey = currentSessionKey(), signal?: AbortSignal) =>
    requestForSession<void>(
      `/files/${encodeURIComponent(id)}/discard`,
      { method: 'POST', json: {}, ...(signal ? { signal } : {}) },
      sessionKey
    );

  function allModules(signal?: AbortSignal, sessionKey = currentSessionKey()) {
    return collectAllPages(
      (page, pageSignal) =>
        client.request<{ items: TrailModule[]; total: number }>(
          `/modules?page=${page}&pageSize=100&sort=order`,
          { signal: pageSignal }
        ),
      {
        signal,
        assertCurrent: sessionFence(sessionKey, signal)
      }
    );
  }

  function allSubjects(signal?: AbortSignal, sessionKey = currentSessionKey()) {
    return collectAllPages(
      (page, pageSignal) =>
        client.request<{ items: AssessmentSubject[]; total: number }>(
          `/subjects?page=${page}&pageSize=100`,
          { signal: pageSignal }
        ),
      {
        signal,
        assertCurrent: sessionFence(sessionKey, signal)
      }
    );
  }

  async function context(
    signal?: AbortSignal,
    sessionKey = currentSessionKey()
  ): Promise<AssessmentContext> {
    const guard = sessionFence(sessionKey, signal);
    guard();
    const [modules, subjects] = await Promise.all([
      allModules(signal, sessionKey),
      allSubjects(signal, sessionKey)
    ]);
    guard();
    return { modules, subjects };
  }

  async function overview(
    filters: Filters = {},
    signal?: AbortSignal,
    sessionKey = currentSessionKey()
  ): Promise<AssessmentOverview> {
    const guard = sessionFence(sessionKey, signal);
    guard();
    const [assessments, pageContext] = await Promise.all([
      all(filters, signal, sessionKey),
      context(signal, sessionKey)
    ]);
    guard();
    return { ...pageContext, assessments };
  }

  async function builder(
    id: string | undefined,
    signal?: AbortSignal,
    sessionKey = currentSessionKey()
  ) {
    const guard = sessionFence(sessionKey, signal);
    guard();
    const [pageContext, assessment] = await Promise.all([
      context(signal, sessionKey),
      id ? read(id, signal) : Promise.resolve(undefined)
    ]);
    guard();
    return { ...pageContext, assessment };
  }

  async function saveAndPublish(
    input: { id?: string; revision: number; fields: AssessmentFields },
    sessionKey: string | undefined,
    intent: string,
    onCreated?: (assessment: AssessmentStaff) => void | Promise<void>
  ) {
    const guard = sessionFence(sessionKey);
    guard();
    let assessment: AssessmentStaff;
    if (input.id) {
      assessment = await edit(input.id, input.fields, input.revision);
      guard();
    } else {
      assessment = await create(toAssessmentCreate(input.fields), intent);
      guard();
      await onCreated?.(assessment);
      guard();
    }
    if (assessment.status === 'draft') {
      assessment = await publish(assessment.id, assessment.revision, `${intent}-publish`);
      guard();
    }
    return assessment;
  }

  async function saveDraft(
    input: { id?: string; revision: number; fields: AssessmentFields },
    sessionKey: string | undefined,
    intent: string,
    onCreated?: (assessment: AssessmentStaff) => void | Promise<void>
  ) {
    const guard = sessionFence(sessionKey);
    guard();
    const assessment = input.id
      ? await edit(input.id, input.fields, input.revision)
      : await create(toAssessmentCreate(input.fields), intent);
    guard();
    if (!input.id) {
      await onCreated?.(assessment);
      guard();
    }
    return assessment;
  }

  async function rosterForModule(
    moduleId: string,
    signal?: AbortSignal,
    sessionKey = currentSessionKey()
  ): Promise<{ id: string; name: string; email: string }[]> {
    const guard = sessionFence(sessionKey, signal);
    guard();
    const mod = await client.request<TrailModule>(`/modules/${encodeURIComponent(moduleId)}`, {
      signal
    });
    guard();
    const detail = await client.request<{ subject: { classId: string } }>(
      `/subjects/${encodeURIComponent(mod.subjectId)}`,
      { signal }
    );
    guard();
    const items: { id: string; name: string; email: string }[] = [];
    for (let page = 1; ; page++) {
      guard();
      const result = await client.request<{
        items: { id: string; name: string; email: string; active?: boolean }[];
        total: number;
      }>(
        `/students?classId=${encodeURIComponent(detail.subject.classId)}&page=${page}&pageSize=100`,
        { signal }
      );
      guard();
      for (const student of result.items)
        if (student.active !== false)
          items.push({ id: student.id, name: student.name, email: student.email });
      if (result.items.length < 100 || items.length >= result.total) return items;
    }
  }

  return {
    list,
    all,
    read,
    readForSession,
    create,
    edit,
    publish,
    context,
    overview,
    builder,
    rosterForModule,
    saveAndPublish,
    saveDraft,
    attemptPage,
    allAttempts,
    readAttempt,
    startAttempt,
    saveAttemptAnswers,
    submitAttempt,
    readAttemptResult,
    allSubmissions,
    readSubmission,
    prepareSubmission,
    updateSubmission,
    submitWork,
    saveFeedback,
    publishFeedback,
    uploadWorkFile,
    readWorkFile,
    readWorkFileContent,
    discardWorkFile
  };
}
