/** Local-only fake transport. No fetch, credentials, cookies or real API calls. */
export const NETWORK_DELAY_MS = 500;
let failNext = false;
export function simulateNextFailure() {
  failNext = true;
}
export async function mockRequest<T>(operation: () => T, signal?: AbortSignal): Promise<T> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, NETWORK_DELAY_MS);
    signal?.addEventListener('abort', abort, {
      once: true
    });
  });
  if (failNext) {
    failNext = false;
    throw new Error('Não foi possível concluir a simulação. Tente novamente.');
  }
  return operation();
}
