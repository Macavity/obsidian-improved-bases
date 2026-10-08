# Spike-Ergebnisse: typisierte Relationen & Schema für Bases

Getestet am 2026-10-01 mit Obsidian 1.13.7 (Installer 1.12.7), npm-Paket `obsidian` 1.13.1, macOS. Testdaten liegen in der Flyeralarm-Vault unter `_spike/` (`Employees/`, `Teams/`, `Employees.base`, `Teams.base`). `Teams.base` filtert auf `file.inFolder("_spike/Teams")` und `status != "archived"`, deshalb fehlt „Team Omega“ im Ergebnis.

Das Plugin ist per Symlink eingebunden: `.obsidian/plugins/obsidian-improved-bases → ~/Sites/obsidian-improved-bases`. Ein macOS-Finder-Alias funktioniert nicht, weil Obsidian ihm nicht folgt.

Code: `src/baseQuery.ts` (F1), `src/tableView.ts` + `src/fields.ts` (F2), `src/panel.ts` (F3). Zum Testen gibt es den Debug-Handle `window.ibSpike`.

---

## F1: Base aus Plugin-Code abfragen

**Ergebnis: funktioniert**, auf zwei Wegen, beide mit Live-Updates.

### Weg 1: interner CLI-Handler (undokumentiert)

`obsidian base:query` wird von `app.cli.handlers.get("base:query").handler(args)` ausgeführt. Der Handler lässt sich direkt aus Plugin-Code aufrufen:

```ts
const handler = (app as any).cli.handlers.get("base:query").handler;
const paths: string = await handler({ path: "_spike/Teams.base", format: "paths" });
// "_spike/Teams/Team Alpha.md\n_spike/Teams/Team Beta.md\n…"  (Omega fehlt, Filter greift)
```

So arbeitet der Handler intern (minifiziert): `cQ.fromString(yaml)` parst die Base, `QX.and(globalFilters, viewFilters)` kombiniert die Filter, `new jX(app, filter, formulas, null)` baut den Query-Kontext, `new _X(ctx, file)` wird pro Markdown-Datei ausgewertet und `new YZ(app, viewConfig, order, entries)` liefert das Ergebnis. Die Klassen sind modulintern und nicht direkt erreichbar, der Handler schon.

- Er liefert keine Änderungsbenachrichtigung. Im Spike erledigt das `BaseWatcher` (debounced Re-Query bei `metadataCache.changed`, `vault.rename`, `vault.delete` und Änderungen an der `.base`-Datei). Getestet: `status: archived` an Team Beta setzen, Watcher meldet 3 Teams; zurücksetzen, wieder 4.
- Die Query macht einen vollständigen Scan aller Markdown-Dateien und ist synchron. Bei großen Vaults mit vielen Relationen kann das teuer werden.
- `this` ist im Filter `null`. Filter wie `file.hasLink(this)` funktionieren deshalb nicht.

### Weg 2: versteckte „Collector“-View (Fallback A, fast nur öffentliche API)

