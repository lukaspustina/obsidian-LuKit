# SDD: One Triage Stop per Note

Status: Ready for Implementation
Original: specs/sdd/triage-note-stops.md
Refined: 2026-09-08

## Overview

The triage walk currently makes a stop out of *a due intake group* and, separately, out of *a due TaskNote*. A Vorgang is both, so the same note is presented twice in one walk, and the key bar changes shape between the two stops — and again inside an intake stop once its group has been worked off. This SDD merges both into a single stop per note: the note is the object, its due intake groups are its content, and each key is offered based on what the stop actually carries.

## Context & Constraints

- TypeScript strict, no `any`, explicit return types on exports. Engine files stay free of Obsidian imports (`src/features/task-triage/task-triage-engine.ts`, `src/features/vorgang/intake-engine.ts`).
- German UI strings, English code and artifacts (this SDD included).
- LuKit never reads or writes task frontmatter itself — every task mutation goes through `tasknotes-bridge.ts`. Intake mutations go through the pure `intake-engine.ts` functions (`takeOverGroup`/`dropGroup`/`snoozeGroup`), each returning `{ newContent } | null`.
- This changes behaviour defined by two archived SDDs — `specs/done/sdd/tasknotes-triage-walk-2026-07-02.md` (task stops, the five-bucket summary) and `specs/done/sdd/vorgang-next-steps-2026-09-02.md` (intake stops, ⌘S, `groupDone`). Neither is the single base of a delta, so this is a flat SDD that supersedes named criteria of both; the affected tests carry a note pointing here.
- Measured on the maintainer's vault at the time of writing: 116 due TaskNotes, 21 due intake groups across 14 notes, of which 11 are TaskNotes and 7 are themselves due today — those 7 are the notes presented twice.
- Current code for reference: `src/features/task-triage/task-triage-engine.ts` (`TriageStop`, `TriageTask`, `IntakeStopCandidate`, `selectTriageTasks`, `selectDueIntakeGroups`, `overdueLabel`), `src/features/vorgang/intake-engine.ts` (`IntakeGroup` — has both `line`, the full parent bullet text, and `lineIndex`, its position — and `IntakeTakeOver` — `{ taken, keptOwn, keptForeign }`, all `IntakeItem[]`), `src/features/task-triage/task-triage-feature.ts` (`TaskTriageFeature`, `takenOverStops`, `counts`, `finishWalk`), `src/features/task-triage/task-triage-modal.ts` (`TaskTriageModal`), `src/features/task-triage/intake-select-modal.ts` (`IntakeSelectModal`), `src/features/task-triage/note-date-modal.ts` (`NoteDateModal`, `NoteDates`).

## Architecture

```
beginWalk
 ├─ loadDueReminders ──────────────► reminder stops (unchanged)
 ├─ bridge.listTasks ─► selectTriageTasks ─┐
 └─ vault scan ─► parseIntakeGroups ─►     ├─► selectNoteStops ─► note stops
                  selectDueIntakeGroups ───┘        (pure, one per note)
```

`selectNoteStops(tasks, candidates, today)` is the new join point: it groups the due tasks (from `selectTriageTasks`) and the due intake candidates (from `selectDueIntakeGroups`, still keyed by `IntakeStopCandidate.notePath`) by note path, emits one `NoteStop` each, and orders them per Requirement 3. It is pure and lives in `task-triage-engine.ts` next to the two selectors it consumes, both of which stay as they are and keep their tests.

## Requirements

