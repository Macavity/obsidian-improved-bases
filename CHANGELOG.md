# Changelog

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the plugin's `manifest.json`.

The release workflow takes the section of the released version from this file as the GitHub release notes. Without a section the release only carries the compare link.

## [Unreleased]

### Added

- Schema format version: the `improved-bases:` section carries `version: 1`, written on every save and assumed when missing. Format 1 is stable. A base with a newer version is read as far as possible and is read-only in the schema settings dialog; unknown keys in the section survive every write.
- The plugin's texts follow Obsidian's interface language. English and German are included; other languages can be added under `src/i18n/`.

### Fixed

- Schema settings: the field disclosure chevron was invisible on tablets, where Obsidian pads plain buttons; it is an icon button now, keeps its icon under theme padding, tells assistive technology whether the row is open, and the row's icon buttons use touch size on mobile.
- Schema settings: on narrow phones the field row could overflow the dialog and hide the remove button; the name column shrinks instead.

## [0.2.0] - 2026-11-03

### Added

- Select and Relation are registered as Obsidian property types and appear in Obsidian's own type menus.
- Fields with a global Select or Relation type but no base definition get generic widgets: select shows the values used in the vault as neutral pills, relation offers a picker over all notes.
- Change a column's type from the base header context menu. For Select, Relation, or a field the base defines, Schema settings opens with that field preselected; cancel leaves the base unchanged.
- Schema settings can open with a field focused.

### Changed

- Turning widgets off unregisters the property types; such fields show as text and keep their values.
- The plugin reads global types from Obsidian's assigned widgets and refreshes them when it is enabled.

## [0.1.0] - 2026-10-17

### Added

- Relation fields that link to entries of another base, optionally restricted to one view of that base.
- Select fields with colored options, managed from a popover in the field.
- Schema settings dialog per base; definitions live in the `.base` file.
- Widgets in the Bases table view, the properties panel and the sidebar file properties.

[Unreleased]: https://github.com/Macavity/obsidian-improved-bases/compare/0.2.0...HEAD
[0.2.0]: https://github.com/Macavity/obsidian-improved-bases/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/Macavity/obsidian-improved-bases/commits/0.1.0
