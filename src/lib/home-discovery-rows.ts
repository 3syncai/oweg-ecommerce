/** Hold only the unfinished row while more catalogue pages are available. */
export function discoveryRows(total: number, columns: number, hasMore: boolean) {
  const width = Math.max(1, Math.floor(columns));
  const visibleCount = hasMore ? total - total % width : total;
  return { visibleCount, bufferedCount: total - visibleCount, needsFill: hasMore && (total === 0 || total % width !== 0) };
}

/** Never repeat a cursor if an upstream response fails to advance. */
export function nextDiscoveryOffset(next: number | null, current: number): number | undefined {
  return typeof next === 'number' && Number.isSafeInteger(next) && next > current ? next : undefined;
}
