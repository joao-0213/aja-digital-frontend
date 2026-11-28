import {
  keepOnlyValidEmails,
  type BatchEnrollmentItem,
  type BatchProgress,
  type BatchSummary
} from '../lib/enrollment-batch';

export type BatchPhase = 'input' | 'checking' | 'review' | 'submitting' | 'done';

export interface BatchEnrollmentState {
  phase: BatchPhase;
  rawEmails: string;
  items: BatchEnrollmentItem[];
  progress: BatchProgress;
  inputError: string;
  abortedNotice: string;
  confirmingClose: boolean;
  copiedProblems: boolean;
}

export type BatchEnrollmentAction =
  | { type: 'SET_RAW_EMAILS'; rawEmails: string }
  | { type: 'SET_INPUT_ERROR'; message: string }
  | { type: 'REMOVE_INVALID_EMAILS' }
  | { type: 'START_PREVIEW'; items: BatchEnrollmentItem[]; total: number }
  | { type: 'UPDATE_PROGRESS'; items: BatchEnrollmentItem[]; progress: BatchProgress }
  | {
      type: 'FINISH_PREVIEW';
      items: BatchEnrollmentItem[];
      completed: number;
      total: number;
      aborted: boolean;
    }
  | { type: 'TOGGLE_ITEM'; email: string; checked: boolean }
  | { type: 'TOGGLE_ALL_READY'; checked: boolean }
  | { type: 'START_CONFIRM'; total: number }
  | {
      type: 'FINISH_CONFIRM';
      items: BatchEnrollmentItem[];
      completed: number;
      total: number;
      aborted: boolean;
    }
  | { type: 'BACK_TO_INPUT'; rawEmails?: string }
  | { type: 'REQUEST_CLOSE' }
  | { type: 'CANCEL_CLOSE' }
  | { type: 'SET_COPIED_PROBLEMS'; copied: boolean };

/** Creates the initial state for the batch enrollment phase machine. */
export function createInitialBatchEnrollmentState(rawEmails = ''): BatchEnrollmentState {
  return {
    phase: 'input',
    rawEmails,
    items: [],
    progress: { completed: 0, total: 0 },
    inputError: '',
    abortedNotice: '',
    confirmingClose: false,
    copiedProblems: false
  };
}

/** Returns true while preview checks or sequential enrollment requests are running. */
export function isBatchBusy(phase: BatchPhase): boolean {
  return phase === 'checking' || phase === 'submitting';
}

/** Returns true when closing the dialog should prompt before discarding state. */
export function hasBatchUnsavedWork(state: BatchEnrollmentState): boolean {
  return state.phase === 'input' ? state.rawEmails.trim() !== '' : state.phase === 'review';
}

/** Counts items still queued or awaiting preview retry. */
export function countPendingPreview(
  items: BatchEnrollmentItem[],
  summary: BatchSummary
): { queuedCount: number; pendingPreviewCount: number } {
  const queuedCount = items.filter((item) => item.status === 'queued').length;
  return {
    queuedCount,
    pendingPreviewCount: summary.previewErrorCount + queuedCount
  };
}

/** Pure state reducer for batch enrollment phases, progress, selection, and cancellation. */
export function batchEnrollmentReducer(
  state: BatchEnrollmentState,
  action: BatchEnrollmentAction
): BatchEnrollmentState {
  switch (action.type) {
    case 'SET_RAW_EMAILS':
      return { ...state, rawEmails: action.rawEmails, inputError: '' };
    case 'SET_INPUT_ERROR':
      return { ...state, inputError: action.message };
    case 'REMOVE_INVALID_EMAILS':
      return { ...state, rawEmails: keepOnlyValidEmails(state.rawEmails), inputError: '' };
    case 'START_PREVIEW':
      return {
        ...state,
        phase: 'checking',
        items: action.items,
        progress: { completed: 0, total: action.total },
        inputError: '',
        abortedNotice: '',
        confirmingClose: false
      };
    case 'UPDATE_PROGRESS':
      if (!isBatchBusy(state.phase)) return state;
      return { ...state, items: action.items, progress: action.progress };
    case 'FINISH_PREVIEW':
      return {
        ...state,
        phase: 'review',
        items: action.items,
        progress: { completed: action.completed, total: action.total },
        abortedNotice: action.aborted
          ? 'Conferência interrompida. Os itens já conferidos foram mantidos.'
          : ''
      };
    case 'TOGGLE_ITEM':
      if (state.phase !== 'review') return state;
      return {
        ...state,
        items: state.items.map((item) =>
          item.email === action.email && item.status === 'ready'
            ? { ...item, selected: action.checked }
            : item
        )
      };
    case 'TOGGLE_ALL_READY':
      if (state.phase !== 'review') return state;
      return {
        ...state,
        items: state.items.map((item) =>
          item.status === 'ready' ? { ...item, selected: action.checked } : item
        )
      };
    case 'START_CONFIRM':
      return {
        ...state,
        phase: 'submitting',
        progress: { completed: 0, total: action.total },
        abortedNotice: '',
        confirmingClose: false
      };
    case 'FINISH_CONFIRM':
      return {
        ...state,
        phase: 'done',
        items: action.items,
        progress: { completed: action.completed, total: action.total },
        abortedNotice: action.aborted
          ? 'Processamento interrompido. Os alunos já incluídos permanecem registrados.'
          : ''
      };
    case 'BACK_TO_INPUT':
      if (isBatchBusy(state.phase)) return state;
      return {
        ...state,
        phase: 'input',
        rawEmails: typeof action.rawEmails === 'string' ? action.rawEmails : state.rawEmails,
        items: [],
        progress: { completed: 0, total: 0 },
        inputError: '',
        abortedNotice: '',
        confirmingClose: false
      };
    case 'REQUEST_CLOSE':
      if (isBatchBusy(state.phase)) return state;
      return { ...state, confirmingClose: !state.confirmingClose };
    case 'CANCEL_CLOSE':
      return { ...state, confirmingClose: false };
    case 'SET_COPIED_PROBLEMS':
      return { ...state, copiedProblems: action.copied };
  }
}
