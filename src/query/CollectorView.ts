import { BasesView, Component, MarkdownRenderer, Plugin, QueryController, TFile, addIcon, parseYaml, removeIcon, stringifyYaml } from "obsidian";
import type { MountCollector } from "./BaseQuery";

export class BaseNotFoundError extends Error {
	constructor(basePath: string) {
		super(`Base not found: ${basePath}`);
		this.name = "BaseNotFoundError";
	}
}

export const COLLECTOR_VIEW = "improved-bases-collector";
/** Own icon id: styles.css hides the view-selector entry by this icon's class. */
export const COLLECTOR_ICON = "improved-bases-collector";
const HOST_CLASS = "improved-bases-collector-host";
const ICON_SVG =
	'<circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="8"/>' +
	'<line x1="20" y1="80" x2="80" y2="20" stroke="currentColor" stroke-width="8"/>';

/** Wraps YAML in a ```base block whose fence is longer than any backtick run inside the YAML. */
export function baseFence(yaml: string): string {
	const longest = Math.max(0, ...(yaml.match(/`+/g) ?? []).map((m) => m.length));
	const fence = "`".repeat(Math.max(3, longest + 1));
	return `${fence}base\n${yaml}${yaml.endsWith("\n") ? "" : "\n"}${fence}\n`;
}

type Push = (files: TFile[]) => void;

class CollectorView extends BasesView {
	type = COLLECTOR_VIEW;

	constructor(controller: QueryController, private readonly listeners: Map<string, Push>) {
		super(controller);
	}

	onDataUpdated(): void {
		const id = this.config.get("collectorId");
		if (typeof id !== "string") return;
		this.listeners.get(id)?.(this.data.data.map((e) => e.file));
	}
}

/**
 * Registers the hidden collector view and returns a mount function for BaseQuery.
 * The collector renders the base as a ```base block into an offscreen host: the query only
 * runs once the container is shown (QueryController.runQuery waits for isShown()).
 */
export function registerCollector(plugin: Plugin): MountCollector {
	const { app } = plugin;
	const listeners = new Map<string, Push>();
	let seq = 0;

	addIcon(COLLECTOR_ICON, ICON_SVG);
	plugin.register(() => removeIcon(COLLECTOR_ICON));
	plugin.registerBasesView(COLLECTOR_VIEW, {
		name: "Improved Bases collector",
		icon: COLLECTOR_ICON,
		factory: (controller) => new CollectorView(controller, listeners),
	});

	return async (basePath, push) => {
		await new Promise<void>((resolve) => app.workspace.onLayoutReady(resolve));
		const file = app.vault.getFileByPath(basePath);
		if (!file) throw new BaseNotFoundError(basePath);
		const parsed: unknown = parseYaml(await app.vault.cachedRead(file)) ?? {};
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error(`Base is not a YAML mapping: ${basePath}`);
		}
		const id = `c${++seq}`;
		const source = { ...(parsed as Record<string, unknown>), views: [{ type: COLLECTOR_VIEW, name: "collector", collectorId: id }] };

		const host = document.body.createDiv({ cls: HOST_CLASS, attr: { "aria-hidden": "true" } });
		const component = new Component();
		component.load();
		listeners.set(id, push);
		component.register(() => {
			listeners.delete(id);
			host.remove();
		});
		try {
			await MarkdownRenderer.render(app, baseFence(stringifyYaml(source)), host, file.path, component);
		} catch (e) {
			component.unload();
			throw e;
		}
		return () => component.unload();
	};
}