1. The walk shall present at most one stop per note. A note qualifies when TaskNotes reports it as due (per `selectTriageTasks`), when it carries at least one due intake group (per `selectDueIntakeGroups`), or both. A note's task need not itself be due for the note to qualify — a note whose only due content is an intake group still gets a stop, and that stop still carries the note's task (if TaskNotes knows one) even though the task itself is not due; ⌘D/⌘1–⌘T/⌘X act on it exactly as at any other note stop.
2. A note stop shall carry the note's task (absent for a note TaskNotes does not know, e.g. a Person note) and all of that note's due intake groups in file order.
3. Note stops shall be ordered by the note's own `scheduled`, then its `due`, dateless last. "Dateless" here means the note carries no task at all, or carries one whose `scheduled` and `due` are both absent — either way, such a note falls back to ordering by the earliest due date among its groups, dateless last. Remaining ties break by note path. Reminder stops shall keep their place ahead of all note stops.
4. The key bar at a note stop shall always offer Enter (open & stop), Esc (skip) and ⌘. (stop the walk). It shall additionally offer, each gated on its own condition: ⌘D, ⌘1/⌘2/⌘3/⌘T and ⌘G only while the stop carries a task (Requirements 5, 6, 8); ⌘X only while the stop carries a task and that task is recurring (Requirement 7); ⌘S only while the stop has at least one group (Requirements 9, 13).
5. ⌘D shall complete the note's task — `toggleCompleteInstance(today)` when recurring, `complete` otherwise. It shall not be offered for a note without a task.
6. ⌘1/⌘2/⌘3/⌘T shall set the note's `scheduled` date via the bridge. They shall not be offered for a note without a task.
7. ⌘X shall toggle today's skipped instance of the note's recurring task. It shall not be offered for a note without a task, or whose task is not recurring.
8. ⌘G shall set the note's `Fällig` and `Geplant` dates via `NoteDateModal`, write only what changed, treat an emptied field as a clear, and return to the stop. It shall not be offered for a note without a task.
9. ⌘S shall open the item selection over **all** groups of the stop at once, one section per group, headed by the group's `line` (its full parent-bullet text, e.g. `- Aus [[Besprechung Acme Kickoff]]`).
10. Confirming the selection shall, per group: move ticked lines — using each line's edited text, falling back to the line's original text when the edit is emptied (the existing selection dialog's convention: the checkbox, not the text field, is how a line is dropped) — into the curated part of `# Nächste Schritte`; keep unticked lines in the group, with their (possibly edited) text; and remove a group that keeps nothing (no line kept and the group not discarded).
11. The selection shall offer, per group, a control that discards the whole group — every line dropped, nothing moved, regardless of any per-line ticks or edits in that group's section.
12. The selection shall offer, per group, a date field that writes the group's own due date onto its `- Aus …` parent line via `snoozeGroup`, so a single block can be deferred while its siblings are sorted. The field is the same native `<input type="date">` control already used by `note-date-modal.ts:48` and `task-triage-date-modal.ts:36` (the control TaskNotes' own picker uses), feeding `parseDateString`/`formatDate` from `src/shared/date-format.ts` — not a free text field. Leaving the field blank makes no change to the group's existing due date — there is no control to clear a group's date back to due-now; that is out of scope for this SDD (see Decision Log).
13. Confirming shall apply the groups' mutations in the stop's group order, threading each group's resulting content into the next (a discard, a date-set, and a take-over/partial-take-over on the same note are all one edit to the same in-memory content); the whole batch shall be committed as a single note write. Within one group's own outcome, a take-over (full or partial) and a date-set compose as at most two engine calls, in the order `takeOverGroup` then `snoozeGroup`; `snoozeGroup` is skipped entirely for that group when its outcome removes the group in full (nothing kept — the same case as discard) rather than being invoked and treated as a missing-parent-line failure. Each mutation re-resolves its group through `findParentIndex` (`intake-engine.ts:181-198`), which trusts `group.lineIndex` first and falls back to content-matching when it has gone stale — this is what lets a later group's call, or a group's own second call, survive an earlier mutation's line-shift. If any group's mutation reports its parent line no longer present, the batch shall abort without writing anything, and the walk shall report a mutation failure (Requirement 17) and stay on the stop; implementation follows the existing `mutateReminder`/`mutateIntake` idiom (`task-triage-feature.ts:391-430`): thread a local `working` string through each mutation inside one `vault.process` callback, return the original `content` unchanged when any mutation returns `null`, and throw after the callback into the existing `onMutationError` path.
14. ⌘S shall return to the same stop, refreshed from disk: the note is re-read and its due groups recomputed with the same due-ness filter `selectDueIntakeGroups` uses, so `groups` on the stop reflects what is due right now. A group that left the note (taken over in full or discarded) disappears from the stop because it is no longer in the note; a group whose date moved into the future by this same confirm disappears from the stop because it is no longer due — in both cases the group is absent from `groups`, and the stop does not end.
15. A stop is counted exactly once, in the bucket of the action that closes it: ⌘D → erledigt, ⌘1/⌘2/⌘3/⌘T → verschoben, ⌘X → ausgelassen. A stop closed via Esc, or left unvisited when the walk ends (⌘. or the walk running out of stops), is counted as übernommen instead of übersprungen/offen when ⌘S moved at least one line out of one of its groups at any point during the visit — mirroring the existing `takenOverStops` mechanism, generalized to note stops; otherwise it is counted as übersprungen/offen as before. The summary always reports all six buckets — erledigt, verschoben, ausgelassen, übersprungen, übernommen, offen — including any that are zero, and their sum equals the number of stops.
16. Notes carrying `doneTag` shall be excluded from the walk, as today.
17. A mutation failure shall keep the walk on its stop and report a German Notice, as today.
18. A note stop without a task shall render its header without the task-derived segments (overdue label, Fällig, Geplant, Priorität, ↻, Kontexte, Projekte) and shall instead show the note's basename and its group count, alongside the walk position (`n/total`) that every stop already carries. The count follows the existing singular/plural convention (`vorgang-feature.ts:217`, `:333-334`): `<Basisname> · 1 Gruppe` for exactly one group, `<Basisname> · N Gruppen` otherwise.

