import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttendanceApi } from '../src/features/attendance/api.ts';

test('attendance client collects every eligible roster page using the OpenAPI query', async () => {
  const requests: string[] = [];
  const api = createAttendanceApi({
    async request<T>(path: string) {
      requests.push(path);
      const url = new URL(path, 'http://localhost');
      const page = Number(url.searchParams.get('page'));
      const items = page === 1
        ? Array.from({ length: 100 }, (_, index) => ({ id: `student-${index}`, name: `Student ${index}`, eligible: true, reason: null }))
        : [{ id: 'student-100', name: 'Student 100', eligible: true, reason: null }];
      return { items, page, pageSize: 100, total: 101 } as T;
    }
  });

  const roster = await api.eligible('s1', '2031-06-15', '19:00');
  assert.equal(roster.length, 101);
  assert.equal(requests.length, 2);
  const query = new URL(requests[0], 'http://localhost').searchParams;
  assert.equal(query.get('subjectId'), 's1');
  assert.equal(query.get('date'), '2031-06-15');
  assert.equal(query.get('time'), '19:00');
  assert.equal(query.get('pageSize'), '100');
});

test('attendance client reads a date range then selects the requested lesson time locally', async () => {
  const requests: string[] = [];
  const api = createAttendanceApi({
    async request<T>(path: string) {
      requests.push(path);
      const url = new URL(path, 'http://localhost');
      const page = Number(url.searchParams.get('page'));
      return {
        items: page === 1 ? [
          { id: 'lesson-18', revision: 1, createdAt: '2031-06-15T12:00:00Z', updatedAt: '2031-06-15T12:00:00Z', updatedBy: 'teacher-a', subjectId: 's1', date: '2031-06-15', time: '18:00', records: {} },
          { id: 'lesson-19', revision: 1, createdAt: '2031-06-15T12:00:00Z', updatedAt: '2031-06-15T12:00:00Z', updatedBy: 'teacher-a', subjectId: 's1', date: '2031-06-15', time: '19:00', records: {} }
        ] : [], page, pageSize: 100, total: 2
      } as T;
    }
  });

  const lessons = await api.lesson('s1', '2031-06-15', '19:00');
  assert.equal(lessons.find(lesson => lesson.time === '19:00')?.id, 'lesson-19');
  assert.equal(requests.length, 1);
  const query = new URL(requests[0], 'http://localhost').searchParams;
  assert.equal(query.get('subjectId'), 's1');
  assert.equal(query.get('from'), '2031-06-15');
  assert.equal(query.get('to'), '2031-06-15');
  assert.equal(query.get('sort'), 'date');
  assert.equal(query.has('date'), false);
  assert.equal(query.has('time'), false);
});
