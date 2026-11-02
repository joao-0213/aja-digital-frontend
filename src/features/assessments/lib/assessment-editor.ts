import type { Assessment } from '@/models';

type AssessmentStructure = Pick<Assessment, 'moduleId' | 'questionIds'>;
type EditorStructure = AssessmentStructure & { originals: readonly unknown[] };

export function needsAssessmentStructureRecovery(current: AssessmentStructure | undefined, local: EditorStructure, hasDeliveries: boolean): boolean {
  return !!current && hasDeliveries && (current.moduleId !== local.moduleId || current.questionIds.length !== local.questionIds.length || current.questionIds.some((id, index) => id !== local.questionIds[index]) || local.originals.length > 0);
}

/** Recover only immutable fields; keep the editor's text and revision review separate. */
export function restoreAssessmentStructure<T extends EditorStructure>(local: T, current: AssessmentStructure): T {
  return { ...local, moduleId: current.moduleId, questionIds: [...current.questionIds], originals: [] };
}
