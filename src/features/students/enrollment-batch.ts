import type { EnrollmentDto, EnrollmentPreview } from './api.ts';
import { normalizeEmail, validEmail } from '../../lib/enrollment.ts';
import { HttpError } from '../../lib/http-client.ts';

export const MAX_EMAIL_LENGTH = 254;
export const DEFAULT_PREVIEW_CONCURRENCY = 2;

export interface ParsedEmailEntry {
  raw: string;
  email: string;
  valid: boolean;
  reason?: string;
}

export interface ParsedEmailBatch {
  entries: ParsedEmailEntry[];
  valid: string[];
  invalid: ParsedEmailEntry[];
  duplicatesRemoved: number;
  totalTokens: number;
}

export type BatchItemStatus =
  | 'invalid'
  | 'queued'
  | 'checking'
  | 'ready'
  | 'blocked'
  | 'preview-error'
  | 'submitting'
  | 'success'
  | 'error';

export interface BatchEnrollmentItem {
  email: string;
  idempotencyKey: string;
  status: BatchItemStatus;
  selected: boolean;
  preview?: EnrollmentPreview;
  enrollment?: EnrollmentDto;
  error?: string;
}

export interface BatchProgress {
  completed: number;
  total: number;
  currentEmail?: string;
}

export interface BatchPreviewOutcome {
  badge: string;
  tone: 'green' | 'amber' | 'purple' | 'blue' | 'red';
  detail: string;
}

export interface BatchPreviewRunResult {
  items: BatchEnrollmentItem[];
  completed: number;
  total: number;
  aborted: boolean;
  sessionExpired: boolean;
}

export interface BatchConfirmRunResult {
  items: BatchEnrollmentItem[];
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
  aborted: boolean;
  sessionExpired: boolean;
}

export interface BatchSummary {
  total: number;
  validCount: number;
  invalidCount: number;
  readyCount: number;
  selectedCount: number;
  blockedCount: number;
  previewErrorCount: number;
  successCount: number;
  activeCount: number;
  pendingCount: number;
  errorCount: number;
  problemEmails: string[];
}

