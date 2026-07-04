export function compareByAtId(
  a: { at: string; id: string },
  b: { at: string; id: string }
): number {
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortByAtId<T extends { at: string; id: string }>(
  items: T[]
): T[] {
  return [...items].sort(compareByAtId);
}
