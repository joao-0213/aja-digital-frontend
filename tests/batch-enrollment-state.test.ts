import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchEnrollmentReducer,
  countPendingPreview,
  createInitialBatchEnrollmentState,
  hasBatchUnsavedWork,
  isBatchBusy
} from '../src/features/students/hooks/batch-enrollment-state.ts';
import {
  createBatchItems,
  parseBatchEmails,
  summarizeBatch,
  type BatchEnrollmentItem
} from '../src/features/students/lib/enrollment-batch.ts';

function makeItems(raw: string): BatchEnrollmentItem[] {
  let seq = 0;
  return createBatchItems(parseBatchEmails(raw), undefined, () => `key-${++seq}`);
}

test('initial state, busy flags, and unsaved-work detection follow phase rules', () => {
  const empty = createInitialBatchEnrollmentState();
  assert.equal(empty.phase, 'input');
  assert.equal(isBatchBusy(empty.phase), false);
  assert.equal(hasBatchUnsavedWork(empty), false);

  const withDraft = batchEnrollmentReducer(empty, {
    type: 'SET_RAW_EMAILS',
    rawEmails: 'ana@escola.br'
  });
  assert.equal(hasBatchUnsavedWork(withDraft), true);

  const checking = batchEnrollmentReducer(withDraft, {
    type: 'START_PREVIEW',
    items: makeItems(withDraft.rawEmails),
    total: 1
  });
  assert.equal(checking.phase, 'checking');
  assert.equal(isBatchBusy(checking.phase), true);
  assert.equal(hasBatchUnsavedWork(checking), false);

  const review = batchEnrollmentReducer(checking, {
    type: 'FINISH_PREVIEW',
    items: checking.items,
    completed: 1,
    total: 1,
    aborted: false
  });
  assert.equal(review.phase, 'review');
  assert.equal(hasBatchUnsavedWork(review), true);

  const done = batchEnrollmentReducer(review, {
    type: 'FINISH_CONFIRM',
    items: review.items,
    completed: 1,
    total: 1,
    aborted: false
  });
  assert.equal(done.phase, 'done');
  assert.equal(hasBatchUnsavedWork(done), false);
});

test('preview and confirm transitions track progress, conflicts, and selection toggles', () => {
  let state = createInitialBatchEnrollmentState('a@ex.test, conflict@ex.test, bad');
  state = batchEnrollmentReducer(state, { type: 'SET_INPUT_ERROR', message: 'Erro anterior' });
  assert.equal(state.inputError, 'Erro anterior');

  const initialItems = makeItems(state.rawEmails);
  state = batchEnrollmentReducer(state, {
    type: 'START_PREVIEW',
    items: initialItems,
    total: 2
  });
  assert.equal(state.inputError, '');
  assert.deepEqual(state.progress, { completed: 0, total: 2 });

  const checkedItems: BatchEnrollmentItem[] = [
    { ...initialItems[0], status: 'ready', selected: true },
    {
      ...initialItems[1],
      status: 'blocked',
      selected: false,
      error: 'O aluno já tem vínculo ativo em Turma B.',
      preview: {
        email: 'conflict@ex.test',
        classId: 'c1',
        canEnroll: false,
        message: 'O aluno já tem vínculo ativo em Turma B.',
        account: {
          id: 'u1',
          name: 'Conflito',
          email: 'conflict@ex.test',
          role: 'student',
          emailConfirmedAt: null
        },
        existingEnrollment: null,
        otherClass: { id: 'c2', name: 'Turma B' }
      }
    },
    initialItems[2]
  ];

  state = batchEnrollmentReducer(state, {
    type: 'UPDATE_PROGRESS',
    items: checkedItems,
    progress: { completed: 2, total: 2, currentEmail: 'conflict@ex.test' }
  });
  assert.equal(state.progress.completed, 2);

  state = batchEnrollmentReducer(state, {
    type: 'FINISH_PREVIEW',
    items: checkedItems,
    completed: 2,
    total: 2,
    aborted: false
  });
  assert.equal(state.phase, 'review');
  assert.equal(state.abortedNotice, '');

  // Toggling all ready must not select blocked or invalid items.
  state = batchEnrollmentReducer(state, { type: 'TOGGLE_ALL_READY', checked: false });
  assert.equal(state.items[0].selected, false);
  assert.equal(state.items[1].selected, false);

  state = batchEnrollmentReducer(state, { type: 'TOGGLE_ITEM', email: 'a@ex.test', checked: true });
  state = batchEnrollmentReducer(state, {
    type: 'TOGGLE_ITEM',
    email: 'conflict@ex.test',
    checked: true
  });
  assert.equal(state.items[0].selected, true);
  assert.equal(state.items[1].selected, false);

  // Confirm phase with conflict/error outcome.
  state = batchEnrollmentReducer(state, { type: 'START_CONFIRM', total: 1 });
  assert.equal(state.phase, 'submitting');

  const confirmedItems: BatchEnrollmentItem[] = [
    { ...state.items[0], status: 'error', error: 'Conflito de revisão ao matricular.' },
    state.items[1],
    state.items[2]
  ];
  state = batchEnrollmentReducer(state, {
    type: 'FINISH_CONFIRM',
    items: confirmedItems,
    completed: 1,
    total: 1,
    aborted: false
  });
  assert.equal(state.phase, 'done');
  const summary = summarizeBatch(state.items);
  assert.deepEqual(summary.problemEmails, ['a@ex.test', 'conflict@ex.test', 'bad']);
});

