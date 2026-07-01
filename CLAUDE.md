# LuKit — Obsidian Plugin

## Project Overview
LuKit is a modular Obsidian plugin that bundles workflow automations for note-taking workflows. Each use case is a self-contained "feature" in `src/features/<name>/`. Date formatting is configurable via the `dateLocale` setting (`"de"`, `"en"`, or `"iso"`), defaulting to German locale. Section names use German terms (`Inhalt`, `Fakten und Pointer`, `Erinnerungen`, `Nächste Schritte`).

## Build & Test Commands
- `npm install` — install dependencies
- `npm run build` — typecheck + bundle to main.js
- `npm run build:cli` — bundle CLI only
- `npm run dev` — bundle in watch mode (no typecheck)
- `npm run test` — run all tests with Vitest

## Features

### Work Diary (`src/features/work-diary/`)
Maintains a reverse-chronological diary in a single note. The diary note has frontmatter, then an optional `# Erinnerungen` section, then a third `---` separator, below which are date-headed entries.
- Date headers: h5 with locale-dependent format (e.g., `##### Fr, 06.02.2026` for `de`, `##### Fri, 02/06/2026` for `en`, `##### 2026-02-06` for `iso`)
- Entries are bullet points: linked (`- [[NoteName#Heading|NoteName: Heading]]`) or plain text (`- some text`)
- "Add text entry" and "Add reminder" commands prompt for text and a date (via `TextDateModal`, defaults to today); entries and reminders are filed under the chosen date's header
- Reminders go under `# Erinnerungen` between frontmatter and the third `---` separator, tagged with the chosen date (`- Call dentist, 13.02.2026`)
- The third `---` separator is a critical structural element — diary entries go below it
- "Add current note" command: adds the active note (with heading at cursor) as a diary entry — no modals, rejects if active file is the diary note
- Engine: `work-diary-engine.ts` (pure logic), Feature: `work-diary-feature.ts` (Obsidian commands)
- Settings: `diaryNotePath` (path to the single diary note)

### Vorgang (`src/features/vorgang/`)
Automates adding sections to "Vorgang" (case/process) notes. A Vorgang note has:
- `# Fakten und Pointer` — facts section
- `# Inhalt` — table of contents with wikilink bullets (`- [[#Section Name, DD.MM.YYYY]]`)
- `##### Section Name, DD.MM.YYYY` — h5 section headers with bullet content below
- Adding a section creates both a TOC entry and an h5 header, placing cursor for immediate typing
- Adding a section prompts for a name and a date (defaults to today); the diary entry is placed under the chosen date's header in the configured diary note; silently skips if no diary path is configured
- `formatVorgangHeadingText(name, locale, date?)` returns the heading text without the `##### ` prefix (e.g., `"Section, DD.MM.YYYY"`)
- `addVorgangSectionLinked(content, noteName, locale, date, bodyLines?)` inserts a linked h5 section (e.g., `##### [[NoteName]]`) with optional body lines; used by BesprechungFeature to embed meeting summaries into a Vorgang note
- Engine: `vorgang-engine.ts`, Feature: `vorgang-feature.ts`, Modal: `add-section-modal.ts` (feature-specific two-field modal: section name + date)

