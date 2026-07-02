# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.15.1] - 2026-07-02

### Fixed
- Task Triage: tasks whose TaskNotes due/scheduled carry a time component (`YYYY-MM-DDTHH:mm`) were silently excluded from the walk (due today) or rendered NaN labels (overdue) — dates are now normalized to date-only at the bridge boundary (4c18fda).
- Task Triage: a failing task listing aborted silently (unhandled rejection); it now shows an error Notice and resets the walk (4c18fda).
- Task Triage: the walk could be started twice while the (long) task listing was still loading — the re-entry guard now claims the walk before the await (4c18fda).
- Task Triage: walks crossing midnight completed/snoozed/skipped relative to the new day; the walk date is now pinned at walk start (4c18fda).
- Task Triage: a single stale index path (note just deleted/renamed) failed the whole task listing; unreadable tasks are now skipped individually (4c18fda).
- Task Triage: Vorgang previews — an empty `# Fakten und Pointer` section fell back to the untrimmed full note, and h5 headings inside the Fakten section were duplicated and consumed the newest-3-sections budget (4c18fda).
- Task Triage: unloading the plugin mid-walk no longer lets a surviving modal resurrect the walk; the availability check now also requires the `catalog.read` capability (4c18fda).

### Changed
- Task Triage: ISO date helpers unified into the shared date-format module, duplicated action handlers merged, debug timing logs removed; note previews use cached reads with per-walk caching and next-task prefetch (4c18fda).

## [1.15.0] - 2026-07-02

### Added
- **Task Triage (requires TaskNotes ≥ 4.10.0)** — new command **Vorgang: Triage due tasks**: walks every TaskNotes task due or scheduled until today (the "Until today" condition) and forces one quick decision per stop — **⌘D** complete (recurring tasks: check off today's instance), **⌘1/⌘2/⌘3** snooze to tomorrow / +1 week / next Monday, **⌘T** snooze via native date picker, **⌘X** skip today's recurring instance, **Enter** open & stop, **Esc** skip, **⌘.** stop. Each stop shows a compact metadata line (position, overdue indicator, dates, priority, contexts, projects) and a large Markdown-rendered preview (Vorgang notes trimmed to `# Fakten und Pointer` plus the newest three sections). All task access goes through the TaskNotes runtime API (versioned, capability-gated) — user-remapped fields, custom statuses, and recurring semantics stay correct; a summary Notice reports completed / snoozed / skipped / remaining on every exit path (ab8f672, 0cf6c20, f55a051, db11b6b).

### Changed
- Task Triage startup is instant on large vaults: task listing uses TaskNotes' internal path index (with fallback to the official `list()`, which scans the whole vault), and the walk modal opens before the first preview finishes loading (f55a051, 123bb6d).

## [1.14.1] - 2026-07-01

### Fixed
- Email Filing: attachments (including PDFs) were silently dropped when Mail's JXA `mimeType()` is unreadable — it throws in some Mail versions, and the bridge read name/mimeType/size in a single guard, so a failing `mimeType()` discarded the whole attachment. Each field is now read independently (mimeType defaults to empty), and the inline-image filter keys off the auto-generated `imageNNN.<ext>` filename instead of the unreliable MIME type — so real attachments and meaningfully-named images are kept while signature/logo images are still dropped (c681bde).

## [1.14.0] - 2026-07-01

### Added
- **Email Filing (macOS / Apple Mail)** — walk the Apple Mail inbox and file each message into a Vorgang/Person/Bestellung/Bewerbung note; the inbox-zero counterpart to *Besprechung: File pending*. Filing assembles the **whole conversation** — the received message, your Sent replies, and the thread's other emails still in the inbox — newest-first as one section, de-duplicated against what the Vorgang already contains; sibling inbox emails are archived too, so the whole thread leaves the inbox. A per-message preview offers include/exclude checkboxes and editable bodies (headers and `message://` links are locked). Quoted history, signatures, and inline images are stripped. Filing suggestions are mined from existing Vorgänge and learn across sessions. A single-shot **E-Mail: File selected Mail message** command (capture-only) covers threads you started. No copies stored in the vault; the osascript bridge passes all values as argv, never interpolated (997787b…e3f922e).
- Besprechung: **filing-target suggestions** — the section-note picker pins the most likely targets on top (`★ … (suggested)`), ranked by recency-weighted history of past filings plus name-match against the candidate's own name (49f3ce0, 65d6f1b, 0a344b7).
- Besprechung: configurable **self-name stopwords** setting — names ignored when matching filing suggestions (default empty) (287567f).
- Modals: keyboard shortcuts for picker actions — **Esc** = Skip, **⌘.** = Stop, **⌘D** = Don't file, **⌘P** = toggle peek panel (e3dd498).

### Changed
- Besprechung: extract summary sections at **any heading level** (h1–h6), not only h3 — supports Granola-style h1 headings (b4ebc91).

### Fixed
- Modals: picker cancel detection is now order-independent (Obsidian 1.12.7 fires `onClose` before `onChooseItem`), so picks no longer spuriously trigger the dismiss path (afafb17).

### Internal
- Forbid PII across fixtures, examples, and source; scrubbed real names from test data (7e2d0bb, 674dd1f).

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
