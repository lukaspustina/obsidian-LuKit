# SDD: Dev-Review Remediation (Two-Phase)

**Status**: Ready for Implementation
**Original**: specs/sdd/dev-review-remediation.md
**Refined**: 2026-04-28

---

## Overview

Two-phase cleanup based on the 2026-04-28 dev-review. Phase 1 fixes structural and process debt that does not change runtime behaviour (release hygiene, layering/coupling, test coverage gaps, observability, engineering hygiene). Phase 2 fixes user-visible bugs and UX gaps (modal input validation, duplicate-detection correctness, silent fallbacks, misleading notices, CLI input validation, HelpModal drift, destructive migration UX, LaunchBar exit-code handling). The phases are independently shippable; Phase 1 hardens the foundation so Phase 2 lands with full test coverage.

---

## Context & Constraints

- TypeScript strict mode, ES2022, Obsidian plugin v1.12.4 + Node CLI, esbuild, Vitest 4.
- CLAUDE.md rules: no `any`, explicit return types on all exported functions, no default exports except the Plugin class, `*-engine.ts` files must remain free of `obsidian` imports, named exports throughout, German section names (`Inhalt`, `Erinnerungen`, `Fakten und Pointer`, `Nächste Schritte`).
- Engine/feature split is load-bearing; the `obsidian`-import constraint is verified by grep and must stay verified after every phase.
- Single-user offline desktop threat model — no security hardening required beyond what the review flagged.
- The CLI (`src/cli.ts` → `cli.js`) is a single esbuild-bundled file; it does not ship `manifest.json` at runtime.

---

## Architecture

The existing engine/feature/modal pattern is unchanged. This SDD reorganises helpers into `src/shared/` sub-modules and adds inline validation to modals. No new features, no new commands, no new settings keys.

```
src/
  shared/
    note-structure.ts    (NEW) Inhalt helpers + appendSectionAt + stripTrailingBrackets
    frontmatter.ts       (NEW) frontmatter tag helpers + extractCreatedDate
    diary-settings.ts    (NEW) getDiaryNotePath accessor
    diary.ts             (REWRITTEN) real diary helpers; no longer a re-export shim
    date-format.ts       (unchanged)
    modals/
      text-date-modal.ts     (inline validation added)
      text-input-modal.ts    (inline validation added)
      heading-suggest.ts     (pre-fill fix)
      help-modal.ts          (driven by helpEntries() registry)
      section-note-suggest.ts (unchanged)
  features/
    vorgang/
      vorgang-engine.ts      (imports from shared; appendSectionAt refactor)
      vorgang-feature.ts     (uses getDiaryNotePath; Notice on missing diary path)
      add-section-modal.ts   (inline validation added)
    besprechung/
      besprechung-engine.ts  (helpers moved to shared; duplicate-detection fix)
      besprechung-feature.ts (error-surface fixes; tag-removal separation)
    work-diary/
      work-diary-engine.ts   (helpers moved to shared/diary.ts; loop helper extracted)
      work-diary-feature.ts  (Notice date parameterisation)
    migration/
      migration-engine.ts    (unchanged logic; imports from shared)
      migration-feature.ts   (diff count in confirm dialog)
  types.ts               (mergeSettings validation; LuKitFeature.helpEntries())
  main.ts                (Notice on feature-load failure)
  cli.ts                 (arg validation; --help/--version)
launchbar/
  LuKit Add Text to Diary.lbaction/Contents/Scripts/default.js  (exit-code check)
  LuKit Add Reminder.lbaction/Contents/Scripts/default.js       (exit-code check)
versions.json            (1.12.4 entry)
CHANGELOG.md             ([Unreleased] section)
CLAUDE.md                (remove hardcoded version)
```

---

## Requirements

### Phase 1 — Technical

**REQ-01** ✓ `versions.json` shall contain an entry `"1.12.4": "1.0.0"` matching `manifest.json`'s `minAppVersion`.

**REQ-02** ✓ `CHANGELOG.md` shall contain an `[Unreleased]` section listing every user-visible change shipped since `[1.12.4] - 2026-04-16`: File pending notes, Add multiple summaries, configurable `pendingOrder`, "skip insertion if besprechung already linked", "Don't file" picker option, vorgang `]]` parse fix, vorgang sort by note-name date.

**REQ-03** ✓ `CLAUDE.md` shall not contain a hardcoded version number; the `(v1.12.2)` literal shall be removed and replaced with a version-free description.

**REQ-04** ✓ The following helpers shall be exported from `src/shared/` modules rather than from feature directories:
- `findInhaltSectionIndex` (currently `vorgang-engine.ts`) → `src/shared/note-structure.ts`
- `findInhaltBulletRange` (currently `vorgang-engine.ts`) → `src/shared/note-structure.ts`
- `formatLinkedBullet` (currently `vorgang-engine.ts`) → `src/shared/note-structure.ts`
- `frontmatterTagsInclude` (currently `besprechung-engine.ts`) → `src/shared/frontmatter.ts`
- `removeTagFromFrontmatter` (currently `besprechung-engine.ts`) → `src/shared/frontmatter.ts`
- `extractCreatedDate` (currently `besprechung-engine.ts`) → `src/shared/frontmatter.ts`

No other helpers are promoted; scope is limited to these six.

**REQ-05** ✓ `src/shared/diary.ts` shall become the real source for diary helpers moved from `work-diary-engine.ts`. The current 3-line re-export shim shall be replaced with actual implementations. The helpers to move are: `findThirdSeparatorIndex`, `findTodayHeaderIndex`, `addEntryUnderToday`, `entryExistsUnderToday`, `ensureTodayHeader`, `formatTodayHeader`, `formatDiaryEntry`, `formatTextEntry`, `stripWikilinks`, plus the private helper `parseDiaryHeaderDate` (consumed by `findTodayHeaderIndex`). `formatReminderEntry` and `addReminder` shall remain in `work-diary-engine.ts` (single-feature consumers, not cross-feature). `work-diary-engine.ts` retains only diary-orchestration-specific logic that is not consumed outside the feature.

