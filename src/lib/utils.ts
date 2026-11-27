export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}
export function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR');
}
export function dateLabel(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', options ?? {
    day: '2-digit',
    month: 'short'
  }).format(new Date(date.length === 10 ? `${date}T12:00:00` : date));
}
export function brazilDateTimeLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(parsed);
}
export function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}
export function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}
export function percent(done: number, total: number) {
  return total ? Math.round(done / total * 100) : 0;
}
export function formatScore(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}
export function textMatch(text: string, search: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  return normalize(text).includes(normalize(search));
}
