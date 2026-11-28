import { HttpError } from '@/lib/http-client';
import type { AssessmentFields, AssessmentStaff } from '../api';

export type BuilderSaveAction = 'draft' | 'publish';
export type BuilderDialogState = 'bank' | 'author' | 'review' | 'reset' | 'leave' | null;
export type PendingCreate = { fields: AssessmentFields; intent: string; action: BuilderSaveAction };
export type PendingPublish = { id: string; revision: number; intent: string };

export interface AssessmentBuilderState {
  activeRecord: AssessmentStaff | undefined;
  businessConflict: boolean;
  latestRecord: AssessmentStaff | null;
  latestError: string;
  latestLoading: boolean;
  pendingCreate: PendingCreate | null;
  pendingPublish: PendingPublish | null;
  dialog: BuilderDialogState;
  pendingAction: BuilderSaveAction | null;
  resetConfirmedFor: string;
  validationError: string;
}

export type AssessmentBuilderAction =
  | { type: 'SET_DIALOG'; dialog: BuilderDialogState }
  | { type: 'CLOSE_DIALOG' }
  | { type: 'SET_VALIDATION_ERROR'; message: string }
  | { type: 'OPEN_RESET_CONFIRM'; action: BuilderSaveAction }
  | { type: 'CONFIRM_RESET'; signature: string; nextAction: BuilderSaveAction }
  | { type: 'RECORD_REMEMBERED'; record: AssessmentStaff }
  | { type: 'CONFLICT_ACKNOWLEDGED'; latest?: AssessmentStaff }
  | { type: 'INSPECT_START' }
  | { type: 'INSPECT_SUCCESS'; record: AssessmentStaff }
  | { type: 'INSPECT_ERROR'; message: string }
  | { type: 'ADOPT_CURRENT'; record: AssessmentStaff }
  | { type: 'BUSINESS_CONFLICT' }
  | { type: 'SET_PENDING_CREATE'; value: PendingCreate | null }
  | { type: 'SET_PENDING_PUBLISH'; value: PendingPublish | null }
  | { type: 'CLEAR_PENDING' }
  | { type: 'SAVE_FINISHED' };

export function createInitialAssessmentBuilderState(
  record: AssessmentStaff | undefined,
  pendingCreate: PendingCreate | null,
  pendingPublish: PendingPublish | null
): AssessmentBuilderState {
  return {
    activeRecord: record,
    businessConflict: false,
    latestRecord: null,
    latestError: '',
    latestLoading: false,
    pendingCreate,
    pendingPublish,
    dialog: null,
    pendingAction: null,
    resetConfirmedFor: '',
    validationError: ''
  };
}

export function assessmentBuilderReducer(
  state: AssessmentBuilderState,
  action: AssessmentBuilderAction
): AssessmentBuilderState {
  switch (action.type) {
    case 'SET_DIALOG':
      return { ...state, dialog: action.dialog };
    case 'CLOSE_DIALOG':
      return { ...state, dialog: null, pendingAction: null };
    case 'SET_VALIDATION_ERROR':
      return { ...state, validationError: action.message };
    case 'OPEN_RESET_CONFIRM':
      return { ...state, pendingAction: action.action, dialog: 'reset' };
    case 'CONFIRM_RESET':
      return {
        ...state,
        resetConfirmedFor: action.signature,
        dialog: action.nextAction === 'publish' ? 'review' : null
      };
    case 'RECORD_REMEMBERED':
      return { ...state, activeRecord: action.record };
    case 'CONFLICT_ACKNOWLEDGED':
      return action.latest
        ? { ...state, activeRecord: action.latest, latestRecord: action.latest }
        : state;
    case 'INSPECT_START':
      return { ...state, latestLoading: true, latestError: '' };
    case 'INSPECT_SUCCESS':
      return { ...state, latestLoading: false, latestRecord: action.record };
    case 'INSPECT_ERROR':
      return { ...state, latestLoading: false, latestError: action.message };
    case 'ADOPT_CURRENT':
      return {
        ...state,
        activeRecord: action.record,
        latestRecord: null,
        latestError: '',
        businessConflict: false,
        validationError: ''
      };
    case 'BUSINESS_CONFLICT':
      return { ...state, businessConflict: true, latestRecord: null, latestError: '' };
    case 'SET_PENDING_CREATE':
      return { ...state, pendingCreate: action.value };
    case 'SET_PENDING_PUBLISH':
      return { ...state, pendingPublish: action.value };
    case 'CLEAR_PENDING':
      return { ...state, pendingCreate: null, pendingPublish: null };
    case 'SAVE_FINISHED':
      return { ...state, dialog: null, pendingAction: null };
  }
}

export function isAmbiguousBuilderError(cause: unknown): boolean {
  return (
    cause instanceof HttpError &&
    (['unavailable', 'timeout', 'invalid-response'].includes(cause.kind) ||
      (cause.status ?? 0) >= 500)
  );
}

export type SaveRequestDecision =
  | { kind: 'retry_uncertain'; action: BuilderSaveAction }
  | { kind: 'blocked' }
  | { kind: 'needs_recovery'; message: string }
  | { kind: 'structural_locked'; message: string }
  | { kind: 'confirm_reset'; action: BuilderSaveAction }
  | { kind: 'validation_error'; message: string }
  | { kind: 'open_review' }
  | { kind: 'save_draft'; confirmResetDrafts: boolean };

export function resolveBuilderSaveRequest(input: {
  action: BuilderSaveAction;
  uncertain: boolean;
  pendingCreateAction?: BuilderSaveAction;
  conflicted: boolean;
  blocked: boolean;
  needsStructureRecovery: boolean;
  structuralLocked: boolean;
  questionStructureChanged: boolean;
  resetConfirmed: boolean;
  validationMessage: string;
}): SaveRequestDecision {
  if (input.uncertain) {
    return { kind: 'retry_uncertain', action: input.pendingCreateAction ?? 'publish' };
  }
  if (input.conflicted || input.blocked) return { kind: 'blocked' };
  if (input.needsStructureRecovery) {
    return {
      kind: 'needs_recovery',
      message: 'Consulte e use a estrutura atual antes de salvar os campos permitidos.'
    };
  }
  if (input.structuralLocked && input.questionStructureChanged) {
    return {
      kind: 'structural_locked',
      message:
        'A atividade já recebeu uma entrega. Mantenha a modalidade, o módulo e as questões atuais.'
    };
  }
  if (input.questionStructureChanged && !input.resetConfirmed) {
    return { kind: 'confirm_reset', action: input.action };
  }
  if (input.validationMessage) {
    return { kind: 'validation_error', message: input.validationMessage };
  }
  if (input.action === 'publish') return { kind: 'open_review' };
  return { kind: 'save_draft', confirmResetDrafts: input.questionStructureChanged };
}
