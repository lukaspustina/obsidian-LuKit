# SDD Implementation Report: tasknotes-triage-walk.md

**Date**: 2026-07-02
**Phases run**: 1, 2
**Overall status**: all-shipped
**SDD amendments suggested**: 5

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 1 | Bridge & Engine | shipped | ab8f672 |
| 2 | Walk Modal & Command | shipped | 0cf6c20 |

## SDD Amendments Needed

Advisory — both phases are committed; apply these to the SDD if it should reflect the shipped reality before archiving.

1. **Req 10 / Phase 1 — capability identifiers**: The SDD assumed "one capability per bridge mutation" (four identifiers). The real TaskNotes runtime API (apiVersion 1) is coarser: `tasks.read` (listing), `tasks.write` (complete + setScheduled), `recurring.write` (both instance toggles). The implementation checks these three, in that order.
2. **Data Models — `isCompleted` derivation**: The SDD's fallback referenced `api.query.filterOptions()`; the direct path is `api.catalog.statuses(): StatusConfig[]` (match `value === task.status` → `isCompleted`). Implemented via `catalog.statuses()`.
3. **Context & Constraints — minimum TaskNotes version**: The runtime API exists only since **TaskNotes 4.10.0** (released 2026-06-01). The vault had 4.5.1 at build time, where `availability()` correctly returns `api-missing`. Pin "requires TaskNotes ≥ 4.10.0" in the SDD.
4. **Req 1 — command name**: Shipped as `"Triage: Walk due tasks"` (not `"Triage due tasks"`) to match the project-wide `<Feature>: <Action>` command-naming convention (Besprechung:/E-Mail:/Migration:/Diary:).
5. **Phase 2 — hint bar**: Plain `Modal` has no `setInstructions` (only `SuggestModal` does). The modal renders an equivalent `.prompt-instructions` bar via `createEl`.

Next: review amendments above, `/sdd-refine specs/sdd/tasknotes-triage-walk.md` — or, since both phases shipped, edit the SDD directly and proceed to `/sdd-verify`.

## Phase 1: Bridge & Engine

**Status**: shipped
**Commit**: ab8f672

### Acceptance Criteria
23 criteria, one test file each in `tests/sdd_tasknotes-triage-walk/` (`p1_c1`–`p1_c23`): selection semantics c1–c8 (Group 0), snooze math c9–c10, preview c11–c13, overdue labels c14–c18, project links c19 (all Group 0 → `task-triage-engine.ts`); availability gating c20–c23 (Group 1 → `tasknotes-bridge.ts`). All passing.

### Reviewer Findings
**Blockers**: none.
**SDD Amendments**: 1–3 above.
**Nits**: redundant `.slice()` after `.filter()` in the engine sort (harmless).

### Notes
- API verification performed against the installed TaskNotes bundle (4.5.1 — no runtime API) and the 4.11.1 tag sources: listing = `api.tasks.list()`, capability strings and `catalog.statuses()` pinned as above.
- Coder loop: 2 iterations (both Sonnet), zero stuck tests.

## Phase 2: Walk Modal & Command

**Status**: shipped
**Commit**: 0cf6c20

### Acceptance Criteria
13 criteria (`p2_c1`–`p2_c13`): availability/empty-walk aborts, complete (non-recurring/recurring), snooze (+1 week and custom date), conditional actions, skip-instance, open & stop with `remaining` semantics, skip without mutation, mutation-failure stay-on-task, summary bucket sums, re-entry guard, preview placeholder. All passing. Acceptance tests drive the feature headlessly via a pinned internals contract (`presentStop` stubbed); bridge doubles follow the `fakeBridge()` pattern.

### Reviewer Findings
**Blockers (resolved during the run)**: cancelling the ⌘T date modal originally stranded the walk (`walkActive` stuck true, no modal open, re-entry guard blocking restart). Fixed before commit: `TaskTriageDateModal` gained an `onCancel` callback (deferred `submitted`-flag check in `onClose`), and the feature re-presents the current stop on cancel. Reviewer re-verified: resolved, no double-present on the submit path.
**SDD Amendments**: 4–5 above.
**Deferred**: live smoke test against TaskNotes ≥ 4.10.0 (see Manual Test Plan).
**Nits**: `parseIsoDate` assumes pure `YYYY-MM-DD` (safe per data model); preview panel uses inline styles (matches `section-note-suggest.ts` precedent).

### Notes
- One test fixture corrected by the orchestrator (`p2_c10`: due dates were inverted relative to SDD Req 4's sort order; criterion semantics unchanged).
- Coder loop: 1 iteration (Sonnet), zero stuck tests.

## Manual Test Plan

Prerequisite: **update TaskNotes to ≥ 4.10.0** (current: 4.11.1). With the vault's 4.5.1, step 1 correctly aborts with "TaskNotes-API nicht verfügbar."

1. Run "Triage: Walk due tasks" with old TaskNotes (4.5.1) — expected: Notice "TaskNotes-API nicht verfügbar.", no modal.
2. Update TaskNotes, reload Obsidian, run the command — expected: modal with the first task (scheduled ASC, due ASC), header showing title, dates, overdue indicator (e.g. "3d überfällig"), priority, recurring badge, contexts, project names; preview visible underneath (Vorgang notes trimmed to `# Fakten und Pointer` + newest section).
3. ⌘D on a non-recurring task — expected: TaskNotes marks it done (status + completedDate in frontmatter), walk advances.
4. ⌘D on a recurring task — expected: today lands in `complete_instances`, `scheduled` advances to the next occurrence, walk advances.
5. ⌘1/⌘2/⌘3 on a non-recurring task — expected: `scheduled` set to tomorrow / +1 week / next Monday, `due` untouched.
6. ⌘T, enter a date, submit — expected: `scheduled` set to that date. ⌘T then **Cancel/Esc** — expected: the walk modal for the same task reopens (regression check for the resolved blocker).
7. On a recurring task — expected: hint bar shows ⌘X but no snooze keys; ⌘X puts today into `skipped_instances` and advances. On a non-recurring task the inverse.
8. Esc — expected: task untouched, walk advances. Click outside the modal — same as Esc.
9. Enter — expected: task note opens in a new tab, walk ends, summary Notice shows the opened task under "offen".
10. ⌘. — expected: walk ends with the summary Notice (`Triage beendet: … erledigt, … verschoben, … ausgelassen, … übersprungen, … offen`; the five numbers sum to the walk size).
11. Run the command twice quickly — expected: second invocation rejected with "Triage läuft bereits."
12. With no due/scheduled-until-today tasks — expected: Notice "Keine fälligen Tasks".

## How to Resume Blocked Phases

None — both phases shipped.
