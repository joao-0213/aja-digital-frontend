import type { SessionClient } from '@/providers/session-client';
import type { PaginatedResponse } from '@/models';
import { collectAllPages } from '@/lib/http-pagination';

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
type CalendarPage = PaginatedResponse<CalendarDto>;

export function createCalendarApi(client: Pick<SessionClient, 'request'>) {
  return {
    upcoming: (signal?: AbortSignal) => {
      const from = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      return collectAllPages(
        (page, pageSignal) => {
          const query = new URLSearchParams({
            from,
            page: String(page),
            pageSize: '100',
            sort: 'date'
          });
          return client.request<CalendarPage>(`/calendar?${query}`, { signal: pageSignal });
        },
        { signal }
      );
    },
    range: (from: string, to: string, signal?: AbortSignal) =>
      collectAllPages(
        (page, pageSignal) => {
          const query = new URLSearchParams({
            from,
            to,
            page: String(page),
            pageSize: '100',
            sort: 'date'
          });
          return client.request<CalendarPage>(`/calendar?${query}`, { signal: pageSignal });
        },
        { signal }
      )
  };
}
