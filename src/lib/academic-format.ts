export function resolveActorDisplayName(
  actorId: string | null | undefined,
  knownActors: readonly { id: string; name: string }[] = [],
  fallback = 'Equipe docente'
) {
  const value = actorId?.trim();
  if (!value) return fallback;
  const known = knownActors.find((actor) => actor.id === value);
  if (known?.name.trim()) return known.name.trim();
  if (!value.includes(' ') && (/[-_]/.test(value) || /^[0-9a-f]{8,}$/i.test(value)))
    return fallback;
  return value;
}

export function moduleDisplayNumber(
  modules: readonly { id: string; subjectId?: string; order: number }[],
  target: { id: string; subjectId?: string; order: number } | undefined
) {
  if (!target) return null;
  const siblings = (
    target.subjectId ? modules.filter((item) => item.subjectId === target.subjectId) : [...modules]
  ).sort((a, b) => a.order - b.order);
  const index = siblings.findIndex((item) => item.id === target.id);
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
    .map((entry) => entry.item);
}
