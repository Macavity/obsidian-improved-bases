import { parse, stringify } from "yaml";

type Handler = (...args: unknown[]) => unknown;

export class Events {
	private handlers = new Map<string, Set<Handler>>();
	on(name: string, cb: Handler): { name: string; cb: Handler } {
		let set = this.handlers.get(name);
		if (!set) {
			set = new Set();
			this.handlers.set(name, set);
		}
		set.add(cb);
		return { name, cb };
	}
	off(name: string, cb: Handler): void {
		this.handlers.get(name)?.delete(cb);
	}
	offref(ref: { name: string; cb: Handler }): void {
		this.off(ref.name, ref.cb);
	}
	trigger(name: string, ...args: unknown[]): void {
		for (const cb of [...(this.handlers.get(name) ?? [])]) cb(...args);
	}
}

export class Component {
	load(): void {}
	unload(): void {}
	onload(): void {}
	onunload(): void {}
	addChild<T extends Component>(child: T): T {
		return child;
	}
	register(_cb: () => unknown): void {}
	registerEvent(_ref: unknown): void {}
	registerDomEvent(..._args: unknown[]): void {}
	registerInterval(id: number): number {
		return id;
	}
}

export class Plugin extends Component {
	app: unknown = {};
	manifest: unknown = {};
	addCommand(cmd: unknown): unknown {
		return cmd;
	}
	addSettingTab(_tab: unknown): void {}
	loadData(): Promise<unknown> {
		return Promise.resolve(null);
	}
	saveData(_data: unknown): Promise<void> {
		return Promise.resolve();
	}
}

export class TFile {
	path = "";
	name = "";
	basename = "";
	extension = "";
}

export class Notice {
	constructor(public message?: string | DocumentFragment, public duration?: number) {}
	hide(): void {}
}

export class Modal {
	constructor(public app: unknown) {}
	open(): void {}
	close(): void {}
}

export class FuzzySuggestModal<T> extends Modal {
	getItems(): T[] {
		return [];
	}
	getItemText(_item: T): string {
		return "";
	}
	onChooseItem(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
}

export class PluginSettingTab {
	containerEl: HTMLElement = document.createElement("div");
	constructor(public app: unknown, public plugin: unknown) {}
	display(): void {}
	hide(): void {}
}

export const Platform = {
	isDesktop: true,
	isMobile: false,
	isDesktopApp: true,
	isMobileApp: false,
};

export function parseYaml(text: string): unknown {
	return parse(text);
}

export function stringifyYaml(value: unknown): string {
	return stringify(value);
}

export abstract class BasesView extends Component {
	app: unknown = {};
	config: { get(key: string): unknown } = { get: () => undefined };
	data: { data: Array<{ file: TFile }> } = { data: [] };
	constructor(_controller?: unknown) {
		super();
	}
	abstract onDataUpdated(): void;
}

export class MarkdownRenderer {
	static render(_app: unknown, _md: string, _el: HTMLElement, _sourcePath: string, _component: Component): Promise<void> {
		return Promise.resolve();
	}
}

export function addIcon(_iconId: string, _svgContent: string): void {}