## Data Models

```ts
// task-triage-engine.ts — replaces the "task" and "intake" members of TriageStop.

// One note that qualifies for a stop: it carries a task, at least one due
// group, or both.
export interface NoteStop {
	notePath: string;
	noteBasename: string;
	// Absent when TaskNotes does not know the note — a Person note carries
	// an intake but has no dates and no completion.
	task?: TriageTask;
	// The note's due groups in file order; empty once they are all worked
	// off or deferred past today, which withdraws ⌘S and nothing else.
	groups: IntakeGroup[];
}

export type TriageStop = { kind: "reminder"; reminder: ReminderItem } | ({ kind: "note" } & NoteStop);

// The join point: groups due tasks and due intake candidates by note path,
// emits one NoteStop per note, ordered per Requirement 3.
export function selectNoteStops(tasks: TriageTask[], candidates: IntakeStopCandidate[], today: string): NoteStop[];
```

```ts
// intake-select-modal.ts — the confirm payload, now one entry per group.
export interface IntakeGroupOutcome {
	// Identifies the group in the note — IntakeGroup's own identity field,
	// the same one takeOverGroup/dropGroup/snoozeGroup already resolve by
	// (falling back to item-content matching when it has gone stale). Not
	// the rendered line text: two groups filed the same day from sources
	// with the same generated section name produce byte-identical `line`s.
	lineIndex: number;
	// Discard wins over everything else in the group: taken/keptOwn/
	// keptForeign and due are all ignored when discard is true.
	discard: boolean;
	// A future date to write onto the group's parent line via snoozeGroup,
	// parsed from this ISO string to a Date via the existing parseIsoDate
	// before the call (mirrors handleIntakeNoteDate's conversion of
	// NoteDateModal's string-typed NoteDates). null: no change to the
	// group's existing due date (blank field).
	due: string | null;
	taken: IntakeItem[];
	keptOwn: IntakeItem[];
	keptForeign: IntakeItem[];
}

export interface IntakeSelectModalOptions {
	// One section per group, in the stop's group order.
	groups: IntakeGroup[];
	onConfirm: (outcomes: IntakeGroupOutcome[]) => void;
	onCancel: () => void;
}
```

