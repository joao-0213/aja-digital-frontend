const DASHBOARD_TIME_ZONE = 'America/Sao_Paulo';

export function dashboardDeadlineLabel(value: string) {
  const date = new Date(value);
  const localDate = new Intl.DateTimeFormat('pt-BR', { timeZone: DASHBOARD_TIME_ZONE, day: '2-digit', month: 'short' }).format(date);
  const localTime = new Intl.DateTimeFormat('pt-BR', { timeZone: DASHBOARD_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return `${localDate} · ${localTime}`;
}
