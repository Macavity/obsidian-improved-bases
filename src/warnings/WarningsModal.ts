import { Modal, type App, type EventRef } from "obsidian";
import type { WarningRegistry } from "./WarningRegistry";
import { renderWarningRow } from "./render";
import { t } from "../i18n";

/** Lists every current warning; follows the registry while open. */
export class WarningsModal extends Modal {
	private ref: EventRef | null = null;

	constructor(
		app: App,
		private readonly warnings: WarningRegistry,
		private readonly openBase: (basePath: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("improved-bases-warnings-modal");
		this.setTitle(t("warnings.title"));
		this.render();
		this.ref = this.warnings.on("changed", () => this.render());
	}

	onClose(): void {
		if (this.ref) this.warnings.offref(this.ref);
		this.ref = null;
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("improved-bases-warnings");
		const list = this.warnings.list();
		if (!list.length) {
			contentEl.createDiv({ cls: "improved-bases-warnings-empty", text: t("warnings.empty") });
			return;
		}
		const openBase = (basePath: string): void => {
			this.close();
			this.openBase(basePath);
		};
		for (const w of list) renderWarningRow(contentEl, w, { openBase, dismiss: (id) => this.warnings.dismiss(id) });
	}
}