## File & Module Structure

| Path | Change |
|---|---|
| `src/features/task-triage/task-triage-engine.ts` | `TriageStop`/`NoteStop` reshaped as above; new pure `selectNoteStops`; `overdueLabel` stays task-only (called only when `stop.task` is present); a new pure header-building helper for the taskless-note case backs Requirement 18 |
| `src/features/task-triage/task-triage-feature.ts` | walk assembly (`beginWalk`) joins `selectTriageTasks` and the intake candidates via `selectNoteStops` instead of building two stop arrays; `handleComplete`/`handleSnooze*`/`handleSkipInstance`/`handleIntakeNoteDate` re-target `stop.task`/`stop.notePath` on a `kind: "note"` stop; `handleIntakeSelect` passes `stop.groups` (all of them) to the modal and applies the returned `IntakeGroupOutcome[]` as one sequential, single-write batch (Requirement 13) via `takeOverGroup`/`dropGroup`/`snoozeGroup`, following the existing `mutateReminder`/`mutateIntake` idiom (`:391-430`): a local `working` string threaded through each call inside one `vault.process` callback, `content` returned unchanged and a throw into `onMutationError` on any `null`; each non-null `IntakeGroupOutcome.due` is parsed via the existing `parseIsoDate` before it reaches `snoozeGroup`, mirroring `handleIntakeNoteDate`'s conversion of `NoteDateModal`'s string-typed `NoteDates`; `refreshIntakeStop` recomputes `groups` via `selectDueIntakeGroups` over the freshly read note (Requirement 14); counting collapses `takenOver`/`discarded` bookkeeping into the six-bucket scheme of Requirement 15 (`takenOverStops` mechanism kept, now scoped to note stops); `finishWalk` always includes all six buckets |
| `src/features/task-triage/task-triage-modal.ts` | one header renderer and one key set for `kind: "note"` stops (replacing the separate task/intake renderers), gated per Requirement 4; taskless-note header per Requirement 18 |
| `src/features/task-triage/intake-select-modal.ts` | reshaped to multi-group: one section per group with its `line` as header, per-line checkboxes/text (unchanged mechanics), a discard control, and a date field using the same native `<input type="date">` control as `note-date-modal.ts:48`/`task-triage-date-modal.ts:36`, feeding `parseDateString`/`formatDate` (`src/shared/date-format.ts`); `onConfirm` returns `IntakeGroupOutcome[]` keyed by `lineIndex`; the existing headless harnesses carry over unchanged — `tests/acceptance/intake-select-modal.test.ts` (mount via `modal.onOpen()`, walk `contentEl.children`, fire clicks with `__fireEvent`) and `tests/acceptance/intake-stop-header.test.ts` (call `renderHeader()` directly, read text via `__allTexts`), both from `tests/helpers/obsidian-stub.ts` |
| `src/features/vorgang/intake-engine.ts` | unchanged — `takeOverGroup`/`dropGroup`/`snoozeGroup` are called per group by the feature, threaded through the same content string |
| `tests/unit/`, `tests/acceptance/`, `tests/sdd_tasknotes-triage-walk/`, `tests/sdd_vorgang-next-steps/` | 28 files reference `kind: "task"` or `kind: "intake"` today (confirmed by `grep -rl 'kind: "task"\|kind: "intake"' tests/ src/`); see Phase 1 |
| `tests/sdd_triage-note-stops/` | new — one file per criterion of this SDD, named `sdd_triage-note-stops_pN_cM_<short>.test.ts` |

## Implementation Phases

## Phase 1 — One Stop per Note

Merge the two stop kinds into `kind: "note"`, join them in `beginWalk` via the new `selectNoteStops`, re-target the keys onto the note, and make ⌘S open a multi-group selection (source header + per-line checkboxes/text + discard control per group; the date field is Phase 2). Reduce and fix the summary to the six-bucket scheme of Requirement 15, always shown in full.

