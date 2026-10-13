import type { MenuItem } from "obsidian";

/** Root element of a menu item, or null when Obsidian does not expose it. */
export function itemDom(item: MenuItem): HTMLElement | null {
	const dom = (item as { dom?: unknown }).dom;
	return dom instanceof HTMLElement ? dom : null;
}
