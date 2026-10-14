import { Modal, type App } from "obsidian";
import type { OverlayRegistry } from "./types";

/** "notes": remove the value from the notes too; "schema": only the option; null: cancel. */
export type DeleteChoice = "notes" | "schema" | null;

/** Asks what to do with the notes that still use an option about to be deleted. Closing the dialog cancels. */
export function confirmOptionDelete(app: App, value: string, count: number, overlays: OverlayRegistry): Promise<DeleteChoice> {
	return new Promise((resolve) => {
		let choice: DeleteChoice = null;
		let unregister = (): void => {};
		const modal = new (class extends Modal {
			onOpen(): void {
				this.setTitle("Delete option");
				this.contentEl.createEl("p", { text: `"${value}" is set in ${count} ${count === 1 ? "note" : "notes"} of this base.` });
				const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
				const add = (text: string, next: DeleteChoice, cls?: string): void => {
					const button = buttons.createEl("button", { text, cls });
					button.addEventListener("click", () => {
						choice = next;
						this.close();
					});
				};
				add("Remove from notes", "notes", "mod-warning");
				add("Only remove from schema", "schema");
				add("Cancel", null);
			}
			onClose(): void {
				unregister();
				this.contentEl.empty();
				resolve(choice);
			}
		})(app);
		unregister = overlays.add(() => modal.close());
		modal.open();
	});
}