**REQ-06** ✓ `VorgangFeature` shall not directly read `this.plugin.settings.workDiary.diaryNotePath`. Cross-feature settings access shall go through `getDiaryNotePath(plugin: LuKitPlugin): string` exported from `src/shared/diary-settings.ts`.

**REQ-07** Engine-only assertions already covered by `tests/unit/` shall be deleted from `tests/acceptance/`. They shall not be moved — tests in `tests/unit/` already cover them.

**REQ-08** `tests/helpers/obsidian-mocks.ts` shall expose exactly the following mock surface (no more, no less):
- `Vault`: `read`, `modify`, `process`, `getAbstractFileByPath`, `getMarkdownFiles`
- `MetadataCache`: `getFileCache`
- `FileManager`: `processFrontMatter`
- `Workspace`: `activeEditor`, `getActiveFile`
- `Notice`: capture-only shim exposing `lastNotice(): string | undefined` for assertions
- `Modal`: shim with `open()`, `close()`, `contentEl: HTMLElement`
- `MockTFile.stat`: `{ mtime: number; ctime: number }` (both fields). `createMockTFile` defaults both to `Date.now()`. Tests exercising `pendingOrder` shall set `ctime` explicitly per fixture.

**REQ-09** `BesprechungFeature.filePendingCmd` shall have feature-level tests covering: `pendingOrder` oldest, `pendingOrder` newest, skip advances index, drop removes tag and advances, ESC ends workflow, duplicate-bullet short-circuit.

**REQ-10** `MigrationFeature.migrateCmd`, `WorkDiaryFeature.addCurrentNoteCmd`, and `VorgangFeature.addVorgangSectionCmd` shall each have feature-level tests covering their decision branches.

**REQ-11** `mergeSettings` in `src/types.ts` (signature: `mergeSettings(saved: Partial<LuKitSettings>): LuKitSettings`) shall validate `dateLocale` against the `DateLocale` type set `("de" | "en" | "iso")`; invalid values shall fall through to the default `"de"` and emit `console.warn` with the rejected value. Tests shall cover: empty data, partial data, invalid `dateLocale`, full round-trip.

**REQ-12** `insertBesprechungSummary` and `addBesprechungSummariesCmd` in `besprechung-feature.ts` shall surface async rejections via `new Notice(...)`. Bare `void` calls that swallow rejections shall be replaced with `.catch(err => new Notice(\`LuKit: \${err.message}\`))`.

**REQ-13** `BesprechungFeature.fileBesprechungIntoVorgang` shall decompose `markFiled` into two separate `processFrontMatter` calls:
1. Inside the existing outer try block: write `filed_into` and `filed_at` metadata via `markFiledInFrontmatter`.
2. In its own try/catch: remove the pending tag via `removeTagFromFrontmatter`.

Vault-modify failure or step (1) failure shall surface "Failed to file". Step (1) success but step (2) failure shall surface `"LuKit: filed \"${besprechung.basename}\" but failed to remove tag \"${pendingTag}\""`. Both succeeding shall surface the existing "Filed successfully" Notice.

**REQ-14** ✓ `insertVorgangContent` in `vorgang-engine.ts` shall be refactored to use a single helper `appendSectionAt` with the signature:
```typescript
function appendSectionAt(
  lines: string[],
  atIndex: number,
  header: string,
  bodyLines: string[],
): { lines: string[]; cursorLineIndex: number }
```
The helper consolidates the four h5-insertion sub-branches across Cases 2 and 3 (Inhalt-without-bullets and normal Inhalt, each with h5-found / h5-not-found variants). Case 1 (no `# Inhalt` exists — scaffold from scratch) remains a separate early-return block above the helper call site, since it inserts the `# Inhalt` heading itself rather than just an h5 section.

**REQ-15** ✓ The three `replace(/\]+$/, "")` call sites shall be replaced with a single exported helper `stripTrailingBrackets(s: string): string` in `src/shared/note-structure.ts`. Call sites:
- `src/shared/diary.ts` (inside `parseDiaryHeaderDate`, after Phase 1.B moves it from `work-diary-engine.ts`)
- `vorgang-engine.ts:71`
- `vorgang-engine.ts:88`

This requirement depends on Phase 1.B step 4 having moved `parseDiaryHeaderDate` to `src/shared/diary.ts`.

**REQ-16** ✓ The "advance through bullets and indented sub-content" pattern in `work-diary-engine.ts` (`entryExistsUnderToday` and `addEntryUnderToday`) shall be extracted into a single private helper `findEntryBlockEnd(lines: string[], headerIndex: number): number` and reused from both functions.

**REQ-17** ✓ `main.ts` `onload` shall add `new Notice(\`LuKit: failed to load feature \${feature.id} — see console\`)` alongside the existing `console.error` when a feature's `onload` throws.

### Phase 2 — Functional / UX

**REQ-18** `TextDateModal.submit()` shall validate the date field using `parseDateString(value, this.locale)`. On failure: modal stays open, an inline error element shows `"Invalid date — expected ${dateFormatHint(this.locale)}"`, the resolver is not called.

**REQ-19** `AddSectionModal.submit()` (in `src/features/vorgang/add-section-modal.ts`) shall validate the date field using `parseDateString(value, this.locale)`. On failure: modal stays open, inline error shows `"Invalid date — expected ${dateFormatHint(this.locale)}"`. The fallback to `new Date()` is removed; if no date is provided the field is required.

`dateFormatHint(locale: DateLocale): string` shall be added to `src/shared/date-format.ts` and return:
- `"DD.MM.YYYY"` for `"de"`
- `"MM/DD/YYYY"` for `"en"`
- `"YYYY-MM-DD"` for `"iso"`

**REQ-20** `TextInputModal.submit()` and `TextDateModal.submit()` shall display an inline error "Text required." when the text field is empty, rather than silently no-opping. The modal shall stay open.

