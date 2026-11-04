// Mobile smoke: switches the running Obsidian to tablet emulation (`dev:mobile on`, which reloads the app), opens the schema
// dialog of Mitarbeiter.base and checks what only shows there: the disclosure chevron keeps its icon (Obsidian pads plain
// buttons on tablets), the row's icon buttons are touch-sized, and a real touch tap expands the row. Saves a screenshot and
// switches emulation off again. Obsidian must be running with the test vault open and the current build loaded
// (`pnpm vault:link-test`, `pnpm build`, `pnpm reload`). Output dir: $MOBILE_SMOKE_OUT or <tmp>/improved-bases-mobile.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, ensureVault, evalJs, obs, screenshot, waitFor } from "./lib/cli.mjs";
import { squeezedIcon } from "./lib/icon-check.mjs";

const OUT = process.env.MOBILE_SMOKE_OUT ?? join(tmpdir(), "improved-bases-mobile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (code) => JSON.parse(evalJs(`JSON.stringify(${code})`));
const cdp = (method, params) => obs("dev:cdp", { method, params: JSON.stringify(params) });

ensureVault();
mkdirSync(OUT, { recursive: true });

/** `dev:mobile` reloads the app; until it is back, every CLI command answers "Command … not found". */
function untilReady() {
	return waitFor(() => {
		try {
			return evalJs("'ok'") === "ok";
		} catch {
			return false;
		}
	}, 30000, 500);
}
const closeDialog = () => evalJs("document.querySelector('.improved-bases-footer-buttons .improved-bases-close, .improved-bases-footer-buttons .improved-bases-cancel')?.click()");

const FOOTER = `document.querySelector('.improved-bases-schema-modal .improved-bases-footer') ? 'yes' : 'no'`;
const MEASURE = `(() => {
	const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
	const disclosure = [...document.querySelectorAll('.improved-bases-schema-modal .improved-bases-field-disclosure')].find((b) => !b.disabled);
	const remove = document.querySelector('.improved-bases-schema-modal .improved-bases-field-remove');
	return {
		mobile: document.body.classList.contains('is-mobile'),
		touch: parseFloat(getComputedStyle(document.body).getPropertyValue('--touch-size-s')),
		disclosure: disclosure ? rect(disclosure) : null,
		svgWidth: disclosure?.querySelector('svg')?.getBoundingClientRect().width ?? 0,
		svgHeight: disclosure?.querySelector('svg')?.getBoundingClientRect().height ?? 0,
		remove: remove ? rect(remove) : null,
	};
})()`;
const EXPANDED = `document.querySelectorAll('.improved-bases-schema-modal .improved-bases-field-row.is-expanded').length`;

const failures = [];
/** Records a failure when the element is missing or either side falls short of Obsidian's touch size (`--touch-size-s`). */
function touchSized(name, r, touch) {
	if (!r) failures.push(`${name}: not found`);
	else if (r.width < touch - 0.5 || r.height < touch - 0.5) failures.push(`${name}: ${Math.round(r.width)}x${Math.round(r.height)}px, touch size is ${touch}px`);
}

try {
	console.log(obs("dev:mobile", { on: true }).trim());
	await sleep(1500);
	await untilReady();
	obs("open", { file: "Mitarbeiter.base" });
	await sleep(1500);
	evalJs("app.commands.executeCommandById('improved-bases:open-schema-settings')");
	await waitFor(() => evalJs(FOOTER) === "yes", 10000);
	await sleep(500);
	const m = json(MEASURE);
	assert(m.mobile, "body has no is-mobile class after dev:mobile on");
	assert(m.touch > 0, "--touch-size-s is not set");
	const squeezed = squeezedIcon(m);
	if (squeezed) failures.push(`disclosure chevron ${squeezed}`);
	touchSized("disclosure", m.disclosure, m.touch);
	touchSized("remove button", m.remove, m.touch);
	if (m.disclosure) {
		const x = m.disclosure.left + m.disclosure.width / 2;
		const y = m.disclosure.top + m.disclosure.height / 2;
		cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
		cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		try {
			await waitFor(() => evalJs(EXPANDED) !== "0", 3000);
		} catch {
			failures.push("touch tap on the disclosure did not expand the row");
		}
	}
	screenshot(join(OUT, "tablet-dialog.png"));
} catch (e) {
	failures.push(`smoke aborted: ${e.message}`);
} finally {
	// Leave Obsidian as found even after a failure: dialog closed, desktop mode. Problems here join `failures` instead of
	// throwing, so they never replace the failure that got us here.
	try {
		closeDialog();
	} catch {
		// the app may still be reloading; the reload closes the dialog anyway
	}
	try {
		console.log(obs("dev:mobile", { off: true }).trim());
	} catch (e) {
		failures.push(`dev:mobile off failed: ${e.message}`);
	}
	await sleep(1500);
	try {
		await untilReady();
		if (evalJs("String(app.isMobile)") !== "false") failures.push("Obsidian is still in mobile emulation");
	} catch (e) {
		failures.push(`Obsidian did not answer after dev:mobile off: ${e.message}`);
	}
}
console.log(`screenshot in ${OUT}`);
if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("mobile ok");
