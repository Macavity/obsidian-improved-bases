import { LinkValue, Notice, TFile } from "obsidian";
import { baseViewNames } from "../schema/baseViews";
import type { RelationField } from "../schema/types";
import { targetKey } from "../query/target";
import { entryItem } from "./entryItem";
import { entryIcon, renderIcon } from "./icons";
import { bindOpenTrigger } from "./openTrigger";
import { EntryPicker, type PickerItem } from "./pickers";
import type { PluginWidget } from "./types";
import { linkTarget, relationOutput, toList } from "./values";
import { t } from "../i18n";

/** Link chips; clicking the field opens a checkbox picker over the target base entries. */
export const RelationWidget: PluginWidget<RelationField> = (el, value, ctx, field, env, source) => {
	const { app, membership } = env;
	const key = targetKey({ base: field.base, view: field.view });
	let links = toList(value);
	// A list for `multiple: false` (or a string for `multiple: true`) is a valid value: shown like any other and only
	// rewritten into the schema shape on the next edit, as Obsidian does after a property type change.

	const root = el.createDiv({
		cls: "improved-bases-relation",
		// No aria-label: the chip links are the accessible name; the popup is announced via aria-haspopup.
		attr: { "data-improved-bases": "relation", tabindex: "0", role: "button", "aria-haspopup": "dialog" },
	});

	const commit = (next: string[]): void => {
		links = next;
		draw();
		ctx.onChange(relationOutput(next, field.multiple));
	};

	const resolve = (raw: string): TFile | null => {
		const target = linkTarget(raw);
		return target ? app.metadataCache.getFirstLinkpathDest(target, ctx.sourcePath) : null;
	};

	/** Paths of the target base entries, or null while the query result is unknown. */
	const targetPaths = (): Set<string> | null => {
		const entries = membership.targetEntries(key);
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
		const rest = (membership.targetEntries(key) ?? [])
			.filter((file) => !activePaths.has(file.path))
			.map((file) => entryItem(app, file, ctx.sourcePath));
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

	// A missing target is a state warning of the defining base (when known); it heals once the picker opens again.
	const warningId = `relation:${source?.basePath ?? ""}:${ctx.key.toLowerCase()}`;
	const warn = (text: string): void => {
		new Notice(text + t("notice.seeWarnings"));
		env.warnings.report(warningId, { text, bases: source ? [source.basePath] : [] });
	};

	let opening = false;
	const openPicker = async (): Promise<void> => {
		if (opening) return;
		if (!(app.vault.getAbstractFileByPath(field.base) instanceof TFile)) {
			warn(t("relation.targetMissing", { base: field.base }));
			return;
		}
		if (field.view !== undefined) {
			opening = true;
			const found = (await baseViewNames(app, field.base))?.includes(field.view);
			opening = false;
			if (!found) {
				warn(t("relation.viewMissing", { view: field.view, base: field.base }));
				return;
			}
		}
		env.warnings.resolve(warningId);
		const items = buildItems();
		new EntryPicker(app, items, (i) => entryIcon(app, i.file, membership.baseIcon(field.base), env.prefs().defaultIcon), (i) => toggle(items, i), env.overlays).open();
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
				chip.setAttribute("title", t("picker.notInTarget"));
			}
			renderIcon(chip.createSpan(), entryIcon(app, dest, membership.baseIcon(field.base), env.prefs().defaultIcon));
			const link = LinkValue.parseFromString(app, raw, ctx.sourcePath);
			const body = chip.createSpan({ cls: "improved-bases-chip-body" });
			if (link) link.renderTo(body, app.renderContext);
			else body.setText(raw);
		}
	};

	// A click in the field opens the picker; a click on a link keeps the link's own behavior (open, modifier = new tab).
	// Obsidian renders wikilinks as `span.internal-link`, markdown links as `a`.
	bindOpenTrigger(root, () => void openPicker(), "a, .internal-link");

	draw();
	return {
		type: "relation",
		focus() {
			root.focus();
		},
	};
};
