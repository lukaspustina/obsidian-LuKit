# SDD: TaskNotes Triage Walk

Status: Ready for Implementation
Original: specs/sdd/tasknotes-triage-walk.md
Refined: 2026-07-02

## Overview

A walk-style triage command that iterates over all TaskNotes tasks matching the "Until today" condition (the semantics of the user's existing Bases view) and forces one quick decision per task: complete, snooze, skip today's recurring instance, open & stop, or skip. It replaces opening the TaskNotes edit modal per task with a single keyboard-driven walk modal, mirroring LuKit's existing Besprechung/email-filing walk pattern.

## Context & Constraints

- Obsidian plugin, TypeScript strict mode, esbuild bundle, Vitest. Feature module pattern: `*-engine.ts` pure (no Obsidian imports), `*-feature.ts` impure, feature-specific modals in the feature directory.
- **Hard dependency on the TaskNotes community plugin** (callumalpass/tasknotes) with its versioned runtime API (`app.plugins.getPlugin("tasknotes")?.api`, `apiVersion === 1`, capability gating via `hasCapability(...)`). LuKit must NOT read or write task frontmatter itself: TaskNotes supports user-remapped field names (FieldMapper) and user-configurable status values, and recurring-completion semantics (advance `scheduled`, maintain `complete_instances`, DTSTART handling per `recurrence_anchor`) live inside TaskNotes. All task access goes through the API, wrapped in an injectable bridge (pattern: `src/features/email-filing/mail-bridge.ts`).
- Date display follows the plugin's `dateLocale` setting via `src/shared/date-format.ts`.
- No PII in tests/fixtures (CLAUDE.md rule) — fictional task titles only (`Max Mustermann`, `Acme`, …).
- Console logging is PII-safe: error type only, never task titles/paths (same convention as email-filing).
- **Verified against the codebase**: `findH5InsertIndex` in `src/features/vorgang/vorgang-engine.ts` inserts each new h5 section immediately before the first existing h5 whose date is `<=` the new section's date — i.e. Vorgang h5 sections are stored newest-first (topmost = newest). Req 6/Phase 1's "topmost h5 section = newest" assumption is therefore correct and requires no further verification during implementation.
- `besprechung-engine.ts` exports `extractSection(content, heading, bulletsOnly = false)` — heading-bounded extraction (any level, ends at the next heading of the same or higher level). `buildTriagePreview` must reuse this for the `# Fakten und Pointer` slice rather than re-implementing heading parsing.
- `note-structure.ts`'s `extractWikilinkTarget` returns the pre-pipe target and discards the alias. `formatProjectLink` needs the inverse (alias-first when present) — it is a distinct, new function, not a reuse or wrapper of `extractWikilinkTarget`. An implementer must not substitute `extractWikilinkTarget` here.
- `app.plugins` is not part of the public `obsidian.d.ts`. The project's "no `any`" rule requires a precise local type at this boundary rather than an untyped cast (precedent: the local `RawMailMessageMeta`/`ThreadMessage` types in `mail-bridge.ts`).

## Architecture

```
task-triage-feature.ts ── registers command, runs walk loop, end summary
        │
        ├── tasknotes-bridge.ts (impure, injectable)
        │      wraps app.plugins.getPlugin("tasknotes").api via a local
        │      TaskNotesApi interface, availability check, listTasks,
        │      complete, setScheduled, toggleCompleteInstance,
        │      toggleSkippedInstance, readNote, openInNewTab
        │
        ├── task-triage-engine.ts (pure)
        │      selectTriageTasks(tasks, today) — filter + sort (Req 2–4)
        │      snoozeDate(kind, today) — tomorrow / +1w / next Monday
        │      buildTriagePreview(content) — Fakten-und-Pointer trimming
        │        (reuses besprechung-engine.ts's extractSection) + private
        │        frontmatter-stripping helper (Req 6)
        │      overdueLabel(task, today, locale) — due/scheduled precedence (Req 5)
        │      formatProjectLink(raw) — wikilink → display text (Req 5)
        │
        ├── task-triage-date-modal.ts — feature-specific date-only prompt for ⌘T
        │
        └── task-triage-modal.ts — walk modal (header, preview, shortcut scope)
```

The bridge fetches the **full task list** from TaskNotes and normalizes it into `TriageTask`; the "Until today" filter and ordering are applied client-side in the pure engine. Rationale: the TaskNotes query contract's expressiveness for OR-date conditions is unverified, and a pure filter is directly unit-testable. Task volume (tens of tasks) makes client-side filtering trivially cheap.

## Requirements

1. The plugin shall register a command "Vorgang: Triage due tasks" (`task-triage-walk`) that starts the walk from anywhere; no open note or base is required. (Amended post-ship: named per the project-wide `<Feature>: <Action>` command convention.)
2. The walk shall include exactly the tasks matching the "Until today" condition: (`due` ≤ today OR `scheduled` ≤ today) AND (task is not in a completed status OR (task is recurring AND today is not in its `complete_instances`)). Recurring effective-status overrides the raw status field: a recurring task scheduled/due today with empty `complete_instances`/`skipped_instances` is included even if its raw status is one TaskNotes considers "completed" for non-recurring tasks.
3. Recurring tasks whose instance for today is marked skipped (in `skipped_instances`) shall be excluded from the walk.
4. The walk order shall be `scheduled` ascending, then `due` ascending (tasks without the respective date sort last within each key).
5. Each walk stop shall display:
   - task title;
   - due and scheduled dates, locale-formatted via `formatDate`;
   - an overdue indicator computed by `overdueLabel`: use `due` if present and `<= today`; else use `scheduled` if present and `<= today`; else no indicator (`""`). Only one indicator is ever shown, sourced from whichever field triggered inclusion under this precedence. Format by `dateLocale`: `de` → `"{n}d überfällig"` (e.g. `"3d überfällig"`); `en` and `iso` → `"{n}d overdue"` (e.g. `"3d overdue"`);
   - priority (rendered as plain text; no engine transform — verified manually, no automated test required);
   - a recurring badge;
   - contexts;
   - linked project wikilink targets (`TriageTask.projects`), rendered via `formatProjectLink`: strip the `[[`/`]]` wikilink brackets, prefer the alias segment (text after `|`) when present, render as non-interactive plain text (no click-through), matching the read-only-header precedent in email-filing's `EmailPreviewModal`. If the raw string does not match the `[[...]]` wikilink pattern, `formatProjectLink` returns it unmodified.
6. Each walk stop shall display a content preview of the task note by default (no toggle needed to see it), produced by `buildTriagePreview(content)`:
   - Strip a leading YAML frontmatter block (`---...---`) from `content` first, regardless of branch below, via a private helper local to `task-triage-engine.ts` (this is new text-level logic — `src/shared/frontmatter.ts` operates on parsed frontmatter objects, not raw text, and is not reused here; the helper is not promoted to `src/shared/`).
   - For notes containing a `# Fakten und Pointer` heading (Vorgang-style notes): return the `# Fakten und Pointer` section (via `extractSection` from `besprechung-engine.ts`) followed by the newest three (topmost) h5 sections found after it. (Amended post-ship from "only the topmost h5 section" — user feedback: the preview must reveal what happened last and what the next steps are.)
   - For all other notes: return the full (frontmatter-stripped) body, scrollable in the modal.
7. The following actions shall be available per stop, each advancing to the next task on success:
   - **⌘D — Complete**: recurring task → `api.recurring.toggleCompleteInstance(path, today)`; non-recurring → `api.tasks.complete(path)`.
   - **⌘1 / ⌘2 / ⌘3 — Snooze** to tomorrow / +1 week / next Monday: `api.tasks.setScheduled(path, date)`. Snooze sets only `scheduled`, never `due`.
   - **⌘T — Snooze to a free date**: prompt via `task-triage-date-modal.ts` — a native `<input type="date">` opened via `showPicker()` (the same control TaskNotes' own `DateTimePickerModal` uses) — then `setScheduled`. Cancelling the date modal re-presents the current stop. (Amended post-ship from a locale-parsed free-text field.)
   - **⌘X — Skip today's instance** (recurring tasks only): `api.recurring.toggleSkippedInstance(path, today)`.
   - **Enter — Open & stop**: open the task note in a new tab (`bridge.openInNewTab`) and end the walk, showing the summary Notice (Req 9) exactly as any other end-of-walk path.
   - **Esc — Skip**: leave the task untouched, advance.
   - **⌘. — Stop**: end the walk, showing the summary Notice.
8. Snooze actions (⌘1/⌘2/⌘3/⌘T) shall be hidden for recurring tasks; ⌘X shall be hidden for non-recurring tasks.
9. The walk shall end with a summary Notice on every exit path (natural completion, ⌘. Stop, Enter/open-and-stop), reporting: completed, snoozed, instances skipped, skipped, and remaining. `remaining` is defined as the total number of tasks in the ordered list minus `completed`, `snoozed`, `instancesSkipped`, and `skipped` — i.e. "visited" means "received a mutating action" (Complete/Snooze/⌘X), not merely "was the current stop." The task current when Enter (open & stop) fires received no mutating action, so it is counted in `remaining`, and the five buckets always sum to the total task count.
10. If TaskNotes is not installed, is installed but exposes no `.api`, exposes `.api` with `apiVersion !== 1`, or is missing a required capability, the command shall abort with an explanatory Notice naming which of these four conditions failed. Required capabilities (pinned against TaskNotes 4.11.1 — the real capability list is coarser than per-mutation): `"tasks.read"` (listing), `"tasks.write"` (complete + setScheduled), `"recurring.write"` (both instance toggles); the bridge checks each via `hasCapability(...)` in that order and availability fails on the first missing one, with the Notice naming the specific identifier. The runtime API exists since TaskNotes 4.10.0; older versions fail availability with `api-missing`.
11. If an API mutation fails, the walk shall show a Notice and remain on the current task (the user can retry or Esc-skip); it shall not silently advance.
12. A concurrent-walk guard shall reject starting the walk while one is already running (same pattern as email-filing).
13. If the walk matches zero tasks, the command shall show a "Keine fälligen Tasks" Notice and not open the modal.
14. Esc-as-skip shall be implemented using the same order-independent cancel-detection pattern already established in `src/shared/modals/section-note-suggest.ts` (Obsidian calls `onClose()` before `onChooseItem()`; a `chosen`/`acted` flag is checked in a deferred `setTimeout(…, 0)` before routing to skip). This is a fixed implementation requirement, not an open decision — the Phase 2 test scenarios asserting `Esc → skip, no mutation` depend on it.

## File & Module Structure

- `src/features/task-triage/tasknotes-bridge.ts` — `TaskNotesBridge` interface + `createTaskNotesBridge(app)`; the only file touching the TaskNotes API. Declares the local `TaskNotesApi` interface (see Data Models) and performs the single narrow cast at the plugin boundary.
- `src/features/task-triage/task-triage-engine.ts` — pure selection, ordering, snooze-date math, preview trimming (reusing `extractSection`, plus a private frontmatter-stripping helper not exported outside this file), overdue labels, project-link formatting.
- `src/features/task-triage/task-triage-date-modal.ts` — feature-specific date-only modal for ⌘T (single date field, no text field; reuses `formatDate`/`dateFormatHint`/date parsing helpers from `src/shared/date-format.ts`; its own date-only validation is implemented inline in this file, not added to `src/shared/modal-validation.ts` — `modal-validation.ts`'s `validateTextAndDate` requires a non-empty text field and has no date-only path, and this modal is the only caller, so a shared export would be speculative).
- `src/features/task-triage/task-triage-modal.ts` — walk modal; shortcuts registered via `scope.register` in `onOpen` (pattern: `section-note-suggest.ts`); implements the Esc-as-skip deferred-flag pattern (Req 14).
- `src/features/task-triage/task-triage-feature.ts` — `LuKitFeature` implementation, command registration, walk loop, summary Notice.
- `src/main.ts` — register the feature (modified).
- `tests/sdd_tasknotes-triage-walk/` — one test file per SDD criterion (`p1_c1`–`p1_c23` engine/bridge, `p2_c1`–`p2_c13` command flow with a mocked bridge); `tests/unit/tasknotes-bridge-listing.test.ts` covers the indexed-listing fast path. (Amended post-ship: per-criterion organization from /sdd-implement instead of two consolidated files.)
- `README.md`, `CLAUDE.md` — updated in Phase 2 (new command, new feature section).
- No settings file: v1 has no configuration (fixed snooze presets, fixed order, `dateLocale` reused from main settings).

## Data Models

```ts
export interface TriageTask {
	path: string;
	title: string;
	isCompleted: boolean; // normalized by TaskNotes (statuses are user-configurable)
	due?: string; // YYYY-MM-DD
	scheduled?: string; // YYYY-MM-DD
	priority?: string;
	contexts: string[];
	projects: string[]; // raw wikilink strings, e.g. "[[Vorgang Name]]" or "[[Vorgang Name|Alias]]"
	isRecurring: boolean;
	completeInstances: string[]; // YYYY-MM-DD
	skippedInstances: string[]; // YYYY-MM-DD
}

export type BridgeAvailability =
	| { ok: true }
	| { ok: false; reason: "plugin-missing" | "api-missing" | "api-version-mismatch" }
	| { ok: false; reason: "capability-missing"; capability: string };

export interface TaskNotesBridge {
	availability(): BridgeAvailability;
	listTasks(): Promise<TriageTask[]>;
	complete(path: string): Promise<void>;
	setScheduled(path: string, date: string): Promise<void>;
	toggleCompleteInstance(path: string, date: string): Promise<void>;
	toggleSkippedInstance(path: string, date: string): Promise<void>;
	readNote(path: string): Promise<string>; // for the preview
	openInNewTab(path: string): Promise<void>;
}

export type SnoozeKind = "tomorrow" | "week" | "nextMonday";

export interface TriageSummary {
	completed: number;
	snoozed: number;
	instancesSkipped: number;
	skipped: number;
	remaining: number;
}
```

`tasknotes-bridge.ts` also declares a local, minimal `TaskNotesApi` interface covering only the surface LuKit calls — `apiVersion: number`, `hasCapability(id: string): boolean`, the task-listing method, `tasks.complete`/`tasks.setScheduled`, `recurring.toggleCompleteInstance`/`recurring.toggleSkippedInstance` — obtained via a single narrow `as unknown as TaskNotesApi` cast at the `app.plugins.getPlugin("tasknotes")` boundary (`app.plugins` is not in the public `obsidian.d.ts`; precedent: the local `RawMailMessageMeta`/`ThreadMessage` types in `mail-bridge.ts`). The exact listing method name and the raw TaskNotes `TaskInfo` field names consumed by the mapping into `TriageTask` are pinned at Phase 1 start by inspecting the installed TaskNotes API (see Phase 1 verification steps below); once pinned, add a corresponding minimal local `TaskInfo` type covering exactly the fields read.

`TriageTask` field mapping happens once in the bridge from TaskNotes' normalized task-info objects — the engine never sees raw frontmatter. `isCompleted` derivation (pinned): TaskNotes' `TaskInfo` has no boolean completed field; it is derived via `api.catalog.statuses(): StatusConfig[]` (the `isCompleted` flag of the config whose `value` matches the task's status; unknown status → false) — never by comparing against a hardcoded status string.

Listing (pinned, post-ship perf amendment): the official `api.tasks.list()` walks every markdown file in the vault and falls back to a disk read for each note without cached frontmatter (20–30 s on a large vault). `listTasks()` therefore probes TaskNotes' internal `cacheManager.getAllTaskPaths()` filter index (synchronous, metadataCache-backed) and fetches only those paths via `api.tasks.get(path)`, falling back to `list()` whenever the internal shape is absent or throws.

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| TaskNotes unavailable | plugin missing, plugin present with no `.api`, `apiVersion !== 1`, or a required capability missing | abort before modal | Notice naming which of the four reasons applied (missing capability Notices name the specific capability identifier) |
| Empty walk | zero tasks match | no modal | Notice "Keine fälligen Tasks" |
| Mutation fails | API call rejects | stay on current task | Notice; console logs error type only |
| Preview unreadable | vault read fails (`readNote` rejects) | header/actions still render; preview area shows placeholder instead of throwing | placeholder text in preview area |
| Re-entry | command invoked while walk active | reject | Notice |

## Phase 1 — Bridge & Engine

Implement `tasknotes-bridge.ts` (the local `TaskNotesApi` interface, `TaskNotesBridge` interface, and `createTaskNotesBridge` with availability gating distinguishing `plugin-missing` / `api-missing` / `api-version-mismatch` / `capability-missing` — the last carrying the failing capability's identifier string) and the pure engine: `selectTriageTasks`, `snoozeDate`, `buildTriagePreview` (reusing `extractSection` from `besprechung-engine.ts` plus a private frontmatter-stripping helper), `overdueLabel` (due/scheduled precedence per Req 5, `de`/`en`/`iso` wording), `formatProjectLink` (alias-first, non-wikilink fallback — distinct from `note-structure.ts`'s `extractWikilinkTarget`). Full unit-test coverage of the engine.

Verification steps at Phase 1 start (against the installed TaskNotes API, before writing the bridge's mutation/listing calls):
- Determine the cheapest listing call that returns all tasks with normalized fields (e.g. `api.tasks.list()` vs `api.query.tasks({})`) and use it in `listTasks`.
- Pin the exact `hasCapability(...)` identifier strings for complete / recurring-completion-toggle / recurring-skip-toggle / setScheduled.
- Determine whether the installed `TaskInfo`-equivalent type exposes a boolean completed-equivalent field; if not, use `api.query.filterOptions()`'s completed-status group membership for `isCompleted`.

These are bridge-internal verifications with no impact on engine behavior or on Req 10's four-reason contract; they do not block writing the pure engine, which can be implemented and tested against the `TriageTask`/`TaskNotesBridge` interfaces independently.

The bridge-availability unit test constructs its own minimal inline `app` stub (e.g. `{ plugins: { getPlugin: () => ... } }` returning missing-plugin / no-`.api` / wrong-`apiVersion` / missing-capability shapes); `tests/helpers/obsidian-mocks.ts`'s `createMockApp` is not extended for this.

Phase complete when: `npm run test` passes with new unit tests covering all filter/sort/snooze/preview/overdue/project-link/availability branches; `npm run build` clean.

### Test Scenarios

- GIVEN a task with `due` yesterday and a non-completed status, WHEN `selectTriageTasks` runs for today, THEN the task is included in the result.
- GIVEN a task with `scheduled` = today and `due` next week, WHEN `selectTriageTasks` runs, THEN the task is included (OR semantics across due/scheduled).
- GIVEN a task with both `due` and `scheduled` in the future, WHEN `selectTriageTasks` runs, THEN the task is excluded.
- GIVEN a completed non-recurring task with `due` yesterday, WHEN `selectTriageTasks` runs, THEN the task is excluded.
- GIVEN a recurring task scheduled today with today present in `completeInstances`, WHEN `selectTriageTasks` runs, THEN the task is excluded.
- GIVEN a recurring task scheduled today with today present in `skippedInstances`, WHEN `selectTriageTasks` runs, THEN the task is excluded.
- GIVEN a recurring task scheduled today with empty `completeInstances`/`skippedInstances` and a completed-looking status, WHEN `selectTriageTasks` runs, THEN the task is still included (recurring effective-status overrides raw status).
- GIVEN a set of tasks with mixed `scheduled`/`due` values including tasks missing one or both dates, WHEN `selectTriageTasks` runs, THEN the output is ordered by `scheduled` ascending then `due` ascending, with dateless values sorted last within each key.
- GIVEN today is a Wednesday, WHEN `snoozeDate("tomorrow"|"week"|"nextMonday", today)` is called for each kind, THEN it returns today+1d, today+7d, and the following Monday respectively.
- GIVEN today is itself a Monday, WHEN `snoozeDate("nextMonday", today)` is called, THEN it returns the Monday one week ahead (not today).
- GIVEN note content containing `# Fakten und Pointer` and three h5 sections, WHEN `buildTriagePreview` runs, THEN the returned string contains the Fakten section content (via `extractSection`) and only the topmost (newest) h5 section, excluding the other two.
- GIVEN note content without a `# Fakten und Pointer` heading, WHEN `buildTriagePreview` runs, THEN the full original body is returned unmodified.
- GIVEN note content with a leading `---...---` frontmatter block (Vorgang or non-Vorgang branch), WHEN `buildTriagePreview` runs, THEN the frontmatter block is stripped from the returned preview.
- GIVEN a task with `due` 3 days before today and `dateLocale = "de"`, WHEN `overdueLabel` runs, THEN it returns a string containing "3d überfällig".
- GIVEN a task with `due` 3 days before today and `dateLocale = "en"` or `"iso"`, WHEN `overdueLabel` runs, THEN it returns a string containing "3d overdue".
- GIVEN a task with `due` today (not overdue), WHEN `overdueLabel` runs, THEN it returns no overdue indicator (empty string).
- GIVEN a task with `scheduled` 2 days overdue and `due` in the future, WHEN `overdueLabel` runs, THEN it uses `scheduled` (since `due` doesn't qualify) and reports the overdue indicator based on `scheduled`.
- GIVEN a task with `due` overdue and `scheduled` also overdue, WHEN `overdueLabel` runs, THEN `due` takes precedence.
- GIVEN a raw project string `"[[Vorgang Name|Alias]]"`, WHEN `formatProjectLink` runs, THEN it returns `"Alias"`; GIVEN `"[[Vorgang Name]]"` with no alias, THEN it returns `"Vorgang Name"`; GIVEN a raw string that doesn't match the `[[...]]` pattern, THEN it returns the string unmodified.
- GIVEN the TaskNotes plugin is not installed, WHEN `createTaskNotesBridge(app).availability()` is called, THEN it returns `{ ok: false, reason: "plugin-missing" }`.
- GIVEN the TaskNotes plugin is installed but exposes no `.api`, WHEN `availability()` is called, THEN it returns `{ ok: false, reason: "api-missing" }`.
- GIVEN TaskNotes is installed with `apiVersion !== 1`, WHEN `availability()` is called, THEN it returns `{ ok: false, reason: "api-version-mismatch" }`.
- GIVEN TaskNotes is installed at `apiVersion === 1` but a required capability check fails, WHEN `availability()` is called, THEN it returns `{ ok: false, reason: "capability-missing", capability: <the failing identifier> }`.

## Phase 2 — Walk Modal & Command

Implement `task-triage-date-modal.ts`, `task-triage-modal.ts`, and `task-triage-feature.ts`: command registration, walk loop over the engine's selection, all actions of Req 7–8 via the bridge, the Esc-as-skip deferred-flag pattern (Req 14), hint bar (`setInstructions`), summary Notice on every exit path (Req 9's `remaining` semantics), concurrent-walk guard, feature registration in `main.ts`. Update `README.md` (new command) and `CLAUDE.md` (feature section). `TaskNotesBridge` test doubles follow the `fakeBridge()` interface-mocking pattern from `tests/acceptance/email-filing-feature.test.ts` (not `mail-bridge.test.ts`'s `vi.hoisted`/`execFile` subprocess mocking, which doesn't apply here).

Phase complete when: acceptance tests with a mocked bridge cover every action path and abort path; `npm run test` and `npm run build` pass; README/CLAUDE.md updated.

### Test Scenarios

- GIVEN TaskNotes is unavailable (per `availability()`), WHEN the `task-triage-walk` command runs, THEN a Notice naming the reason appears and no modal opens.
- GIVEN `selectTriageTasks` returns zero tasks, WHEN the command runs, THEN a "Keine fälligen Tasks" Notice appears and no modal opens.
- GIVEN a non-recurring due task is the current stop, WHEN ⌘D is pressed, THEN `bridge.complete(path)` is called exactly once, `bridge.toggleCompleteInstance` is not called, and the walk advances to the next task.
- GIVEN a recurring due task is the current stop, WHEN ⌘D is pressed, THEN `bridge.toggleCompleteInstance(path, today)` is called exactly once and `bridge.complete` is not called.
- GIVEN a non-recurring task is the current stop, WHEN ⌘2 is pressed, THEN `bridge.setScheduled(path, today+7d)` is called and no call touches `due`.
- GIVEN a recurring task is the current stop, WHEN the modal renders, THEN the snooze shortcuts (⌘1/⌘2/⌘3/⌘T) are absent from the hint bar and ⌘X is present; GIVEN a non-recurring task, THEN the inverse holds.
- GIVEN a recurring task is the current stop, WHEN ⌘X is pressed, THEN `bridge.toggleSkippedInstance(path, today)` is called and the walk advances.
- GIVEN any current stop, WHEN Enter is pressed, THEN `bridge.openInNewTab(path)` is called exactly once, no further stop is rendered, and the summary Notice is shown with `remaining` counting the opened task (not double-counted, not omitted from all five buckets).
- GIVEN any current stop, WHEN Esc is pressed, THEN no bridge mutation method (`complete`/`setScheduled`/`toggleCompleteInstance`/`toggleSkippedInstance`) is called and the walk advances to the next task.
- GIVEN a current stop, WHEN a bridge mutation call rejects (e.g. `complete` throws), THEN a Notice appears, the walk does not advance, and the same task remains the current stop.
- GIVEN a walk that produces 2 completed, 1 snoozed, 1 instance-skipped, and 1 skipped task with N total tasks, WHEN the walk ends via natural completion, ⌘., or Enter, THEN the summary Notice reports exactly those four counts plus a `remaining` value such that all five sum to N.
- GIVEN a walk is already running, WHEN the `task-triage-walk` command is invoked again, THEN it is rejected with a Notice, no second modal opens, and the original walk's state is unchanged.
- GIVEN a note whose content fails to load (`readNote` rejects), WHEN the stop for that task renders, THEN the header/actions still render and the preview area shows a placeholder instead of throwing.

## Post-Ship Amendments (2026-07-02)

Applied after both phases shipped and were smoke-tested, driven by user feedback; the implementation is the reference:

- Command renamed to "Vorgang: Triage due tasks" (project `<Feature>: <Action>` convention).
- Vorgang preview shows the newest **three** h5 sections (was: one) so the walk reveals recent activity and next steps; markdown-rendered via `MarkdownRenderer` with a per-modal `Component`.
- Walk modal sized like the email preview (85vh × min(90vw, 1200px)); metadata collapsed to one muted line with a position counter; hint bar is a manual `.prompt-instructions` element (plain `Modal` has no `setInstructions`).
- ⌘T uses a native `<input type="date">` + `showPicker()`; cancel re-presents the current stop (fixes a review-found walk-stranding blocker).
- Listing uses TaskNotes' internal path index with official-API fallback (see Data Models); the modal opens before the first preview loads ("Lade Vorschau…" placeholder, async `setPreview`).
- Capability identifiers pinned to the real, coarser TaskNotes list: `tasks.read` / `tasks.write` / `recurring.write`; runtime API requires TaskNotes ≥ 4.10.0.

## Decision Log

- **TaskNotes runtime API for query AND mutation** — chosen over (a) LuKit reading/writing frontmatter directly: wrong under FieldMapper remapping and user-configurable statuses, and recurring semantics (advance `scheduled`, `recurrence_anchor`/DTSTART handling) are TaskNotes-internal; (b) parsing/evaluating the `.base` file: the filter strings are a full expression language — reimplementing the private Bases engine, which had breaking changes during 1.9.x beta; there is no headless "run this base" API (`QueryController` is empty in the public `obsidian.d.ts`, feature request unanswered); (c) `registerBasesView` (Obsidian ≥ 1.10.1): officially supported and reuses the actual view filters, but the walk would have to start from an opened base and requires view infrastructure — kept as a possible v2 if "walk over arbitrary base views" is ever wanted.
- **Client-side filtering over `api.query.tasks` server-side query** — the query contract's support for OR-date conditions is unverified; a pure `selectTriageTasks` is unit-testable without TaskNotes and trivially fast at this task volume. Accepted drift: if the user edits the "Until today" view in the `.base` file, the walk does not follow — the condition is treated as a stable mental model, not an implementation detail to sync with.
- **Walk scope = all TaskNotes (variant b)** — not just Vorgang-tagged tasknotes (variant a), and not Vorgänge grouped with their linked tasks (variant c, rejected as YAGNI). Vorgänge appear naturally because they carry tasknote frontmatter themselves.
- **Skip-instance (⌘X) included, recurring-only** — snooze is the wrong tool for recurring tasks (manual `scheduled` edits fight the RRULE; TaskNotes recomputes it on completion). Without ⌘X the only options for "not today" on a recurring instance are lying with Complete or re-seeing it tomorrow. Conversely, snooze is hidden for recurring tasks.
- **Skipped-today instances excluded from selection (Req 3)** — the Bases view checks only `complete_instances`, but without this the task would reappear on a same-day re-run right after ⌘X. Deliberate, minor deviation from the view.
- **Walk modal, not a dashboard modal** — the Bases view already is the dashboard; the walk's value is one forced decision per item. Preview visible by default (unlike email-filing's ⌘P toggle) because fast visual review is the primary pain point.
- **No settings in v1** — snooze presets, order, and preview trimming are fixed; `dateLocale` is reused. No speculative configuration (YAGNI).
- **No PRD** — single-user workflow tool; acceptance criteria live in this SDD's test scenarios.
- **`buildTriagePreview` reuses `extractSection` from `besprechung-engine.ts`** rather than re-implementing heading-bounded extraction a third time — same heading-parsing need (bounded by next same-or-higher-level heading), already pure and tested. The frontmatter-stripping helper it also needs is genuinely new (no existing text-level utility) and stays private to `task-triage-engine.ts` rather than being promoted to `src/shared/` — single caller, YAGNI.
- **Feature-specific date-only modal (`task-triage-date-modal.ts`) instead of extending `TextDateModal`** — `TextDateModal`'s validation (`validateTextAndDate`) requires a non-empty text field, which ⌘T's date-only prompt doesn't have; adding a date-only mode flag to the shared modal for a single caller would be speculative configuration (YAGNI). Its date-only validation is implemented inline in the feature file rather than as a new `src/shared/modal-validation.ts` export, for the same single-caller reason. A small feature-specific modal follows the existing precedent of feature-specific modals (e.g. `add-section-modal.ts` for vorgang).
- **Esc-as-skip resolved as a fixed implementation requirement (Req 14), not left as a live open decision** — the Phase 2 test scenarios already lock `Esc → skip, no mutation` as behavior; the codebase already has a proven solution to exactly this class of problem (`section-note-suggest.ts`'s deferred-`setTimeout` cancel detection), so there is no genuine uncertainty left to defer.
- **Overdue-label precedence: `due` before `scheduled`** — since Req 2's selection is due-OR-scheduled, a task can qualify on one field only; `due` is the more commonly user-facing deadline field, so it wins when both are present and overdue.
- **Overdue-label wording for `en`/`iso`: `"{n}d overdue"`** — mirrors the `de` `"{n}d überfällig"` format with the same one shared string across `en` and `iso` (no separate ISO-specific wording), consistent with the fixed, non-configurable, minimal-surface approach taken for the rest of v1's display strings.
- **`BridgeAvailability` distinguishes four reasons, `capability-missing` carries the failing identifier** — Req 10 names four failure conditions (not installed / installed with no `.api` / `apiVersion` mismatch / missing capability); the type and Notice text are aligned to expose all four, and `capability-missing` carries the specific capability string so the abort Notice can name it, rather than reporting an undifferentiated "a capability is missing."
- **`remaining` = total − (completed + snoozed + instancesSkipped + skipped)** — "visited" is redefined as "received a mutating action," not "was rendered as the current stop," so the Enter/open-and-stop task (which received no mutating action) is counted in `remaining` and the five buckets always sum to the total walk size.
- **Project display: strip wikilink syntax, prefer alias, non-interactive text, non-wikilink fallback returns the string unmodified** — matches the read-only-header precedent already established in email-filing's `EmailPreviewModal` for exactly this "show a reference without letting it be misclicked into an edit" problem; the fallback avoids throwing or dropping the value if TaskNotes ever returns a non-wikilink project reference. `formatProjectLink` is a new function distinct from `note-structure.ts`'s `extractWikilinkTarget`, which discards the alias — reusing that function here would silently drop the alias-preference requirement.
- **Priority and project-link rendering are manual-verification-only** — both are pure display of existing `TriageTask` fields with no engine transform beyond `formatProjectLink` (which does have a test); testing that they appear in the DOM would duplicate modal-rendering plumbing tests already implicit in the acceptance suite's other assertions, for no engine-logic benefit.
- **`TaskNotesApi` local interface with a single narrow cast at the plugin boundary** — `app.plugins` is not part of the public `obsidian.d.ts`, and the project's "no `any`" rule requires a precise local type rather than an untyped or `any`-typed access, matching the `RawMailMessageMeta`/`ThreadMessage` precedent in `mail-bridge.ts`.
- **Test doubles**: the bridge-availability unit test builds its own minimal inline `app` stub rather than extending `tests/helpers/obsidian-mocks.ts`'s `createMockApp` (that helper is shared across features and this shape is task-triage-specific); Phase 2's `TaskNotesBridge` test doubles follow the `fakeBridge()` interface-mocking pattern already used in `tests/acceptance/email-filing-feature.test.ts`, not the subprocess-oriented `vi.hoisted`/`execFile` mocking in `mail-bridge.test.ts`.

## Open Decisions

None. The two items carried from the original draft (exact bridge listing call and capability identifier strings; `isCompleted` derivation path) are technical verifications against the installed TaskNotes API, not business choices — they are documented as verification steps at the start of Phase 1 above, not as open decisions. All other ambiguities raised by review findings were resolved concretely in the Requirements, Data Models, and Decision Log sections above.

## Out of Scope

- Registering a LuKit Bases view type / walking arbitrary `.base` views (possible v2).
- Editing `due` dates, priorities, statuses beyond complete, or task bodies in the walk — the TaskNotes edit modal remains the tool for that.
- Creating tasks, time tracking, pomodoro, or any other TaskNotes surface.
- Grouping the walk by Vorgang or showing a Vorgang's linked open tasks per stop (rejected variant c).
- TaskNotes HTTP API / webhooks — in-process runtime API only.
- CLI support for the walk (Obsidian-only feature).
- Configurable snooze presets or walk order.
