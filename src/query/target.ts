/** A base plus an optional named view; without a view only the base's global filters apply. */
export interface QueryTarget { base: string; view?: string }

/** Map key only; never parsed back. */
export function targetKey(t: QueryTarget): string {
	return t.view === undefined ? t.base : `${t.base}#${t.view}`;
}

/** A view name as text: YAML reads unquoted `2024` or `true` as number/boolean; null for other types. */
export function viewName(name: unknown): string | null {
	return typeof name === "string" ? name : typeof name === "number" || typeof name === "boolean" ? String(name) : null;
}
