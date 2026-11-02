/** Refuse async callbacks without leaving their rejected promises unobserved. */
export function synchronous(value) {
  if (value && typeof value.then === 'function') {
    void Promise.resolve(value).catch(() => {});
    throw new Error('Service callbacks must be synchronous.');
  }
  return value;
}
