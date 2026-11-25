import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAttempt, validateClassCode, canChangeRole, validateUpload, moveItem } from '../src/lib/domain.ts';
import { brazilDateTimeLabel, countLabel } from '../src/lib/utils.ts';
test('grades correct, incorrect and blank answers without leaking unanswered points', () => {
  assert.deepEqual(gradeAttempt(['a', 'b', 'c'], {
    a: 0,
    b: 1
  }, [{
    id: 'a',
    correct: 0
  }, {
    id: 'b',
    correct: 2
  }, {
    id: 'c',
    correct: 1
  }]), {
    total: 3,
    correct: 1,
    answered: 2,
    blank: 1,
    percentage: 33
  });
});
test('empty and missing catalog entries never yield NaN or accidental points', () => {
  assert.equal(gradeAttempt([], {}, []).percentage, 0);
  assert.equal(gradeAttempt(['a'], {}, []).correct, 0);
});
test('class codes are unique regardless of case and surrounding spaces', () => {
  assert.ok(validateClassCode(' ext-26 ', [{
    id: '1',
    code: 'EXT-26'
  }]));
  assert.equal(validateClassCode('EXT-26', [{
    id: '1',
    code: 'EXT-26'
  }], '1'), null);
  assert.ok(validateClassCode('not valid!', []));
});
test('last admin cannot be demoted', () => {
  assert.equal(canChangeRole({
    id: '1',
    role: 'admin'
  }, 'student', [{
    id: '1',
    role: 'admin'
  }]), false);
  assert.equal(canChangeRole({
    id: '1',
    role: 'admin'
  }, 'teacher', [{
    id: '1',
    role: 'admin'
  }, {
    id: '2',
    role: 'admin'
  }]), true);
});
test('upload validates type, nonempty content and size', () => {
  assert.equal(validateUpload({
    type: 'application/pdf',
    size: 500
  }, ['application/pdf'], 1000), true);
  assert.equal(validateUpload({
    type: 'text/html',
    size: 500
  }, ['application/pdf'], 1000), false);
  assert.equal(validateUpload({
    type: 'application/pdf',
    size: 1001
  }, ['application/pdf'], 1000), false);
  assert.equal(validateUpload({
    type: 'application/pdf',
    size: 0
  }, ['application/pdf'], 1000), false);
});
test('reordering is immutable and bounded', () => {
  const source = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(source, 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(source, ['a', 'b', 'c']);
  assert.deepEqual(moveItem(source, 0, -1), source);
});

test('UI formatting helpers handle singular/plural counts and Brasília timestamps safely', () => {
  assert.equal(countLabel(0, 'questão', 'questões'), '0 questões');
  assert.equal(countLabel(1, 'questão', 'questões'), '1 questão');
  assert.equal(countLabel(2, 'questão', 'questões'), '2 questões');
  assert.match(brazilDateTimeLabel('2026-12-10T19:00:00-03:00'), /10\/12\/2026.*19:00/);
  assert.equal(brazilDateTimeLabel('invalid-date'), 'invalid-date');
});
