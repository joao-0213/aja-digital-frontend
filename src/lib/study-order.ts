/** Legacy timestamps without an offset retain their original browser-local meaning.
 * Explicit offsets and UTC timestamps are compared as instants; invalid dates come last.
 */
export function compareTimestamps(left: string, right: string): number {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a)) return Number.isFinite(b) ? 1 : 0;
  if (!Number.isFinite(b)) return -1;
  return a - b;
}

export function lastAccessedMaterial<T extends { id: string }>(userId: string, materials: readonly T[], progress: readonly {
  userId: string;
  materialId: string;
  lastAccess: string;
}[]): T | undefined {
  const available = new Map(materials.map(material => [material.id, material]));
  let latest: T | undefined;
  let latestTime = -Infinity;
  for (const visit of progress) {
    const material = available.get(visit.materialId);
    const time = Date.parse(visit.lastAccess);
    if (visit.userId === userId && material && Number.isFinite(time) && time > latestTime) {
      latest = material;
      latestTime = time;
    }
  }
  return latest;
}
