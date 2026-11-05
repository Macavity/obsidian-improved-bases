import { LinkValue, type TFile } from "obsidian";
import type { TypeWidget } from "../internals/detect";
import { collectValues, isMultiple, validateGeneric } from "./genericValues";
import { entryItem } from "./entryItem";
import { entryIcon, renderIcon } from "./icons";
import { bindOpenTrigger } from "./openTrigger";
import { EntryPicker, type PickerItem } from "./pickers";
import type { PropertyRenderContext, WidgetEnv } from "./types";
import { linkTarget, relationOutput, toList } from "./values";
import { t } from "../i18n";

/** Relation for a globally typed field without a base definition: link chips, the picker lists every markdown note. */
export function createGenericRelationWidget(env: WidgetEnv): TypeWidget {
	const { app } = env;
	return {
		type: "relation",
		icon: "lucide-link",
		name: () => t("type.relation"),
		validate: validateGeneric,
		render(el, initial, rawCtx) {
			const ctx = rawCtx as PropertyRenderContext;
			let current = initial;
			const root = el.createDiv({
				cls: "improved-bases-relation",
				attr: { "data-improved-bases": "relation", tabindex: "0", role: "button", "aria-haspopup": "dialog" },
			});

			const resolve = (raw: string): TFile | null => {
				const target = linkTarget(raw);
				return target ? app.metadataCache.getFirstLinkpathDest(target, ctx.sourcePath) : null;
			};

			const draw = (): void => {
				root.empty();
				for (const raw of toList(current)) {
					const chip = root.createSpan({ cls: "improved-bases-chip" });
					renderIcon(chip.createSpan(), entryIcon(app, resolve(raw), null, env.prefs().defaultIcon));
					const body = chip.createSpan({ cls: "improved-bases-chip-body" });
					const link = LinkValue.parseFromString(app, raw, ctx.sourcePath);
					if (link) link.renderTo(body, app.renderContext);
					else body.setText(raw);
				}
			};

			const openPicker = (): void => {
				const links = toList(current);
				const multiple = isMultiple(current, () => collectValues(app, ctx.key).anyList);
				const active = [...new Set(links)].map((raw): PickerItem => {
					const file = resolve(raw);
					return { raw, file, label: file?.basename ?? raw, active: true, foreign: false };
				});
				const activePaths = new Set(active.flatMap((i) => (i.file ? [i.file.path] : [])));
				const rest = app.vault
					.getMarkdownFiles()
					.filter((file) => !activePaths.has(file.path))
					.map((file) => entryItem(app, file, ctx.sourcePath));
				const items = [...active, ...rest];
				const toggle = (item: PickerItem): void => {
					const was = item.active;
					const before = toList(current);
					if (!multiple) for (const i of items) i.active = false;
					item.active = !was;
					const next = multiple ? (was ? before.filter((l) => l !== item.raw) : [...before, item.raw]) : was ? [] : [item.raw];
					current = relationOutput(next, multiple);
					draw();
					ctx.onChange(current);
				};
				new EntryPicker(app, items, (i) => entryIcon(app, i.file, null, env.prefs().defaultIcon), toggle, env.overlays).open();
			};

			bindOpenTrigger(root, openPicker, "a, .internal-link");

			draw();
			return {
				type: "relation",
				focus() {
					root.focus();
				},
			};
		},
	};
}