Also in this phase: update the 28 existing test files that reference `kind: "task"` or `kind: "intake"` — each is either edited in place (where it exercises mechanics that are unchanged: `selectTriageTasks`, `selectDueIntakeGroups`, `takeOverGroup`/`dropGroup`/`snoozeGroup`, the reminder path) or replaced by a new criterion test under `tests/sdd_triage-note-stops/` (where it pins the now-superseded double-stop behaviour, e.g. the five/seven-bucket summary literal, the separate `kind: "task"`/`kind: "intake"` stop shapes, or `groupDone`). A test being replaced carries a comment pointing at the superseding `tests/sdd_triage-note-stops/` file; this SDD's own tests are what `npm run test` must pass by phase end.

Phase complete when: a walk over a note that is both a due TaskNote and holds two due intake groups presents exactly one stop; its key bar carries ⌘D/⌘1/⌘2/⌘3/⌘T/⌘G/⌘S/Enter/Esc/⌘. gated per Requirement 4, and drops ⌘S once the groups are gone; the summary always shows all six buckets; `IntakeGroupOutcome.due` is always `null` in this phase, since the date control ships in Phase 2; `npm run test` and `npm run build` pass.

### Test Scenarios

- GIVEN a note that TaskNotes reports due and that holds two due intake groups, WHEN `selectNoteStops` runs, THEN it returns exactly one `NoteStop` for that note carrying its task and both groups in file order.
- GIVEN a note with intake groups at two different line positions, WHEN its `NoteStop.groups` is built, THEN the array is ordered by ascending line position, not by group due date or discovery order.
- GIVEN a Person note with a due intake group and no task, WHEN its stop is presented, THEN the key bar offers ⌘S/Enter/Esc/⌘. and omits ⌘D/⌘1/⌘2/⌘3/⌘T/⌘G/⌘X.
- GIVEN a note stop without a task, WHEN its header renders, THEN it shows `<Basisname> · N Gruppen` (or `· 1 Gruppe` when there is exactly one) and the walk position, and omits overdue label/Fällig/Geplant/Priorität/↻/Kontexte/Projekte.
- GIVEN a due TaskNote with no intake group, WHEN its stop is presented, THEN ⌘S is absent and ⌘D/⌘1/⌘2/⌘3/⌘T/⌘G/Enter/Esc/⌘. are present (⌘X only if recurring).
- GIVEN a note stop whose task is recurring vs one whose task is not, WHEN the key bar renders, THEN ⌘X appears only for the recurring case.
- GIVEN two due notes, one with task `scheduled`/`due` and one with only group dates, WHEN stops are ordered, THEN the earlier-dated note precedes the later, and a fully dateless note sorts last; ties break by note path.
- GIVEN a note carrying `doneTag`, WHEN `selectNoteStops` runs, THEN no stop is produced for it even if it has a due task or due intake groups.
- GIVEN a note stop, WHEN ⌘D is pressed, THEN `complete`/`toggleCompleteInstance(today)` is called via the bridge, the walk advances, and the note's groups remain in the note unchanged.
- GIVEN a note stop with two groups, WHEN ⌘S confirms with only one group's lines fully ticked, THEN that group's lines move into the curated part and the group is removed from the note; the other group's lines and parent line are byte-identical; the walk returns to the same stop with `groups.length === 1`.
- GIVEN a note stop with one group, WHEN its section is marked discard and confirmed, THEN all its lines (own + foreign) are removed, none are moved into the curated part, and the stop remains open with `groups.length === 0`, at which point ⌘S is withdrawn.
- GIVEN a note stop whose only group is fully taken over via ⌘S, WHEN the stop refreshes, THEN `groups` is empty and ⌘S disappears from the key bar without the walk advancing.
- GIVEN a bridge mutation (⌘D, ⌘1/⌘2/⌘3/⌘T, ⌘G) fails, WHEN handled, THEN a German Notice is shown and the walk remains on the same stop.
- GIVEN a walk with five stops left via five different actions (including one left unvisited by ⌘.), WHEN the walk ends, THEN the buckets sum to five, with the unvisited stop counted as "offen".
- GIVEN a note stop where ⌘S moves at least one line out of a group, WHEN the stop is later left via Esc, THEN it is counted as übernommen, not übersprungen.
- GIVEN a note stop where ⌘S moves at least one line out of a group, WHEN the stop is later left via ⌘D (or a snooze, or ⌘X), THEN it is counted in that action's own bucket (erledigt/verschoben/ausgelassen), not übernommen.
- GIVEN a walk with zero stops in one or more buckets, WHEN it ends, THEN the summary Notice names all six buckets including the zero ones.