### Besprechung (`src/features/besprechung/`)
Extracts key sections from meeting notes and inserts formatted summaries at cursor.
- Picks a note from a configured folder via fuzzy search
- Extracts configurable sections by heading name at any level (h1–h6, e.g. h1 `# Nächste Schritte` from Granola notes or h3 `### Nächste Schritte`); default headings: `Nächste Schritte`, `Zusammenfassung`. A section ends at the next heading of the same or higher level. Note: a `#` without a trailing space is not a heading (CommonMark/Obsidian) and is correctly ignored.
- Converts h3 headers to bold in the output
- `formatBesprechungSummary` returns `{ body, missing }` and never aborts; `composeBesprechungInsertion(summary, basename)` appends `→ See full notes: [[<basename>]] (missing: …)` whenever a configured heading wasn't found, so partial extractions still yield a useful insertion (and pure-missing cases insert just the link line)
- "File pending notes" command: walks Besprechungen tagged with `pendingTag` (default: `todo`) in `pendingOrder` (default: `oldest` first by ctime; alt: `newest`), picks a section note (Vorgang/Person/Bestellung/Bewerbung) for each, files the summary via `app.vault.modify` (no editor required), then on the besprechung removes the pending tag and stamps `filed_into: "[[<vorgang basename>]]"` + `filed_at: <ISO>` via `app.fileManager.processFrontMatter` (`markFiled` helper). The frontmatter stamp is structured training data for future automation that suggests routings. Picker has three virtual entries: Skip (leaves pending, advances), Don't file (removes pending tag without filing or stamping, advances), Stop+open (opens current besprechung in new tab via `workspace.getLeaf("tab").openFile` and stops the workflow). Keyboard: **Esc / click-outside = Skip** (dismiss → `onSkip`), **⌘. = Stop** (`onCancel`), **⌘D = Don't file** (`onDrop`); the list entries remain for mouse use, and a `setInstructions` hint bar shows the shortcuts.
- "File this Besprechung" command: single-shot variant that operates on the active note. Validates the active file has `Besprechung` in its frontmatter `tags`, then opens the same `SectionNoteSuggestModal` with only Pick + Don't-file entries (Skip and Stop+open are degenerate in single-shot mode). Reuses `fileBesprechungIntoVorgang`/`dropPending`. Files regardless of pending-tag state so it works for back-filling untagged besprechungen.
- **Filing suggestions**: both filing commands pin the most likely target note(s) atop the picker as `★ <name> (suggested)` rows, ranked by `suggestFilingTargets` (pure `besprechung-suggest-engine.ts`). Two signals combine: history (recency-weighted Jaccard of the candidate title against past `filed_into` besprechung titles, summed per target) and name-match (recall of a candidate note's own name tokens against the title). `BesprechungFeature.buildFilingCorpus` gathers `{rawTitle, target, filedAt}` from besprechungen under `folderPath` with a `filed_into` value (reusing `extractWikilinkTarget` for the target), excluding the besprechung being filed; `sectionNoteBasenames` enumerates the selectable candidate set with the same filter the modal uses. Suggestion computation is wrapped so any failure degrades to no suggestions (full list still opens). Weights/threshold and the generic stopword list are internal constants; the only stopword setting is `selfNameStopwords` (extra tokens — e.g. the note-owner's own name — passed via `SuggestOptions.selfNameStopwords` and stripped from both title and candidate-name tokens).
- `SectionNoteSuggestModal` constructor takes an options object `{ placeholder, onPick, onSkip?, onDrop?, onOpenSource?, onCancel?, suggestions?, skipLabel?, dropLabel?, openLabel?, previewText? }`; virtual sentinels appear only when their callback is provided. Keyboard shortcuts are registered in `onOpen` via `scope.register(["Mod"], …)`: ⌘. → `onCancel` (Stop), ⌘D → `onDrop`, ⌘P → toggle the `previewText` peek panel; **dismiss (Esc/click-outside) routes to `onSkip` when present, else `onCancel`** (see the cancel-detection note below). `setInstructions` renders the hint bar. `suggestions` (ordered basenames) pins resolved candidates above the sentinels as `★ <name> (suggested)` and removes them from the full list; absent/empty leaves ordering unchanged.
- Engine: `besprechung-engine.ts` (also exports `frontmatterTagsInclude`, `removeTagFromFrontmatter` — pure helpers used by the pending-filing flow), `besprechung-suggest-engine.ts` (pure filing-target ranker), Feature: `besprechung-feature.ts`
- Modal: `src/shared/modals/section-note-suggest.ts` (lists notes whose frontmatter tags include any of `Vorgang|Person|Bestellung|Bewerbung`, prepends `↪ Skip`/`✕ Don't file`/`→ Stop` virtual entries). **Cancel detection is order-independent**: Obsidian 1.12.7 calls `onClose()` before `onChooseItem()`, so the `chosen` flag is checked in a deferred `setTimeout(…,0)` — otherwise every pick spuriously fired the dismiss path.
- Settings: `folderPath`, `sectionHeadings` (array of h3 heading names), `pendingTag` (default `"todo"`), `pendingOrder` (`"oldest"` | `"newest"`, default `"oldest"`), `selfNameStopwords` (array, default `[]` — names ignored in filing-suggestion matching)

