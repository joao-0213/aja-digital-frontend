import type { SubmissionAttachment, SubmissionStudent } from '../api';
import type { WorkUploadIntent } from '../lib/work-upload-batch';

export type LocalWorkRecovery = {
  revision: number;
  attachments: SubmissionAttachment[];
  uploads: Record<string, WorkUploadIntent>;
  submit?: { revision: number; key: string } | null;
};

export function workOwnerKey(userId: string, sessionId: string, activityId: string): string {
  return `aja-work-v1:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}:${encodeURIComponent(activityId)}`;
}

export function workRevisionStorageKey(ownerKey: string, revision: number): string {
  return `${ownerKey}:revision:${revision}`;
}

export function isLocalWorkRecovery(value: unknown): value is LocalWorkRecovery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<LocalWorkRecovery>;
  return (
    Number.isSafeInteger(candidate.revision) &&
    Array.isArray(candidate.attachments) &&
    typeof candidate.uploads === 'object' &&
    candidate.uploads !== null
  );
}

export function sameWorkAttachments(
  left: SubmissionAttachment[],
  right: SubmissionAttachment[]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function resolveInitialWorkRecovery(
  recovery: LocalWorkRecovery | null,
  initialSubmission: SubmissionStudent | null
) {
  const serverRevision = initialSubmission?.revision ?? 0;
  const matches = Boolean(
    recovery && recovery.revision === serverRevision && !initialSubmission?.submittedAt
  );
  return {
    matches,
    items: matches && recovery ? recovery.attachments : (initialSubmission?.attachments ?? []),
    uploads: matches && recovery ? recovery.uploads : {},
    submitIntent: matches && recovery ? (recovery.submit ?? null) : null,
    notice:
      recovery && !matches
        ? 'Há uma recuperação local de outra revisão. Ela foi mantida sem substituir o estado atual do servidor.'
        : ''
  };
}

export function isWorkSubmissionDirty(
  submission: SubmissionStudent | null,
  items: SubmissionAttachment[],
  uploads: Record<string, WorkUploadIntent>
): boolean {
  return (
    !submission ||
    !sameWorkAttachments(
      items.filter((item) => item.kind !== 'file' || !item.fileId.startsWith('local:')),
      submission.attachments
    ) ||
    Object.keys(uploads).length > 0
  );
}