## Phase 2 — A Date per Block

Add the per-group date field to the selection dialog and wire it to `snoozeGroup`, so one block can be deferred while its siblings are sorted. Confirming a multi-group selection applies all groups' outcomes (discard, date, take-over) as the single sequential batch specified in Requirement 13.

Phase complete when: setting a date on one group's section and confirming rewrites that group's `- Aus …` parent line with the new date, leaves its lines in place, and the group no longer appears in a walk run before that date; `npm run test` and `npm run build` pass.

### Test Scenarios

- GIVEN a group section with a date set to next week and no lines ticked or discarded, WHEN confirmed, THEN `snoozeGroup` rewrites only the `- Aus …` parent line's trailing date; sub-bullets are byte-identical.
- GIVEN a group section with both a date set and some lines ticked, WHEN confirmed, THEN the ticked lines move into the curated part and the remaining (rewritten) group's parent line carries the new date.
- GIVEN a group section marked discard that also carries a date, WHEN confirmed, THEN the group and its lines are removed and no date is written anywhere.
- GIVEN a group section fully taken over (nothing kept) that also carries a date, WHEN confirmed, THEN only `takeOverGroup` runs for that group (the group is removed) and `snoozeGroup` is skipped — no missing-parent-line failure is reported and no date is written.
- GIVEN a group deferred to a future date via ⌘S, WHEN the stop refreshes immediately after (Requirement 14), THEN that group is absent from the current stop's `groups`, and the stop does not end.
- GIVEN a group deferred to a future date via ⌘S, WHEN a fresh walk is started afterward (new `selectNoteStops`/`selectDueIntakeGroups` pass over the mutated note), THEN that group is absent from every stop; a note whose only group was deferred yields a stop only if its task is independently due.
- GIVEN a note stop with two groups, one marked discard and one given a future date, WHEN confirmed, THEN both mutations land in a single note write, in the stop's group order, and the resulting content matches applying `dropGroup` then `snoozeGroup` (or the reverse group order, per the stop's own `groups` order) sequentially by hand.
- GIVEN a note stop with two groups, WHEN confirming causes the second group's mutation to report its parent line missing, THEN nothing from either group's mutation is written, a German Notice is shown, and the walk remains on the stop.

## Decision Log

