import { around } from "monkey-around";
import type { MetadataTypeManager } from "./detect";

/** Base and view behind a right-clicked column header. */
export interface HeaderBase {
	basePath: string;
	viewName: string | null;
}

export interface HeaderTypeChangeOptions {
	/** Base behind a right-clicked header cell; production: resolveBase on the ancestor holding `.bases-toolbar`. */
	resolve: (cell: Element) => HeaderBase | null;
	pluginTypes: () => ReadonlySet<string>;
	/** `key` is lowercase. */
	hasBaseEntry: (basePath: string, key: string) => boolean;
	open: (base: HeaderBase, focus: { name: string; type: string }) => void;
}

export interface HeaderTypeChange {
	/** Header context remembered since the last right-click on a column header, if not yet discarded. */
	pending(): HeaderBase | null;
	uninstall(): void;
}

/** Column header cells of a Bases table, without the file-name column. Event targets are often children of the cell. */
const HEADER_CELL_SELECTOR = ".bases-thead .bases-td:not(.mod-implicit)";
const MENU_SELECTOR = ".menu";

// Duck-typed: `instanceof Element` fails for nodes of popout windows.
const closest = (target: EventTarget | null, selector: string): Element | null =>
	typeof (target as Element | null)?.closest === "function" ? (target as Element).closest(selector) : null;

/**
 * Wraps `metadataTypeManager.setType`: a type change chosen from a base column header opens the schema dialog
 * when the type is a plugin type or the base has its own entry for the field. The original always runs first.
 *
 * The header context is discarded after the first `setType` and on the next input outside a menu, because native
 * menus (macOS default) put no `.menu` in the DOM and swallow Escape and outside clicks.
 * Residual risk: a `setType` from another source (e.g. programmatic) while a context is pending, with no input in
 * between, is attributed to the header.
 *
 * Returns null when `setType` is missing.
 */
export function installHeaderTypeChange(doc: Document, mtm: MetadataTypeManager, opts: HeaderTypeChangeOptions): HeaderTypeChange | null {
	if (typeof mtm.setType !== "function") return null;
	let context: HeaderBase | null = null;

	const onContextMenu = (e: Event): void => {
		context = null;
		const cell = closest(e.target, HEADER_CELL_SELECTOR);
		if (!cell) return;
		try {
			context = opts.resolve(cell);
		} catch (err) {
			console.error("Improved Bases: could not resolve the base of a column header", err);
		}
	};
	// Pointer events inside a DOM menu belong to the item click that calls setType.
	const onPointer = (e: Event): void => {
		if (!closest(e.target, MENU_SELECTOR)) context = null;
	};
	// Keyboard navigation inside an open DOM menu keeps the context; with a native menu the page gets no keys.
	const onKeyDown = (): void => {
		if (!doc.querySelector(MENU_SELECTOR)) context = null;
	};

	const afterSetType = (base: HeaderBase, name: string, type: string): void => {
		const key = String(name).toLowerCase();
		if (!opts.pluginTypes().has(String(type).toLowerCase()) && !opts.hasBaseEntry(base.basePath, key)) return;
		opts.open(base, { name, type });
	};

	const uninstallPatch = around(mtm as Required<Pick<MetadataTypeManager, "setType">>, {
		setType(next) {
			return function (this: MetadataTypeManager, name: string, type: string): unknown {
				const base = context;
				context = null;
				const result = next.call(this, name, type);
				if (base) {
					try {
						afterSetType(base, name, type);
					} catch (err) {
						console.error("Improved Bases: header type change failed", err);
					}
				}
				return result;
			};
		},
	});

	const listeners: [string, (e: Event) => void][] = [
		["contextmenu", onContextMenu],
		["pointerdown", onPointer],
		["mousedown", onPointer],
		["keydown", onKeyDown],
	];
	for (const [type, fn] of listeners) doc.addEventListener(type, fn, true);

	return {
		pending: () => context,
		uninstall() {
			for (const [type, fn] of listeners) doc.removeEventListener(type, fn, true);
			uninstallPatch();
			context = null;
		},
	};
}