**REQ-21** Besprechung duplicate-detection shall match by note name (wikilink target), not by rendered bullet string. The check shall parse existing `# Inhalt` TOC bullets using the regex `\[\[([^\]#|]+)` to extract the note name before any `#` or `|`, and compare against the candidate note's basename. Re-insertion shall be blocked regardless of date-resolution drift. On a hit, the canonical Notice text shall be `"LuKit: \"${besprechung.basename}\" already linked in \"${vorgang.basename}\""` (no surrounding quotes change between insert paths and pending-filing paths; the message is identical).

**REQ-22** `VorgangFeature.addDiaryEntryForSection` shall show `new Notice("Diary entry skipped — set Diary note path in LuKit settings")` when `getDiaryNotePath(plugin)` returns an empty string. The Vorgang section is still inserted.

**REQ-23** The CLI shall count only positional arguments (flags stripped before counting) per command. When the positional count exceeds the expected count, it shall write `"Usage: lukit <command> ... — extra args (did you forget to quote text?)\n"` to stderr and exit with code 2. No file shall be written.

**REQ-24** The CLI `add-diary-entry` command shall reject an empty `<note-name>` argument with stderr `"note-name must not be empty\n"` and exit code 2.

**REQ-25** `loadLocale()` in `src/cli.ts` shall call `console.warn(\`LuKit: invalid dateLocale "\${value}" in config — falling back to "de"\`)` when `isDateLocale` returns false for the configured value.

**REQ-26** `HelpModal` shall render by calling `plugin.features.flatMap(f => f.helpEntries())`. `LuKitFeature` shall gain a new optional method:
```typescript
helpEntries?(): HelpEntry[]
```
`HelpEntry` is defined in `src/types.ts`:
```typescript
export interface HelpEntry {
  commandId: string;
  displayName: string;
  description: string;
}
```
Each feature shall implement `helpEntries()` listing every command it registers. A Vitest snapshot test shall call `plugin.features.flatMap(f => f.helpEntries?.() ?? [])` and assert with `expect(entries).toMatchSnapshot()`. Updating the snapshot is the only way to ship a new command; drift is detected automatically.

**REQ-27** `MigrationFeature.migrateCmd` shall compute a diff count (lines changed) from the engine output before opening the confirm dialog. The confirm body shall include "X line(s) will change." before the user confirms.

**REQ-28** `WorkDiaryFeature.addCurrentNoteCmd` "Already in diary" Notice shall reflect the actual target date derived from the heading or title, not literally "today". The message shall be `"Already in diary for \${formattedDate}"`.

**REQ-29** `HeadingSuggestModal` shall not pre-fill the query input with `headings[1]` when "No heading" is the first displayed item. The pre-fill shall be removed; the modal opens with an empty input.

**REQ-30** The CLI shall recognise `--help` in any position in `argv`. When a known command name precedes `--help` (e.g. `add-diary-entry --help`), it shall print per-command usage to stdout and exit 0. When `--help` appears with no recognised command, it shall print the global usage and exit 0.

