import type { SessionClient } from '@/providers/session-client';

export interface CalendarDto {
  id: string;
  title: string;
  kind: 'class' | 'exam' | 'event';
  date: string;
  time: string | null;
  allDay: boolean;
  description: string;
  subjectId: string | null;
  source: 'announcement' | 'assessment';
  sourceId: string;
  href: string;
}
interface CalendarPage {
  items: CalendarDto[];
  page: number;
  pageSize: number;
  total: number;
}

export function createCalendarApi(client: Pick<SessionClient, 'request'>) {
  return {
    upcoming: async (signal?: AbortSignal) => {
      const from = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      const items: CalendarDto[] = [];
      for (let page = 1; ; page++) {
        const query = new URLSearchParams({
          from,
          page: String(page),
          pageSize: '100',
          sort: 'date'
        });
        const result = await client.request<CalendarPage>(`/calendar?${query}`, { signal });
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
      }
    },
    range: async (from: string, to: string, signal?: AbortSignal) => {
      const items: CalendarDto[] = [];
      for (let page = 1; ; page++) {
        const query = new URLSearchParams({
          from,
          to,
          page: String(page),
          pageSize: '100',
          sort: 'date'
        });
        const result = await client.request<CalendarPage>(`/calendar?${query}`, { signal });
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
      }
    }
  };
}
