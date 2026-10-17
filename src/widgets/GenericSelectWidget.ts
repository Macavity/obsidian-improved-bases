import { Notice } from "obsidian";
import type { TypeWidget } from "../internals/detect";
import { isUnsafeKey } from "../schema/keys";
import type { SelectOption } from "../schema/types";
import { collectValues, isMultiple, validateGeneric } from "./genericValues";
import { bindOpenTrigger } from "./openTrigger";
import { openOptionPicker, type OptionPickerHost } from "./OptionPicker";
import type { PropertyRenderContext, WidgetEnv } from "./types";
import { selectOutput, toList } from "./values";

/**
 * Select for a globally typed field without a base definition: neutral pills, options are the values found in the vault.
 * The vault is scanned only when the picker opens, never while rendering.
 */
export function createGenericSelectWidget(env: WidgetEnv): TypeWidget {
	return {
		type: "select",
		icon: "lucide-circle-dot",
		name: () => "Select",
		validate: validateGeneric,
		render(el, initial, rawCtx) {
			const ctx = rawCtx as PropertyRenderContext;
			let current = initial;
			let picker: { close(): void } | null = null;
			const root = el.createDiv({
				cls: "improved-bases-select",
				attr: { "data-improved-bases": "select", tabindex: "0", role: "button", "aria-haspopup": "dialog" },
			});

			const draw = (): void => {
				root.empty();
				for (const picked of toList(current)) {
					root.createSpan({ cls: "improved-bases-pill is-neutral" }).createSpan({ cls: "improved-bases-pill-body", text: picked });
				}
			};

			const host = (): OptionPickerHost => {
				const found = collectValues(env.app, ctx.key);
				const multiple = isMultiple(current, () => found.anyList);
				const values = toList(current);
				const options: SelectOption[] = [...new Set([...found.values, ...values])].map((value) => ({ value, color: "grey" }));
				return {
					options,
					values: [...values],
					multiple,
					commit(next) {
						const output = selectOutput(next, multiple);
						current = output;
						draw();
						ctx.onChange(output);
					},
					create(created) {
						if (isUnsafeKey(created)) {
							new Notice("Reserved name");
							return Promise.resolve(null);
						}
						return Promise.resolve({ value: created, color: "grey" });
					},
				};
			};

			const openPicker = (): void => {
				picker?.close();
				picker = openOptionPicker(root, host(), env.overlays);
			};
			bindOpenTrigger(root, openPicker);

			draw();
			return {
				type: "select",
				focus() {
					root.focus();
				},
			};
		},
	};
}