test('abort notices, close confirmation, and back-to-input respect busy guards', () => {
  let state = createInitialBatchEnrollmentState('a@ex.test, b@ex.test');
  const items = makeItems(state.rawEmails);

  state = batchEnrollmentReducer(state, { type: 'START_PREVIEW', items, total: 2 });
  // Busy state ignores close request and back-to-input.
  assert.equal(batchEnrollmentReducer(state, { type: 'REQUEST_CLOSE' }).confirmingClose, false);
  assert.equal(batchEnrollmentReducer(state, { type: 'BACK_TO_INPUT' }).phase, 'checking');

  // Aborting preview preserves notice and transitions to review.
  const partialPreview: BatchEnrollmentItem[] = [
    { ...items[0], status: 'preview-error', selected: false, error: 'Falha na consulta.' },
    items[1]
  ];
  state = batchEnrollmentReducer(state, {
    type: 'FINISH_PREVIEW',
    items: partialPreview,
    completed: 1,
    total: 2,
    aborted: true
  });
  assert.equal(state.phase, 'review');
  assert.match(state.abortedNotice, /Conferência interrompida/);
  assert.deepEqual(countPendingPreview(state.items, summarizeBatch(state.items)), {
    queuedCount: 1,
    pendingPreviewCount: 2
  });

  // Close confirmation toggles only when not busy.
  state = batchEnrollmentReducer(state, { type: 'REQUEST_CLOSE' });
  assert.equal(state.confirmingClose, true);
  state = batchEnrollmentReducer(state, { type: 'CANCEL_CLOSE' });
  assert.equal(state.confirmingClose, false);

  // Returning to input with problem emails replaces rawEmails and clears items.
  state = batchEnrollmentReducer(state, { type: 'BACK_TO_INPUT', rawEmails: 'a@ex.test' });
  assert.equal(state.phase, 'input');
  assert.equal(state.rawEmails, 'a@ex.test');
  assert.equal(state.items.length, 0);
  assert.equal(state.abortedNotice, '');

  // Aborting confirm sets interrupted notice in done phase.
  state = batchEnrollmentReducer(state, { type: 'START_CONFIRM', total: 1 });
  state = batchEnrollmentReducer(state, {
    type: 'FINISH_CONFIRM',
    items: [],
    completed: 0,
    total: 1,
    aborted: true
  });
  assert.equal(state.phase, 'done');
  assert.match(state.abortedNotice, /Processamento interrompido/);

  // Remove invalid emails helper cleans raw input.
  const dirty = createInitialBatchEnrollmentState('valid@ex.test, invalido');
  const cleaned = batchEnrollmentReducer(dirty, { type: 'REMOVE_INVALID_EMAILS' });
  assert.equal(cleaned.rawEmails, 'valid@ex.test');
});
