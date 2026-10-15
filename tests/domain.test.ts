import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAttempt, validateClassCode, canChangeRole, validateUpload, moveItem } from '../src/lib/domain.ts';
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
