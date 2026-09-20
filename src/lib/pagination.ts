export const DEFAULT_PAGE_SIZE = 20;

export function parsePage(pageParam: string | undefined): number {
  return Math.max(1, Number(pageParam) || 1);
}

/**
 * Every list query fetches `pageSize + 1` rows (see the plan's "Prev/Next only" decision — no
 * COUNT query anywhere). This is the one place that turns that into "this page's rows" + whether
 * there's a next page — a trivial, query-shape-independent step, unlike the actual `skip`/`take`
 * query construction, which stays hand-written per call site since the `where` clause differs
 * every time.
 */
export function splitPage<T>(rows: T[], pageSize: number = DEFAULT_PAGE_SIZE): { items: T[]; hasNextPage: boolean } {
  return { items: rows.slice(0, pageSize), hasNextPage: rows.length > pageSize };
}
