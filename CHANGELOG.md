# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.13.1] - 2026-05-04

### Fixed
- Besprechung: create diary entry when filing into a section note (Add summary, File pending, File this) — was silently skipped in all three paths (6dc9dd4)

## [1.13.0] - 2026-04-30

### Added
- Besprechung: **File pending notes** — walks Besprechungen tagged with the configured pending tag (default `todo`) in FIFO order, picks a target Vorgang/Person/Bestellung/Bewerbung for each, files the summary and removes the tag. Picker also offers Skip, Don't file, and Stop+open virtual entries. Stamps `filed_into` and `filed_at` on filed Besprechungen for future automation training data (fe5b471, 7cc8cd7, dbbd7dd, 47dbbec).
- Besprechung: **Add multiple summaries** — re-opens the picker after each insertion (already-picked files hidden) until ESC; persists the search query across iterations (0a6a879).
- Besprechung: **File this Besprechung** — single-shot variant of File pending that operates on the active note (94d1676).
- Besprechung: configurable **pending order** setting (oldest-first / newest-first) for the File pending workflow (15f3616).
- Never abort summary insertion — when configured sections are missing, the available ones are still inserted and a `→ See full notes: [[Besprechung]] (missing: …)` line is appended; if all sections are missing the insertion is the link line alone (bf3787b).
- Modal input validation with inline errors instead of silently no-opping; date fields show locale-specific format hints (f4e5d4a).
- CLI: `--help` (global + per-command) and `--version` flags; positional-argument validation with usage-aware error messages (49bfe8e).
- HelpModal driven by per-feature `helpEntries()` registry; snapshot test catches drift when commands are added/renamed without updating help (b07302f).
- LaunchBar wrapper scripts surface CLI errors via `LaunchBar.alert` instead of showing a misleading success notification (5634d49).

### Fixed
- Vorgang: skip insertion when the besprechung is already linked in `# Inhalt`; duplicate-detection now matches by parsed wikilink target, not by rendered bullet text (e2945cf, aeca7d6).
- Vorgang: strip trailing `]]` when parsing existing h5 dates so wikilink-form headers sort correctly (467a327).
- Vorgang: sort linked sections by note-name date when present, instead of falling back to the caller-supplied date that may not match the displayed entry (ecd031a).
- Vorgang: emit Notice when the diary path is unset, instead of silently skipping the diary entry (aeca7d6).
- Work Diary: "Already in diary" Notice now reflects the resolved target date instead of literal "today" (aeca7d6).
- HeadingSuggestModal: removed unwanted query pre-fill; modal opens empty (aeca7d6).
- Migration: confirm dialog now includes "X line(s) will change." (aeca7d6).
- Besprechung filing: `processFrontMatter` failures during tag removal no longer surface a misleading "Failed to file" Notice; the message now clearly states "filed but failed to remove tag" (0fe425b).
- `mergeSettings` validates `dateLocale` and falls back to default with a `console.warn` on invalid values (f1cf67f).
- Plugin: feature-load failures emit a Notice alongside the existing `console.error`; remaining features still register (0959c6a).

### Changed
- Cross-feature helpers consolidated into `src/shared/` (note-structure, frontmatter, diary-settings, diary, modal-validation); engine/feature layering now consistent (08cfd9f, 93c696b, 1631371, a3ca6ea, 7aeb23f).
- `insertVorgangContent` refactored to use a shared `appendSectionAt` helper covering both Inhalt-without-bullets and normal-Inhalt paths (0959c6a).
- CLI: `runCli(argv, io)` is now exported and testable in-process; entry only auto-runs when invoked as `cli.js` (7aeb23f).
- `main.ts`: `loadFeatures` extracted as a pure helper, isolating feature load failures (7aeb23f).
- Test infrastructure: feature-class acceptance tests with mocked Obsidian app/vault/metadataCache/fileManager/workspace; obsidian-stub aliased so feature classes load under vitest (9ea612e, a8cde98, 7aeb23f).

## [1.12.4] - 2026-04-16

### Added
- Recognize Person, Bestellung, Bewerbung as section notes for besprechung summary (9870871)
- Add local-install Makefile target (2b4917b)

### Fixed
- Remove deprecated baseUrl, use project tsc in CI (e65e6f7)
