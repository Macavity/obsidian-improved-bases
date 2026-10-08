import { Menu, Plugin } from "obsidian";
import { BaseWatcher, COLLECTOR_VIEW, CollectorView, Strategy, collectorStats, mountCollector, queryBaseViaCli } from "./baseQuery";
import { PanelManager } from "./panel";
import { RelationTableView, TABLE_VIEW } from "./tableView";
import { EMPLOYEE_SCHEMA } from "./schema";

export default class ImprovedBasesPlugin extends Plugin {
	strategy: Strategy = "cli";
	panels!: PanelManager;
	private watchers = new Map<string, BaseWatcher>();

	async onload() {
		this.registerBasesView(COLLECTOR_VIEW, {
			name: "Collector (spike)",
			icon: "eye-off",
			factory: (controller) => new CollectorView(controller),
		});
		this.registerBasesView(TABLE_VIEW, {
			name: "Relation table (spike)",
			icon: "table",
			factory: (controller, el) => new RelationTableView(controller, el, this),
		});

		// Pre-warm watchers so pickers have data on first open.
		this.app.workspace.onLayoutReady(() => {
			for (const f of Object.values(EMPLOYEE_SCHEMA.fields)) if (f.kind === "relation") this.watcher(f.base);
		});

		this.panels = this.addChild(new PanelManager(this.app, this));

		// Debug handle for `obsidian eval`
		(window as any).ibSpike = {
			plugin: this,
			queryBaseViaCli: (p: string) => queryBaseViaCli(this.app, p),
			mountCollector: (p: string, mode: any, cb: any) => mountCollector(this.app, p, mode, cb),
			collectorStats,
			Menu,
		};
		this.register(() => delete (window as any).ibSpike);
	}

	watcher(basePath: string): BaseWatcher {
		const key = `${this.strategy}:${basePath}`;
		let w = this.watchers.get(key);
		if (!w) {
			w = this.addChild(new BaseWatcher(this.app, basePath, this.strategy));
			this.watchers.set(key, w);
		}
		return w;
	}
}