### Migration (`src/features/migration/`)
Auto-detects and converts old-format notes to current format. Idempotent (safe to run multiple times).
- **Vorgang notes** (detected by `**Inhalt**` or `# Inhalt`): bold top-level → h1, `Fakten` → `Fakten und Pointer`, bold entries → h5, plain TOC → wikilinks, adds frontmatter tag
- **Diary notes** (no Inhalt section): bold date headers → h5
- Engine: `migration-engine.ts` (reuses `vorgang-engine.ts` helpers), Feature: `migration-feature.ts`

### Email Filing (`src/features/email-filing/`)
macOS/Apple Mail only. Walks the Apple Mail inbox and files each message into a section note (Vorgang/Person/Bestellung/Bewerbung), mirroring Besprechung's "File pending" flow. Inbox-zero: the inbox IS the pending queue; filing/dismissing moves the message to the account's archive mailbox; **no email state is stored in the vault**.
- "File inbox emails" command (`email-filing-walk`): walks `listInbox()` in `order` (oldest/newest); per message opens `SectionNoteSuggestModal` (name-match suggestions + relabeled Skip/Don't-file/Stop entries). Pick → `EmailPreviewModal` (editable body) → on confirm the **archive-first → verify (`isInInbox`) → modify Vorgang** contract runs (any failed step shows an error Notice and skips the rest). Don't-file archives without filing; Skip leaves in inbox; Stop+open opens via `message://` and halts; a concurrent-walk guard rejects re-entry. Keyboard (shared modal): Enter files, **Esc = Skip**, **⌘. = Stop**, **⌘D = Don't file**, **⌘P = toggle the email peek panel** (the `previewText` view, shown by default).
- Body extraction is plain-text only (`parseEmailBody`): strips `>` quotes, Apple Mail `Am … schrieb:`, German Outlook `Von:/Gesendet:` blocks, `-----Ursprüngliche Nachricht-----`, and a signature/footer block — cut at the first of the `-- ` delimiter, a closing salutation (`Mit freundlichen Grüßen`/`Viele Grüße`/`MfG`/`Best regards`/… at line start), or a disclaimer marker (`Diese E-Mail`/`Vertraulichkeitshinweis`/`Sitz der Gesellschaft`/`Handelsregister`/… at line start). Aggressive by design — biased to under-trim (line-start matches only), and the editable preview + `message://` link recover anything over-cut. Inline images are filtered (`filterAttachments`); only real attachments are listed (`Anhänge:`). HTML→markdown is a deferred v2 concern.
- Engines (pure): `email-quote-engine.ts` (`parseEmailBody`), `email-format-engine.ts` (`formatEmailSection`, `filterAttachments`, `sanitizeSenderSubject`, `stripSubjectPrefixes`, `buildMessageUrl`, `MailAttachment`, `EmailMeta`). Bridge (impure, injectable): `mail-bridge.ts` (`createOsascriptBridge` over `osascript` JXA via `child_process.execFile`; runtime values passed as **argv, never interpolated**; `child_process` externalized in the plugin esbuild bundle). `listInbox` uses **bulk property reads** (one Apple Event per property per account's INBOX, not per-message) to avoid multi-second startup; the feature caches picker candidates once per walk and **prefetches the next message body** while the user works the current one; loading Notices cover the gaps. Messages that left the inbox between snapshot and their turn (server rules / other clients) are detected via a `{notFound}` sentinel from `fetchBody`, skipped **silently**, and summarized once at walk end; genuine bridge errors still surface and stop the walk. Feature: `email-filing-feature.ts` (inline `renderSettings` with a "Detect accounts" button + per-account include-in-walk toggle). Settings: `email-filing-settings.ts` (`order`, `defaultArchiveMailbox`, per-account `archiveMailboxes`, per-account `walkAccounts` toggle map; `isAccountIncluded` defaults unknown/true to included). The walk filters to included accounts via `selectWalkMessages` before ordering.
- Suggestions reuse `suggestFilingTargets` with an explicit `minScore` (no `besprechung-suggest-engine` change). The corpus is an **in-walk routing memory** (`walkFiledRecords`): each successful filing records `{title, target}`, so later same-thread emails (matching subject minus `AW:/Re:` prefixes) are steered to the Vorgang already chosen this walk. The first email of a thread falls back to name-match only (empty corpus). Reset per walk; nothing persists to the vault. Symmetric **skip memory**: skipping an email records its `threadKey` (normalized subject, prefixes stripped); later same-thread emails are **auto-skipped before fetching** (left in the inbox, counted "automatisch übersprungen" in the summary). Only Skip feeds this — Don't-file (which archives) is never auto-propagated. Console logging is PII-safe (error type only, never subject/sender).
- **Conversations (v2, `specs/sdd/email-filing-conversations.md`):** filing an inbound email assembles the whole thread — the inbound message **plus the user's Sent replies** (bridge `listSentForThread`, matched by correspondent address + `threadKey`) — rendered **newest-first** as one section via `formatThreadSection` (each message's sub-header links the party name to its `message://`; no separate "siehe" line), **deduped against the target Vorgang's existing `message://` ids** (`extractFiledMessageIds`) so re-filing a thread only adds what's new. Filing records the `threadKey` so the thread's other inbox messages auto-skip. Sent-retrieval failure degrades to inbound-only. **Perf:** `listSentForThread` uses a `whose({subject:{_contains}})` query (one Apple Event) rather than scanning the whole Sent mailbox; the Sent mailbox name is resolved once at Detect time (`detectSentMailboxes`) and stored, with a `/sent|gesendet/i` fallback (`lukitSentMailbox`) covering provider/locale variants (Sent Messages / Sent Items / Sent Mail / Gesendet). Single-shot command **`email-filing-file-selected`** ("File selected Mail message"): files the Mail selection (any mailbox incl. Sent) + its thread into a Vorgang, **capture-only (never archives)** — covers threads the user initiated (`bridge.getSelection`). Cross-session routing: at walk/single-shot start, `email-routing.ts` (`mineVorgangFilings`) mines existing Vorgang `E-Mail von`/`E-Mail-Thread` headings into a `FiledRecord` corpus (subject as `rawTitle`), cached in `emailFiling.routingCache` (plugin data, 24h TTL, invalidated after each filing) and combined with the in-walk memory for suggestions. No per-email notes — Vorgänge remain the record.
- **Status:** Phases 1–4 (base) + conversations v2 (Phases 1–3) implemented; the osascript bridge's live behavior (esp. Gmail archive mailbox, `listSentForThread`, `getSelection`) awaits manual smoke tests against real accounts — see the SDD reports.

### CLI (`src/cli.ts` → `cli.js`)
Command-line interface for use outside Obsidian. Commands: `add-text-to-diary`, `ensure-today-header`, `add-diary-entry`, `add-reminder`, `init-config`. Uses `~/.lukit.json` config (includes `dateLocale` field). LaunchBar actions in `launchbar/` directory for macOS integration.

## Architecture

### File Structure
- `src/main.ts` — thin plugin shell, loads features. Orchestration only, no business logic.
- `src/types.ts` — shared interfaces (`LuKitFeature`, settings types, `DEFAULT_SETTINGS`)
- `src/settings.ts` — main settings tab, composes sections from features
- `src/cli.ts` — CLI entry point, parsed with minimal deps (no Obsidian imports)
- `src/shared/date-format.ts` — shared date formatting module (`DateLocale` type, `formatDate`, `formatWeekday`, `formatDateWithWeekday`, `parseDateString`, `extractDateFromTitle`)
- `src/shared/modals/` — reusable modals (`confirm-modal`, `text-input-modal`, `text-date-modal`, `note-suggest`, `folder-note-suggest`, `heading-suggest`, `help-modal`)
- `src/features/<name>/` — self-contained feature modules

### Feature Module Pattern
Each feature has up to 4 files:
- `<name>-engine.ts` — **pure logic**, no Obsidian imports, directly testable. Operates on strings/arrays.
- `<name>-feature.ts` — implements `LuKitFeature`, registers Obsidian commands, reads/writes files via Obsidian API.
- `<name>-settings.ts` — settings interface and defaults (optional, not all features have settings).
- Feature-specific modals (e.g., `add-section-modal.ts` for vorgang).

### Test Structure
- `tests/unit/` — unit tests for `*-engine.ts` pure logic (no Obsidian mocks needed)
- `tests/acceptance/` — acceptance tests for `*-feature.ts` command flows with mocked Obsidian APIs
- `tests/helpers/obsidian-mocks.ts` — shared Obsidian API mocks

### Examples
- `examples/old/` — pre-migration note styles (bold headers, plain TOC entries, bold date headers in diary)
- `examples/new/` — current note styles (h5 section headers, wikilink TOC entries, `# Fakten und Pointer` / `# Inhalt` structure)
- `examples/test-besprechung.md` — sample meeting note with `### Nächste Schritte` and `### Zusammenfassung` sections

### Adding a New Feature
1. Create `src/features/<name>/` with `<name>-engine.ts` (pure logic) and `<name>-feature.ts` (implements `LuKitFeature`)
2. Add feature-specific settings to a `<name>-settings.ts` if needed
3. Register the feature in `main.ts` → `onload()`
4. Add tests in `tests/unit/` (engine) and `tests/acceptance/` (commands)

## Code Style
- TypeScript strict mode, no `any` types
- Explicit return types on all exported functions
- No default exports except the Plugin class (Obsidian requires it)
- Prefer `const` over `let`, never use `var`
- Use early returns to reduce nesting
- Named exports for everything except the Plugin class

## Security
- Never execute user-provided strings as code
- Validate all file paths before use
- Sanitize modal input (trim whitespace, reject empty where required)
- No dynamic imports or `eval`
- No innerHTML — use Obsidian's DOM creation APIs (`createEl`, `Setting`)

## No PII (test data, examples, docs, source)
This plugin operates on personal notes, so real data leaks easily into fixtures. **Never** put real personal data anywhere in the repo — tests, example notes, docs, SDDs, or source constants. This includes: real people's names (including the maintainer's own name and colleagues), employer/company names, cities/locations, vendor/product names, account references, amounts tied to real events, and meeting/Vorgang titles copied from the real vault.
- Use clearly-fictional German placeholders: persons `Max Mustermann` / `Erika Beispiel` / `Petra Schneider` / `Jonas Klein` / `Anna` / `Hans`; place `Musterstadt`; company `Acme`; only `example.com` for domains.
- Never hardcode a real name as a constant (e.g. a stopword) — make it a setting that defaults to empty (see `besprechung.selfNameStopwords`).
- The only sanctioned real name is plugin authorship in `package.json` / `manifest.json`.
- When adding fixtures derived from real notes, genericize names/orgs/places but keep structure (dates, headers, edge-case characters).

## Testing
- **Every change must pass all tests** — run `npm run test` before considering any change complete
- Unit test all pure logic functions with full branch coverage
- Acceptance test command flows with mocked Obsidian dependencies
- Keep diary-engine.ts and other pure logic free of Obsidian imports so they can be tested without mocks

## Documentation
- **Keep `README.md` up to date** — update it when adding features, commands, or changing setup instructions
- **Keep `TODO.md` up to date** — add planned features, mark completed ones, remove obsolete items

## Maintainability
- Each feature is isolated in its own directory
- Shared utilities go in `src/shared/`
- `main.ts` is a thin shell — no business logic
- Each modal in its own file with a single responsibility
- Keep pure logic separate from Obsidian API calls

## Git
- **Never add `Co-Authored-By` lines** to commit messages
