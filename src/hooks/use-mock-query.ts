'use client';

import { useEffect, useState } from 'react';
import { mockRequest } from '@/mocks/api';
export function useMockQuery(key: string) {
  const [state, setState] = useState<{
    key: string;
    status: 'loading' | 'success' | 'error';
    error?: string;
  }>({
    key,
    status: 'loading'
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({
      key,
      status: 'loading'
    });
    mockRequest(() => true, controller.signal).then(() => setState({
      key,
      status: 'success'
    })).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({
        key,
        status: 'error',
        error: error instanceof Error ? error.message : 'Falha ao carregar.'
      });
    });
    return () => controller.abort();
  }, [key, retry]);
  return {
    loading: state.key !== key || state.status === 'loading',
    error: state.status === 'error' ? state.error : undefined,
    retry: () => setRetry(value => value + 1)
  };
}
