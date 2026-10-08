/** string | string[] | null → string[] (non-strings and empty strings are dropped). */
export function toList(value: unknown): string[] {
	if (typeof value === "string") return value ? [value] : [];
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v !== "");
	return [];
}

/** Value in schema format: `multiple` writes a list, otherwise the first link or null. */
export function relationOutput(links: string[], multiple: boolean): string | string[] | null {
	if (multiple) return links;
	return links[0] ?? null;
}

/** "[[A|x]]" → "A", "[[A#H]]" → "A"; null when the string is not a wikilink. */
export function linkTarget(raw: string): string | null {
	const m = /^\s*\[\[([^\]]+)\]\]\s*$/.exec(raw);
	if (!m?.[1]) return null;
	const target = m[1].split("|")[0]?.split("#")[0]?.split("^")[0]?.trim();
	return target ? target : null;
}