/** Splits raw user input (single email or pasted list) into cleaned, deduplicated, validated entries. */
export function parseBatchEmails(raw: string): ParsedEmailBatch {
  const tokens = raw.split(/[\s,;]+/).map(part => part.trim()).filter(Boolean);
  const seen = new Set<string>();
  const entries: ParsedEmailEntry[] = [];
  const valid: string[] = [];
  const invalid: ParsedEmailEntry[] = [];
  let duplicatesRemoved = 0;

  for (const token of tokens) {
    const email = normalizeEmail(token);
    if (seen.has(email)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(email);
    const reason = email.length > MAX_EMAIL_LENGTH
      ? 'O e-mail excede o limite de 254 caracteres.'
      : !validEmail(email)
        ? 'Formato de e-mail inválido.'
        : undefined;
    const entry: ParsedEmailEntry = reason
      ? { raw: token, email, valid: false, reason }
      : { raw: token, email, valid: true };
    entries.push(entry);
    if (entry.valid) valid.push(email);
    else invalid.push(entry);
  }

  return { entries, valid, invalid, duplicatesRemoved, totalTokens: tokens.length };
}

/** Returns only the valid, normalized, deduplicated emails joined by newline. */
export function keepOnlyValidEmails(raw: string): string {
  return parseBatchEmails(raw).valid.join('\n');
}

/** Builds initial batch items, assigning a unique stable Idempotency-Key per email. */
export function createBatchItems(
  parsed: ParsedEmailBatch,
  existingKeys?: ReadonlyMap<string, string>,
  createKey: () => string = () => globalThis.crypto.randomUUID(),
): BatchEnrollmentItem[] {
  return parsed.entries.map(entry => ({
    email: entry.email,
    idempotencyKey: existingKeys?.get(entry.email) ?? createKey(),
    status: entry.valid ? 'queued' : 'invalid',
    selected: false,
    error: entry.valid ? undefined : entry.reason,
  }));
}

export function describePreviewOutcome(preview: EnrollmentPreview): BatchPreviewOutcome {
  if (!preview.canEnroll) {
    return {
      badge: 'Impedido',
      tone: 'red',
      detail: preview.message || 'Não é possível incluir este e-mail nesta turma.',
    };
  }
  if (preview.existingEnrollment?.status === 'active') {
    return {
      badge: 'Já ativo na turma',
      tone: 'blue',
      detail: preview.account
        ? `${preview.account.name} · Vínculo ativo já registrado nesta turma.`
        : 'Vínculo ativo já registrado nesta turma.',
    };
  }
  if (preview.existingEnrollment?.status === 'pending') {
    if (preview.account && preview.account.emailConfirmedAt !== null) {
      return {
        badge: 'Será ativado',
        tone: 'green',
        detail: `${preview.account.name} · Matrícula pendente será ativada imediatamente.`,
      };
    }
    return {
      badge: 'Já pendente',
      tone: 'purple',
      detail: preview.account
        ? `${preview.account.name} · Pendência já registrada; aguarda confirmação do e-mail.`
        : 'Matrícula pendente já registrada; aguarda cadastro e confirmação.',
    };
  }
  if (preview.account) {
    if (preview.account.emailConfirmedAt !== null) {
      return {
        badge: 'Vínculo imediato',
        tone: 'green',
        detail: `${preview.account.name} · Conta existente com e-mail confirmado.`,
      };
    }
    return {
      badge: 'Ficará pendente',
      tone: 'amber',
      detail: `${preview.account.name} · Conta existente; aguarda confirmação do e-mail.`,
    };
  }
  return {
    badge: 'Ficará pendente',
    tone: 'purple',
    detail: 'Sem conta cadastrada · Aguardará cadastro e confirmação do e-mail.',
  };
}

function isSessionError(error: unknown): boolean {
  return error instanceof HttpError && error.kind === 'session';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function replaceItem(
  items: BatchEnrollmentItem[],
  index: number,
  patch: Partial<BatchEnrollmentItem>,
): BatchEnrollmentItem[] {
  const next = items.slice();
  next[index] = { ...next[index], ...patch };
  return next;
}

/**
 * Checks each queued/failed-preview item via the existing preview endpoint with bounded concurrency.
 * An error on one email never prevents checking the remaining items (except 401 session expiration).
 */
export async function runBatchPreview(
  initialItems: BatchEnrollmentItem[],
  checkEmail: (email: string) => Promise<EnrollmentPreview>,
  options: {
    concurrency?: number;
    onlyStatuses?: BatchItemStatus[];
    isAborted?: () => boolean;
    onUpdate?: (items: BatchEnrollmentItem[], progress: BatchProgress) => void;
  } = {},
): Promise<BatchPreviewRunResult> {
  const onlyStatuses = options.onlyStatuses ?? ['queued', 'preview-error'];
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_PREVIEW_CONCURRENCY));
  let items = initialItems.map(item => ({ ...item }));
  const targetIndices = items
    .map((item, index) => (onlyStatuses.includes(item.status) ? index : -1))
    .filter(index => index >= 0);

  const total = targetIndices.length;
  let completed = 0;
  let cursor = 0;
  let aborted = false;
  let sessionExpired = false;

  const updateAt = (index: number, patch: Partial<BatchEnrollmentItem>, currentEmail?: string) => {
    items = replaceItem(items, index, patch);
    options.onUpdate?.(items, { completed, total, currentEmail });
  };

  if (!total) {
    return { items, completed: 0, total: 0, aborted: false, sessionExpired: false };
  }

  const worker = async () => {
    while (true) {
      if (sessionExpired || cursor >= targetIndices.length) return;
      if (options.isAborted?.()) {
        aborted = true;
        return;
      }
      const index = targetIndices[cursor++];
      const target = items[index];
      updateAt(index, { status: 'checking', error: undefined }, target.email);
      try {
        const preview = await checkEmail(target.email);
        completed++;
        updateAt(index, {
          status: preview.canEnroll ? 'ready' : 'blocked',
          selected: preview.canEnroll,
          preview,
          error: preview.canEnroll ? undefined : (preview.message || 'Inclusão não permitida.'),
        }, target.email);
      } catch (error: unknown) {
        completed++;
        if (isSessionError(error)) sessionExpired = true;
        updateAt(index, {
          status: 'preview-error',
          selected: false,
          preview: undefined,
          error: errorMessage(error, 'Não foi possível conferir a inclusão.'),
        }, target.email);
      }
    }
  };

  const workerCount = Math.min(concurrency, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { items, completed, total, aborted, sessionExpired };
}

/**
 * Submits selected (or retryable failed) items strictly sequentially via POST /enrollments,
 * preserving each item's unique Idempotency-Key and isolating partial failures.
 */
export async function runBatchConfirm(
  initialItems: BatchEnrollmentItem[],
  addEmail: (email: string, idempotencyKey: string) => Promise<EnrollmentDto>,
  options: {
    mode?: 'selected' | 'retry-failed';
    isAborted?: () => boolean;
    onUpdate?: (items: BatchEnrollmentItem[], progress: BatchProgress) => void;
  } = {},
): Promise<BatchConfirmRunResult> {
  const mode = options.mode ?? 'selected';
  let items = initialItems.map(item => ({ ...item }));
  const targetIndices = items
    .map((item, index) => {
      if (mode === 'retry-failed') return item.status === 'error' ? index : -1;
      return item.status === 'ready' && item.selected ? index : -1;
    })
    .filter(index => index >= 0);

  const total = targetIndices.length;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let aborted = false;
  let sessionExpired = false;

  const updateAt = (index: number, patch: Partial<BatchEnrollmentItem>, currentEmail?: string) => {
    items = replaceItem(items, index, patch);
    options.onUpdate?.(items, { completed, total, currentEmail });
  };

  for (const index of targetIndices) {
    if (options.isAborted?.()) {
      aborted = true;
      break;
    }
    const target = items[index];
    updateAt(index, { status: 'submitting', error: undefined }, target.email);
    try {
      const enrollment = await addEmail(target.email, target.idempotencyKey);
      completed++;
      succeeded++;
      updateAt(index, { status: 'success', enrollment, error: undefined }, target.email);
    } catch (error: unknown) {
      completed++;
      failed++;
      const expired = isSessionError(error);
      updateAt(index, {
        status: 'error',
        error: errorMessage(error, 'Não foi possível concluir a inclusão.'),
      }, target.email);
      if (expired) {
        sessionExpired = true;
        break;
      }
    }
  }

  return { items, completed, total, succeeded, failed, aborted, sessionExpired };
}

export function summarizeBatch(items: BatchEnrollmentItem[]): BatchSummary {
  let validCount = 0;
  let invalidCount = 0;
  let readyCount = 0;
  let selectedCount = 0;
  let blockedCount = 0;
  let previewErrorCount = 0;
  let successCount = 0;
  let activeCount = 0;
  let pendingCount = 0;
  let errorCount = 0;
  const problemEmails: string[] = [];

  for (const item of items) {
    if (item.status === 'invalid') {
      invalidCount++;
      problemEmails.push(item.email);
    } else {
      validCount++;
    }
    if (item.status === 'ready') {
      readyCount++;
      if (item.selected) selectedCount++;
    } else if (item.status === 'blocked') {
      blockedCount++;
      problemEmails.push(item.email);
    } else if (item.status === 'preview-error') {
      previewErrorCount++;
      problemEmails.push(item.email);
    } else if (item.status === 'success') {
      successCount++;
      if (item.enrollment?.status === 'active') activeCount++;
      else pendingCount++;
    } else if (item.status === 'error') {
      errorCount++;
      problemEmails.push(item.email);
    }
  }

  return {
    total: items.length,
    validCount,
    invalidCount,
    readyCount,
    selectedCount,
    blockedCount,
    previewErrorCount,
    successCount,
    activeCount,
    pendingCount,
    errorCount,
    problemEmails,
  };
}