`registerBasesView("ib-collector", …)` registriert die View. Der Plugin-Code liest die YAML aus `Teams.base`, ersetzt `views` durch `[{ type: "ib-collector", collectorId }]` und rendert sie per `MarkdownRenderer.render` als ```` ```base ````-Codeblock. `onDataUpdated()` erhält dann `this.data.data` (BasesEntry[]).

```ts
parsed.views = [{ type: "ib-collector", name: "collector", collectorId: id }];
await MarkdownRenderer.render(app, "```base\n" + stringifyYaml(parsed) + "```", host, baseFile.path, component);
```

| Host-Element | Daten kommen an? |
|---|---|
| abgelöst (nicht im DOM) | nein |
| im DOM, `display:none` | nein |
| im DOM, offscreen (`position:fixed; left:-10000px`, echte Größe) | **ja**, inkl. Live-Updates |

Der Grund steht in `QueryController.runQuery`: Die Query wartet, bis `viewContainerEl.isShown()` wahr ist (`onNodeInserted`), und läuft vorher gar nicht los. Der Host muss also im DOM hängen und Layout haben. Unter Mobile-Emulation funktioniert das ebenfalls.

Risiken bei Weg 2:
- Pro Relation-Base läuft eine vollwertige Controller-Instanz mit Toolbar-DOM, das ist Overhead.
- Der Collector-View-Typ erscheint im View-Selector der Bases. Er lässt sich nicht verstecken, die öffentliche Registrierung hat dafür kein Flag.
- Bei `this` im Filter ist der Kontext die Base-Datei, weil sie als `sourcePath` übergeben wird.
- Die Offscreen-Bedingung ist ein Implementierungsdetail.
- Änderungen an der `.base`-Datei werden im Spike nicht neu gemountet, das wäre aber einfach nachzurüsten.

### Empfehlung F1

Für das echte Plugin gehört eine Abstraktion `BaseQuery.watch(basePath, cb)` dazu, mit **Weg 2 (Collector) als Standard**. Er stützt sich fast nur auf öffentliche API, liefert Live-Updates direkt vom Bases-Controller, evaluiert identisch zur echten Base (Formeln, Filter) und läuft auf Mobile. Weg 1 dient als Desktop-Fallback oder Schnellpfad für einmalige Abfragen. Ob `app.cli` auf echten Mobile-Geräten existiert, ist ungeprüft (siehe offene Fragen). Langfristig sollte man bei Obsidian eine öffentliche Query-API anfragen.

---

## F2: Relation-Zelle in eigener Bases-View

**Ergebnis: funktioniert vollständig**, ausschließlich über öffentliche API (abgesehen von der Picker-Datenquelle aus F1).

| Prüfpunkt | Ergebnis |
|---|---|
| Link rendern | `entry.getValue("note.team").renderTo(td, app.renderContext)` erzeugt `<span class="internal-link" data-href="Team Alpha">` |
| Hover-Preview | funktioniert nativ: `renderTo` feuert `hover-link` mit `source: "bases"`, `hoverParent = app.renderContext`. Mit echter Maus und Cmd erscheint das Popover. Kein eigener Handler nötig. |
| Klick-Navigation | funktioniert nativ (echter Klick öffnet `Team Alpha.md`) |
| Picker | `FuzzySuggestModal` über das F1-Ergebnis zeigt 4 Teams, Omega ist ausgeschlossen |
| Schreiben | `metadataCache.fileToLinktext(target, file.path, true)` + `fileManager.processFrontMatter` ergibt `team: "[[Team Beta]]"` |
| Rename | `Team Beta → Team Bravo` aktualisiert das Frontmatter beider Employees automatisch (Voraussetzung: Einstellung `alwaysUpdateLinks`, hier aktiv) |
| Graph/Backlinks | `resolvedLinks` enthält die Kante, `obsidian backlinks` listet beide Employees |
| Select `role` (Bonus) | farbige Pill aus hardcodiertem Schema, Auswahl per `Menu`, schreibt per `processFrontMatter` |

Code-Kern (`src/tableView.ts`):

```ts
value?.renderTo(td, this.app.renderContext);
btn.onclick = () => new FilePickModal(app, plugin.watcher(field.base).files,
  (f) => writeRelation(app, entry.file, "team", f)).open();
