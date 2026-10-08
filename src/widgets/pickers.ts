import { FuzzySuggestModal, type App, type TFile } from "obsidian";

/** Picks one entry of a target base. */
export class EntryPicker extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly entries: TFile[] | null,
		private readonly onPick: (file: TFile) => void,
		emptyText?: string,
	) {
		super(app);
		this.setPlaceholder("Select an entry");
		if (emptyText) this.emptyStateText = emptyText;
	}

	getItems(): TFile[] {
		return this.entries ?? [];
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}
