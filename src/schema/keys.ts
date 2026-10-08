/** Keys that would hit inherited members when used as property names. */
const UNSAFE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

export function isUnsafeKey(key: string): boolean {
	return UNSAFE_KEYS.has(key);
}

/** Own key matching `name` case-insensitively (exact match preferred). */
export function findOwnKey(obj: object, name: string): string | undefined {
	if (Object.hasOwn(obj, name)) return name;
	const lower = name.toLowerCase();
	return Object.keys(obj).find((k) => k.toLowerCase() === lower);
}