| Decision | Alternatives rejected | Why |
|---|---|---|
| Stop = note | Keep stop = group and merely stop withdrawing the keys when the group is gone | The keys would still address a group that no longer exists; and the double stop for the 7 notes that are both due tasks and due intakes would remain. |
| Stop = note | Keep stop = group, but carry the note's next group into a worked-off stop (shipped 2026-09-07) | That fixes the successor problem inside one note but not the doubling against the task stop, and the key bar still changes shape. It is superseded by this SDD. |
| ⌘D = complete the task | ⌘D = "take over the whole group", as at today's intake stop | With the note as the object, "erledigt" is the only meaning that matches the other stop kinds. Taking a group over is ⌘S, its header's "alle" box, Enter. |
| ⌘S rows start unticked | Preselect every row, as the single-group dialog did | Amended 2026-09-08 after the correctness pass: with several groups in one dialog, a preselected confirm took over every line of every group, so a date typed on one group reached a group that had just been removed and was dropped silently. Unticked-by-default makes a confirm move only what was ticked; the section header's "alle" box keeps "take this whole group over" at one gesture. |
| ⌘X = skip today's instance | ⌘X = discard the group | ⌘X means two different things today, and merging the stops forces one. Discarding is per group, so it belongs in the per-group dialog (Requirement 11), not on a stop-level key. |
| Group date in the ⌘S dialog | Drop the per-group date entirely | Deferring one filed source while sorting another is a real case; without a control, the date in the `- Aus …` line would still filter the walk but could only be set by hand. |
| Group date field is set-only, no clear affordance | Add a third state mirroring `NoteDateModal`'s "emptied field clears" | No requirement in either archived SDD calls for clearing a group's date, and the group-level field is new surface area; adding a clear affordance here is out of scope until a real need for it shows up. |
| Per-group take-over + date compose as take-over-then-snooze, with snooze skipped when the group is fully removed | Snooze-then-takeover; or invoke snooze unconditionally and treat a full take-over's missing parent line as a mutation failure | Take-over first keeps `renderGroup`'s verbatim rewrite of the kept group's line from being overwritten by a snooze call resolving a now-stale `lineIndex`; skipping snooze on full removal avoids a spurious mutation-failure Notice when the group — and its date — are simply gone. |
| Group identity by `lineIndex` in `IntakeGroupOutcome` | Identity by the rendered `line` string | `IntakeGroup` and every existing mutation (`takeOverGroup`/`dropGroup`/`snoozeGroup`) already resolve identity primarily by `lineIndex`, falling back to content-matching only when it has gone stale. Two groups filed the same day with the same generated section name produce byte-identical `line` text; keying the outcome by `line` would collide where `lineIndex` does not. |
| Multi-group ⌘S confirm applies sequentially, single write, all-or-nothing on any missing parent line | Apply each group's mutation as its own separate file write | A single note write per confirm matches the existing single-write pattern for a stop's mutations (`vault.process`) and keeps the note's content consistent for the immediate re-read in Requirement 14; a partial write after one group's mutation succeeds and another's fails would leave the note in a state no single action produced. |
| A worked-then-left stop is übernommen only when closed via Esc or left unvisited; an explicit ⌘D/snooze/⌘X still wins its own bucket | Let ⌘S always win the bucket, overriding even an explicit completing action | This is the exact scope of the existing `takenOverStops` mechanism (`handleSkip` is the only place it overrides today); generalizing it further to override a deliberate ⌘D/snooze/⌘X would hide that the user explicitly acted on the task, which the summary should still show. |
| Summary always reports all six buckets, zero included | Show the übernommen/discard-adjacent bucket only when the walk had a stop with groups (as in the original draft) | That reintroduces the same "shape changes depending on content" problem Requirement 4 removes from the key bar; a fixed six-bucket summary is simpler, and the refine pass flagged the conditional shape as the same defect in a second place. |
| Flat SDD | Delta SDD on one archived base | The behaviour being changed is defined across two archived SDDs; a delta names exactly one base and would hide the other. |

## Open Decisions

None.

## Out of Scope

- Reminder stops — their selection, keys and preview stay exactly as they are.
- How groups get into a note: Besprechung filing, email filing and `vorgang-merge` are untouched.
- The `- Warte auf:` split and the `ownNames` setting.
- The preview body (`buildTriagePreview`) and its `VORGANG_PREVIEW_SECTIONS` limit — only the header line (Requirement 18) changes for a taskless note stop.
- Clearing a group's date back to due-now via the ⌘S dialog (see Decision Log).
- Any direct write to task frontmatter — every task mutation stays behind `tasknotes-bridge.ts`.
- Filing-suggestion ranking, which shares no code with the walk.
