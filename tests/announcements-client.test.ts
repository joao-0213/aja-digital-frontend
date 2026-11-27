import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/lib/http-client.ts';
import { createHttpEditor } from '../src/lib/http-editor.ts';
import * as announcementApi from '../src/features/announcements/api.ts';
import type { AnnouncementFields } from '../src/features/announcements/api.ts';
import { announcementSubjectAfterClassChange, canManageAnnouncementItem, initialAnnouncementFields } from '../src/features/announcements/announcement-form.ts';
import { getOrCreateAnnouncementIntent } from '../src/features/announcements/announcement-intent.ts';
import { createCalendarApi } from '../src/features/calendar/api.ts';

const { createAnnouncementsApi } = announcementApi;
import { upcomingMeetings } from '../src/lib/announcement-calendar.ts';

test('announcement API binds filters, create replay key, expected revision and withdrawal to HTTP routes', async () => {
  assert.equal(announcementApi.announcementsPath, '/avisos');
  const calls: { path: string; options?: unknown }[] = [];
  const client = { request: async (path: string, options?: unknown) => { calls.push({ path, options }); return (path.startsWith('/announcements?') ? { items: [], total: 0 } : {}) as never; } };
  const api = createAnnouncementsApi(client);
  const fields: AnnouncementFields = { classId: 'c1', subjectId: 's1', title: 'Revisão', body: 'Sala 2', notify: true, occurrence: { date: '2031-06-20', time: '18:30', allDay: false } };
  await api.create(fields, 'request-key-0001');
  await api.edit('notice/1', fields, 3);
  await api.withdraw('notice/1', 4);
  await api.all({ subjectId: 's1', q: 'revisão' });
  assert.deepEqual(calls.map(call => call.path), ['/announcements', '/announcements/notice%2F1', '/announcements/notice%2F1/withdraw', '/announcements?page=1&pageSize=100&sort=-createdAt&subjectId=s1&q=revis%C3%A3o']);
  assert.deepEqual((calls[0].options as { headers: object }).headers, { 'Idempotency-Key': 'request-key-0001' });
  assert.equal((calls[1].options as { json: { expectedRevision: number } }).json.expectedRevision, 3);
  assert.equal((calls[2].options as { json: { expectedRevision: number } }).json.expectedRevision, 4);
});

test('announcement editor preserves text after a failed request and requires review before saving over a changed revision', async () => {
  const initial = { title: 'Título original', body: 'Rascunho', notify: true };
  const editor = createHttpEditor<typeof initial, { id: string; revision: number; title: string }>(initial, 2);
  editor.change({ ...initial, title: 'Texto local mantido' });
  assert.equal(await editor.submit(async () => { throw new Error('API indisponível'); }), false);
  assert.equal(editor.getSnapshot().fields.title, 'Texto local mantido');
  assert.match(editor.getSnapshot().error ?? '', /indisponível/);
  assert.equal(await editor.submit(async () => { throw new HttpError('conflict', 'O registro mudou.', { code: 'REVISION_CONFLICT', details: { currentRevision: 3 } }); }, async () => ({ id: 'n1', revision: 3, title: 'Versão atual' })), false);
  assert.equal(editor.getSnapshot().conflicted, true);
  assert.equal(editor.getSnapshot().latest?.title, 'Versão atual');
  editor.acknowledge();
  assert.equal(editor.getSnapshot().expectedRevision, 3);
  assert.equal(editor.getSnapshot().fields.title, 'Texto local mantido');
  assert.equal(await editor.submit(async (_fields, revision) => { assert.equal(revision, 3); }), true);
});

test('dashboard upcoming meetings include future visible events and assessment deadlines, keep source links and limit three', () => {
  const events = [
    { id: 'old', title: 'Passado', date: '2031-06-14', time: '19:00', source: 'announcement' as const, sourceId: 'old', href: '/avisos#aviso-old' },
    { id: 'deadline', title: 'Prazo', date: '2031-06-15', time: '18:00', source: 'assessment' as const, sourceId: 'work1', href: '/questionarios?id=work1' },
    { id: 'later', title: 'Segundo', date: '2031-06-17', time: null, source: 'announcement' as const, sourceId: 'later', href: '/avisos#aviso-later' },
    { id: 'first', title: 'Primeiro', date: '2031-06-16', time: '18:30', source: 'announcement' as const, sourceId: 'first', href: '/avisos#aviso-first' },
    { id: 'last', title: 'Quarto', date: '2031-06-18', time: '18:30', source: 'assessment' as const, sourceId: 'last-work', href: '/questionarios/responder?id=last-work' }
  ];
  assert.deepEqual(upcomingMeetings(events, '2031-06-15').map(event => [event.id, event.href]), [['deadline', '/questionarios?id=work1'], ['first', '/avisos#aviso-first'], ['later', '/avisos#aviso-later']]);
});

