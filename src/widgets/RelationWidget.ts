import { LinkValue, Notice, TFile } from "obsidian";
import type { RelationField } from "../schema/types";
import { entryIcon, renderIcon } from "./icons";
import { EntryPicker, type PickerItem } from "./pickers";
import type { PluginWidget } from "./types";
import { linkTarget, relationOutput, toList } from "./values";

const NOT_IN_TARGET = "Not in target base";

/** Link chips; clicking the field opens a checkbox picker over the target base entries. */
export const RelationWidget: PluginWidget<RelationField> = (el, value, ctx, field, env) => {
	const { app, membership } = env;
	let links = toList(value);
	// A list for `multiple: false` (or a string for `multiple: true`) is shown unchanged; it is rewritten on the next edit.
	const mismatch = value != null && Array.isArray(value) !== field.multiple;

	const root = el.createDiv({
		cls: "improved-bases-relation",
		// No aria-label: the chip links are the accessible name; the popup is announced via aria-haspopup.
		attr: { "data-improved-bases": "relation", tabindex: "0", role: "button", "aria-haspopup": "dialog" },
	});
	if (mismatch) root.addClass("is-mismatch");

	const commit = (next: string[]): void => {
		links = next;
		root.removeClass("is-mismatch");
		draw();
		ctx.onChange(relationOutput(next, field.multiple));
	};

	const resolve = (raw: string): TFile | null => {
		const target = linkTarget(raw);
		return target ? app.metadataCache.getFirstLinkpathDest(target, ctx.sourcePath) : null;
	};

	/** Paths of the target base entries, or null while the query result is unknown. */
	const targetPaths = (): Set<string> | null => {
		const entries = membership.targetEntries(field.base);
		return entries ? new Set(entries.map((f) => f.path)) : null;
	};

	const isForeign = (inTarget: Set<string> | null, dest: TFile | null): boolean =>
		!!inTarget && !(dest && inTarget.has(dest.path));

	const buildItems = (): PickerItem[] => {
		const inTarget = targetPaths();
		// A link stored twice is listed once; a toggle then removes both copies.
		const active = [...new Set(links)].map((raw): PickerItem => {
			const file = resolve(raw);
			return { raw, file, label: file?.basename ?? raw, active: true, foreign: isForeign(inTarget, file) };
		});
		const activePaths = new Set(active.flatMap((i) => (i.file ? [i.file.path] : [])));
		const rest = (membership.targetEntries(field.base) ?? [])
			.filter((file) => !activePaths.has(file.path))
			.map((file): PickerItem => ({
				raw: `[[${app.metadataCache.fileToLinktext(file, ctx.sourcePath, true)}]]`,
				file,
				label: file.basename,
				active: false,
				foreign: false,
			}));
		return [...active, ...rest];
	};

	const toggle = (items: PickerItem[], item: PickerItem): void => {
		if (field.multiple) {
			commit(item.active ? links.filter((l) => l !== item.raw) : [...links, item.raw]);
			item.active = !item.active;
			return;
		}
		const wasActive = item.active;
		for (const i of items) i.active = false;
		item.active = !wasActive;
		commit(wasActive ? [] : [item.raw]);
	};

	const openPicker = (): void => {
		if (!(app.vault.getAbstractFileByPath(field.base) instanceof TFile)) {
			new Notice(`Target base not found: ${field.base}`);
			return;
		}
		const items = buildItems();
		new EntryPicker(app, items, (i) => entryIcon(app, i.file, field), (i) => toggle(items, i), env.overlays).open();
	};

	const draw = (): void => {
		try {
			render();
		} catch (e) {
			console.error("Improved Bases: relation widget failed to render", e);
			root.empty();
			root.setText(links.join(", "));
		}
	};

	const render = (): void => {
		root.empty();
		const inTarget = targetPaths();
		for (const raw of links) {
			const chip = root.createSpan({ cls: "improved-bases-chip" });
			const dest = resolve(raw);
			if (isForeign(inTarget, dest)) {
				chip.addClass("is-foreign");
				chip.setAttribute("title", NOT_IN_TARGET);
			}
			renderIcon(chip.createSpan(), entryIcon(app, dest, field));
			const link = LinkValue.parseFromString(app, raw, ctx.sourcePath);
			const body = chip.createSpan({ cls: "improved-bases-chip-body" });
			if (link) link.renderTo(body, app.renderContext);
			else body.setText(raw);
		}
	};

	// Capture phase: a plain click anywhere in the field, links included, opens the picker and never reaches the
	// link's own handler. Modifier or middle clicks keep the link's native behavior (open in a new tab).
	// Obsidian renders wikilinks as `span.internal-link`, markdown links as `a`.
	root.addEventListener(
		"click",
		(evt) => {
			if (evt.button !== 0 || evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
			if (evt.target instanceof Element && evt.target.closest("a, .internal-link")) {
				evt.preventDefault();
				evt.stopPropagation();
			}
			openPicker();
		},
		true,
	);
	root.addEventListener("keydown", (evt) => {
		// Keys from a focused link inside the field belong to the link.
		if (evt.target !== root || (evt.key !== "Enter" && evt.key !== " ")) return;
		evt.preventDefault();
		openPicker();
	});

	draw();
	return {
		type: "relation",
		focus() {
			root.focus();
		},
	};
};
