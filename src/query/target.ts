/** A base plus an optional named view; without a view the base's default (first) view applies. */
export interface QueryTarget { base: string; view?: string }

/** Map key only; never parsed back. */
export function targetKey(t: QueryTarget): string {
	return t.view === undefined ? t.base : `${t.base}#${t.view}`;
}
