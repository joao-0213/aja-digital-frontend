import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../../../../server/app.mjs';
import { createTransactionStore } from '../../../../server/transaction-store.mjs';
import { openRepository } from '../../../../server/repository.mjs';

const baseDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja13-dashboard-calendar-'));
const { filename } = openRepository(directory, { baseDate });
const store = createTransactionStore({ filename });
const localDay = new Date(`${baseDate}T12:00:00-03:00`);
localDay.setDate(localDay.getDate() + 4);
const assessmentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(localDay);
await store.transact(state => {
  state.announcements = [];
  const source = state.assessments.find(row => row.id === 'quiz-open');
  assert.ok(source, 'fixture has source assessment quiz-open');
  state.classes.find(row => row.id === 'c1').studentIds = ['student', 'student-two'];
  const enrollment = state.enrollments.find(row => row.id === 'e1');
  enrollment.status = 'active';
  enrollment.unassignedAssessmentIds = enrollment.unassignedAssessmentIds.filter(id => id !== 'aja13-agenda-assessment');
  state.assessments.push({
    ...structuredClone(source),
    id: 'aja13-agenda-assessment',
    title: 'AJA-13 atividade futura na agenda',
    status: 'published',
    required: true,
    deadline: `${assessmentDate}T19:30:00-03:00`,
    authorId: 'teacher-a',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
});

const origin = 'http://127.0.0.1:3000';
const server = createApp({ origins: [origin], frontendOrigin: origin, store, now: () => new Date().toISOString() }).listen(3002, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:3002/api/v1';
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@aja.local.test', password: 'AjaLocal-student-2031!' }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const projection = await fetch(`${base}/me/dashboard`, { headers: { Origin: origin, Cookie: cookie } });
assert.equal(projection.status, 200);
const dashboard = await projection.json();
const assessmentEvent = dashboard.upcoming.find(item => item.sourceId === 'aja13-agenda-assessment');
assert.ok(assessmentEvent, 'student dashboard API projects the future assessment event before browser launch');
process.stdout.write(JSON.stringify({ port: 3002, fixture: path.basename(directory), baseDate, announcementRecordsBeforeUiPublish: 0, assessmentEvent, preflightDashboardStatus: projection.status }) + '\n');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
