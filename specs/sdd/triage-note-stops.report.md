# SDD Implementation Report: triage-note-stops.md

**Date**: 2026-09-08
**Phases run**: 1 (Phase 2 in progress)

## Phase 1: One Stop per Note

**Status**: shipped
**Commit**: 475cfdc
**Test Baseline**: 631e071 (`.adlc/cycle/triage-note-stops/test-commit-1`)

### Acceptance Criteria

All 17 criteria pass; the suite for this phase is `tests/sdd_triage-note-stops/`, 17 files /
39 assertions (36 written from the criteria, 3 added after the review — see Reviewer Findings).
Full suite: 245 files / 932 tests green. `npm run build` clean.

### Reviewer Findings

**Blockers** (both found, both fixed and re-verified by the same reviewer before the commit):

1. Requirement 1's carry clause was not implemented. `beginWalk` fed `selectNoteStops` only the
   *due* tasks, so a note qualifying solely through its intake came out with `task: undefined` and
   the modal withdrew ⌘D, ⌘G and the snoozes on it — a regression against the pre-merge behaviour,
   where the same note did offer ⌘G. Fixed with a third parameter `otherTasks` that attaches a
   non-due task to an already-qualified note and can never create a stop of its own. Pinned by two
   new cases in `..._p1_c1_one-stop-per-note.test.ts`.
2. The deleted `..._p4_c7_selection-subset.test.ts` pinned a *subset inside one group*; its named
   successor covered only all-or-nothing outcomes per group, so that content outcome was
   uncovered. Fixed with a mixed-selection case in `..._p1_c10_partial-group-takeover.test.ts`,
   which the reviewer judged strictly stronger than the deleted test on group content and sibling
   byte-identity.

**SDD Amendments Needed** (advisory, none blocked the commit; all `affected_phase: 1`):

- R10 describes the pre-`174bf94` selection convention ("an emptied field falls back to the
  original text"). Since that commit an emptied field *deletes* the line. The implementation
  follows the shipped behaviour; only the SDD is wrong.
- R4/R6 phrase the snooze gate as "only while the stop carries a task", but the implementation
  keeps the legacy `snooze: !task.isRecurring` rule, so a recurring task offers no snooze. The
  recurring exclusion should be stated explicitly.
- R16 says doneTag exclusion works "as today"; today only the intake half was filtered. Repaired
  in phase — the task half is filtered now, which is what c8 pins.
- R15's exit enumeration omits Enter (open & stop). `handleOpenAndStop` finishes the walk without
  counting, so a stop whose intake was worked and then left via Enter reports `offen`.
- The `selectNoteStops` signature in Data Models still shows the dropped `today` parameter; the
  implemented signature is `(dueTasks, candidates, otherTasks = [])`.

**Deferred**: none.

**Nits**: 7, of which one was acted on — `README.md` still documented three stop kinds,
⌘D-as-take-over, ⌘X-as-discard and the conditional summary. Rewritten for the note stop.

### Behavioral Verification

**Not executed — deferred to a manual smoke test, deliberately.** The phase's criteria address an
Obsidian modal; the deliverable is `main.js`, which only runs inside Obsidian, and this repository
has no `.claude/skills/verify/` harness and no headless Obsidian driver. What was executed:

- `npm run build` → `tsc -noEmit` clean, `main.js` (248 KB) and `cli.js` (15.1 KB) written.
- `adlc auto verify-run --dir .` → 245 files / 932 tests, all green.
- `adlc auto verify-gate --dir .` → exit 0 (lint clean; attestation flagged dirty because it was
  written before the commit).

The manual steps are in the Manual Test Plan below. Until they are run, the live behaviour of
Phase 1 is unproven in the same sense the plugin's other Obsidian-facing features are.

### Operational change worth knowing

Stop order now reads the note's own dates first. A group due today on a note scheduled for
December is therefore presented **last**, not first — which is Requirement 3 working as specified,
but it is a visible change to the order the walk offers.

## Manual Test Plan

1. Open a Vorgang that is a due TaskNote **and** carries two due intake groups → expected: one
   stop, headed by the note, with `⌘D ⌘1 ⌘2 ⌘3 ⌘T ⌘G ⌘S ↵ esc ⌘.` in the hint bar.
2. Press ⌘S → expected: one section per group, headed by the group's `- Aus …` line, every line
   with a checkbox and an editable field, plus a discard box per group.
3. Untick one line of one group, confirm → expected: the ticked lines move above
   `#### Unsortiert`, the unticked line stays in the group, the walk returns to the same stop.
4. Tick everything in the remaining group, confirm → expected: the group is gone, ⌘S disappears
   from the hint bar, every other key stays, the walk has not advanced.
5. Press ⌘G → expected: both dates prefilled; clearing one clears the property.
6. Press ⌘D → expected: the task completes, the walk advances, the note's intake is untouched.
7. Open a Person note stop (intake, no task) → expected: only `⌘S ↵ esc ⌘.`, header reads
   `<Basisname> · N Gruppen`.
8. End the walk with ⌘. → expected: a summary naming all six buckets, including the zeros.
