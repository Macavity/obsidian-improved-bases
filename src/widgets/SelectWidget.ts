import { Notice } from "obsidian";
import type { Color, SelectField, SelectOption } from "../schema/types";
import { openOptionPicker, type OptionPickerHost } from "./OptionPicker";
import type { PluginWidget, SchemaSource } from "./types";
import { addOptionMutation, colorOf, nextOptionColor, selectOutput, setColorMutation, toList } from "./values";

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
			console.error("Improved Bases: schema write failed", e);
			new Notice("Could not update the schema base");
			return false;
		}
	};

	const host = (): OptionPickerHost => ({
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
			if (!src) return null;
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
		rename: () => Promise.resolve(false),
		remove: () => Promise.resolve(false),
	});

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
