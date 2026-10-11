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
		attr: { "data-improved-bases": "relation", tabindex: "0", role: "button", "aria-label": "Edit relations" },
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

	const isForeign = (dest: TFile | null): boolean => {
		const entries = membership.targetEntries(field.base);
		return !!entries && !(dest && entries.some((f) => f.path === dest.path));
	};

	const buildItems = (): PickerItem[] => {
		const active = links.map((raw): PickerItem => {
			const file = resolve(raw);
			return { raw, file, label: file?.basename ?? raw, active: true, foreign: isForeign(file) };
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
		for (const raw of links) {
			const chip = root.createSpan({ cls: "improved-bases-chip" });
			const dest = resolve(raw);
			if (isForeign(dest)) {
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

	root.addEventListener("click", (evt) => {
		if (evt.target instanceof Element && evt.target.closest("a")) return;
		openPicker();
	});
	root.addEventListener("keydown", (evt) => {
		if (evt.key !== "Enter" && evt.key !== " ") return;
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
