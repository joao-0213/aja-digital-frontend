import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../../../server/app.mjs';
import { createTransactionStore } from '../../../../server/transaction-store.mjs';
import { openRepository } from '../../../../server/repository.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja16-review-'));
const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
const store = createTransactionStore({ filename });
await store.transact(state => {
  const original = state.assessments.find(row => row.id === 'quiz-open');
  state.assessments = state.assessments.filter(row => !['quiz-closed', 'quiz-no-deadline'].includes(row.id));
  for (let index = 1; index <= 4; index += 1) {
    state.assessments.push({
      ...structuredClone(original),
      id: `review-deadline-${index}`,
      title: `AJA-16 prazo ${index}`,
      deadline: '2031-06-16T00:30:00.000Z',
      createdAt: `2031-06-15T10:0${index}:00.000Z`,
      updatedAt: `2031-06-15T10:0${index}:00.000Z`
    });
  }
});

const origin = 'http://127.0.0.1:3000';
const server = createApp({ origins: [origin], frontendOrigin: origin, store, now: () => '2031-06-15T12:00:00.000Z' }).listen(3002, '127.0.0.1');
server.on('listening', () => process.stdout.write(JSON.stringify({ port: 3002, fixture: path.basename(directory), pendingAssessmentCount: 5, visibleDeadlineCards: 3, deadline: '2031-06-16T00:30:00.000Z' }) + '\n'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
