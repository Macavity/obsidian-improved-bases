import { App, FuzzySuggestModal, LinkValue, Menu, TFile } from "obsidian";

export class FilePickModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, private files: TFile[], private onPick: (f: TFile) => void) {
		super(app);
		this.setPlaceholder("Pick an entry from the related base");
	}
	getItems() {
		return this.files;
	}
	getItemText(f: TFile) {
		return f.basename;
	}
	onChooseItem(f: TFile) {
		this.onPick(f);
	}
}

export async function writeRelation(app: App, file: TFile, prop: string, target: TFile) {
	const linktext = app.metadataCache.fileToLinktext(target, file.path, true);
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm[prop] = `[[${linktext}]]`;
	});
}

export async function writeSelect(app: App, file: TFile, prop: string, value: string) {
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm[prop] = value;
	});
}

// Render a frontmatter value (string or list) as link chips using the public LinkValue.
// renderTo wires native hover preview (source "bases") and click navigation.
export function renderRelation(app: App, el: HTMLElement, raw: unknown, sourcePath: string) {
	const items = (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map(String);
	for (const item of items) {
		const chip = el.createSpan({ cls: "ib-chip" });
		const v = LinkValue.parseFromString(app, item, sourcePath);
		if (v) v.renderTo(chip, app.renderContext);
		else chip.setText(item);
	}
	if (!items.length) el.createSpan({ cls: "ib-empty", text: "–" });
}

export function renderSelect(el: HTMLElement, value: unknown, colors: Record<string, string>) {
	if (value == null || value === "") {
		el.createSpan({ cls: "ib-empty", text: "–" });
		return;
	}
	const s = String(value);
	el.createSpan({ cls: "ib-pill", text: s, attr: { "data-color": colors[s] ?? "grey" } });
}

export function openSelectMenu(evt: MouseEvent, colors: Record<string, string>, onPick: (v: string) => void) {
	const menu = new Menu();
	for (const opt of Object.keys(colors)) menu.addItem((i) => i.setTitle(opt).onClick(() => onPick(opt)));
	menu.showAtMouseEvent(evt);
}
