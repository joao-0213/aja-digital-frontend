import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/lib/http-client.ts';
import { createAttendanceSessionController } from '../src/features/attendance/hooks/use-attendance-session.ts';
import { createForumComposerController } from '../src/features/forum/hooks/use-forum-composer.ts';
import { createForumReplyController } from '../src/features/forum/hooks/use-forum-reply.ts';
import {
  forumComposeDraftKeys,
  forumReplyDraftKey
} from '../src/features/forum/lib/forum-draft.ts';
import type { SessionStorageLike } from '../src/lib/session-draft-storage.ts';
import type { AttendanceLesson } from '../src/features/attendance/api.ts';
import type { ForumAttachmentDto, ForumTopicDto } from '../src/features/forum/api.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function createMemoryStorage(): SessionStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    }
  };
}

test('attendance session aborts and ignores delayed responses after rapid date/lesson switch', async () => {
  const firstEligible =
    deferred<{ id: string; name: string; eligible: boolean; reason: string | null }[]>();
  const firstLesson = deferred<AttendanceLesson[]>();
  const signals: AbortSignal[] = [];

  const controller = createAttendanceSessionController({
    api: {
      eligible: async (_subjectId, date, _time, signal) => {
        if (signal) signals.push(signal);
        if (date === '2026-11-01') return firstEligible.promise;
        return [{ id: 'st-b', name: 'Bruno', eligible: true, reason: null }];
      },
      lesson: async (_subjectId, date, _time, signal) => {
        if (signal) signals.push(signal);
        if (date === '2026-11-01') return firstLesson.promise;
        return [
          {
            id: 'lesson-b',
            revision: 2,
            createdAt: '2026-11-02T19:00:00Z',
            updatedAt: '2026-11-02T19:00:00Z',
            updatedBy: 'teacher-1',
            subjectId: 's1',
            date: '2026-11-02',
            time: '19:00',
            records: { 'st-b': false }
          }
        ];
      },
      read: async () => {
        throw new Error('not used');
      },
      create: async () => {
        throw new Error('not used');
      },
      update: async () => {
        throw new Error('not used');
      }
    },
    subjectId: 's1',
    canManageContent: true,
    initialDate: '2026-11-01',
    initialTime: '19:00',
    onSaved: () => {},
    onInvalidateRecent: () => {}
  });

  const pendingFirst = controller.load();
  assert.equal(controller.getSnapshot().loading, true);
  assert.equal(signals[0]?.aborted, false);

  controller.setDate('2026-11-02');
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals[1]?.aborted, true);

  const secondLoaded = await controller.load();
  assert.equal(secondLoaded, true);
  assert.equal(controller.getSnapshot().lesson?.id, 'lesson-b');
  assert.deepEqual(controller.getSnapshot().records, { 'st-b': false });

  // Late resolution from the stale 2026-11-01 request must be ignored.
  firstEligible.resolve([{ id: 'st-a', name: 'Ana', eligible: true, reason: null }]);
  firstLesson.resolve([
    {
      id: 'lesson-a',
      revision: 1,
      createdAt: '2026-11-01T19:00:00Z',
      updatedAt: '2026-11-01T19:00:00Z',
      updatedBy: 'teacher-1',
      subjectId: 's1',
      date: '2026-11-01',
      time: '19:00',
      records: { 'st-a': true }
    }
  ]);
  assert.equal(await pendingFirst, false);

  const snap = controller.getSnapshot();
  assert.equal(snap.loaded, true);
  assert.equal(snap.date, '2026-11-02');
  assert.equal(snap.lesson?.id, 'lesson-b');
  assert.deepEqual(snap.records, { 'st-b': false });
});

