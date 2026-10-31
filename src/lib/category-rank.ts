type RankedCategory = { id?: string; rank?: number | null; category_children?: RankedCategory[] };

export function compareCategoryRank(a: RankedCategory, b: RankedCategory): number {
  const left = typeof a.rank === 'number' && Number.isFinite(a.rank) ? a.rank : Infinity;
  const right = typeof b.rank === 'number' && Number.isFinite(b.rank) ? b.rank : Infinity;
  // Match the admin list's ID tie-break when saved sibling ranks are duplicated.
  if (left === right) {
    return Number.isFinite(left) && a.id && b.id ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : 0;
  }
  return left < right ? -1 : 1;
}

export function sortCategoriesByRank<T extends RankedCategory>(categories: T[]): T[] {
  return categories.map(category => ({
    ...category,
    ...(category.category_children ? { category_children: sortCategoriesByRank(category.category_children) } : {}),
  })).sort(compareCategoryRank);
}
