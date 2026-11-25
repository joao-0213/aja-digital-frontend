import type { Assessment } from '@/models';

type AssessmentStructure = Pick<Assessment, 'moduleId' | 'questionIds'>;
type EditorStructure = AssessmentStructure & { originals: readonly unknown[] };

const brasiliaTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const brasiliaSeconds = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo', second: '2-digit', hourCycle: 'h23'
});

export function toBrazilDateTimeLocal(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = Object.fromEntries(brasiliaTime.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function fromBrazilDateTimeLocal(value: string, preserveTimeFrom?: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  let precision = '00';
  if (preserveTimeFrom && Number.isFinite(Date.parse(preserveTimeFrom))) {
    const parts = Object.fromEntries(brasiliaSeconds.formatToParts(new Date(preserveTimeFrom)).map(part => [part.type, part.value]));
    precision = `${parts.second}.${String(new Date(preserveTimeFrom).getUTCMilliseconds()).padStart(3, '0')}`;
  }
  const result = `${value}:${precision}-03:00`;
  return toBrazilDateTimeLocal(result) === value ? result : null;
}

export function minBrazilDateTimeLocal(nowMs = Date.now()): string {
  const roundedMs = Math.ceil(nowMs / 60_000) * 60_000;
  return toBrazilDateTimeLocal(new Date(roundedMs).toISOString());
}

export function isDeadlineInPast(deadline: string | null | undefined, nowMs = Date.now()): boolean {
  if (!deadline) return false;
  const parsed = Date.parse(deadline);
  return Number.isFinite(parsed) && parsed < nowMs;
}

export function needsAssessmentStructureRecovery(current: AssessmentStructure | undefined, local: EditorStructure, hasDeliveries: boolean): boolean {
  return !!current && hasDeliveries && (current.moduleId !== local.moduleId || current.questionIds.length !== local.questionIds.length || current.questionIds.some((id, index) => id !== local.questionIds[index]) || local.originals.length > 0);
}

/** Recover only immutable fields; keep the editor's text and revision review separate. */
export function restoreAssessmentStructure<T extends EditorStructure>(local: T, current: AssessmentStructure): T {
  return { ...local, moduleId: current.moduleId, questionIds: [...current.questionIds], originals: [] };
}