test('attendance session supports batch marking and preserves local edits across conflict resolution', async () => {
  const savedLesson: AttendanceLesson = {
    id: 'lesson-1',
    revision: 1,
    createdAt: '2026-11-01T19:00:00Z',
    updatedAt: '2026-11-01T19:00:00Z',
    updatedBy: 'teacher-1',
    subjectId: 's1',
    date: '2026-11-01',
    time: '19:00',
    records: { a1: true, a2: true }
  };
  const latestLesson: AttendanceLesson = {
    ...savedLesson,
    revision: 2,
    records: { a1: false, a2: true }
  };

  const controller = createAttendanceSessionController({
    api: {
      eligible: async () => [
        { id: 'a1', name: 'Ana', eligible: true, reason: null },
        { id: 'a2', name: 'Bia', eligible: true, reason: null }
      ],
      lesson: async () => [savedLesson],
      read: async () => latestLesson,
      create: async () => savedLesson,
      update: async (_id, records, expectedRevision) => {
        if (expectedRevision < 2) {
          throw new HttpError('conflict', 'Conflito de revisão.', {
            status: 409,
            code: 'CONFLICT'
          });
        }
        return { ...latestLesson, revision: 3, records };
      }
    },
    subjectId: 's1',
    canManageContent: true,
    initialDate: '2026-11-01',
    initialTime: '19:00',
    onSaved: () => {},
    onInvalidateRecent: () => {}
  });

  await controller.load();
  controller.markAllAbsent();
  assert.deepEqual(controller.getSnapshot().records, { a1: false, a2: false });
  controller.markAllPresent();
  assert.deepEqual(controller.getSnapshot().records, { a1: true, a2: true });
  controller.setStudentPresence('a2', false);

  controller.setConfirm(true);
  const firstSave = await controller.save();
  assert.equal(firstSave, false);
  assert.equal(controller.getSnapshot().confirm, false);
  assert.equal(controller.getSnapshot().conflictLesson?.revision, 2);
  assert.deepEqual(controller.getSnapshot().records, { a1: true, a2: false });

  controller.resolveConflict();
  assert.equal(controller.getSnapshot().conflictLesson, undefined);
  assert.equal(controller.getSnapshot().expectedRevision, 2);
  assert.deepEqual(controller.getSnapshot().records, { a1: true, a2: false });

  const secondSave = await controller.save();
  assert.equal(secondSave, true);
  assert.equal(controller.getSnapshot().lesson?.revision, 3);
});

test('forum composer reuses idempotency key on transient failure and clears draft on success', async () => {
  const storage = createMemoryStorage();
  const keysSeen: string[] = [];
  let failOnce = true;
  let publishedCount = 0;
  let seq = 0;

  const controller = createForumComposerController({
    api: {
      upload: async () => {
        throw new Error('unused');
      },
      readFile: async () => {
        throw new Error('unused');
      },
      discardFile: async () => {},
      create: async (fields, key) => {
        keysSeen.push(key);
        if (failOnce) {
          failOnce = false;
          throw new HttpError('unavailable', 'Serviço indisponível.', {
            status: 503,
            code: 'UNAVAILABLE'
          });
        }
        return {
          id: 'topic-1',
          revision: 1,
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T10:00:00Z',
          updatedBy: 'u1',
          ...fields,
          author: { id: 'u1', name: 'Aluno' },
          replies: [],
          read: true,
          attachment: null,
          legacyReference: null,
          legacyAttachmentName: null
        } satisfies ForumTopicDto;
      }
    },
    storage,
    userId: 'u1',
    materialId: null,
    questionId: null,
    initialSubjectId: 's1',
    subjects: [{ id: 's1', name: 'Matemática', classId: 'c1', className: 'Turma A' }],
    onPublished: () => {
      publishedCount += 1;
    },
    generateKey: () => `key-${++seq}`
  });

  controller.restoreDraft();
  controller.setTitle('Dúvida sobre regra de três');
  controller.setBody('Como identificar grandezas inversas?');
  controller.setTags('proporcao, exercicio');

  const firstAttempt = await controller.publish();
  assert.equal(firstAttempt, false);
  assert.equal(keysSeen.length, 1);
  assert.equal(controller.getSnapshot().pendingCreate?.key, 'key-1');
  assert.match(controller.getSnapshot().error, /indisponível/i);

  const draftKey = forumComposeDraftKeys('u1', null, null).current;
  assert.ok(storage.getItem(draftKey));

  const retryAttempt = await controller.publish();
  assert.equal(retryAttempt, true);
  assert.deepEqual(keysSeen, ['key-1', 'key-1']);
  assert.equal(publishedCount, 1);
  assert.equal(storage.getItem(draftKey), null);
  assert.equal(controller.getSnapshot().title, '');
  assert.equal(controller.getSnapshot().pendingCreate, undefined);
});

