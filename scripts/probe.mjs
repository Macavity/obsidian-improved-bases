// Task 3 checkpoint probes (spec "Prüfpunkte" 1–6). Everything is installed in-memory via eval and
// removed again; the only file the probe creates (_probe.base) is deleted, then `pnpm vault:reset` runs.
// Usage: node scripts/probe.mjs
import { execSync } from "node:child_process";
import { obs, evalJs, ensureVault, waitFor, REPO } from "./lib/cli.mjs";

ensureVault();

const results = [];
function report(id, pass, evidence) {
	const status = pass === null ? "OPEN" : pass ? "PASS" : "FAIL";
	results.push({ id, status, evidence });
	console.log(`${id} ${status}: ${evidence}`);
}

/** Runs an async body in Obsidian; `P` is the probe handle, `h` its helpers. Returns parsed JSON. */
function run(body) {
	const out = evalJs(`(async () => { const P = app.__ibProbe; const h = P?.h; ${body} })().then((r) => JSON.stringify(r ?? null))`);
	return JSON.parse(out);
}

// --- Hull: wraps metadataTypeManager.getTypeInfo like the planned internals/typeInfoPatch -------------
// For the probe every file counts as "schema member": team → list widget, role → text widget.
const INSTALL = `(() => {
  const mtm = app.metadataTypeManager;
  if (app.__ibProbe) app.__ibProbe.uninstall();
  const hadOwn = Object.hasOwn(mtm, "getTypeInfo");
  const orig = mtm.getTypeInfo;
  const forced = { team: "multitext", role: "text" };
  const cache = new Map();
  const calls = [];
  const wrap = (w) => {
    let x = cache.get(w);
    if (!x) {
      x = { ...w, validate: () => true, render(el, value, ctx) {
        calls.push({ el, ctx, src: ctx.sourcePath, key: String(ctx.key).toLowerCase() });
        return w.render(el, value, ctx);
      } };
      cache.set(w, x);
    }
    return x;
  };
  mtm.getTypeInfo = function (name, value) {
    const info = orig.call(this, name, value);
    const t = forced[String(name).toLowerCase()];
    if (!t) return info;
    const w = wrap(this.getWidget(t));
    return { expected: w, inferred: w };
  };
  const surface = (el) => {
    if (!el.isConnected) return "detached";
    if (el.closest(".bases-view")) return el.closest(".bases-table") ? "bases-table" : el.closest(".bases-cards-container") ? "bases-cards" : "bases-list";
    const leaf = el.closest(".workspace-leaf-content");
    if (!leaf) return "other";
    if (leaf.dataset.type === "markdown") return leaf.querySelector(".markdown-reading-view")?.isShown() && el.closest(".markdown-reading-view") ? "markdown-reading" : "markdown-live";
    return leaf.dataset.type;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const wc = () => window.electron.remote.getCurrentWebContents();
  const h = {
    wait,
    async open(path, state) {
      const f = app.vault.getAbstractFileByPath(path);
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(f, state);
      app.workspace.setActiveLeaf(leaf, { focus: true });
      await wait(900);
      return leaf;
    },
    async click(el) {
      const r = el.getBoundingClientRect();
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      wc().sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
      wc().sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
      await wait(400);
    },
    async key(keyCode, modifiers = []) {
      wc().sendInputEvent({ type: "keyDown", keyCode, modifiers });
      wc().sendInputEvent({ type: "keyUp", keyCode, modifiers });
      await wait(600);
    },
    async read(path) { return app.vault.read(app.vault.getAbstractFileByPath(path)); },
    snap() {
      const r = {};
      for (const c of calls) { const k = surface(c.el) + ":" + c.key; r[k] = (r[k] ?? 0) + 1; }
      calls.length = 0;
      return r;
    },
    find(surf, src, key) { return calls.find((c) => surface(c.el) === surf && c.src === src && c.key === key); },
    rerender() { mtm.trigger("changed", "team"); mtm.trigger("changed", "role"); },
    newIdentity() { cache.clear(); }, // next getTypeInfo returns fresh wrapper objects
  };
  app.__ibProbe = { calls, h, uninstall() {
    if (hadOwn) mtm.getTypeInfo = orig; else delete mtm.getTypeInfo;
    delete app.__ibProbe;
    mtm.trigger("changed", "team"); mtm.trigger("changed", "role");
  } };
  return "installed";
})()`;

const PROBE_BASE = "_probe.base";
const PROBE_BASE_YAML = [
	"filters:",
	"  and:",
	'    - file.inFolder("Mitarbeiter")',
	"views:",
	...["table:T", "cards:C", "list:L"].flatMap((v) => {
		const [type, name] = v.split(":");
		return [`  - type: ${type}`, `    name: ${name}`, "    order: [file.name, Team, Role]"];
	}),
	"",
].join("\n");

