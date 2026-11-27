import { HttpError } from './http-client';

/** Cancelled requests and aborted fetches are expected lifecycle events, never user-facing failures. */
export function isCancelledError(cause: unknown): boolean {
  if (cause instanceof HttpError) return cause.kind === 'cancelled';
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { name?: unknown }).name === 'AbortError'
  );
}

export function toErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
