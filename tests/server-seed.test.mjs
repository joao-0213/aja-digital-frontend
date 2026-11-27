import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { generateSeed } from '../server/seed.mjs';
import { openRepository, resetRepository } from '../server/repository.mjs';
import { canAccessSubject } from '../src/lib/access.ts';
import { validateComposition } from '../src/lib/question-composition.ts';
import { enrolledForLesson } from '../src/lib/enrollment.ts';

const fixed = '2031-06-15';
test('seed has complete linked journeys, isolated author questions, valid answers and private binaries', () => {
  const db = generateSeed({ baseDate: fixed });
  const has = (collection, id) => db[collection].some(row => row.id === id);
  for (const collection of ['users', 'classes', 'subjects', 'modules', 'materials', 'questions', 'assessments', 'attempts', 'submissions', 'topics', 'announcements', 'attendance', 'enrollments', 'files']) {
    assert.ok(db[collection].length, collection);
    assert.equal(new Set(db[collection].map(row => row.id)).size, db[collection].length, collection);
    for (const row of db[collection]) assert.ok(row.revision >= 1, `${collection} revision`);
    for (const row of db[collection]) {
      for (const value of [row.createdAt, row.publishedAt, row.startedAt, row.submittedAt, row.enrolledAt, row.endedAt, row.feedbackDraft?.createdAt, row.feedbackPublished?.createdAt].filter(Boolean)) {
        assert.ok(Date.parse(row.updatedAt) >= Date.parse(value), `${collection}/${row.id}: updatedAt before ${value}`);
      }
    }
  }
  for (const subject of db.subjects) { assert.ok(has('classes', subject.classId)); for (const id of subject.teacherIds) assert.equal(db.users.find(u => u.id === id)?.role, 'teacher'); }
  for (const mod of db.modules) assert.ok(has('subjects', mod.subjectId));
  for (const material of db.materials) assert.ok(has('modules', material.moduleId));
  assert.deepEqual(new Set(db.materials.map(m => m.kind)), new Set(['lesson', 'pdf', 'video']));
  for (const q of db.questions) validateComposition([q], [q.id]);
  for (const a of db.assessments) { assert.ok(has('modules', a.moduleId)); if (a.kind === 'quiz') validateComposition(a.questions, a.questionIds); }
  const authored = db.assessments.flatMap(a => a.questions).filter(q => q.origin === 'author');
  assert.ok(authored.length); assert.ok(authored.every(q => !has('questions', q.id)));
  for (const attempt of db.attempts) {
    assert.ok(has('users', attempt.userId)); assert.ok(has('assessments', attempt.assessmentId));
    validateComposition(attempt.questions, attempt.questionOrder);
    for (const [id, answer] of Object.entries(attempt.answers)) assert.ok(answer >= 0 && answer < attempt.questions.find(q => q.id === id).options.length);
  }
  assert.ok(db.attempts.some(a => !a.submittedAt)); assert.ok(db.attempts.some(a => a.submittedAt));
  assert.ok(db.submissions.some(s => s.feedbackDraft && !s.feedbackPublished));
  assert.ok(db.submissions.some(s => s.feedbackPublished && s.feedbackHistory.length));
  for (const s of db.submissions) { assert.ok(has('assessments', s.assessmentId)); assert.ok(has('users', s.userId)); for (const a of s.attachments) if (a.kind === 'file') assert.ok(has('files', a.id)); }
  for (const t of db.topics) {
    assert.ok(has('subjects', t.subjectId)); assert.ok(has('users', t.authorId));
    if (t.target) assert.ok(has(t.target.type === 'material' ? 'materials' : 'questions', t.target.id));
    if (t.attachment) assert.ok(has('files', t.attachment.id));
    for (const r of t.replies) assert.ok(has('users', r.authorId));
  }
  assert.ok(db.topics.some(t => t.replies.some(r => r.accepted)));
  assert.ok(db.announcements.some(a => a.occurrence));
  for (const f of db.files) {
    const filename = new URL(`../server/fixtures/${f.fixture}`, import.meta.url);
    const bytes = fs.readFileSync(filename);
    assert.equal(bytes.length, f.size); assert.ok(bytes.length > 0);
    if (f.mime === 'application/pdf') { assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert.ok(bytes.toString().includes('%%EOF')); }
    if (f.mime === 'image/png') assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  for (const credential of db.credentials) {
    assert.ok(has('users', credential.userId)); assert.equal(credential.algorithm, 'scrypt'); assert.ok(credential.hash.length >= 64); assert.equal('password' in credential, false);
    assert.equal(scryptSync(`AjaLocal-${credential.userId}-2031!`, credential.salt, 64).toString('hex'), credential.hash);
  }
  for (const progress of db.progress) { assert.ok(has('users', progress.userId)); assert.ok(has('materials', progress.materialId)); }
  for (const e of db.enrollments) {
    assert.ok(has('classes', e.classId)); const user = db.users.find(u => u.id === e.studentId);
    assert.ok(user); assert.equal(e.email, user.email);
    if (e.status === 'pending') { assert.equal(e.enrolledAt, undefined); assert.equal(user.emailConfirmedAt, null); }
    else { assert.ok(e.enrolledAt); assert.ok(Date.parse(e.createdAt) <= Date.parse(e.enrolledAt)); }
    if (e.endedAt) assert.ok(Date.parse(e.enrolledAt) <= Date.parse(e.endedAt));
  }
  for (const lesson of db.attendance) {
    const subject = db.subjects.find(s => s.id === lesson.subjectId); assert.ok(subject);
    for (const id of Object.keys(lesson.records)) { assert.ok(has('users', id)); assert.ok(enrolledForLesson(db, subject.classId, id, lesson.date)); }
  }
  for (const notice of db.announcements) {
    assert.ok(has('classes', notice.classId)); assert.ok(has('users', notice.authorId));
    if (notice.subjectId) assert.equal(db.subjects.find(s => s.id === notice.subjectId)?.classId, notice.classId);
    if (notice.occurrence) assert.match(notice.occurrence.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const topic of db.topics) {
    assert.equal(db.subjects.find(s => s.id === topic.subjectId)?.classId, topic.classId);
    assert.equal(new Set(topic.replies.map(r => r.id)).size, topic.replies.length);
    assert.ok(topic.replies.filter(r => r.accepted).length <= 1);
    for (const id of topic.readBy) assert.ok(has('users', id));
    for (const reply of topic.replies) { assert.ok(reply.revision >= 1); for (const id of Object.keys(reply.votes)) assert.ok(has('users', id)); }
    if (topic.target?.type === 'material') {
      const m = db.materials.find(m => m.id === topic.target.id);
      assert.equal(db.modules.find(mod => mod.id === m.moduleId)?.subjectId, topic.subjectId);
    }
  }
  const parentCollections = { material: 'materials', submission: 'submissions', topic: 'topics', question: 'questions' };
  for (const file of db.files) {
    assert.ok(has('users', file.authorId)); assert.ok(has(parentCollections[file.parentType], file.parentId));
    assert.equal(file.purpose, { material: 'material', submission: 'work', topic: 'forum', question: 'question' }[file.parentType]);
  }
  for (const attempt of db.attempts) {
    const enrollment = db.enrollments.find(e => e.studentId === attempt.userId && e.classId === 'c1');
    assert.ok(Date.parse(enrollment.enrolledAt) <= Date.parse(attempt.startedAt));
    if (attempt.submittedAt) { assert.ok(Date.parse(attempt.startedAt) <= Date.parse(attempt.submittedAt)); assert.ok(Date.parse(attempt.submittedAt) <= Date.parse(db.assessments.find(a => a.id === attempt.assessmentId).deadline)); }
  }
  for (const submission of db.submissions) {
    const e = db.enrollments.find(e => e.studentId === submission.userId && e.classId === 'c1');
    assert.ok(Date.parse(e.enrolledAt) <= Date.parse(submission.submittedAt));
    for (const f of [submission.feedbackDraft, submission.feedbackPublished, ...submission.feedbackHistory].filter(Boolean)) { assert.ok(has('users', f.authorId)); assert.ok(Date.parse(submission.submittedAt) <= Date.parse(f.createdAt)); assert.ok(f.grade >= 0 && f.grade <= 10); }
  }
});

test('seed contexts implement allowed, empty, pending, closed and denied scenarios with pure access rules', () => {
  const db = generateSeed({ baseDate: fixed });
  const actor = id => db.users.find(u => u.id === id);
  assert.equal(canAccessSubject(db, actor('student'), 's1'), true);
  for (const id of ['teacher-a', 'teacher-b', 'admin']) assert.equal(canAccessSubject(db, actor(id), 's1'), true);
  for (const id of ['teacher-unassigned', 'student-empty', 'student-pending', 'student-inactive']) assert.equal(canAccessSubject(db, actor(id), 's1'), false, id);
  assert.equal(canAccessSubject(db, actor('student'), 's-closed'), false);
  assert.equal(canAccessSubject(db, actor('teacher-a'), 's-closed'), true);
  assert.equal(db.modules.some(m => m.subjectId === 's-empty'), false);
  assert.ok(db.enrollments.some(e => e.status === 'pending'));
});

test('fixed resets reproduce seed, current-day defaults are dynamic, restart preserves deadlines and updates', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-seed-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = openRepository(dir, { baseDate: fixed });
  const snapshot = structuredClone(first.db.getState());
  first.db.set('meta.operatorNote', 'preserved').write();
  const reopened = openRepository(dir, { baseDate: '2040-01-01' });
  assert.equal(reopened.db.get('meta.baseDate').value(), fixed);
  assert.equal(reopened.db.get('meta.operatorNote').value(), 'preserved');
  assert.throws(() => resetRepository(dir, { allowedRoot: dir, baseDate: '2031-02-30' }));
  assert.equal(openRepository(dir).db.get('meta.operatorNote').value(), 'preserved');
  resetRepository(dir, { allowedRoot: dir, baseDate: fixed });
  assert.deepEqual(openRepository(dir).db.getState(), snapshot);
  resetRepository(dir, { allowedRoot: dir, baseDate: fixed });
  assert.deepEqual(openRepository(dir).db.getState(), snapshot);
  assert.equal(generateSeed().meta.baseDate, new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const dates = snapshot.assessments.map(a => a.deadline);
  assert.ok(dates.includes('')); assert.ok(dates.some(d => d > fixed)); assert.ok(dates.some(d => d && d < fixed));
  assert.throws(() => generateSeed({ baseDate: '2031-02-30' }));
});

test('relative seed dates cross year and leap-day boundaries without changing civil-day semantics', () => {
  const year = generateSeed({ baseDate: '2031-12-31' });
  assert.equal(year.assessments.find(a => a.id === 'quiz-open').deadline, '2032-01-07T23:59:59-03:00');
  const leap = generateSeed({ baseDate: '2032-02-29' });
  assert.equal(leap.assessments.find(a => a.id === 'quiz-closed').deadline, '2032-02-28T23:59:59-03:00');
  assert.throws(() => generateSeed({ baseDate: '2031-02-29' }));
});