try {
	console.log(`Obsidian ${obs("version").trim()}`);
	evalJs(INSTALL);

	// --- P1: does every surface call render() of the hull? ------------------------------------------
	const p1 = run(`
    const out = {};
    const f = app.vault.getAbstractFileByPath("${PROBE_BASE}") ?? await app.vault.create("${PROBE_BASE}", ${JSON.stringify(PROBE_BASE_YAML)});
    const leaf = await h.open(f.path);
    leaf.view.controller.selectView("L"); // so that switching to T below really rebuilds the table
    await h.wait(900);
    for (const v of ["T", "C", "L"]) {
      h.snap();
      leaf.view.controller.selectView(v);
      await h.wait(1200);
      const typeCalls = h.snap();
      const el = leaf.view.controller.viewContainerEl;
      out[v] = { renders: typeCalls, renderedValues: el.querySelectorAll(".bases-rendered-value").length };
    }
    // Table cells are rebuilt on metadataTypeManager "changed" only if the widget identity changes.
    leaf.view.controller.selectView("T");
    await h.wait(1200);
    h.snap();
    h.rerender();
    await h.wait(900);
    out.sameIdentity = h.snap();
    h.newIdentity();
    h.rerender();
    await h.wait(900);
    out.newIdentity = h.snap();
    const md = await h.open("Mitarbeiter/Dario Dietz.md");
    out.live = h.snap();
    await md.setViewState({ type: "markdown", state: { file: "Mitarbeiter/Dario Dietz.md", mode: "preview" } });
    await h.wait(900);
    h.snap();
    h.rerender();
    await h.wait(900);
    out.reading = h.snap();
    await md.setViewState({ type: "markdown", state: { file: "Mitarbeiter/Dario Dietz.md", mode: "source", source: false } });
    await h.wait(500);
    h.snap();
    app.commands.executeCommandById("properties:open-local");
    await h.wait(300);
    h.rerender();
    await h.wait(900);
    out.sidebar = h.snap();
    return out;
  `);
	if (process.env.PROBE_DEBUG) console.log(JSON.stringify(p1));
	const has = (snap, surf) => Object.keys(snap).some((k) => k.startsWith(surf + ":"));
	const surfaces = {
		table: has(p1.T.renders, "bases-table"),
		cards: has(p1.C.renders, "bases-cards"),
		list: has(p1.L.renders, "bases-list"),
		panelLive: has(p1.live, "markdown-live"),
		panelReading: has(p1.reading, "markdown-reading"),
		sidebar: has(p1.sidebar, "file-properties"),
	};
	report(
		"P1",
		Object.values(surfaces).every(Boolean),
		`render() reached: ${Object.entries(surfaces).map(([k, v]) => `${k}=${v ? "yes" : "NO"}`).join(", ")}` +
			`; cards/list show ${p1.C.renderedValues}/${p1.L.renderedValues} .bases-rendered-value (Value.renderTo, read-only), getTypeInfo not called there` +
			`; table re-render on "changed": same widget identity=${has(p1.sameIdentity, "bases-table") ? "yes" : "no"}, new identity=${has(p1.newIdentity, "bases-table") ? "yes" : "no"}`,
	);

	// --- P2: hull writes a list where types.json says text (and vice versa) -------------------------
	const p2 = run(`
    const path = "Mitarbeiter/Finn Fuchs.md";
    const warn = (key) => {
      const el = app.workspace.getActiveFileView()?.containerEl.querySelector('.metadata-property[data-property-key="' + key + '"] .metadata-property-warning-icon');
      return !!el && el.isShown();
    };
    // Baseline without hull: Ada has a list in "Team" while types.json says text -> native warning.
    P.uninstall();
    await h.open("Mitarbeiter/Ben Brandt.md");
    await h.open("Mitarbeiter/Ada Albers.md");
    const nativeWarn = warn("team");
    eval(${JSON.stringify(INSTALL)});
    const H = app.__ibProbe.h;
    await H.open(path);
    H.rerender();
    await H.wait(700);
    const before = await H.read(path);
    const c = H.find("markdown-live", path, "team");
    if (!c) return { error: "no panel ctx for team" };
    c.ctx.onChange(["[[Team Alpha]]", "[[Team Beta]]"]);
    await H.wait(1200);
    const after = await H.read(path);
    const warnAfter = warn("team");
    await H.open("Mitarbeiter/Ben Brandt.md");
    await H.open(path);
    await H.wait(500);
    const reopened = await H.read(path);
    const fm = app.metadataCache.getCache(path)?.frontmatter?.Team;
    // Reverse: types says list (in-memory only), hull writes a string.
    const mtm = app.metadataTypeManager;
    mtm.assignedWidgets.role = { name: "Role", widget: "multitext" };
    H.rerender();
    await H.wait(700);
    const c2 = H.find("markdown-live", path, "role");
    c2?.ctx.onChange("Manager");
    await H.wait(1200);
    const afterRev = await H.read(path);
    const warnRev = warn("role");
    delete mtm.assignedWidgets.role;
    H.rerender();
    return { nativeWarn, before: before.split("---")[1], after: after.split("---")[1], warnAfter,
      unchangedOnReopen: reopened === after, fmIsArray: Array.isArray(fm), afterRev: afterRev.split("---")[1], warnRev };
  `);
	const listWritten = /Team:\s*\n\s+- "?\[\[Team Alpha\]\]"?\s*\n\s+- "?\[\[Team Beta\]\]"?/.test(p2.after ?? "");
	report(
		"P2",
		!p2.error && p2.nativeWarn && listWritten && !p2.warnAfter && p2.unchangedOnReopen && p2.fmIsArray && /Role: Manager/.test(p2.afterRev) && !p2.warnRev,
		p2.error ??
			`types.json team=text; onChange(list) wrote YAML list=${listWritten}, warning=${p2.warnAfter} (native baseline warning=${p2.nativeWarn}), ` +
				`unchanged after reopen=${p2.unchangedOnReopen}; reverse (role assigned list in-memory, wrote string) ok=${/Role: Manager/.test(p2.afterRev)}, warning=${p2.warnRev}`,
	);

	// --- P3: undo after ctx.onChange in table and panel ----------------------------------------------
	const p3 = run(`
    const role = (s) => /^Role: (.*)$/m.exec(s)?.[1];
    // Table
    const tp = "Mitarbeiter/Ben Brandt.md";
    const leaf = await h.open("Mitarbeiter.base");
    h.rerender();
    await h.wait(900);
    const tc = h.find("bases-table", tp, "role");
    if (!tc) return { error: "no table ctx" };
    const t0 = role(await h.read(tp));
    tc.ctx.onChange("Manager");
    await h.wait(1000);
    const t1 = role(await h.read(tp));
    tc.el.closest(".bases-td")?.focus();
    await h.key("z", ["meta"]);
    const t2 = role(await h.read(tp));
    app.commands.executeCommandById("editor:undo");
    await h.wait(600);
    const t3 = role(await h.read(tp));
    // Panel
    const pp = "Mitarbeiter/Cora Conrad.md";
    const md = await h.open(pp);
    h.rerender();
    await h.wait(700);
    const pc = h.find("markdown-live", pp, "role");
    if (!pc) return { error: "no panel ctx" };
    const p0 = role(await h.read(pp));
    pc.ctx.onChange("Manager");
    await h.wait(1000);
    const p1 = role(await h.read(pp));
    const ed = md.view.editor;
    ed.focus();
    await h.wait(200);
    const p1e = role(ed.getValue());
    await h.key("z", ["meta"]);
    const p2 = role(ed.getValue()); // editor buffer; the save to disk is debounced
    await h.wait(2500);
    const p2disk = role(await h.read(pp));
    return { table: [t0, t1, t2, t3], panel: [p0, p1, p2], panelEditorBefore: p1e, panelDisk: p2disk };
  `);
	if (p3.error) report("P3", false, p3.error);
	else {
		const tableUndo = p3.table[1] !== p3.table[0] && (p3.table[2] === p3.table[0] || p3.table[3] === p3.table[0]);
		const panelUndo = p3.panel[1] !== p3.panel[0] && p3.panel[2] === p3.panel[0] && p3.panelDisk === p3.panel[0];
		report(
			"P3",
			tableUndo && panelUndo,
			`table Role ${p3.table[0]} → onChange ${p3.table[1]} → Cmd+Z ${p3.table[2]} → editor:undo ${p3.table[3]} (undo=${tableUndo}); ` +
				`panel Role ${p3.panel[0]} → onChange ${p3.panel[1]} (editor buffer ${p3.panelEditorBefore}) → Cmd+Z in editor ${p3.panel[2]}, on disk after save ${p3.panelDisk} (undo=${panelUndo})`,
		);
	}

	// --- P4: hook for the context menu of a property name in the panel -------------------------------
	const p4 = run(`
    const src = await (await fetch("app.js")).text();
    const menuEvents = [...new Set([...src.matchAll(/trigger\\("([a-z:-]*menu[a-z:-]*)"/g)].map((m) => m[1]))];
    const i = src.indexOf("showPropertyMenu=function");
    const body = i < 0 ? "" : src.slice(i, src.indexOf("prototype.handleUpdateKey", i));
    const ctxIdx = src.indexOf("markdown-properties-menu");
    return { found: i >= 0, bodyLen: body.length, triggers: [...body.matchAll(/\\.trigger\\("([^"]+)"/g)].map((m) => m[1]),
      menuEvents, blockMenuArgs: src.slice(ctxIdx - 60, ctxIdx + 60).includes("this.owner.getFile()") };
  `);
	report(
		"P4",
		p4.found && p4.triggers.length > 0,
		p4.found
			? `showPropertyMenu (${p4.bodyLen} chars) triggers ${p4.triggers.length ? p4.triggers.join(",") : "no workspace event"} → ${p4.triggers.length ? "hook" : "kein Hook"}; ` +
					`nearest: "markdown-properties-menu"(menu, file) on the whole Properties block=${p4.blockMenuArgs}; all menu events: ${p4.menuEvents.join(",")}`
			: "showPropertyMenu not found in app.js",
	);

	// --- P5: hide the collector view type in the Layout picker via CSS -------------------------------
	const ICON = "lucide-eye-off";
	const SELECTOR = `.suggestion-container.combobox .suggestion-item:has(.suggestion-flair svg.${ICON})`;
	const p5 = run(`
    const plugin = app.plugins.plugins["improved-bases"];
    plugin.registerBasesView("ib-probe-collector", { name: "IB Probe Collector", icon: "${ICON}", factory: (_c, el) => ({ load() {}, unload() {}, onDataUpdated() {}, containerEl: el }) });
    const style = document.head.createEl("style", { attr: { id: "ib-probe-style" } });
    const leaf = await h.open("${PROBE_BASE}");
    const pick = async (hide) => {
      style.textContent = hide ? '${SELECTOR} { display: none; }' : "";
      const ctl = leaf.view.controller;
      if (!document.querySelector(".menu.bases-toolbar-views-menu")) await h.click(ctl.viewHeaderEl.querySelector(".bases-toolbar-views-menu .text-icon-button"));
      const menu = document.querySelector(".menu.bases-toolbar-views-menu");
      if (!menu) return { error: "views menu did not open" };
      if (!document.querySelector(".view-config-menu")) await h.click(menu.querySelector(".bases-toolbar-menu-item-icon"));
      const combo = document.querySelector(".view-config-menu .combobox-button");
      if (!combo) return { error: "layout combobox missing" };
      await h.click(combo);
      const items = [...document.querySelectorAll(".suggestion-container.combobox .suggestion-item")];
      const res = { all: items.map((i) => i.textContent), visible: items.filter((i) => i.isShown()).map((i) => i.textContent) };
      await h.key("Escape"); await h.key("Escape"); await h.key("Escape");
      return res;
    };
    const shown = await pick(false);
    const hidden = await pick(true);
    style.remove();
    return { shown, hidden };
  `);
	const name = "IB Probe Collector";
	const p5pass = !p5.shown.error && !p5.hidden.error && p5.shown.visible.includes(name) && p5.hidden.all.includes(name) && !p5.hidden.visible.includes(name) && p5.hidden.visible.length === p5.shown.visible.length - 1;
	report(
		"P5",
		p5pass,
		p5.shown.error ?? p5.hidden.error ??
			`Layout picker without CSS: [${p5.shown.visible.join(", ")}]; with \`${SELECTOR} { display: none }\`: [${p5.hidden.visible.join(", ")}]`,
	);

	// --- P6: real mobile device ----------------------------------------------------------------------
	report("P6", null, "collector on a real iOS/Android device: manual, open (blocks release only)");
} finally {
	try {
		run(`
      app.__ibProbe?.uninstall();
      document.getElementById("ib-probe-style")?.remove();
      for (const l of app.workspace.getLeavesOfType("bases")) if (l.view.file?.path === "${PROBE_BASE}") l.detach();
      const f = app.vault.getAbstractFileByPath("${PROBE_BASE}");
      if (f) await app.vault.delete(f);
      return true;
    `);
	} catch (e) {
		console.error(`cleanup in Obsidian failed: ${e.message}`);
	}
	obs("plugin:reload", { id: "improved-bases" }); // drops the probe's bases view registration
	await waitFor(() => evalJs("!!app.plugins.plugins['improved-bases']") === "true", 15000);
	execSync("pnpm vault:reset", { cwd: REPO, stdio: "inherit" });
	const dirty = execSync("git status --porcelain -- test-vault", { cwd: REPO, encoding: "utf8" }).trim();
	console.log(dirty ? `WARNING: test-vault not clean:\n${dirty}` : "test-vault clean");
}

const failed = results.filter((r) => r.status === "FAIL").map((r) => r.id);
console.log(failed.length ? `FAILED: ${failed.join(", ")}` : "all automated checkpoints passed");
