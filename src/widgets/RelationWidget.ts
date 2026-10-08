import { LinkValue, Notice, type TFile } from "obsidian";
import type { RelationField } from "../schema/types";
import { EntryPicker } from "./pickers";
import type { PluginWidget } from "./types";
import { linkTarget, relationOutput, toList } from "./values";

const NOT_IN_TARGET = "Not in target base";

/** Link chips with remove buttons and an entry picker restricted to the target base. */
export const RelationWidget: PluginWidget<RelationField> = (el, value, ctx, field, env) => {
	const { app, membership } = env;
	let links = toList(value);
	// A list for `multiple: false` (or a string for `multiple: true`) is shown unchanged; it is rewritten on the next edit.
	const mismatch = value != null && Array.isArray(value) !== field.multiple;

	const root = el.createDiv({ cls: "improved-bases-relation", attr: { "data-improved-bases": "relation" } });
	if (mismatch) root.addClass("is-mismatch");

	const commit = (next: string[]): void => {
		links = next;
		root.removeClass("is-mismatch");
		draw();
		ctx.onChange(relationOutput(next, field.multiple));
	};

	const openPicker = (): void => {
		const entries = membership.targetEntries(field.base);
		const emptyText = entries === null ? `Target base not found: ${field.base}` : "No entries";
		if (entries === null) new Notice(emptyText);
		new EntryPicker(app, entries, (file: TFile) => {
			const link = `[[${app.metadataCache.fileToLinktext(file, ctx.sourcePath, true)}]]`;
			if (field.multiple) {
				if (!links.includes(link)) commit([...links, link]);
			} else {
				commit([link]);
			}
		}, emptyText).open();
	};

	const draw = (): void => {
		root.empty();
		const entries = membership.targetEntries(field.base);
		const inTarget = entries ? new Set(entries.map((f) => f.path)) : null;
		links.forEach((raw, index) => {
			const chip = root.createSpan({ cls: "improved-bases-chip" });
			const target = linkTarget(raw);
			const dest = target ? app.metadataCache.getFirstLinkpathDest(target, ctx.sourcePath) : null;
			if (inTarget && !(dest && inTarget.has(dest.path))) {
				chip.addClass("is-foreign");
				chip.setAttribute("title", NOT_IN_TARGET);
			}
			const link = LinkValue.parseFromString(app, raw, ctx.sourcePath);
			const body = chip.createSpan({ cls: "improved-bases-chip-body" });
			if (link) link.renderTo(body, app.renderContext);
			else body.setText(raw);
			const remove = chip.createEl("button", {
				cls: "improved-bases-chip-remove clickable-icon",
				text: "×",
				attr: { type: "button", "aria-label": "Remove" },
			});
			remove.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				commit(links.filter((_, i) => i !== index));
			});
		});
		const add = root.createEl("button", {
			cls: "improved-bases-add clickable-icon",
			text: "+",
			attr: { type: "button", "aria-label": "Add" },
		});
		add.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			openPicker();
		});
	};

	draw();
	return {
		type: "relation",
		focus() {
			root.querySelector<HTMLElement>(".improved-bases-add")?.focus();
		},
	};
};
