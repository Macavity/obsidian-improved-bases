import {
	App,
	BasesView,
	Component,
	MarkdownRenderer,
	QueryController,
	TFile,
	debounce,
	parseYaml,
	stringifyYaml,
} from "obsidian";

export type Strategy = "cli" | "collector";
export type HostMode = "detached" | "offscreen" | "hidden";
type Listener = (files: TFile[]) => void;

// ---------- Strategy 1: internal CLI handler (app.cli.handlers["base:query"]) ----------

export async function queryBaseViaCli(app: App, path: string): Promise<TFile[]> {
	const handler = (app as any).cli?.handlers?.get("base:query")?.handler;
	if (!handler) throw new Error("app.cli base:query handler not available");
	const out: string = await handler({ path, format: "paths" });
	return out
		.split("\n")
		.filter(Boolean)
		.map((p) => app.vault.getFileByPath(p))
		.filter((f): f is TFile => !!f);
}

// ---------- Strategy 2: hidden "collector" Bases view rendered via MarkdownRenderer ----------

export const COLLECTOR_VIEW = "ib-collector";
const collectorListeners = new Map<string, Listener>();
export const collectorStats = { created: 0, updates: 0 };

export class CollectorView extends BasesView {
	type = COLLECTOR_VIEW;

	constructor(controller: QueryController) {
		super(controller);
		collectorStats.created++;
	}

	onDataUpdated(): void {
		collectorStats.updates++;
		const id = this.config.get("collectorId") as string;
		collectorListeners.get(id)?.(this.data.data.map((e) => e.file));
	}
}

let collectorSeq = 0;

export async function mountCollector(
	app: App,
	basePath: string,
	mode: HostMode,
	listener: Listener
): Promise<Component> {
	const file = app.vault.getFileByPath(basePath);
	if (!file) throw new Error(`Base not found: ${basePath}`);
	const id = `c${++collectorSeq}`;
	const parsed = parseYaml(await app.vault.cachedRead(file)) ?? {};
	parsed.views = [{ type: COLLECTOR_VIEW, name: "collector", collectorId: id }];
	const md = "```base\n" + stringifyYaml(parsed) + "```\n";

	const host = createDiv({ cls: "ib-collector-host" });
	if (mode !== "detached") document.body.appendChild(host);
	if (mode === "offscreen") host.addClass("ib-offscreen");
	if (mode === "hidden") host.style.display = "none";

	const component = new Component();
	component.load();
	collectorListeners.set(id, listener);
	component.register(() => {
		collectorListeners.delete(id);
		host.remove();
	});
	await MarkdownRenderer.render(app, md, host, file.path, component);
	return component;
}

// ---------- Watcher: keeps the result of a base up to date ----------

export class BaseWatcher extends Component {
	files: TFile[] = [];
	private listeners = new Set<Listener>();

	constructor(
		private app: App,
		readonly basePath: string,
		readonly strategy: Strategy,
		private hostMode: HostMode = "offscreen"
	) {
		super();
	}

	onload(): void {
		if (this.strategy === "cli") {
			const refresh = debounce(() => this.refreshCli(), 200, true);
			this.registerEvent(this.app.metadataCache.on("changed", refresh));
			this.registerEvent(this.app.vault.on("rename", refresh));
			this.registerEvent(this.app.vault.on("delete", refresh));
			this.registerEvent(this.app.vault.on("modify", (f) => f.path === this.basePath && refresh()));
			this.refreshCli();
		} else {
			mountCollector(this.app, this.basePath, this.hostMode, (files) => this.set(files)).then((c) =>
				this.addChild(c)
			);
		}
	}

	onChange(l: Listener): () => void {
		this.listeners.add(l);
		return () => this.listeners.delete(l);
	}

	private async refreshCli() {
		this.set(await queryBaseViaCli(this.app, this.basePath));
	}

	private set(files: TFile[]) {
		const same =
			files.length === this.files.length && files.every((f, i) => f === this.files[i]);
		this.files = files;
		if (!same) this.listeners.forEach((l) => l(files));
	}
}
