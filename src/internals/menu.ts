import type { Menu, MenuItem } from "obsidian";

/** Undocumented members of Obsidian's DOM menu; every access is feature-detected. */
type Keyed = { register(modifiers: string[], key: string | null, fn: () => unknown): unknown; keys: unknown[] };

function isKeyed(value: unknown): value is Keyed {
	if (typeof value !== "object" || value === null) return false;
	const v = value as { register?: unknown; keys?: unknown };
	return typeof v.register === "function" && Array.isArray(v.keys);
}

/** Root element of a menu item, or null when Obsidian does not expose it. */
export function itemDom(item: MenuItem): HTMLElement | null {
	const dom = (item as { dom?: unknown }).dom;
	return dom instanceof HTMLElement ? dom : null;
}

export interface MenuInternals {
	dom: HTMLElement;
	/** Runs `fn` on Enter before the menu's own handler (which would otherwise swallow it). */
	onEnter(fn: () => void): void;
}

/** The menu's DOM and key scope; null unless both are available (then the menu stays a plain menu). */
export function menuInternals(menu: Menu): MenuInternals | null {
	const { dom, scope } = menu as { dom?: unknown; scope?: unknown };
	if (!(dom instanceof HTMLElement) || !isKeyed(scope)) return null;
	return {
		dom,
		onEnter(fn) {
			const handler = scope.register([], "Enter", () => {
				fn();
				return false;
			});
			const last = scope.keys.length - 1;
			if (last > 0 && scope.keys[last] === handler) scope.keys.unshift(scope.keys.pop());
		},
	};
}