```

Stolpersteine:
- Ein Watcher, der erst beim ersten Klick angelegt wird, ist noch leer. Watcher deshalb beim Laden vorwärmen.
- `Menu` ist unter macOS standardmäßig ein **natives** Electron-Menü. Es erscheint weder im DOM noch im Screenshot, automatisierte Tests brauchen deshalb `menu.setUseNativeMenu(false)`. Für ein Select mit Farben (farbige Optionen im Menü) muss man ohnehin `setUseNativeMenu(false)` oder ein eigenes Popover verwenden, weil native Menüs kein Styling erlauben.
- Die Properties-Spalten-Typen bleiben global (`types.json`). `team` sollte dort als `text` oder `list` stehen, damit das native Panel den Wikilink nicht zerstört.

### Empfehlung F2

So umsetzen. Für Multi-Relationen (`list`) muss die Zelle `ListValue` iterieren. Die eigene Table-View muss Sort/Group selbst rendern (`data.groupedData`), was laut Nicht-Ziel offen bleibt. Alternative: keine eigene Table, sondern nur eigene Views (Kanban usw.) bauen und für die Standard-Tabelle mit dem nativen Rendering leben.

---

## F3: Properties-Panel der Datei ersetzen

**Ergebnis: teilweise bis funktioniert.** Ansatz „inline“ erfüllt alle Kriterien, beruht aber auf DOM-Interna.

Native Panel-Positionen (DOM):
- Live Preview: `.view-content > .markdown-source-view > .cm-editor > .cm-scroller > .cm-sizer > .metadata-container`
- Reading: `.view-content > .markdown-reading-view > .markdown-preview-view > .markdown-preview-sizer > .mod-header > .metadata-container`

Getestete Ansätze (`ibSpike.plugin.panels.setMode(...)`):

| Kriterium | **inline** (Panel vor jedes `.metadata-container`, natives per CSS ausgeblendet) | **header** (Prepend in `view.contentEl`) | **cm** (CM6-Block-Widget an Pos. 0) |
|---|---|---|---|
| Live Preview | ✅ | ✅ | ✅ |
| Reading | ✅ | ✅ | ❌ (kein Editor) |
| Source-Modus | – natives Panel gibt es dort auch nicht (rohes YAML), Panel fehlt | ✅ | ✅ |
| Bearbeiten (Picker, Select) | ✅ auch per echtem Klick | ✅ | ✅ (`ignoreEvent() → true`) |
| Update bei Frontmatter-Änderung (auch extern) | ✅ | ✅ | ✅ (StateEffect-Refresh) |
| Dateiwechsel | ✅ | ✅ | ✅ |
| Moduswechsel | ✅ erst mit MutationObserver | ✅ | – |
| Layout | wie natives Panel, scrollt mit | klebt über Titel, scrollt nicht mit | wie natives Panel |
| Mobile-Emulation | ✅ | ✅ | ✅ (Editing) |

Schlüsselstellen in `src/panel.ts`:

```css
.ib-hide-props .metadata-container { display: none !important; }
```
```ts
view.containerEl.toggleClass("ib-hide-props", !!schema);
view.containerEl.querySelectorAll(".metadata-container")
  .forEach((mc) => mc.before(buildPanel(plugin, file, schema)));
