import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentsApi } from '../src/features/assessments/api.ts';
import { HttpError } from '../src/lib/http-client.ts';
import type { HttpRequestOptions } from '../src/lib/http-client.ts';
import { fromBrazilDateTimeLocal, toBrazilDateTimeLocal } from '../src/features/assessments/lib/assessment-editor.ts';

const fields = { moduleId: 'm 1', title: 'Prova', description: 'Instruções', kind: 'quiz' as const, maxGrade: null, deadline: null, required: true, allowLate: false, questions: [{ source: 'bank' as const, questionId: 'q:1' }] };

test('assessment adapter encodes filters and IDs and separates draft, edit and publish commands', async () => {
  const calls: { path: string; options?: HttpRequestOptions }[] = [];
  const api = createAssessmentsApi({ request: async <T>(path: string, options?: HttpRequestOptions) => { calls.push({ path, options }); return { id: 'a:1', revision: 3, status: 'draft' } as T; } });
  await api.list({ subjectId: 's 1', status: 'published', kind: 'quiz' }, 2);
  await api.read('a:1');
  await api.create(fields, 'assessment-intent');
  await api.edit('a:1', { ...fields, confirmResetDrafts: true }, 2);
  await api.publish('a:1', 3, 'publish-intent');
  assert.match(calls[0].path, /subjectId=s\+1/);
  assert.match(calls[0].path, /page=2/);
  assert.equal(calls[1].path, '/assessments/a%3A1');
  assert.deepEqual(calls[2].options, { method: 'POST', json: fields, headers: { 'Idempotency-Key': 'assessment-intent' } });
  assert.deepEqual(calls[3].options, { method: 'PATCH', json: { ...fields, confirmResetDrafts: true, expectedRevision: 2 } });
  assert.deepEqual(calls[4].options, { method: 'POST', json: { expectedRevision: 3 }, headers: { 'Idempotency-Key': 'publish-intent' } });
});

test('multi-step assessment save stops before publication when the authenticated session changes', async () => {
  let sessionKey = 'session-a';
  const calls: string[] = [];
  const api = createAssessmentsApi({
    getSnapshot: () => ({ status: 'authenticated', user: null, expiresAt: null, sessionKey, resourceEpoch: 0 }),
    request: async <T>(path: string) => {
      calls.push(path);
      sessionKey = 'session-b';
      return { id: 'a1', revision: 3, status: 'draft' } as T;
    }
  });
  await assert.rejects(api.saveAndPublish({ id: 'a1', revision: 2, fields }, 'session-a', 'new-assessment-key'), (error: unknown) => error instanceof HttpError && error.kind === 'cancelled');
  assert.deepEqual(calls, ['/assessments/a1']);
});

test('assessment deadlines round-trip in fixed Brasília time without the device timezone', () => {
  assert.equal(fromBrazilDateTimeLocal('2031-11-02T20:15'), '2031-11-02T20:15:00-03:00');
  assert.equal(toBrazilDateTimeLocal('2031-11-02T23:15:00Z'), '2031-11-02T20:15');
  assert.equal(fromBrazilDateTimeLocal(''), null);
  assert.equal(toBrazilDateTimeLocal(null), '');
});

test('editing an existing Brasilia deadline by date preserves hidden seconds and milliseconds', () => {
  assert.equal(
    fromBrazilDateTimeLocal('2031-06-26T20:00', '2031-06-25T23:00:59.999Z'),
    '2031-06-26T20:00:59.999-03:00'
  );
});

test('assessment multi-page loads stop before issuing the next page after a session switch', async () => {
  let sessionKey = 'session-a';
  const calls: string[] = [];
  const api = createAssessmentsApi({
    getSnapshot: () => ({ status: 'authenticated', user: null, expiresAt: null, sessionKey, resourceEpoch: 0 }),
    request: async <T>(path: string) => {
      calls.push(path);
      sessionKey = 'session-b';
      return { items: [{ id: 'a1' }], page: 1, pageSize: 1, total: 2 } as T;
    }
  });
  await assert.rejects(api.all({}, undefined, 'session-a'), (error: unknown) => error instanceof HttpError && error.kind === 'cancelled');
  assert.deepEqual(calls, ['/assessments?page=1&pageSize=100']);
});
