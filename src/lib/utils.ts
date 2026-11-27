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
export function resolveActorDisplayName(
  actorId: string | null | undefined,
  knownActors: readonly { id: string; name: string }[] = [],
  fallback = 'Equipe docente',
) {
  const value = actorId?.trim();
  if (!value) return fallback;
  const known = knownActors.find(actor => actor.id === value);
  if (known?.name.trim()) return known.name.trim();
  if (!value.includes(' ') && (/[-_]/.test(value) || /^[0-9a-f]{8,}$/i.test(value))) return fallback;
  return value;
}
export function moduleDisplayNumber(
  modules: readonly { id: string; subjectId?: string; order: number }[],
  target: { id: string; subjectId?: string; order: number } | undefined,
) {
  if (!target) return null;
  const siblings = (target.subjectId ? modules.filter(item => item.subjectId === target.subjectId) : [...modules])
    .sort((a, b) => a.order - b.order);
  const index = siblings.findIndex(item => item.id === target.id);
  if (index >= 0) return index + 1;
  return target.order >= 1 ? target.order : target.order + 1;
}
export function sortByDeadlineAsc<T extends { deadline: string | null }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => {
      const time = item.deadline ? Date.parse(item.deadline) : Number.NaN;
      return { item, index, time: Number.isNaN(time) ? Number.POSITIVE_INFINITY : time };
    })
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map(entry => entry.item);
}
export function aggregateAttendanceByStudent(lessons: readonly { records: Record<string, boolean> }[]) {
  const totals = new Map<string, { present: number; total: number }>();
  for (const lesson of lessons) {
    for (const [studentId, present] of Object.entries(lesson.records)) {
      if (typeof present !== 'boolean') continue;
      const entry = totals.get(studentId) ?? { present: 0, total: 0 };
      entry.total += 1;
      if (present) entry.present += 1;
      totals.set(studentId, entry);
    }
  }
  return totals;
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