**REQ-31** The CLI shall accept `--version` and print the version string baked in at build time, then exit 0. In `esbuild.config.mjs`, read the version using `JSON.parse(readFileSync("./manifest.json", "utf8")).version` (with `import { readFileSync } from "node:fs"`) — this avoids the `assert { type: "json" }` vs `with { type: "json" }` deprecation cliff between Node 20 and Node 22+. The `define: { "__CLI_VERSION__": JSON.stringify(version) }` option shall be added to the CLI build only (the `if (cli)` branch's `esbuild.build({...})` options block), not to the plugin `esbuild.context({...})`. The CLI source references the `__CLI_VERSION__` constant via `declare const __CLI_VERSION__: string;`.

**REQ-32** Each LaunchBar wrapper script shall check the CLI exit code. On non-zero exit, the script shall surface the CLI's stderr to the user (truncated to 200 characters) as a LaunchBar notification. Success messages shall fire only on exit code 0.

---

## File & Module Structure

**New files:**
- `src/shared/note-structure.ts` — exports: `findInhaltSectionIndex`, `findInhaltBulletRange`, `formatLinkedBullet`, `stripTrailingBrackets`, `appendSectionAt`
- `src/shared/frontmatter.ts` — exports: `frontmatterTagsInclude`, `removeTagFromFrontmatter`, `extractCreatedDate`
- `src/shared/diary-settings.ts` — exports: `getDiaryNotePath(plugin: LuKitPlugin): string`

**Rewritten files:**
- `src/shared/diary.ts` — real source for diary helpers (no longer a re-export shim)

**Modified files (Phase 1):**
- `versions.json`
- `CHANGELOG.md`
- `CLAUDE.md`
- `src/types.ts` — `mergeSettings` locale validation; `LuKitFeature.helpEntries?()`, `HelpEntry` interface
- `src/main.ts` — Notice on feature-load failure
- `src/features/vorgang/vorgang-engine.ts` — import from shared; `appendSectionAt` refactor; `stripTrailingBrackets` usage
- `src/features/vorgang/vorgang-feature.ts` — use `getDiaryNotePath`
- `src/features/besprechung/besprechung-engine.ts` — helpers moved to shared; imports updated
- `src/features/besprechung/besprechung-feature.ts` — async error surface; tag-removal separation
- `src/features/work-diary/work-diary-engine.ts` — helpers moved to `src/shared/diary.ts`; `findEntryBlockEnd` extracted
- `src/features/migration/migration-engine.ts` — imports from shared
- `tests/helpers/obsidian-mocks.ts` — expand mock surface per REQ-08
- `tests/acceptance/besprechung-commands.test.ts`
- `tests/acceptance/migration-commands.test.ts`
- `tests/acceptance/vorgang-commands.test.ts`
- `tests/acceptance/work-diary-commands.test.ts`
- `tests/unit/cli.test.ts`

**Modified files (Phase 2):**
- `src/shared/modals/text-date-modal.ts`
- `src/shared/modals/text-input-modal.ts`
- `src/shared/modals/heading-suggest.ts`
- `src/shared/modals/help-modal.ts`
- `src/features/vorgang/add-section-modal.ts`
- `src/features/vorgang/vorgang-feature.ts`
- `src/features/work-diary/work-diary-feature.ts`
- `src/features/migration/migration-feature.ts`
- `src/cli.ts`
- `esbuild.config.mjs`
- `launchbar/LuKit Add Text to Diary.lbaction/Contents/Scripts/default.js`
- `launchbar/LuKit Add Reminder.lbaction/Contents/Scripts/default.js`

---

## Data Models

```typescript
// src/types.ts additions

export interface HelpEntry {
  commandId: string;   // matches the id passed to addCommand()
  displayName: string; // human-readable command name
  description: string; // one-line description
}

export interface LuKitFeature {
  id: string;
  onload(plugin: LuKitPlugin): void;
  onunload(): void;
  renderSettings?(containerEl: HTMLElement, plugin: LuKitPlugin): void;
  helpEntries?(): HelpEntry[];  // NEW — optional; defaults to empty if absent
}
```

```typescript
// src/shared/note-structure.ts

export function findInhaltSectionIndex(lines: string[]): number
export function findInhaltBulletRange(
  lines: string[],
  inhaltIndex: number,
): { firstBullet: number; afterLastBullet: number } | null
export function formatLinkedBullet(noteName: string, locale: DateLocale, date: Date): string
export function stripTrailingBrackets(s: string): string
export function appendSectionAt(
  lines: string[],
  atIndex: number,
  header: string,
  bodyLines: string[],
): { lines: string[]; cursorLineIndex: number }
```

```typescript
// src/shared/frontmatter.ts

export function frontmatterTagsInclude(
  tags: unknown,
  target: string | ReadonlySet<string>,
): boolean
export function removeTagFromFrontmatter(fm: Record<string, unknown>, tag: string): void
export function extractCreatedDate(content: string): Date | null
```

```typescript
// src/shared/diary-settings.ts

import type LuKitPlugin from "../main";
export function getDiaryNotePath(plugin: LuKitPlugin): string
```

```typescript
// src/shared/diary.ts (promoted from re-export shim)

export function formatTodayHeader(locale: DateLocale, date?: Date): string
export function findThirdSeparatorIndex(lines: string[]): number
export function findTodayHeaderIndex(
  lines: string[],
  afterLine: number,
  locale: DateLocale,
  date?: Date,
): number
export function ensureTodayHeader(
  content: string,
  locale: DateLocale,
  date?: Date,
): { newContent: string; headerLineIndex: number; fallback: boolean }
export function entryExistsUnderToday(
  content: string,
  entry: string,
  locale: DateLocale,
  date?: Date,
): boolean
export function addEntryUnderToday(
  content: string,
  entry: string,
  locale: DateLocale,
  date?: Date,
): { newContent: string; entryLineIndex: number }
export function formatDiaryEntry(noteName: string, heading: string | null): string
export function formatTextEntry(text: string): string
export function stripWikilinks(text: string): string
// Internal (not exported) — moved here because it consumes stripTrailingBrackets
// and is called by findTodayHeaderIndex
function parseDiaryHeaderDate(line: string, locale: DateLocale): Date | null
```

```typescript
// src/shared/date-format.ts (addition)

export function dateFormatHint(locale: DateLocale): string
// Returns "DD.MM.YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD"
```

---

## API Contracts

**`mergeSettings(saved: Partial<LuKitSettings>): LuKitSettings`** (in `src/types.ts`)
- If `saved.dateLocale` is not `"de"`, `"en"`, or `"iso"`, log `console.warn(\`LuKit: invalid dateLocale "\${saved.dateLocale}" — falling back to "de"\`)` and use `"de"`.
- All other nested merges follow existing spread pattern.

**`getDiaryNotePath(plugin: LuKitPlugin): string`** (in `src/shared/diary-settings.ts`)
- Returns `plugin.settings.workDiary.diaryNotePath`.
- Single authoritative read point for cross-feature access.

**`appendSectionAt(lines, atIndex, header, bodyLines)`** (in `src/shared/note-structure.ts`)
- Inserts `header` (and `bodyLines` if non-empty) at `atIndex` in `lines`.
- Returns the mutated `lines` and the `cursorLineIndex` pointing to the first editable line inside the new section.
- Does not mutate the input array; returns a new array.

**Inline error pattern for modals** — all modals touched in Phase 2.A use:
```typescript
// In onOpen():
const errorEl = contentEl.createEl("p", { cls: "lukit-modal-error" });
errorEl.style.display = "none";

// On date validation failure:
errorEl.textContent = `Invalid date — expected ${dateFormatHint(this.locale)}`;
errorEl.style.display = "block";
return; // do not call resolver, do not close modal

// On empty-text validation failure:
errorEl.textContent = "Text required.";
errorEl.style.display = "block";
return;
```

**`__CLI_VERSION__`** — a global constant declared in `esbuild.config.mjs` via `define`, applied only to the CLI build. The TypeScript source references it as:
```typescript
declare const __CLI_VERSION__: string;
```
`esbuild.config.mjs` reads version from `manifest.json` using `readFileSync` (avoiding the `assert` vs `with` import-attribute deprecation across Node versions):
```javascript
import { readFileSync } from "node:fs";
const version = JSON.parse(readFileSync("./manifest.json", "utf8")).version;
// ...
// inside the if (cli) branch only:
await esbuild.build({
  // ...existing CLI options...
  define: { "__CLI_VERSION__": JSON.stringify(version) },
});
```
The plugin `esbuild.context({...})` block is left unchanged.

---

## Configuration

No new settings keys. No changes to `DEFAULT_SETTINGS` keys. `getDiaryNotePath` is a read-only accessor; it introduces no new setting.

The `__CLI_VERSION__` constant is a build-time substitution, not a runtime config value.

---

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Invalid date in modal | User submits unparseable date text | Modal stays open; inline `<p class="lukit-modal-error">` shown; resolver not called | "Invalid date — expected ${dateFormatHint(locale)}" below input (locale-specific) |
| Empty text in modal | User submits with empty text field | Modal stays open; inline error shown; resolver not called | "Text required." below input |
| Missing `diaryNotePath` in Vorgang | `getDiaryNotePath` returns `""` | Vorgang section still inserted; Notice emitted | "Diary entry skipped — set Diary note path in LuKit settings" |
| `processFrontMatter` throws after successful filing | Tag removal (step 2 of decomposed `markFiled`) fails after filing+metadata succeeded | Separate `catch` block; filing Notice already shown | `LuKit: filed "${besprechung.basename}" but failed to remove tag "${pendingTag}"` |
| `insertBesprechungSummary` rejects | Async error in besprechung insert flow | `.catch(err => new Notice(...))` | "LuKit: \<err.message\>" |
| Feature `onload` throws | `feature.onload(this)` in `main.ts` loop | Remaining features still register; Notice emitted | "LuKit: failed to load feature \<id\> — see console" |
| CLI invalid `dateLocale` in config | `loadLocale()` reads value not in `DateLocale` | `console.warn` to stderr; fall through to `"de"` | stderr warning line |
| CLI extra positional args | Positional arg count exceeds expected for command | `process.stderr.write(...)`, exit code 2 | "Usage: lukit \<command\> ... — extra args (did you forget to quote text?)" |
| CLI empty `<note-name>` | `add-diary-entry` receives `""` as first positional | `process.stderr.write(...)`, exit code 2 | "note-name must not be empty" |
| LaunchBar CLI exit non-zero | CLI spawn returns non-zero exit code | Script shows stderr (truncated to 200 chars) as notification; skips success message | LaunchBar notification with error text |
| Migration confirm with diff count | User invokes `Migration: Convert note` | Diff count computed before confirm; shown in dialog body | "X line(s) will change." in confirm modal |

---

## Implementation Phases

### Phase 1.A — Release hygiene ✓ DONE

**Files**: `versions.json`, `CHANGELOG.md`, `CLAUDE.md`

1. Add `"1.12.4": "1.0.0"` to `versions.json`. Line ordering matches the existing descending-version pattern.
2. Add `[Unreleased]` section to `CHANGELOG.md` immediately under the `## [Unreleased]` heading (or create the heading if absent), listing the seven changes from REQ-02. Use Keep-a-Changelog format (`### Added`, `### Fixed`).
3. In `CLAUDE.md`, find the line containing `(v1.12.2)` and remove the parenthetical version reference. Do not rewrite the surrounding sentence beyond the removal.

**Done when**: `jq '.["1.12.4"]' versions.json` outputs `"1.0.0"`; `CHANGELOG.md` contains `[Unreleased]`; `grep -n "v1\." CLAUDE.md` returns nothing.

---

### Phase 1.B — Shared helpers extraction ✓ DONE

**Files (new)**: `src/shared/note-structure.ts`, `src/shared/frontmatter.ts`, `src/shared/diary-settings.ts`

**Files (rewritten)**: `src/shared/diary.ts`

**Files (modified)**: `src/features/vorgang/vorgang-engine.ts`, `src/features/besprechung/besprechung-engine.ts`, `src/features/besprechung/besprechung-feature.ts`, `src/features/migration/migration-engine.ts`, `src/features/work-diary/work-diary-engine.ts`, `src/features/vorgang/vorgang-feature.ts`, `src/shared/modals/section-note-suggest.ts`

Steps (each independently committable):

1. Create `src/shared/note-structure.ts`. Move `findInhaltSectionIndex`, `findInhaltBulletRange`, `formatLinkedBullet` from `vorgang-engine.ts`. Add `stripTrailingBrackets` (stub — replaces duplicated `replace(/\]+$/, "")`, implemented in Phase 1.C). Update `vorgang-engine.ts` imports. Run `npm run build && npm run test`.

2. Create `src/shared/frontmatter.ts`. Move `frontmatterTagsInclude`, `removeTagFromFrontmatter`, `extractCreatedDate` from `besprechung-engine.ts`. Update `besprechung-engine.ts`, `besprechung-feature.ts`, `section-note-suggest.ts` imports. Run `npm run build && npm run test`.

3. Create `src/shared/diary-settings.ts` with `getDiaryNotePath`. Update `vorgang-feature.ts` to call it instead of reading `this.plugin.settings.workDiary.diaryNotePath` directly. Run `npm run build && npm run test`.

4. Rewrite `src/shared/diary.ts`: move the nine diary helper functions listed in REQ-05 plus the private `parseDiaryHeaderDate` helper from `work-diary-engine.ts` into this file as real implementations. `formatReminderEntry` and `addReminder` stay in `work-diary-engine.ts`. Update `work-diary-engine.ts` imports. Update `migration-engine.ts` if it imports from `work-diary-engine.ts`. Run `npm run build && npm run test`. Phase 1.C step 2 (`stripTrailingBrackets` call-site replacement) depends on this step having completed, since one of the call sites moves into `src/shared/diary.ts` here.

**Done when**: `grep -rn "from \".*features/.*-engine\"" src/features/{besprechung,migration,vorgang}/ src/shared/` returns no cross-feature engine imports; build passes; all tests pass.

---

### Phase 1.C — Engineering hygiene ✓ DONE

**Files**: `src/features/vorgang/vorgang-engine.ts`, `src/features/work-diary/work-diary-engine.ts`, `src/shared/note-structure.ts`, `src/main.ts`

Steps:

1. Implement `appendSectionAt` in `src/shared/note-structure.ts` per the signature in REQ-14. Refactor `insertVorgangContent` in `vorgang-engine.ts` to call `appendSectionAt` for all three cases. Engine-level unit tests in `tests/unit/vorgang-engine.test.ts` must pass without modification.

2. Implement `stripTrailingBrackets(s: string): string` in `src/shared/note-structure.ts` (replaces the stub from 1.B step 1). Replace the three `replace(/\]+$/, "")` call sites with `stripTrailingBrackets(...)`. Call sites are: `src/shared/diary.ts` (inside `parseDiaryHeaderDate`, present after Phase 1.B step 4), `vorgang-engine.ts:71`, `vorgang-engine.ts:88`. This step depends on Phase 1.B step 4 completing first.

3. Extract `findEntryBlockEnd(lines: string[], headerIndex: number): number` as a private helper in `work-diary-engine.ts`. The while-loop body in `entryExistsUnderToday` (lines 96-101) and `addEntryUnderToday` (lines 111-117) shall both delegate to it. Engine-level unit tests must pass without modification.

4. In `main.ts`, add `new Notice(\`LuKit: failed to load feature \${feature.id} — see console\`)` inside the catch block at lines 29-31, alongside the existing `console.error`.

**Done when**: `npm run test` passes with no changes to existing test files; `wc -l src/features/vorgang/vorgang-engine.ts` is lower than before.

---

### Phase 1.D — Test layer rebuild

**Files**: `tests/helpers/obsidian-mocks.ts`, `tests/acceptance/*-commands.test.ts`, `tests/acceptance/besprechung-vault.test.ts`, `tests/unit/` (engine tests)

Steps:

1. Expand `tests/helpers/obsidian-mocks.ts` to the surface defined in REQ-08. Each mock method uses `vi.fn()`. `lastNotice()` returns the `message` argument from the most recent `Notice` constructor call. Add `ctime: number` to `MockTFile.stat` (existing `mtime` retained); update `createMockTFile` to default both to `Date.now()`. Tests that exercise `BesprechungFeature.filePendingCmd` `pendingOrder` shall set `ctime` explicitly per fixture to control sort order deterministically.

2. Delete engine-only assertions from `tests/acceptance/*-commands.test.ts` that duplicate assertions already present in the corresponding `tests/unit/*-engine.test.ts` files. Do not move them — they already exist in `tests/unit/`.

3. Delete the duplicate `formatDate` describe block at lines 14-39 of `tests/unit/vorgang-engine.test.ts` (already tested in `tests/unit/date-format.test.ts`).

4. Rewrite each `tests/acceptance/*-commands.test.ts` to instantiate the actual `*-feature.ts` class against a mock plugin (using the mocks from step 1) and invoke command callbacks directly. Assert: `lastNotice()` text, vault `modify` call arguments, cursor placement where applicable.

5. Add tests for `BesprechungFeature.filePendingCmd` per REQ-09. Use `vi.setSystemTime` to pin dates.

6. Add tests for `addCurrentNoteCmd`, `migrateCmd` dispatch, `addVorgangSectionCmd` editor branch per REQ-10.

7. Add tests for `mergeSettings` in `tests/unit/` per REQ-11: empty data, partial data, invalid `dateLocale` (assert `console.warn` called with rejected value), full round-trip.

**Done when**: `npm run test` passes; every `*-feature.ts` file has at least one acceptance test that would fail if the command body were gutted; `mergeSettings` invalid-locale path is covered.

---

### Phase 1.E — Observability

**Files**: `src/features/besprechung/besprechung-feature.ts`, `src/cli.ts`

Steps:

1. Locate every `void this.insertBesprechungSummary(...)` and `void this.addBesprechungSummariesCmd(...)` call in `besprechung-feature.ts`. Append `.catch((err: Error) => new Notice(\`LuKit: \${err.message}\`))` to each.

2. Decompose `markFiled` in `fileBesprechungIntoVorgang` into two sequential `processFrontMatter` calls:
   - **Call 1 (inside the existing outer try block)**: write `filed_into` and `filed_at` metadata via `markFiledInFrontmatter`. Failure of this step (or of the preceding `vault.modify`) shall surface the existing "Failed to file" Notice.
   - **Call 2 (in its own try/catch, after Call 1 succeeds)**: remove the pending tag via `removeTagFromFrontmatter`. On failure, show `LuKit: filed "${besprechung.basename}" but failed to remove tag "${pendingTag}"` and do not show "Failed to file".

   On both succeeding: the existing "Filed successfully" Notice fires.

3. In `src/cli.ts`, in `loadLocale()`, after the `isDateLocale` check fails, add `console.warn(\`LuKit: invalid dateLocale "\${value}" in config — falling back to "de"\`)`.

**Done when**: Vitest tests for the three failure paths pass, asserting correct Notice text / stderr output.

---

### Phase 2.A — Modal input validation

**Files**: `src/shared/modals/text-date-modal.ts`, `src/shared/modals/text-input-modal.ts`, `src/features/vorgang/add-section-modal.ts`

Steps:

1. In each modal's `onOpen()`, add:
   ```typescript
   const errorEl = contentEl.createEl("p", { cls: "lukit-modal-error" });
   errorEl.style.display = "none";
   ```

2. Add `dateFormatHint(locale: DateLocale): string` to `src/shared/date-format.ts` returning `"DD.MM.YYYY"` / `"MM/DD/YYYY"` / `"YYYY-MM-DD"` for `de` / `en` / `iso` respectively.

3. In `TextDateModal.submit()` and `AddSectionModal.submit()`:
   - Call `parseDateString(inputValue, this.locale)`.
   - On `null` result: set ``errorEl.textContent = `Invalid date — expected ${dateFormatHint(this.locale)}` ``, set `errorEl.style.display = "block"`, return early.
   - Remove the `date ?? new Date()` fallback from `AddSectionModal`; the field is required.

4. In `TextInputModal.submit()` and `TextDateModal.submit()`:
   - If the text field value trims to empty: set `errorEl.textContent = "Text required."`, set `errorEl.style.display = "block"`, return early.

**Done when**: Acceptance tests assert that submitting bad/empty input does not call the resolver and does not close the modal (resolver mock not called, modal `close()` mock not called).

---

### Phase 2.B — Behaviour fixes

**Files**: `src/features/besprechung/besprechung-feature.ts`, `src/features/besprechung/besprechung-engine.ts`, `src/features/vorgang/vorgang-feature.ts`, `src/features/work-diary/work-diary-feature.ts`, `src/shared/modals/heading-suggest.ts`, `src/features/migration/migration-feature.ts`

Steps:

1. **Duplicate-detection fix** (`besprechung-feature.ts` + `besprechung-engine.ts`): Replace the bullet-string `includes()` check with a note-path comparison. Add a pure engine function:
   ```typescript
   export function extractWikilinkTarget(bullet: string): string | null
   ```
   Implementation: apply `/\[\[([^\]#|]+)/` to the bullet, return `match[1]` trimmed or `null`. In `besprechung-feature.ts`, before inserting, check whether any existing `# Inhalt` TOC bullet's `extractWikilinkTarget` matches the candidate note's basename.

2. **Vorgang Notice for missing diary path** (`vorgang-feature.ts`): In `addDiaryEntryForSection`, after the empty-path guard, add `new Notice("Diary entry skipped — set Diary note path in LuKit settings")`.

3. **addCurrentNoteCmd date in Notice** (`work-diary-feature.ts`): Compute `formattedDate` from the resolved date using `formatDate(date, locale)`. Change the "Already in diary" Notice to `\`Already in diary for \${formattedDate}\``.

4. **HeadingSuggestModal pre-fill** (`heading-suggest.ts`): Remove the `this.inputEl.value = headings[1]` (or equivalent) pre-fill assignment in `onOpen`. The input opens empty.

5. **Migration diff count** (`migration-feature.ts`): After calling the migration engine, compute a line-diff count. Pass it into the confirm modal body as `"X line(s) will change."` before the existing confirm text.

**Done when**: Acceptance tests assert each Notice text and behaviour. The duplicate-detection test from Test Scenario "duplicate-detection by note path" passes.

---

### Phase 2.C — CLI hardening

**Files**: `src/cli.ts`, `esbuild.config.mjs`

Steps:

1. Add a positional-argument counter to each command handler. Strip flags (strings starting with `--`) before counting. If positional count exceeds the command's expected count, write the usage error to `process.stderr` and call `process.exit(2)`.

2. In the `add-diary-entry` handler, if the `<note-name>` positional argument is an empty string after trimming, write `"note-name must not be empty\n"` to `process.stderr` and call `process.exit(2)`.

3. Add a `--help` scan at the top of the CLI entry point: if `argv.includes("--help")`, determine whether the first non-flag argv element is a known command name; if so, print per-command usage and exit 0; otherwise print global usage and exit 0.

4. Add a `--version` scan: if `argv.includes("--version")`, print `__CLI_VERSION__` and exit 0. In `esbuild.config.mjs`, add `import { readFileSync } from "node:fs";` at the top, then read the version once via `const version = JSON.parse(readFileSync("./manifest.json", "utf8")).version;`. Add `define: { "__CLI_VERSION__": JSON.stringify(version) }` to the `if (cli)` branch's `esbuild.build({...})` options block only — do NOT add it to the plugin `esbuild.context({...})` call. In `src/cli.ts`, add `declare const __CLI_VERSION__: string;` near the top of the file.

**Done when**: `tests/unit/cli.test.ts` covers: extra-arg rejection (exit 2), empty-note-name rejection (exit 2), `--help` global, `--help` per-command, `--version` output.

---

### Phase 2.D — HelpModal registry

**Files**: `src/types.ts`, `src/shared/modals/help-modal.ts`, all `*-feature.ts` files

Steps:

1. Add `HelpEntry` interface and `helpEntries?(): HelpEntry[]` to `LuKitFeature` in `src/types.ts` (per Data Models section).

2. Implement `helpEntries()` in each feature class, returning one entry per `addCommand` call made in that feature's `onload`. Fields: `commandId` matches the `id` string in `addCommand`, `displayName` matches `name`, `description` is a one-line summary.

3. Rewrite `HelpModal` to iterate `plugin.features.flatMap(f => f.helpEntries?.() ?? [])` and render each entry using `contentEl.createEl`.

4. Add a Vitest snapshot test in `tests/unit/` (or `tests/acceptance/`):
   ```typescript
   const entries = plugin.features.flatMap(f => f.helpEntries?.() ?? []);
   expect(entries).toMatchSnapshot();
   ```
   Run `npm run test -- --update-snapshots` once to create the baseline. Subsequent runs fail if the array changes without a snapshot update.

**Done when**: Removing a command from a feature's `onload` without updating `helpEntries()` causes the snapshot test to fail; `npm run test` passes with the baseline snapshot.

---

### Phase 2.E — LaunchBar exit codes

**Files**: `launchbar/LuKit Add Text to Diary.lbaction/Contents/Scripts/default.js`, `launchbar/LuKit Add Reminder.lbaction/Contents/Scripts/default.js`

Steps:

1. In each LaunchBar script, capture the result of the CLI invocation. LaunchBar's JS environment exposes the exit code via the `status` property of the result object from `LaunchBar.execute` (or equivalent spawn API available in the script context). If the exit code is non-zero, surface the `stderr` output (truncated to 200 characters with `stderr.slice(0, 200)`) as a `LaunchBar.displayNotification` or `LaunchBar.alert` call. Do not show the success message.

2. If the LaunchBar JS API does not expose exit code directly, check whether `stdout` starts with `"Error:"` as a fallback heuristic; treat such output as failure and display it as the notification text.

3. On exit code 0: show the existing success notification unchanged.

**Done when**: Manually inducing CLI failure (point `~/.lukit.json` at a non-existent diary file) causes the LaunchBar action to show the CLI error message rather than the success notice. (This phase has no automated test; CI does not cover LaunchBar scripts.)

---

## Test Scenarios

**TS-01 — `mergeSettings` rejects invalid locale**
GIVEN `mergeSettings({ dateLocale: "fr" })` is called
WHEN the function runs
THEN the returned settings have `dateLocale === "de"` AND `console.warn` was called once with the string `"fr"` in its arguments.

**TS-02 — Feature-load failure surfaces Notice**
GIVEN a `LuKitFeature` whose `onload` throws `new Error("boom")`
WHEN `LuKitPlugin.onload` processes the feature list
THEN all other features still register their commands AND `lastNotice()` matches `"LuKit: failed to load feature"`.

**TS-03 — Besprechung tag-removal failure does not produce "Failed to file"**
GIVEN `vault.modify` resolves AND `fileManager.processFrontMatter` rejects
WHEN `fileBesprechungIntoVorgang` runs
THEN no Notice with text containing `"Failed to file"` is shown AND one Notice contains `"failed to remove pending tag"`.

**TS-04 — TextDateModal stays open on bad date**
GIVEN the modal is open
WHEN `submit()` is called with date input `"31/02/2026"`
THEN the resolver callback is not called AND `errorEl.style.display === "block"` AND `errorEl.textContent` contains `"Invalid date"`.

**TS-05 — TextInputModal stays open on empty text**
GIVEN the modal is open
WHEN `submit()` is called with an empty text field
THEN the resolver callback is not called AND `errorEl.textContent === "Text required."`.

**TS-06 — Duplicate-detection by note path, not bullet string**
GIVEN a Vorgang note's `# Inhalt` TOC contains `- [[Meeting-A#§ Summary, 01.01.2026|Meeting-A: Summary, 01.01.2026]]`
WHEN besprechung filing runs for `Meeting-A` with a resolved date of `02.01.2026`
THEN no new bullet is inserted AND `lastNotice()` matches `"Meeting-A" already linked in` (the canonical message from REQ-21).

**TS-07 — CLI rejects extra positional args**
GIVEN `argv = ["add-text-to-diary", "diary.md", "hello", "extra"]`
WHEN the CLI processes this input
THEN exit code is 2 AND stderr contains `"expected 2 arguments"` AND no file is written.

**TS-08 — CLI rejects empty note-name**
GIVEN `argv = ["add-diary-entry", "", "2026-04-28"]`
WHEN the CLI processes this input
THEN exit code is 2 AND stderr contains `"note-name must not be empty"`.

**TS-09 — Vorgang Notice when diary path unset**
GIVEN `getDiaryNotePath(plugin)` returns `""`
WHEN `addDiaryEntryForSection` is called
THEN the section is still inserted in the Vorgang note AND a Notice contains `"Diary note path"`.

**TS-10 — HelpModal drift detection**
GIVEN the baseline help-entries snapshot exists
WHEN a feature registers a new command via `addCommand` without updating `helpEntries()`
THEN `expect(entries).toMatchSnapshot()` fails on the next `npm run test` run.

---

## Decision Log

| Decision | Alternatives considered | Why rejected |
|---|---|---|
| Two phases, not one | Single phase | Phase 1 test gaps would leave Phase 2 behaviour changes unverified. Phase 1 first makes Phase 2 safe. |
| Helpers move to `src/shared/`, not left in-place with comments | Document cross-feature imports | Documenting violations is a slow-motion lie. Promotion is small and removes false structure. |
| Inline error in modals, not Notice on submit failure | Notice toast on invalid input | Modal stays open while Notice disappears; user stares at bad input with no in-place feedback. |
| `AddSectionModal` removes `new Date()` fallback entirely | Keep fallback to `initialDate` | Any silent fallback was the original bug. Fail with a visible error. |
| Duplicate-detection by parsed wikilink target | Tighten bullet-match regex | Any match against the rendered bullet inherits date-resolution drift. Parsing `[[Target]]` is unambiguous. |
| `LuKitFeature.helpEntries?()` registry | Scrape `addCommand` calls at runtime | Obsidian doesn't expose registered commands in a documented API. The optional method is a 5-line addition with strong guarantees. |
| Snapshot the `helpEntries()` array, not rendered HTML | Snapshot full rendered HTML | HTML snapshot is brittle to styling tweaks. Array snapshot fails closed on command add/remove/rename. |
| `--version` baked via esbuild `define` | Ship `manifest.json` alongside `cli.js` | The CLI is a single bundled file. Baking via `define` matches the existing single-binary boundary. |
| Keep `src/shared/diary.ts` filename | Rename to `note-structure-diary.ts` | Smaller diff; naming is clear enough given `note-structure.ts` holds Vorgang/Inhalt helpers. |
| Use `[Unreleased]` section; cut version after Phase 2 | Cut `1.12.5` immediately for Phase 1 hygiene fixes | `[Unreleased]` is simpler; a single `1.13.0` release after Phase 2 is cleaner than two incremental releases. |
| Delete engine-only assertions from acceptance layer | Move them to `tests/unit/` | They already exist in `tests/unit/`; moving would create duplicates. Delete is correct. |
| Phase 1.B implemented as four sequential commits | All of Phase 1.B in one commit | Each sub-step (note-structure, frontmatter, diary-settings, diary) is independently verifiable; smaller commits reduce revert blast radius. |
| LaunchBar: check exit code; fallback: detect `"Error:"` prefix in stdout | Require `exitCode` only | The LaunchBar JS API's exit-code exposure is not uniformly documented; the fallback is a pragmatic safety net for the existing scripts without introducing a build dependency. |

---

## Open Decisions

1. **`appendSectionAt` — mutate or return new array?**
   The signature in REQ-14 shows `{ lines: string[]; cursorLineIndex: number }`. The existing `insertVorgangContent` uses `lines.splice(...)` (mutation). The refactor could either keep in-place mutation and return the same array, or return a new array (functional style). Both work; the choice affects whether callers must reassign. This is a purely internal implementation decision with no user-visible impact. The implementer shall pick the style that makes the cursor-index computation clearest and document the choice inline.

---

## Out of Scope

- ESLint/lint pipeline (CI gap — tracked separately).
- Coverage gate in CI.
- Performance/scalability work (large-vault progress, async batching of `findPendingBesprechungen`).
- Replacing the `setTimeout(..., 10)` focus workaround except in modals touched in Phase 2.A.
- Settings-validation framework (path existence checks at save-time).
- LaunchBar UX beyond exit-code surfacing — no new actions, no `LBSummary` rewrites.
- Splitting `besprechung-feature.ts` into multiple files.
- `BesprechungFeature.SECTION_NOTE_TAGS` becoming a setting.
- I18n of UI strings — English error messages stay English.
- Removing the empty-string sentinel pattern in `DEFAULT_SETTINGS`.
- Changes to `examples/` or addition of `specs/rules/note-structure.md`.
- `besprechung-vault.test.ts` and `migration-vault.test.ts` restructure beyond what is needed by Phase 1.D.
