type RankedCategory = { rank?: number | null; category_children?: RankedCategory[] };

export function compareCategoryRank(a: RankedCategory, b: RankedCategory): number {
  const left = typeof a.rank === 'number' && Number.isFinite(a.rank) ? a.rank : Infinity;
  const right = typeof b.rank === 'number' && Number.isFinite(b.rank) ? b.rank : Infinity;
  // Preserve the API's order for equal or unranked categories.
  return left === right ? 0 : left < right ? -1 : 1;
}

export function sortCategoriesByRank<T extends RankedCategory>(categories: T[]): T[] {
  return categories.map(category => ({
    ...category,
    ...(category.category_children ? { category_children: sortCategoriesByRank(category.category_children) } : {}),
  })).sort(compareCategoryRank);
}
