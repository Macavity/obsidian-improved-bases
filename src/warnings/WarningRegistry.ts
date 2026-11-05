import { Events } from "obsidian";

/**
 * `state`: holds while a condition holds; its source reports it again on every run and resolves it when gone.
 * `event`: something that failed once (a migration, a rename); stays until the user dismisses it.
 */
export type WarningKind = "state" | "event";

export interface Warning {
	id: string;
	kind: WarningKind;
	text: string;
	/** `Date.now()` when first reported; a re-report of an unchanged state warning keeps it. */
	at: number;
	/** Schema bases the warning belongs to; the list links them, the schema dialog of a base shows its own. */
	bases: string[];
}

export interface WarningInput {
	text: string;
	bases?: string[];
}

const same = (a: Warning, b: WarningInput): boolean => a.text === b.text && a.bases.join("\0") === (b.bases ?? []).join("\0");

/** In-memory list of the plugin's current warnings; emits "changed" whenever the list differs. */
export class WarningRegistry extends Events {
	private readonly items = new Map<string, Warning>();
	private seq = 0;

	get count(): number {
		return this.items.size;
	}

	/** Newest first; equal timestamps keep the later report first. */
	list(): Warning[] {
		return [...this.items.values()].reverse().sort((a, b) => b.at - a.at);
	}

	forBase(basePath: string): Warning[] {
		return this.list().filter((w) => w.bases.includes(basePath));
	}

	/** Reports a state warning; the same id replaces the previous one, an unchanged one is a no-op. */
	report(id: string, input: WarningInput): void {
		const prev = this.items.get(id);
		if (prev && same(prev, input)) return;
		this.items.set(id, { id, kind: "state", text: input.text, at: prev?.at ?? Date.now(), bases: input.bases ?? [] });
		this.trigger("changed");
	}

	/** Removes a state warning (or an event warning) by id. */
	resolve(id: string): void {
		if (this.items.delete(id)) this.trigger("changed");
	}

	/** Replaces every state warning whose id starts with `${prefix}:` by `entries` (ids are prefixed here). */
	replace(prefix: string, entries: (WarningInput & { id: string })[]): void {
		const next = new Map(entries.map((e) => [`${prefix}:${e.id}`, e]));
		let changed = false;
		for (const [id, w] of [...this.items]) {
			if (w.kind !== "state" || !id.startsWith(`${prefix}:`) || next.has(id)) continue;
			this.items.delete(id);
			changed = true;
		}
		for (const [id, e] of next) {
			const prev = this.items.get(id);
			if (prev && same(prev, e)) continue;
			this.items.set(id, { id, kind: "state", text: e.text, at: prev?.at ?? Date.now(), bases: e.bases ?? [] });
			changed = true;
		}
		if (changed) this.trigger("changed");
	}

	/** Adds an event warning; returns its id. */
	push(input: WarningInput): string {
		const id = `event:${++this.seq}`;
		this.items.set(id, { id, kind: "event", text: input.text, at: Date.now(), bases: input.bases ?? [] });
		this.trigger("changed");
		return id;
	}

	dismiss(id: string): void {
		this.resolve(id);
	}
}
