import type { ModuleOrderCommand } from '../api';

/** Reorder the complete server snapshot, never an arbitrarily paged subset. */
export function moduleOrderCommand(
  subjectRevision: number,
  modules: readonly { id: string; revision?: number }[],
  movingId: string,
  direction: -1 | 1
): ModuleOrderCommand | null {
  if (new Set(modules.map((item) => item.id)).size !== modules.length)
    throw new Error('Há módulos repetidos. Recarregue a disciplina.');
  const index = modules.findIndex((item) => item.id === movingId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= modules.length) return null;
  const ordered = [...modules];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return {
    expectedRevision: subjectRevision,
    items: ordered.map((item) => ({ id: item.id, expectedRevision: item.revision ?? 1 }))
  };
}