test('announcement retry reuses its idempotency key after the editor remounts in the same session context', () => {
  const drafts = new Map<string, unknown>();
  const client = {
    readDraftExtra: <T,>(context: string) => drafts.get(context) as T | undefined,
    saveDraftExtra: (context: string, value: unknown) => drafts.set(context, value)
  };
  const intent = getOrCreateAnnouncementIntent(client, 'announcement:teacher-a:s1', 'session-5', '{"title":"Plantão"}');
  const remounted = getOrCreateAnnouncementIntent(client, 'announcement:teacher-a:s1', 'session-5', '{"title":"Plantão"}');
  const changed = getOrCreateAnnouncementIntent(client, 'announcement:teacher-a:s1', 'session-5', '{"title":"Plantão editado"}');
  const otherUser = getOrCreateAnnouncementIntent(client, 'announcement:teacher-b:s1', 'session-5', '{"title":"Plantão"}');
  assert.equal(remounted, intent);
  assert.notEqual(changed, intent);
  assert.notEqual(otherUser, intent);
});

test('announcement editing preserves the explicit class-wide audience from a subject mural', () => {
  const notice = { id: 'notice-global', revision: 3, createdAt: '2031-06-15T12:00:00Z', updatedAt: '2031-06-15T12:00:00Z', updatedBy: 'admin', classId: 'c1', subjectId: null, title: 'Aviso da turma', body: 'Texto', notify: false, occurrence: null, author: { id: 'admin', name: 'Equipe' } };
  assert.equal(initialAnnouncementFields(notice, 's1').subjectId, null);
  assert.equal(initialAnnouncementFields(undefined, 's1').subjectId, 's1');
  assert.equal(initialAnnouncementFields({ ...notice, subjectId: 's2' }, 's1').subjectId, 's2');
  assert.equal(initialAnnouncementFields(notice, 's1').occurrence, null);
});

test('class changes clear a subject that does not belong to the newly selected class', () => {
  const subjects = [{ id: 's1', classId: 'c1' }, { id: 's-empty', classId: 'c-empty' }];
  assert.equal(announcementSubjectAfterClassChange('s1', subjects, 'c1'), 's1');
  assert.equal(announcementSubjectAfterClassChange('s1', subjects, 'c-empty', 's1'), null);
  assert.equal(announcementSubjectAfterClassChange('s-empty', subjects, 'c-empty'), 's-empty');
});

test('mural management controls require admin or management of the exact announcement subject', () => {
  assert.equal(canManageAnnouncementItem('teacher', true, null, 's1'), false);
  assert.equal(canManageAnnouncementItem('teacher', true, 's1', 's1'), true);
  assert.equal(canManageAnnouncementItem('teacher', false, 's1', 's1'), false);
  assert.equal(canManageAnnouncementItem('admin', true, null, 's1'), true);
});

test('calendar upcoming paginates before the dashboard filters to announcements', async () => {
  const calls: string[] = [];
  const client = { request: async (path: string) => {
    calls.push(path);
    const page = new URL(`http://localhost${path}`).searchParams.get('page');
    const items = page === '1'
      ? Array.from({ length: 100 }, (_, index) => ({ id: `assessment-${index}`, title: 'Prazo antigo', kind: 'exam' as const, date: '2031-06-16', time: '18:00', allDay: false, description: '', subjectId: 's1', source: 'assessment' as const, sourceId: `assessment-${index}`, href: '/questionarios' }))
      : [{ id: 'announcement-late-page', title: 'Aviso', kind: 'event' as const, date: '2031-06-17', time: null, allDay: true, description: '', subjectId: 's1', source: 'announcement' as const, sourceId: 'notice-1', href: '/avisos#aviso-notice-1' }];
    return { items, page: Number(page), pageSize: 100, total: 101 } as never;
  } };
  const entries = await createCalendarApi(client).upcoming();
  assert.equal(calls.length, 2);
  assert.match(calls[1], /page=2/);
  assert.equal(entries.at(-1)?.source, 'announcement');
});