// Reading view renders its .metadata-container lazily, without any workspace event:
new MutationObserver(onAddedMetadataContainer).observe(view.contentEl, { childList: true, subtree: true });
```

Ohne MutationObserver verschwand das Panel beim ersten Wechsel nach Reading. Der native Container wird dann neu erzeugt, und weder `layout-change` noch `file-open` feuern.

Abhängigkeiten von undokumentierten Interna:
- CSS-Klassen `.metadata-container`, `.mod-header`, `.cm-sizer` und die DOM-Struktur der MarkdownView sind nicht API und können sich mit jedem Update ändern.
- Der MutationObserver über `contentEl` (subtree) feuert auch beim Tippen. Der Filter ist billig, beobachtet aber jede Editor-Mutation (Performance-Risiko bei großen Notizen).
- `view.editor.cm` (EditorView-Zugriff für den Refresh) ist inoffiziell, aber in der Plugin-Community verbreitet.
- `registerEditorExtension` und `editorInfoField` sind öffentlich (cm-Ansatz).
- Das „File properties“-Sidebar-Panel (eigene View) und das Properties-Popover auf Mobile werden **nicht** ersetzt und zeigen weiter die nativen Widgets.

### Empfehlung F3

**inline** als Hauptansatz, mit defensiver Erkennung: Fehlt `.metadata-container`, fällt das Plugin auf **header** zurück und blendet nichts aus. Die Ersetzung sollte abschaltbar sein (natives Panel bleibt der Fallback, Daten liegen ja als normales Frontmatter vor). Der cm-Ansatz bringt keinen Vorteil, weil Reading fehlt.

---

## Gesamturteil: **Go** (mit klar benannten Risiken)

- Relationen als echte Wikilinks samt Graph, Backlinks, Hover und Rename-Updates gibt es weitgehend gratis über öffentliche API (`Value.renderTo`, `processFrontMatter`, `fileToLinktext`).
- Eine Query, die auf eine andere Base beschränkt ist, ist machbar. Der Collector-Ansatz kommt fast ohne Interna aus, der CLI-Handler ist ein robuster Desktop-Fallback.
- Das größte Wartungsrisiko ist F3, weil es auf der DOM-Struktur aufbaut. Der Schaden bleibt begrenzt: Bricht etwas, sieht man das native Panel.

## Offene Fragen

1. Gibt es `app.cli` auf echten iOS/Android-Geräten? Die Emulation läuft im Desktop-Build und zeigt es nur dort. Gerätetest nötig, bis dahin Collector als Standard.
2. Kann man den Collector-View-Typ aus dem View-Selector verstecken (z. B. per CSS auf den Menüeintrag) oder ist ein Feature-Request an Obsidian nötig?
3. Performance von Collector und CLI-Scan bei vielen Relation-Bases und großer Vault (Flyeralarm-Vault: Messung offen).
4. Schema-Ablage: eigene Datei, oder Erweiterung der `.base`-YAML um unbekannte Keys? Das ist noch nicht geprüft. Zu klären ist, ob Bases unbekannte Keys beim Speichern erhält.
5. Wechselwirkung mit globalen Property-Typen (`types.json`): welcher Typ für Relation-Felder, damit das native Panel nichts verändert (`text` vs. `list`)?
6. Ersatz des „File properties“-Sidebar-Panels und des Mobile-Properties-Dialogs.
7. Undo (Cmd+Z) nach `processFrontMatter` aus der View heraus. Nicht getestet.

---

## Prüfpunkte v1

Getestet am 2026-10-08 mit Obsidian 1.14.4 (Installer 1.12.7), macOS, Test-Vault `test-vault`. Reproduzierbar mit `node scripts/probe.mjs`: Die Probe installiert eine Hülle um `metadataTypeManager.getTypeInfo` in-memory (für jede Datei: `team` → Listen-Widget, `role` → Text-Widget, `expected === inferred`, `validate` immer wahr), legt `_probe.base` (Ansichten Tabelle/Cards/List) an, entfernt alles wieder und ruft `pnpm vault:reset` auf.

| # | Ergebnis | Beleg |
|---|---|---|
| P1 | **FAIL** (teilweise) | `render()` der Hülle wird erreicht in Tabelle, Properties-Panel (Live Preview und Reading) und Sidebar „File properties“. **Cards und List rufen `getTypeInfo` gar nicht auf**: Sie rendern read-only über `Value.renderTo` (`.bases-rendered-value`, `data-property-type` kommt aus dem Wert-Typ). |
| P2 | PASS | `types.json` sagt `team: text`; `ctx.onChange(["[[Team Alpha]]","[[Team Beta]]"])` aus dem Panel schreibt eine YAML-Liste, keine Warnung (`.metadata-property-warning-icon` nicht sichtbar; ohne Hülle bei Ada sichtbar), nach erneutem Öffnen byte-gleich. Umgekehrt (in-memory `role` als Liste zugewiesen, Hülle schreibt String) ebenfalls ohne Warnung. |
| P3 | FAIL (Grenze) | Panel: Undo funktioniert. Das Panel schreibt über den Editor, `Cmd+Z` im Editor stellt den Wert wieder her, auch auf der Platte. Tabelle: **kein Undo**, weder per `Cmd+Z` noch per `editor:undo`. Die Tabelle schreibt über `view.updateProperty` (nativer Weg, nativ also ebenso ohne Undo). |
| P4 | FAIL → **kein Hook** | `showPropertyMenu` (Kontextmenü am Property-Namen bzw. -Icon) baut ein `Menu` ohne `workspace.trigger`. Am nächsten liegt `markdown-properties-menu` (`menu, file`, Kontextmenü des ganzen Properties-Blocks), das ist aber nicht in `obsidian.d.ts`. v1 bleibt bei Befehlen. |
| P5 | PASS | Der View-Typ erscheint nur in der Layout-Auswahl (Combobox) der View-Konfiguration. Selektor: `.suggestion-container.combobox .suggestion-item:has(.suggestion-flair svg.<icon-klasse>) { display: none }`. Im Test mit `lucide-eye-off` verschwand der Eintrag, die übrigen (Tabelle, Galerie, Liste, Kanban) blieben. Für das Plugin ein eigenes Icon per `addIcon` registrieren, damit die Klasse eindeutig ist. |
| P6 | offen | Collector auf echtem iOS/Android-Gerät: manuell, blockiert nur das Release (Task 14). |

### Weitere Erkenntnisse für Task 8

- **Tabelle baut Zellen nur bei neuer Widget-Identität neu.** Der Zell-Renderer (`createRenderer` → Klasse mit `bases-metadata-value`) rendert erneut nur, wenn `getTypeInfo(name, value).inferred !== this.inferredType` oder sich der Wert ändert. Ein `trigger("changed")` mit gleicher Hüllen-Identität bewirkt in der Tabelle **nichts**. Mit neuen Hüllen-Objekten (Cache geleert) bauen alle Zellen neu. Panel und Sidebar rendern bei `changed` dagegen immer neu. Konsequenz: Der Cache der Hüllen braucht eine Generation, die bei Schema- oder Mitgliedschaftsänderung hochzählt. Sonst greift der Wechsel nativ → Plugin nach dem ersten Scan in der Tabelle nicht.
- Die Tabelle nutzt nur `.inferred`, das Panel `expected`/`inferred` und `validate` für die Warnung.
- `getTypeInfo` bekommt den Namen in der Tabelle kleingeschrieben (`team`), im Panel in Originalschreibung (`Team`). `ctx` hat die Felder `app, blur, key, hoverSource, onChange, sourcePath`. In der Tabelle ist `hoverSource` `"bases"`.
- Weitere Aufrufer von `getTypeInfo` (Filter-Editor, Gruppierung, Spalten-Icons, Typ-Menüs) lesen nur `.type`/`.icon` der Hülle. Die Hülle muss `type`, `icon` und `name` des Original-Widgets übernehmen.

### Performance (Task 14)

`pnpm perf` (`scripts/perf.mjs`): legt in der Test-Vault `_perf/` mit 2000 Notizen (je Team-Relation + Role) und 10 Schema-Bases an (je 200 Notizen, Relation auf `Teams.base`, Select), deaktiviert/aktiviert das Plugin und misst die Zeit bis `membership.ready` sowie bis zum ersten Plugin-Widget in `_perf/Perf-0.base`. Danach `vault:reset`.

| Messung (2026-10-08, Obsidian 1.14.4, macOS, Fenster nicht im Vordergrund) | Wert |
|---|---|
| `membership.ready` nach Enable (2000 Notizen, 10 Schema-Bases + 4 Fixture-Bases) | 44346 ms |
| Tabelle `Perf-0.base` bis erstes Plugin-Widget | 18014 ms |

Abbruchkriterium (`ready` > 3 s) überschritten. Zum Vergleich: Fixture-Vault (28 Notizen) ca. 0,8 s. Ursache nicht untersucht (Verdacht: je Schema-Base ein CLI-Erstscan plus Collector-View über alle 2000 Dateien, Neuscans bei jedem `metadataCache.changed`). Nutzer vor dem Release informieren.

Hinweis zum Skript: Dateien werden per `app.vault.create` aus Obsidian heraus angelegt; per Dateisystem geschriebene Dateien wurden bei verdecktem Fenster nicht zuverlässig indexiert.
