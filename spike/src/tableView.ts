import { BasesView, QueryController } from "obsidian";
import type ImprovedBasesPlugin from "./main";
import { FilePickModal, openSelectMenu, renderSelect, writeRelation, writeSelect } from "./fields";
import { EMPLOYEE_SCHEMA } from "./schema";

export const TABLE_VIEW = "ib-table";

export class RelationTableView extends BasesView {
	type = TABLE_VIEW;

	constructor(controller: QueryController, private containerEl: HTMLElement, private plugin: ImprovedBasesPlugin) {
		super(controller);
	}

	onDataUpdated(): void {
		const el = this.containerEl;
		el.empty();
		const table = el.createEl("table", { cls: "ib-table" });
		const order = this.config.getOrder();
		const head = table.createEl("tr");
		for (const p of order) head.createEl("th", { text: this.config.getDisplayName(p) });

		for (const entry of this.data.data) {
			const tr = table.createEl("tr");
			for (const p of order) {
				const td = tr.createEl("td");
				const name = p.startsWith("note.") ? p.slice(5) : null;
				const field = name ? EMPLOYEE_SCHEMA.fields[name] : undefined;
				const value = entry.getValue(p);

				if (field?.kind === "select") {
					renderSelect(td, value && !value.toString().length ? null : value?.toString(), field.options);
					td.addClass("ib-editable");
					td.onclick = (evt) =>
						openSelectMenu(evt, field.options, (v) => writeSelect(this.app, entry.file, name!, v));
					continue;
				}

				// Native rendering: links become internal links with hover preview + click.
				value?.renderTo(td, this.app.renderContext);

				if (field?.kind === "relation") {
					const btn = td.createSpan({ cls: "ib-edit", text: "✎" });
					btn.onclick = () => {
						const files = this.plugin.watcher(field.base).files;
						new FilePickModal(this.app, files, (f) => writeRelation(this.app, entry.file, name!, f)).open();
					};
				}
			}
		}
	}
}
