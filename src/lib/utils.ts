export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}
export function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('');
}
export function dateLabel(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', options ?? {
    day: '2-digit',
    month: 'short'
  }).format(new Date(date.length === 10 ? `${date}T12:00:00` : date));
}
export function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}
export function percent(done: number, total: number) {
  return total ? Math.round(done / total * 100) : 0;
}
export function textMatch(text: string, search: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  return normalize(text).includes(normalize(search));
}
export const roleLabels = {
  student: 'Aluno',
  teacher: 'Professor',
  admin: 'Administrador'
} as const;
export const difficultyLabels = {
  easy: 'Fácil',
  medium: 'Média',
  hard: 'Difícil'
} as const;
export const colorClasses = {
  violet: 'bg-brand-100 text-brand-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-emerald-50 text-emerald-700'
} as const;
