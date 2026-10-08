# State – Improved Bases

Plan: `.claude/plans/2026-10-02-improved-bases.md` (Subagent-Driven). Branch `feat/improved-bases`, nichts gepusht.

## Erledigt
- Task 1 (8aee611): vitest + happy-dom, Mock `test/__mocks__/obsidian.ts`, `pnpm check`. Spike archiviert unter Tag `spike`.
- Task 2 (1229906): `test-vault/` Fixtures, `scripts/lib/cli.mjs` (Vault-Guard), vault-link/open/reset, reload, smoke. Vault registriert, Plugin enabled.
- Task 3 (eca5f80): `scripts/probe.mjs`, Ergebnisse in `SPIKE_FINDINGS.md` „Prüfpunkte v1“. minAppVersion 1.14.4 (getestet 1.14.4). `display()` aus settings.ts entfernt (Lint `no-deprecated-display`).

## Prüfpunkte
- P1 TEILWEISE FAIL: Hülle wirkt in Tabelle, Panel, Sidebar. Cards/List rufen `getTypeInfo` nie (rendern read-only via `Value.renderTo`).
- P2 PASS. P3: Undo nur im Panel, Tabelle nativ ohne Undo (README). P4: kein Hook für Property-Kontextmenü → nur Befehle. P5 PASS (Selektor in SPIKE_FINDINGS, eigenes Icon via `addIcon`). P6 offen (Mobil).

## Offene Entscheidung (blockiert Phase 1)
P1: (a) Umfang auf Tabelle+Panel reduzieren, Cards/List nativ; (b) Zusatzweg für Cards/List (Patch Card-Renderer oder DOM-Nachbearbeitung `[data-property="note.x"]`). Danach Spec+Plan anpassen.

## Fakten für Task 8
- Tabelle baut Zellen nur bei neuer Widget-Identität von `inferred` neu → Hüllen-Cache braucht Generation (bei Schema-/Mitgliedschaftsänderung hochzählen).
- Tabelle übergibt Namen lowercase, Panel Original; Hülle muss `type`, `icon`, `name` des Originals übernehmen.

## CLI-Fakten
- `eval` liefert `=> <result>` (evalJs strippt). `base:query format=json` → Array mit `path` + Spaltennamen. `property:read` nackter Wert.
- Nach `plugin:reload` Plugin kurz nicht in `app.plugins.plugins` → `waitFor`.
- Obsidian schreibt Config-Dateien in eigener Form; Fixtures übernehmen diese byte-genau.
