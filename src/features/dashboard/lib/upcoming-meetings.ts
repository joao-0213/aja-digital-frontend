export interface UpcomingCalendarEntry {
  id: string;
  title: string;
  date: string;
  time: string | null;
  source: 'announcement' | 'assessment';
  sourceId: string;
  href: string;
}

export function upcomingMeetings(
  entries: readonly UpcomingCalendarEntry[],
  today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
): UpcomingCalendarEntry[] {
  return entries
    .filter((entry) => entry.date >= today)
    .sort((a, b) =>
      `${a.date}${a.time ?? ''}${a.id}`.localeCompare(`${b.date}${b.time ?? ''}${b.id}`)
    )
    .slice(0, 3);
}
