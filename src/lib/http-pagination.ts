import type { PaginatedResponse } from '@/models';
import { HttpError } from './http-client';

export interface CollectPagesOptions {
  signal?: AbortSignal;
  assertCurrent?: () => void;
  isCurrent?: () => boolean;
}

function checkActive(options: CollectPagesOptions) {
  if (options.signal?.aborted) {
    throw new HttpError('cancelled', 'A consulta foi cancelada.');
  }
  options.assertCurrent?.();
  if (options.isCurrent && !options.isCurrent()) {
    throw new HttpError('cancelled', 'A sessão desta consulta mudou ou a consulta foi cancelada.');
  }
}

/** Collect all pages from a 1-indexed paginated endpoint, guarding abort and session changes. */
export async function collectAllPages<T>(
  fetchPage: (
    page: number,
    signal?: AbortSignal
  ) => Promise<Pick<PaginatedResponse<T>, 'items' | 'total'>>,
  options: CollectPagesOptions = {}
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    checkActive(options);
    const result = await fetchPage(page, options.signal);
    checkActive(options);
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) break;
  }
  return items;
}
