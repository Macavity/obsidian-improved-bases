# State – Improved Bases

Plan: `.claude/plans/2026-10-02-improved-bases.md` (Subagent-Driven). Branch `feat/improved-bases`, nichts gepusht.

## Erledigt
- Task 1 (8aee611): vitest + happy-dom, Mock `test/__mocks__/obsidian.ts`, `pnpm check`. Spike archiviert unter Tag `spike`.
- Task 2 (1229906): `test-vault/` Fixtures, `scripts/lib/cli.mjs` (Vault-Guard), vault-link/open/reset, reload, smoke. Vault registriert, Plugin enabled.
- Task 3 (eca5f80): `scripts/probe.mjs`, Ergebnisse in `SPIKE_FINDINGS.md` „Prüfpunkte v1“. minAppVersion 1.14.4 (getestet 1.14.4). `display()` aus settings.ts entfernt (Lint `no-deprecated-display`).

- Entscheidung P1: Umfang v1 = Tabelle, Panel, Sidebar; Cards/List nativ, unverändert (Spec/Plan angepasst).
- Phase 1 (Tasks 4–7, Gate-1-Review + Fixes): Commits 40509b9…77e3a44. `pnpm check && pnpm smoke` grün.

## Phase-1-API (für Phase 2)
- `parseSchema(basePath, raw)`, `SCHEMA_KEY`, `NATIVE_TYPES` in `src/schema/`. `SchemaWriter.update(basePath, mutate)` byte-erhaltend (Kommentare innerhalb geänderter Feldknoten gehen verloren).
- `BaseQuery.watch(path, cb)`: Ref-Count, Generation, neue Watcher bekommen letztes Ergebnis synchron; Fallback-CLI nach 5 s; Rename/Delete → []. Collector-View-Eintrag per CSS versteckt (Icon `improved-bases-collector`).
- `SchemaRegistry` (`loaded`, `changed`, dispose-sicher, Sequenznummer pro Pfad) + `Membership` (`resolve(file, field)`, `targetEntries`, Events `changed`/`targets-changed`). Konfliktregel: erste Schema-Base nach basePath gewinnt (Meetings.base vor Mitarbeiter.base → Cora `team: text`), console.warn einmal pro (Datei, Feld).
- `Membership.ready` = Latch: registry.loaded ∧ alle Schemas gescannt ∧ metadataCache resolved ∧ 300 ms ohne Push. Vorher `resolve` → null.
- `plugin.query`, `plugin.registry`, `plugin.membership` in `main.ts`; Dispose via `this.register`. Interna nur `src/internals/{detect,cliQuery}.ts`; `hasBasesViewApi` bereit für Task 8/13.
- Offen (Minor): Remount des Collectors bei reinen Schema-Writes vermeiden (Query-Hash).

## Prüfpunkte
- P1 TEILWEISE FAIL: Hülle wirkt in Tabelle, Panel, Sidebar. Cards/List rufen `getTypeInfo` nie (rendern read-only via `Value.renderTo`).
- P2 PASS. P3: Undo nur im Panel, Tabelle nativ ohne Undo (README). P4: kein Hook für Property-Kontextmenü → nur Befehle. P5 PASS (Selektor in SPIKE_FINDINGS, eigenes Icon via `addIcon`). P6 offen (Mobil).

## Phase 2 (Tasks 8–10 + Gate-2-Fixes): Commits 91bbcd8…8cd9900, Gates grün
- `src/internals/typeInfoPatch.ts`: Cache `Map<expected, Map<inferred, {generation, hull}>>`, globale Generation, `refresh(names)` → `mtm.trigger("changed", name)` (lowercase). Dispatch: relation/select → Plugin-Widget, NativeType → `registeredTypeWidgets`, null → Original. Exceptions → Original. Uninstall via monkey-around + Cache leeren + `changed`. Unsupported: `installTypeInfoPatch` → null, Notice (engl.).
- Widgets: `src/widgets/{types,values,pickers,RelationWidget,SelectWidget}.ts`. Wurzel `div.improved-bases-<type>[data-improved-bases]`. `draw()` try/catch → Rohtext. `WidgetEnv.overlays` schließt Picker/Menüs beim Uninstall. Klassen `is-mismatch`, `is-foreign`.
- Relation: `EntryPicker` (FuzzySuggestModal) über `membership.targetEntries(base)`; Rename aktualisiert Frontmatter; Linktext via `fileToLinktext`.
- Select: `Menu` (nicht nativ) mit Suchfeld + `Create "<text>"`, Enter via `menu.scope` – Interna nur in `src/internals/menu.ts` mit Detection (Fallback: ohne Suchfeld). Farben: `--ib-rgb` je `[data-color]`; violet→purple; lime/brown/grey/black/white fix. `addOptionMutation`/`setColorMutation` via `SchemaWriter` (`Object.hasOwn`, defineProperty). `Membership.resolveWithBase` → `{field, basePath, name}`.
- BaseQuery: Erst-Scan sofort per CLI, Collector übernimmt beim ersten Push; kein Fallback-Timer mehr. `BaseNotFoundError` → [] ohne CLI. Bereitschaft nach Enable ~0,8 s (vorher ~3,8 s sichtbar; 14–19 s bei verdecktem Fenster nicht reproduziert).
- tsconfig lib ES2022. Undo nur im Panel (README). Smoke-Hinweise: abgebrochener Lauf hinterlässt Menü → `app:reload`; Obsidian serialisiert offene `.base` um → Smoke vergleicht geparst.
- Offen (Minor, verschoben): Gate-1 #5 Remount bei reinen Schema-Writes; Gate-2 #7 `knownFieldNames`-Cache, Generation pro Name, selektives `targets-changed`.

## Nächster Schritt
Phase 3: Welle 3a Tasks 11+12 parallel (12 registriert sich NICHT in main.ts) → 13 → Gate 3 → Task 14 → Final-Review (opus).

## Fakten für Task 8
- Tabelle baut Zellen nur bei neuer Widget-Identität von `inferred` neu → Hüllen-Cache braucht Generation (bei Schema-/Mitgliedschaftsänderung hochzählen).
- Tabelle übergibt Namen lowercase, Panel Original; Hülle muss `type`, `icon`, `name` des Originals übernehmen.

## CLI-Fakten
- `eval` liefert `=> <result>` (evalJs strippt). `base:query format=json` → Array mit `path` + Spaltennamen. `property:read` nackter Wert.
- Nach `plugin:reload` Plugin kurz nicht in `app.plugins.plugins` → `waitFor`.
- Obsidian schreibt Config-Dateien in eigener Form; Fixtures übernehmen diese byte-genau.
