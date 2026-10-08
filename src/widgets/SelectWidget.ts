import { Notice } from "obsidian";
import type { Color, SelectField } from "../schema/types";
import { openColorMenu, openOptionMenu } from "./pickers";
import type { PluginWidget } from "./types";
import { addOptionMutation, colorOf, selectOutput, setColorMutation, toList } from "./values";

/** Colored pills; options come from the schema, unknown values are shown grey and never dropped. */
export const SelectWidget: PluginWidget<SelectField> = (el, value, ctx, field, env) => {
	const { membership, writer } = env;
	let values = toList(value);
	// Local copy: schema writes reach the widget only after the next patch refresh.
	const options = field.options.map((o) => ({ ...o }));
	const local: SelectField = { ...field, options };
	// A list for `multiple: false` (or a string for `multiple: true`) is shown unchanged; it is rewritten on the next edit.
	const mismatch = value != null && Array.isArray(value) !== field.multiple;
	const source = (): { basePath: string; name: string } | null => membership.resolveWithBase(ctx.sourcePath, ctx.key);

	const root = el.createDiv({ cls: "improved-bases-select", attr: { "data-improved-bases": "select" } });
	if (mismatch) root.addClass("is-mismatch");

	const commit = (next: string[]): void => {
		values = next;
		root.removeClass("is-mismatch");
		draw();
		ctx.onChange(selectOutput(next, field.multiple));
	};

	const writeSchema = async (mutate: ReturnType<typeof addOptionMutation>): Promise<boolean> => {
		const src = source();
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

	const choose = (picked: string): void => {
		if (field.multiple) {
			commit(values.includes(picked) ? values.filter((v) => v !== picked) : [...values, picked]);
		} else {
			commit([picked]);
		}
	};

	const create = (created: string): void => {
		const src = source();
		if (!src) return;
		void writeSchema(addOptionMutation(src.name, created)).then((ok) => {
			if (!ok) return;
			if (!options.some((o) => o.value === created)) options.push({ value: created, color: "grey" });
			if (field.multiple) {
				if (!values.includes(created)) commit([...values, created]);
			} else {
				commit([created]);
			}
		});
	};

	const recolor = (evt: MouseEvent, picked: string): void => {
		openColorMenu(evt, (color: Color) => {
			const src = source();
			if (!src) return;
			void writeSchema(setColorMutation(src.name, picked, color)).then((ok) => {
				if (!ok) return;
				const existing = options.find((o) => o.value === picked);
				if (existing) existing.color = color;
				else options.push({ value: picked, color });
				draw();
			});
		});
	};

	const draw = (): void => {
		root.empty();
		for (const [index, picked] of values.entries()) {
			const pill = root.createSpan({
				cls: "improved-bases-pill",
				attr: { "data-color": colorOf(local, picked) },
			});
			if (!options.some((o) => o.value === picked)) pill.setAttribute("title", "Not in options");
			pill.createSpan({ cls: "improved-bases-pill-body", text: picked });
			pill.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				recolor(evt, picked);
			});
			const remove = pill.createEl("button", {
				cls: "improved-bases-chip-remove clickable-icon",
				text: "×",
				attr: { type: "button", "aria-label": "Remove" },
			});
			remove.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				commit(values.filter((_, i) => i !== index));
			});
		}
		const add = root.createEl("button", {
			cls: "improved-bases-add clickable-icon",
			text: "+",
			attr: { type: "button", "aria-label": "Add" },
		});
		add.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			openOptionMenu(evt, local, values, choose, create);
		});
	};

	draw();
	return {
		type: "select",
		focus() {
			root.querySelector<HTMLElement>(".improved-bases-add")?.focus();
		},
	};
};
