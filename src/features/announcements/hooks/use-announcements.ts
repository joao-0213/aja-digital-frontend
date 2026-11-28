'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createAnnouncementsApi } from '../api';

export const announcementKeys = {
  all: ['announcements'] as const,
  list: ['announcements', 'list'] as const,
  options: ['announcements', 'options'] as const
};

export function useAnnouncementsApi() {
  const client = useSessionClient();
  return useMemo(() => createAnnouncementsApi(client), [client]);
}
