import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileApi } from '@/features/profile/api';
import { createQuestionsApi } from '@/features/questions/api';
import { resolveUrlFilterValue } from '@/hooks/use-url-filter-param';

test('createProfileApi reads enrollments and collects all assigned subject pages', async () => {
  const requests: string[] = [];
  let enrollmentsCalled = 0;
  const api = createProfileApi({
    readEnrollments: async () => {
      enrollmentsCalled += 1;
      return {
        items: [
          {
            id: 'e1',
            classId: 'c1',
            className: 'Turma A',
            status: 'active',
            enrolledAt: '2026-01-01T00:00:00Z'
          }
        ]
      };
    },
    request: async <T>(path: string): Promise<T> => {
      requests.push(path);
      const page = path.includes('page=2') ? 2 : 1;
      return {
        items: [{ id: `s${page}`, name: `Disciplina ${page}` }],
        page,
        pageSize: 1,
        total: 2,
        totalPages: 2
      } as T;
    }
  });

  const enrollments = await api.enrollments();
  assert.equal(enrollmentsCalled, 1);
  assert.equal(enrollments.items.length, 1);

  const subjects = await api.assignedSubjects();
  assert.equal(subjects.length, 2);
  assert.deepEqual(
    subjects.map((item) => item.id),
    ['s1', 's2']
  );
  assert.equal(requests.length, 2);
});

test('createQuestionsApi.listOptions collects all pages of filter options', async () => {
  const requests: string[] = [];
  const api = createQuestionsApi({
    request: async <T>(path: string): Promise<T> => {
      requests.push(path);
      const page = path.includes('page=2') ? 2 : 1;
      return {
        items: [{ id: `q${page}`, subject: `Matemática ${page}` }],
        page,
        pageSize: 100,
        total: 2,
        totalPages: 2
      } as T;
    }
  });

  const options = await api.listOptions();
  assert.deepEqual(
    options.map((item) => item.id),
    ['q1', 'q2']
  );
  assert.ok(requests[0].includes('pageSize=100'));
});

test('resolveUrlFilterValue resets local override when URL query param changes', () => {
  assert.equal(resolveUrlFilterValue({ source: 's1', value: 's3' }, 's1'), 's3');
  assert.equal(resolveUrlFilterValue({ source: 's1', value: 's3' }, 's2'), 's2');
  assert.equal(resolveUrlFilterValue({ source: 'all', value: 's3' }, 's1'), 's1');
});
