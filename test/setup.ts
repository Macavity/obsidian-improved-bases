/* Minimal stand-ins for Obsidian's DOM helpers (happy-dom has none). */
type Opts = { cls?: string | string[]; text?: string; attr?: Record<string, string> } | string;

function createEl<K extends keyof HTMLElementTagNameMap>(this: Node, tag: K, o?: Opts): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (typeof o === "string") el.className = o;
	else if (o) {
		if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
		if (o.text !== undefined) el.textContent = o.text;
		for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
	}
	this.appendChild(el);
	return el;
}

const proto = Node.prototype as unknown as Record<string, unknown>;
proto.createEl ??= createEl;
proto.createDiv ??= function (this: Node, o?: Opts) { return createEl.call(this, "div", o); };
proto.createSpan ??= function (this: Node, o?: Opts) { return createEl.call(this, "span", o); };
proto.instanceOf ??= function (this: Node, type: abstract new (...a: never[]) => unknown) { return this instanceof type; };
proto.addClass ??= function (this: Element, ...c: string[]) { this.classList.add(...c); };
proto.removeClass ??= function (this: Element, ...c: string[]) { this.classList.remove(...c); };
proto.setText ??= function (this: Element, t: string) { this.textContent = t; };
proto.empty ??= function (this: Element) { this.replaceChildren(); };
