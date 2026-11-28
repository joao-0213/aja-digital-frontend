'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createCalendarApi } from '../api';

export const calendarKeys = {
  all: ['calendar'] as const,
  list: ['calendar', 'list'] as const,
  options: ['calendar', 'options'] as const
};

export function useCalendarApi() {
  const client = useSessionClient();
  return useMemo(() => createCalendarApi(client), [client]);
}
