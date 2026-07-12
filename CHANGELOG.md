# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.20.2] - 2026-07-12

### Fixed
- The section title input in the email preview now stretches to the full modal width, matching the body preview (19c084a).

## [1.20.1] - 2026-07-11

### Fixed
- Date detection now normalizes invisible Unicode spaces (non-breaking space & co., pasted from PDFs/emails or substituted by macOS) before matching the `", DD.MM.YYYY"` suffix — previously such sections were treated as dateless: the merge sorted them at the merge date instead of chronologically and appended a bogus second date to their TOC anchors (be41632).

## [1.20.0] - 2026-07-11

### Added
- **Editable section title in the email preview** — a prefilled text input lets you adjust the generated section name before filing; a blank input falls back to the generated one (9aae478).
- **„Ablegen und Öffnen"** — third button in the email preview: files the thread and opens the target note in the current window; in the inbox walk this ends the walk so the opened note stays visible (9aae478).

## [1.19.0] - 2026-07-09

### Added
- **Per-attachment checkboxes in the email preview** — every attachment gets its own checkbox with smart preselection: documents are checked, images only from 500 KB (footer logos and signature icons start unchecked). Unchecked attachments are neither saved to `_resources/` nor listed in the `Anhänge:` line; excluding a whole message greys out its attachment checkboxes. The read-only attachment line in the preview is replaced by the checkbox list — names stay non-editable (93c412e, f10ba26, 40ace64, 4829099).

## [1.18.0] - 2026-07-05

### Added
- **Vorgang: In anderen Vorgang zusammenführen** — structure-aware merge of two Vorgänge: Fakten and Nächste Schritte bullets are appended, h5 sections land date-sorted with fresh TOC entries, already-linked sections are skipped as duplicates. The source becomes a stub (`Zusammengeführt in [[Ziel]].`), gets the done tag, loses `note_type`, and is deliberately NOT renamed; the merge is logged to the diary and summarized in a pluralized Notice. Fail-safe write order: target first — an aborted merge never loses data (c215168, 442ab9b).
- **Email attachments land in the vault** — filing an email (walk and single-shot) saves the included messages' real attachments to the target note's folder under `_resources/` and links them as wikilinks in the `Anhänge:` line. Collision-safe naming (` 2` suffix, case-insensitive, thread-wide), sender-controlled filenames are sanitized against path traversal, and any save failure degrades to the plain name without stopping the filing (89d8983, f060715).
- **Vorgang: Aktuelle Notiz umwandeln** now adds the section-note skeleton (`# Fakten und Pointer`, `# Nächste Schritte`, `# Inhalt`); an existing body moves into a dated `Notiz` section with TOC entry — converted notes are immediately merge- and reference-ready (79c039c). The command also aligns the title prefix (`<Typ> - <Name>`, replacing a different type prefix) (a4d0c46).
- **Create a Vorgang mid-walk** — the filing pickers (email + besprechung) gain a „＋ Neuen Vorgang anlegen…" entry that runs a configured command (e.g. a QuickAdd choice), waits for the new note to be tag-indexed, and reopens the picker with it pinned. New setting: „Kommando für neuen Vorgang" (63c9526).
- **Vorgang: Vorgang referenzieren / Abschließen** — insert a one-way linked section for a picked Vorgang; close a Vorgang (done tag, `note_type` removed, rename to „… - done", diary entry) (8c41f1f).
- Migration command renamed to the Vorgang prefix (ID unchanged — hotkeys survive) (87f0965).

### Fixed
- Gmail archiving: the archive mailbox now resolves via fallback search (Archive/Archiv/All Mail/Alle Nachrichten — Gmail has no "Archive" mailbox) and matches nested `[Gmail]/…` names by their last path segment; an unresolvable mailbox yields a German Notice naming the account (feeb463, 7b3bb35).

### Security
- npm audit fix — vitest, vite, postcss security updates (008b062).

## [1.17.0] - 2026-07-02

### Added
- **Erinnerungen-Triage** — the triage walk now presents due diary reminders (from the diary note's `# Erinnerungen` section) as stops before the TaskNotes tasks; dateless reminders count as always due. **⌘D deletes the reminder line**, ⌘1/⌘2/⌘3/⌘T rewrite its date suffix (dateless lines get one), **Enter opens the diary at the line**; reminder previews show the whole Erinnerungen section and are always read fresh. Without TaskNotes the walk now runs reminders-only instead of aborting. Command renamed to **Vorgänge: Fällige Aufgaben durchgehen** (ID unchanged — hotkeys survive) (8bf7bed, d979701, 105970a).
- **Abgeschlossen-Tag** — new global setting (default `Done`): notes carrying the tag disappear from all filing pickers, suggestion candidates, and routing-corpus mining, so closed Vorgänge stop diluting suggestions (4b995c9).
- Filing suggestions now share their routing knowledge across features: Besprechung suggestions include the email routing corpus and vice versa; inserting a summary into a section note stamps `filed_into`/`filed_at` like the filing flow, so manual insertions feed the corpus too (4b995c9).
- Onboarding guidance: a missing diary note offers to create itself with the required skeleton, an empty filing picker explains the Vorgang/Person/Bestellung/Bewerbung tag taxonomy, TaskNotes gate messages name the required version, and a one-time welcome Notice appears after installation (858c758).

### Changed
- **The plugin UI is now German throughout** — Notices, settings tab, help modal, modal buttons, picker rows, and validation errors; raw exception Notices were replaced with German messages naming the failed action. The CLI stays English (858c758).
- Filing walks: **⌘N replaces ⌘D for „Nicht ablegen"** — ⌘D now unambiguously means Erledigt (task triage). Picker placeholders no longer claim Esc stops when it skips, the hint bar shows the caller's real ⌘N action, and the Besprechung pending walk gained a concurrent-walk guard plus a bucketed German summary (9c5ab0d).

### Fixed
- Email filing: osascript failures no longer dump the full command line (including the embedded JXA script) into a Notice; walks can no longer wedge permanently on an assemble/commit rejection; „Konten erkennen" re-renders only its own settings section instead of wiping the whole tab (00c490a).
- Besprechung: re-filing a besprechung no longer duplicates its section — the already-linked guard now recognizes the date-suffixed bullets the plugin itself writes (00c490a).
- Manifest: `isDesktopOnly` is now true — the email feature's `child_process` import made the plugin fail to load on mobile despite the manifest claiming support (00c490a).

### Removed
- **Besprechung: Mehrere Zusammenfassungen einfügen** — unused loop wrapper around the single-summary command (4b995c9).

## [1.16.0] - 2026-07-02

### Changed
- **All command names are now German**, with a consistent verb convention — *einfügen* = insert at cursor, *hinzufügen* = append to a structure, *ablegen* = file away — and plural prefixes for backlog walks (`Vorgänge: Fällige Tasks durchgehen`, `Besprechungen: Alle offenen ablegen`, `E-Mails: Posteingang ablegen`) vs. singular for single-note commands (`Vorgang: Abschnitt hinzufügen`, `Besprechung: Aktuelle Notiz ablegen`, `Tagebuch: Aktuelle Notiz hinzufügen`, …). This also fixes the task-triage command's misleading prefix and drops developer jargon like "Ensure". Command IDs are unchanged — existing hotkey assignments keep working (4fe86b4).

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
