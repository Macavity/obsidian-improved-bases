import { Notice, type TFile } from "obsidian";
import { migrateOptionValues } from "../schema/optionMigration";
import { MEMBERS_LOADING } from "../schema/messages";
import type { Color, SelectField, SelectOption } from "../schema/types";
import { findOwnKey, isUnsafeKey } from "../schema/keys";
import { confirmOptionDelete } from "./OptionDeleteModal";
import { openOptionPicker, type OptionPickerHost } from "./OptionPicker";
import type { PluginWidget, SchemaSource } from "./types";
import { addOptionMutation, colorOf, countNotesWithValue, nextOptionColor, removeOptionMutation, removeValue, renameOptionMutation, renameValue, selectOutput, setColorMutation, StaleOptionError, toList } from "./values";

/** Colored pills; options come from the schema, unknown values are shown grey and never dropped. Clicking the field opens the option picker. */
export const SelectWidget: PluginWidget<SelectField> = (el, value, ctx, field, env, source) => {
	const { membership, writer } = env;
	let values = toList(value);
	// Local copy: schema writes reach the widget only after the next patch refresh.
	const options = field.options.map((o) => ({ ...o }));
	const local: SelectField = { ...field, options };
	// A list for `multiple: false` (or a string for `multiple: true`) is a valid value: shown like any other and only
	// rewritten into the schema shape on the next edit, as Obsidian does after a property type change.
	// Writes follow the base whose definition is displayed (the patch passes it); the fallback matches the display rule without context.
	const sourceOf = (): SchemaSource | null => source ?? membership.resolveWithBase(ctx.sourcePath, ctx.key);

	const root = el.createDiv({
		cls: "improved-bases-select",
		attr: { "data-improved-bases": "select", tabindex: "0", role: "button", "aria-haspopup": "dialog" },
	});
	let picker: { close(): void } | null = null;

	const writeSchema = async (mutate: ReturnType<typeof addOptionMutation>): Promise<boolean> => {
		const src = sourceOf();
		if (!src) return false;
		try {
			await writer.update(src.basePath, mutate);
			return true;
		} catch (e) {
			if (e instanceof StaleOptionError) {
				new Notice("Option changed elsewhere, reopen the picker");
				return false;
			}
			console.error("Improved Bases: schema write failed", e);
			new Notice("Could not update the schema base");
			return false;
		}
	};

	const reserved = (name: string): boolean => {
		if (isUnsafeKey(name)) new Notice("Reserved name");
		return isUnsafeKey(name);
	};

	/** The field's value in a member note's properties (case-insensitive key). */
	const valueIn = (file: TFile, name: string): unknown => {
		const fm = env.app.metadataCache.getFileCache(file)?.frontmatter;
		const key = fm && findOwnKey(fm, name);
		return fm && key !== undefined ? fm[key] : undefined;
	};

	/** Removes an option; asks first when member notes still use it. After a migration the value also leaves the picker's own `h.values`. */
	const removeOption = async (h: OptionPickerHost, value: string): Promise<boolean> => {
		const src = sourceOf();
		const files = src && membership.targetEntries(src.basePath);
		if (src && !files) new Notice(MEMBERS_LOADING);
		if (!src || !files) return false;
		const count = countNotesWithValue(files.map((f) => valueIn(f, src.name)), value);
		const choice = count === 0 ? "schema" : await confirmOptionDelete(env.app, value, count, env.overlays);
		if (!choice || !(await writeSchema(removeOptionMutation(src.name, value)))) return false;
		if (choice === "notes") {
			const { changed, failed } = await migrateOptionValues(env.app, files, src.name, (v) => removeValue(v, value));
			new Notice(`Removed from ${changed} ${changed === 1 ? "note" : "notes"}${failed > 0 ? `, ${failed} failed` : ""}`);
			values = values.filter((v) => v !== value);
			h.values = h.values.filter((v) => v !== value);
		}
		const index = options.findIndex((o) => o.value === value);
		if (index >= 0) options.splice(index, 1);
		draw();
		return true;
	};

	const host = (): OptionPickerHost => {
		const h: OptionPickerHost = {
			options: options.map((o) => ({ ...o })),
			values: [...values],
			multiple: field.multiple,
			commit(next) {
				values = [...next];
				draw();
				ctx.onChange(selectOutput(next, field.multiple));
			},
			async create(created): Promise<SelectOption | null> {
				const src = sourceOf();
				if (!src || reserved(created)) return null;
				const color = nextOptionColor(options.length);
				if (!(await writeSchema(addOptionMutation(src.name, created, color)))) return null;
				if (!options.some((o) => o.value === created)) options.push({ value: created, color });
				return { value: created, color };
			},
			async recolor(picked: string, color: Color): Promise<boolean> {
				const src = sourceOf();
				if (!src || !(await writeSchema(setColorMutation(src.name, picked, color)))) return false;
				const existing = options.find((o) => o.value === picked);
				if (existing) existing.color = color;
				else options.push({ value: picked, color });
				draw();
				return true;
			},
			async rename(from: string, to: string): Promise<boolean> {
				const src = sourceOf();
				if (reserved(to)) return false;
				if (options.some((o) => o.value === to)) {
					new Notice("Option exists");
					return false;
				}
				const files = src && membership.targetEntries(src.basePath);
				if (src && !files) new Notice(MEMBERS_LOADING);
				if (!src || !files || !(await writeSchema(renameOptionMutation(src.name, from, to)))) return false;
				const { changed, failed } = await migrateOptionValues(env.app, files, src.name, (v) => renameValue(v, from, to));
				const count = `${changed} ${changed === 1 ? "note" : "notes"}`;
				new Notice(`Renamed in ${count}${failed > 0 ? `, ${failed} failed` : ""}`);
				for (const o of options) if (o.value === from) o.value = to;
				values = (renameValue(values, from, to) as string[] | undefined) ?? values;
				draw();
				return true;
			},
			remove: (value) => removeOption(h, value),
		};
		return h;
	};

	const openPicker = (): void => {
		picker?.close();
		picker = openOptionPicker(root, host(), env.overlays);
	};

	root.addEventListener("click", openPicker);
	root.addEventListener("keydown", (evt) => {
		if (evt.target !== root || (evt.key !== "Enter" && evt.key !== " ")) return;
		evt.preventDefault();
		openPicker();
	});

	const draw = (): void => {
		try {
			render();
		} catch (e) {
			console.error("Improved Bases: select widget failed to render", e);
			root.empty();
			root.setText(values.join(", "));
		}
	};

	const render = (): void => {
		root.empty();
		for (const picked of values) {
			const pill = root.createSpan({
				cls: "improved-bases-pill",
				attr: { "data-color": colorOf(local, picked) },
			});
			if (!options.some((o) => o.value === picked)) pill.setAttribute("title", "Not in options");
			pill.createSpan({ cls: "improved-bases-pill-body", text: picked });
		}
	};

	draw();
	return {
		type: "select",
		focus() {
			root.focus();
		},
	};
};
