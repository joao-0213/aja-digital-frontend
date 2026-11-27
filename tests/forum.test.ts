import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import { applyDemoMutation } from './support/legacy/demo-mutations.ts';
import { migrateDatabase } from './support/legacy/demo-storage.ts';
import { scopeDatabase } from '../src/lib/access.ts';
import {
  forumMatches,
  forumReplies,
  forumTarget,
  validateForumAttachment
} from '../src/lib/forum.ts';

function seed(): MockDatabase {
  return {
    version: 1,
    audit: [],
    enrollments: [],
    submissions: [],
    users: [
      { id: 'a', name: 'Admin', email: 'a@example.org', role: 'admin' },
      { id: 'p', name: 'Professor', email: 'p@example.org', role: 'teacher' },
      { id: 's', name: 'Aluno', email: 's@example.org', role: 'student' },
      { id: 'x', name: 'Colega', email: 'x@example.org', role: 'student' }
    ],
    classes: [
      {
        id: 'c',
        name: 'Turma',
        code: 'C',
        year: 2026,
        shift: 'Noite',
        active: true,
        studentIds: ['s', 'x']
      }
    ],
    subjects: [
      {
        id: 'd',
        classId: 'c',
        name: 'Disciplina',
        teacherIds: ['p'],
        color: 'blue',
        description: ''
      }
    ],
    topics: [
      {
        id: 't',
        classId: 'c',
        subjectId: 'd',
        authorId: 's',
        title: 'Uma pergunta',
        body: 'Dúvida',
        tags: [],
        createdAt: '2026-11-01',
        readBy: ['s', 'x'],
        replies: [
          {
            id: 'r',
            authorId: 'p',
            body: 'Resposta',
            createdAt: '2026-11-01',
            votes: {},
            accepted: false
          }
        ]
      }
    ],
    modules: [],
    materials: [],
    questions: [],
    assessments: [],
    attempts: [],
    announcements: [],
    events: [],
    attendance: [],
    progress: []
  };
}
test('new reply invalidates other readers, preserves old replies and latest concurrent votes', () => {
  const db = seed();
  const next = applyDemoMutation(db, 'x', (d) => {
    d.topics[0].replies.push({
      id: 'r2',
      authorId: 'x',
      body: 'Palavra exclusiva',
      createdAt: '2026-11-02',
      votes: {},
      accepted: false
    });
  });
  assert.deepEqual(next.topics[0].readBy, ['x']);
  const voted = applyDemoMutation(next, 's', (d) => {
    d.topics[0].replies[0].votes.s = 1;
  });
  assert.deepEqual(voted.topics[0].readBy, ['x']);
  assert.equal(voted.topics[0].replies.length, 2);
});
test('all roles reject negative/self/foreign votes, spoofing and blank replies atomically', () => {
  for (const actor of ['s', 'p', 'a']) {
    const db = seed();
    assert.throws(() =>
      applyDemoMutation(db, actor, (d) => {
        (d.topics[0].replies[0].votes as Record<string, number>)[actor] = -1;
      })
    );
    assert.throws(() =>
      applyDemoMutation(db, actor, (d) => {
        d.topics[0].replies.push({
          id: 'bad',
          authorId: 'x',
          body: ' ',
          votes: {},
          accepted: false,
          createdAt: '2026-11-02'
        });
      })
    );
  }
  assert.throws(() =>
    applyDemoMutation(seed(), 'p', (d) => {
      d.topics[0].replies[0].votes.p = 1;
    })
  );
  assert.throws(() =>
    applyDemoMutation(seed(), 's', (d) => {
      d.topics[0].replies[0].votes.x = 1;
    })
  );
});
test('reply soft delete clears solution without losing body, votes or audit evidence', () => {
  const db = seed();
  db.topics[0].replies[0].accepted = true;
  const next = applyDemoMutation(db, 'p', (d) => {
    Object.assign(d.topics[0].replies[0], { deletedAt: '2026-11-02' });
  });
  assert.equal(next.topics[0].replies[0].accepted, false);
  assert.equal(next.topics[0].replies[0].body, 'Resposta');
  assert.equal(scopeDatabase(next, next.users[2]).topics[0].replies.length, 0);
  assert.ok(
    next.audit.some(
      (a) => a.collection === 'forumReplies' && a.targetId === 'r' && a.action === 'delete'
    )
  );
});
test('solution is unique, allowed to author and assigned teachers; revoked access rejects', () => {
  const db = seed();
  assert.throws(() =>
    applyDemoMutation(db, 'x', (d) => {
      d.topics[0].replies[0].accepted = true;
    })
  );
  assert.equal(
    applyDemoMutation(db, 'p', (d) => {
      d.topics[0].replies[0].accepted = true;
    }).topics[0].replies[0].accepted,
    true
  );
  db.subjects[0].teacherIds = [];
  assert.throws(() =>
    applyDemoMutation(db, 'p', (d) => {
      d.topics[0].replies[0].accepted = true;
    })
  );
  db.classes[0].studentIds = [];
  assert.throws(() =>
    applyDemoMutation(db, 's', (d) => {
      d.topics[0].readBy.push('s');
      d.topics[0].replies[0].accepted = true;
    })
  );
});
test('legacy negative vote migration is idempotent and records minimal trace', () => {
  const db = seed();
  Object.assign(db.topics[0].replies[0].votes, { x: -1, s: 1 });
  const next = migrateDatabase(db);
  assert.deepEqual(next.topics[0].replies[0].votes, { s: 1 });
  assert.ok(next.audit.some((a) => a.collection === 'forumVotes' && a.targetId === 'r'));
  assert.deepEqual(migrateDatabase(next), next);
});
test('search finds reply-only text, ignores removed replies and preserves chronological ties', () => {
  const t = seed().topics[0];
  t.replies[0].body = 'Explicação exclusiva';
  assert.equal(forumMatches(t, 'explicacao'), true);
  t.replies.push({ ...t.replies[0], id: 'a', accepted: true, votes: { x: 1 } });
  assert.deepEqual(
    forumReplies(t).map((r) => r.id),
    ['a', 'r']
  );
  t.replies.forEach((r) => {
    r.deletedAt = '2026-11-02';
  });
  assert.equal(forumMatches(t, 'exclusiva'), false);
});
test('reference identifies exact question or contextual material and unavailable targets', () => {
  const db = seed();
  db.questions.push({
    id: 'q',
    subject: 'Math',
    topic: 'Tema',
    difficulty: 'easy',
    institution: 'Demo',
    year: 2026,
    statement: 'Enunciado exato',
    options: ['a', 'b'],
    correct: 0,
    explanation: ''
  });
  db.modules.push({ id: 'm', subjectId: 'd', title: 'Módulo', description: '', order: 1 });
  db.materials.push({
    id: 'mat',
    moduleId: 'm',
    title: 'Texto',
    kind: 'lesson',
    duration: 1,
    content: 'Leitura',
    order: 1
  });
  assert.equal(forumTarget(db, { reference: 'q', subjectId: 'd' })?.href, '/questoes?id=q');
  assert.equal(
    forumTarget(db, { target: { type: 'material', id: 'mat' }, subjectId: 'd' })?.href,
    '/materiais?id=mat'
  );
  assert.equal(
    forumTarget(db, { target: { type: 'material', id: 'mat' }, subjectId: 'other' }),
    null
  );
  db.questions[0].deletedAt = '2026-11-02';
  assert.equal(forumTarget(db, { reference: 'q', subjectId: 'd' }), null);
  assert.throws(() =>
    applyDemoMutation(db, 's', (d) => {
      d.topics.push({ ...d.topics[0], id: 'new', replies: [], readBy: ['s'], reference: 'q' });
    })
  );
});
test('attachment boundaries reject empty, oversized and executable content', () => {
  const item = {
    id: 'forum-file-test',
    name: 'demo.pdf',
    mime: 'application/pdf',
    size: 5 * 1024 * 1024
  };
  assert.doesNotThrow(() => validateForumAttachment(item));
  for (const change of [
    { size: 0 },
    { size: item.size + 1 },
    { mime: 'image/svg+xml' },
    { mime: 'text/html' },
    { id: 'other' }
  ])
    assert.throws(() => validateForumAttachment({ ...item, ...change }));
});
test('concurrent replies preserve latest content, stale revision and removed parent reject', () => {
  const db = seed();
  const recipe = (d: MockDatabase) => {
    d.topics[0].replies.push({
      id: 'next',
      authorId: 'x',
      body: 'Nova',
      votes: {},
      accepted: false,
      createdAt: '2026-11-02'
    });
  };
  const next = applyDemoMutation(db, 'x', recipe);
  assert.throws(
    () =>
      applyDemoMutation(next, 'x', recipe, {
        expected: [{ collection: 'topics', id: 't', revision: 0 }]
      }),
    /alterado/
  );
  const removed = applyDemoMutation(next, 's', (d) => {
    d.topics[0].deletedAt = '2026-11-02';
  });
  assert.equal(removed.topics[0].replies.length, 2);
  assert.equal(scopeDatabase(removed, removed.users[2]).topics.length, 0);
  assert.throws(
    () =>
      applyDemoMutation(removed, 'x', (d) => {
        d.topics[0].replies[0].votes.x = 1;
      }),
    /excluído/
  );
});
test('equal assigned teachers can resolve and retire replies; votes toggle without moving them', () => {
  const db = seed();
  db.users.push({ id: 'p2', name: 'Outro docente', role: 'teacher', email: 'p2@example.org' });
  db.subjects[0].teacherIds.push('p2');
  const voted = applyDemoMutation(db, 'x', (d) => {
    d.topics[0].replies[0].votes.x = 1;
  });
  const resolved = applyDemoMutation(voted, 'p2', (d) => {
    d.topics[0].replies[0].accepted = true;
  });
  const unvoted = applyDemoMutation(resolved, 'x', (d) => {
    delete d.topics[0].replies[0].votes.x;
  });
  assert.deepEqual(
    forumReplies(unvoted.topics[0]).map((r) => r.id),
    ['r']
  );
  assert.deepEqual(unvoted.topics[0].replies[0].votes, {});
  assert.equal(unvoted.topics[0].replies[0].accepted, true);
  const deleted = applyDemoMutation(unvoted, 'p2', (d) => {
    d.topics[0].replies[0].deletedAt = '2026-11-02';
  });
  assert.equal(deleted.topics[0].replies[0].accepted, false);
  assert.equal(deleted.topics[0].replies[0].body, 'Resposta');
});
test('archived class history allows staff read markers but refuses interaction and student access', () => {
  const db = seed();
  db.classes[0].active = false;
  for (const actor of ['p', 'a']) {
    const next = applyDemoMutation(db, actor, (d) => {
      d.topics[0].readBy.push(actor);
    });
    assert.ok(next.topics[0].readBy.includes(actor));
    assert.throws(() =>
      applyDemoMutation(next, actor, (d) => {
        d.topics[0].replies[0].accepted = true;
      })
    );
    assert.throws(() =>
      applyDemoMutation(next, actor, (d) => {
        d.topics[0].deletedAt = '2026-11-02';
      })
    );
    assert.equal(scopeDatabase(next, next.users.find((u) => u.id === actor)!).topics.length, 1);
  }
  assert.equal(scopeDatabase(db, db.users.find((u) => u.id === 's')!).topics.length, 0);
  assert.throws(() =>
    applyDemoMutation(db, 's', (d) => {
      d.topics[0].readBy = ['s'];
    })
  );
});