test('forum composer recovers legacy attachments and promotes staged attachments from storage', async () => {
  const storage = createMemoryStorage();
  const draftKey = forumComposeDraftKeys('u1', 'mat-1', null).current;
  const stagedAttachment: ForumAttachmentDto = {
    id: 'file-1',
    name: 'lista.pdf',
    size: 1024,
    mime: 'application/pdf',
    purpose: 'forum',
    parentId: 's1',
    status: 'staged',
    downloadUrl: '/files/file-1/content'
  };

  storage.setItem(
    draftKey,
    JSON.stringify({
      title: 'Título salvo',
      body: 'Corpo salvo no rascunho.',
      tags: 'prova',
      reference: 'material:mat-1',
      targetSubject: 's1',
      attachment: stagedAttachment
    })
  );

  const controller = createForumComposerController({
    api: {
      upload: async () => stagedAttachment,
      readFile: async () => stagedAttachment,
      discardFile: async () => {},
      create: async () => {
        throw new Error('unused');
      }
    },
    storage,
    userId: 'u1',
    materialId: 'mat-1',
    questionId: null,
    initialSubjectId: 's1',
    subjects: [{ id: 's1', name: 'Matemática', classId: 'c1' }],
    onPublished: () => {}
  });

  controller.restoreDraft();
  assert.equal(controller.getSnapshot().title, 'Título salvo');
  assert.equal(controller.getSnapshot().legacyAttachment?.id, 'file-1');

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().attachment?.id, 'file-1');
  assert.equal(controller.getSnapshot().legacyAttachment, undefined);
});

test('forum reply reuses idempotency key on transient failure and clears draft on success', async () => {
  const storage = createMemoryStorage();
  const keysSeen: string[] = [];
  let failOnce = true;
  let invalidations = 0;
  let seq = 0;

  const controller = createForumReplyController({
    api: {
      reply: async (_topicId, _body, key) => {
        keysSeen.push(key);
        if (failOnce) {
          failOnce = false;
          throw new HttpError('unavailable', 'Falha temporária.', {
            status: 503,
            code: 'UNAVAILABLE'
          });
        }
        return {} as ForumTopicDto;
      }
    },
    storage,
    userId: 'u1',
    topicId: 'topic-9',
    onInvalidate: () => {
      invalidations += 1;
    },
    generateKey: () => `reply-key-${++seq}`
  });

  controller.restoreDraft();
  controller.setBody('Você pode inverter a razão antes de multiplicar.');

  assert.equal(await controller.submitReply(true), false);
  assert.equal(controller.getSnapshot().pendingReply?.key, 'reply-key-1');
  assert.ok(storage.getItem(forumReplyDraftKey('u1', 'topic-9')));

  assert.equal(await controller.submitReply(true), true);
  assert.deepEqual(keysSeen, ['reply-key-1', 'reply-key-1']);
  assert.equal(invalidations, 1);
  assert.equal(controller.getSnapshot().body, '');
  assert.equal(controller.getSnapshot().pendingReply, undefined);
  assert.equal(storage.getItem(forumReplyDraftKey('u1', 'topic-9')), null);
});
