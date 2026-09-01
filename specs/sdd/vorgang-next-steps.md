# SDD: Next Steps Intake in Vorgang Notes

Status: Ready for Implementation
Original: specs/sdd/vorgang-next-steps.md
Refined: 2026-09-01
PRD: specs/prd/vorgang-next-steps.md

## Overview

Filing a Besprechung or an email thread into a Vorgang currently writes only into the archive
— the dated h5 section — so `# Nächste Schritte` stays empty unless the user maintains it by
hand, and `buildTriagePreview` does not even display it. This SDD adds an **intake**: a
plugin-owned area below an `#### Unsortiert` boundary inside `# Nächste Schritte`, filled
append-only by both filing paths, one group per filed source, and drained through a third
stop type in the triage walk where each group is taken over, discarded, or snoozed with a
single key.

## Context & Constraints

- TypeScript strict, no `any`, explicit return types on exports. Obsidian plugin bundled with
  esbuild; tests with Vitest (`npm run test`), gate via `just adlc-verify` (`tsc --noEmit` +
  suite). Baseline: 760 tests across 162 files, green.
- Feature pattern: new logic belongs in `<name>-engine.ts` (pure, no Obsidian imports); the
  `<name>-feature.ts` classes only read and write through the Obsidian API. Shared primitives
  live in `src/shared/`.
- UI, notices and settings are German; identifiers, comments and this document are English.
  Section names in notes are German.
- No PII anywhere — fictional placeholders (`Max Mustermann`, `Acme`, `Musterstadt`,
  `example.com`). The user's own names are a setting defaulting to empty, never a constant.
- Command ids never change; only `name`/`displayName` may be renamed.
- Sub-bullets in Vorgang notes are indented by **4 spaces** (established by the decisions log
  and `examples/new/example-new-vorgang.md`).
- `# Inhalt` TOC and h5 sections are reverse-chronological; the intake is **not** — it is
  append-only, oldest group first, because its order is arrival order.
- Tests live in `tests/sdd_vorgang-next-steps/`, one file per criterion, named
  `sdd_vorgang-next-steps_p<N>_c<M>_<slug>.test.ts`, matching `tests/sdd_vorgang-merge/` and
  `tests/sdd_tasknotes-triage-walk/`. `<M>` is the scenario number within phase `<N>` from the
  "Test Scenarios" list of that phase.
- Existing helpers this design reuses rather than re-implements:
  `sliceSectionBody`/`mergeH1Section`/`findInhaltSectionIndex` (`vorgang-engine.ts`),
  `extractDateFromTitle`/`formatDate` (`shared/date-format.ts`),
  `listReminders`/`removeReminderLine`/`rescheduleReminderLine` shape
  (`work-diary-engine.ts`), `selectDueReminders`/`snoozeDate`/`buildTriagePreview`
  (`task-triage-engine.ts`) — `buildTriagePreview` is extended per requirement 40 to include
  `# Nächste Schritte`; its signature is unchanged: `buildTriagePreview(content: string): string`,
  `extractSection` (`besprechung-engine.ts`),
  `tocAlreadyLinks`/`extractWikilinkTarget` (`shared/note-structure.ts`),
  `preselectAttachment` (`email-format-engine.ts`) as the checkbox-preselection pattern to
  follow, with `email-preview-modal.ts` as the rendering reference for the per-item checkbox UI
  (used by requirement 33's ⌘S item-selection modal),
  `formatVorgangHeadingText`/`addVorgangSection` (`vorgang-engine.ts`, req. 9),
  `mutateReminder`'s `vault.process`/found-flag/`onMutationError` shape
  (`task-triage-feature.ts`) — reused for the intake mutations' null-on-not-found contract
  (Phase 4).
- **`sliceSectionBody` and `mergeH1Section` are not changed to be boundary-aware.** Both cut a
  section at the next heading matching `^#{1,5} `, which is `#### Unsortiert` once an intake
  exists. This is left as-is: every existing caller of these two helpers depends on the
  current cut-off, and for the curated part of `# Nächste Schritte` the h4 cut-off is exactly
  where curated content should end. Every read or write that needs to see *past* the boundary
  — building a group, parsing groups back, the walk mutations, and Phase 5's carryover on both
  the merge source and the merge target — goes instead through `extractNextStepsBody`
  (`intake-engine.ts`, Phase 2), which computes the section's true end as the next heading
  matching `^#{1,3} ` (in practice `# Inhalt`). See Phase 1 and Phase 2.
- Intake discovery must not read every section note: filter candidates through
  `metadataCache.getFileCache(file)?.headings` on the boundary heading first, in keeping with
  the triage walk's existing performance fast path.

## Architecture

```
Besprechung filing ─┐
                    ├─→ intake-engine (pure)  ──→ # Nächste Schritte
Email filing ───────┘        buildIntakeGroup       └── #### Unsortiert   ← plugin-owned
                             insertIntakeGroup            - Aus [[Quelle]]
                                                              - eigener Punkt
task-triage-feature ←── selectDueIntakeGroups             - Warte auf:
   (third stop type)     takeOverGroup / dropGroup            - Max: fremder Punkt
                         snoozeGroup
```

The engine owns every string transformation; the features own file access, modals, and the
walk. `intake-engine.ts` is new and pure; it lives beside the Vorgang feature because the
intake is part of a Vorgang note's structure, and is imported by the besprechung, email,
task-triage and vorgang features. `selectDueIntakeGroups` — ordering and due-selection over
already-parsed groups from possibly many notes — lives in `task-triage-engine.ts` beside
`selectDueReminders`/`selectTriageTasks`, which it mirrors; `buildIntakeGroup`,
`insertIntakeGroup`, `parseIntakeGroups`, `takeOverGroup`, `dropGroup`, `snoozeGroup` and
`extractNextStepsBody` live in `intake-engine.ts`, which owns one note's content.

## Requirements

### Structure and ownership

1. The system shall write intake content exclusively below an `#### Unsortiert` heading
   inside the `# Nächste Schritte` section when inserting a group, and shall leave every line
   above that heading byte-identical. (Requirement 10's take-over carve-out is the only
   sanctioned exception, per requirement 10 and requirement 32.)
2. The system shall create the `# Nächste Schritte` section, positioned after
   `# Fakten und Pointer`, when the target note does not have it; when `# Fakten und Pointer`
   is itself absent, the system shall create `# Nächste Schritte` directly after the
   frontmatter, before any other content. A note tagged Vorgang but never converted through
   `ensureVorgangSkeleton` is a real case, and dropping the group there would lose an action
   item.
3. The system shall create the `#### Unsortiert` heading when the section exists without it,
   placing it after the last non-empty line of the section.
4. The system shall recognise both `# Nächste Schritte` and `# nächste Schritte` as the same
   section, through a `NEXT_STEP_HEADERS` constant in the order canonical-first, matching the
   existing `FAKTEN_HEADERS` pattern.
5. The system shall treat the intake region (everything at or below `#### Unsortiert`) as
   ending at the next heading matching `^#{1,3} ` or at the end of the note, computed by
   `extractNextStepsBody` (Phase 2) — not by `sliceSectionBody`'s or `mergeH1Section`'s
   `^#{1,5} ` cut-off, which stops at the h4 boundary itself and cannot see past it.
5a. The system shall recognise, while parsing the intake region, any line at indent 0 as the
    start of a new group; that line's full text becomes `IntakeGroup.line` verbatim, and
    `IntakeGroup.source` is `extractWikilinkTarget` applied to that line, or the empty string
    when the line contains no wikilink.
5b. The system shall skip blank lines while parsing the intake region: a blank line belongs to
    no group and is never emitted as an `IntakeItem` child.
5c. The system shall parse a `- Warte auf:` sub-bullet with no indented lines beneath it (e.g.
    after hand-deletion of all its children) as `foreignItems: []`, and shall not re-emit that
    empty `- Warte auf:` line on any subsequent write of the group (take-over, discard, or a
    fresh `insertIntakeGroup`). This suppression binds the group-writing operations —
    take-over, discard and `insertIntakeGroup` — and deliberately not the merge splice
    (requirement 42), which preserves the source's bytes exactly, including an
    already-emptied `- Warte auf:` line.

### Entry format

6. The system shall write one parent bullet per filed source, at indent level 0, of the form
   `- Aus [[<target>]]`.
7. The system shall write each of the source's action items as a sub-bullet indented by four
   spaces, carrying that item's own further-indented lines along with their relative indent.
7a. The system shall accept a top-level item line with or without a leading bullet marker
    (`- `, `* `, `+ `) and strip it, so that `IntakeItem.text` holds the bare text either way.
    The two callers differ: `extractSection` yields bulleted lines, the email preview yields
    whatever the user typed.
8. The system shall write parent bullets without a trailing date. A trailing
   comma-separated date on a parent line is the group's due field, written only by snooze and
   read only by due selection. Parsing locates this due segment as any text after the parent
   line's last `]]`, distinguishing it from a comma-and-date that may appear inside the
   wikilink or anchor itself (e.g. `- Aus [[#E-Mail-Thread: Angebot, 01.09.2026]]`, where the
   comma belongs to the anchor, not to a due date).
9. The system shall link a Besprechung source by note name (`- Aus [[Besprechung X]]`) and an
   email source by an in-note anchor to the h5 section that same filing creates
   (`- Aus [[#E-Mail-Thread: Betreff, 01.09.2026]]`), where the anchor text is produced by
   `formatVorgangHeadingText` applied to the same section name and date that filing passes to
   `addVorgangSection` for the h5 heading — the resolved `PreviewOutcome.sectionName` (after
   the link-safety sanitisation of requirement 9a) when the user edited the preview's section
   title, never a literal re-derived independently. This keeps the wikilink and the heading it
   targets from drifting apart.
9a. The system shall make the resolved section name link-safe exactly once, via
    `sanitizeSectionName` (`email-format-engine.ts`), before it is used for either the h5
    heading or the intake anchor, so both derive from the identical sanitised value. The
    sanitiser strips only the characters that would break a wikilink or heading match — `]]`,
    `|`, `#` — and is distinct from `sanitizeSenderSubject`, which also strips commas; a comma
    is harmless here because the due segment is read from after the parent line's last `]]`
    (requirement 8), not by splitting on commas.
10. The system shall append new groups after existing ones and shall never remove or rewrite
    an existing group except through an explicit walk action (requirement 32, 33, 34, 35).

### Duplicate protection

11. The system shall add no further intake group when the source is already linked in the
    target's `# Inhalt` TOC (Besprechungen) or when all of the thread's message ids are
    already filed in the target (emails).
12. The system shall never derive duplicate protection from the current contents of the
    intake.

### Inflow — Besprechungen

13. The system shall provide a setting `besprechung.nextStepHeadings: string[]` with default
    `["Nächste Schritte"]`, parsed exactly as `sectionHeadings` and `decisionHeadings` are
    (`value.split(",").map(s => s.trim()).filter(s => s.length > 0)`, no deduplication).
14. The system shall extract, for each configured heading present in the source, every
    non-blank line of that section — lines at indent 0 as items, further-indented lines
    as their children — flattening multiple configured headings into one list in setting
    order. Deliberately not `bulletsOnly`, matching `extractDecisionLines`: that flag
    truncates at the first prose line instead of converting it, and requirement 7a
    already normalises a non-bulleted line into an item.
15. The system shall write no group when the extraction yields no items; this check is made
    by the caller (`besprechung-feature.ts`) before calling `insertIntakeGroup`, which itself
    writes whatever group it is given, including an empty one — the same function the email
    path (requirement 19) relies on to write a group with zero items.
16. The system shall apply requirement 14 in both filing paths: the pending walk and the
    single-shot command.
17. The system shall treat `nextStepHeadings` as independent of `sectionHeadings`: a heading
    listed in both is written to both the h5 section body and the intake.

### Inflow — emails

18. The system shall present, in the email preview modal, a multi-line input for next steps,
    empty by default, whose non-empty lines become the group's items.
19. The system shall write a parent bullet with no sub-bullets when the user presses ⌘K in
    the email preview, calling `insertIntakeGroup` unconditionally with a zero-item group; and
    shall write no group when the field is empty and ⌘K was not pressed. Pressing ⌘K while the
    field already holds text is not a conflict: the group is written from the typed lines
    exactly as it would be without ⌘K, so ⌘K in that case is a no-op.
20. The system shall apply requirements 18 and 19 in both the inbox walk and the single-shot
    command.

### Owner detection

21. The system shall provide a global setting `ownNames: string[]` with default `[]`,
    rendered in the "Allgemein" settings block as a comma-separated text field, parsed as
    `value.split(",").map(s => s.trim()).filter(s => s.length > 0)` — the same formula
    requirement 13 gives for `nextStepHeadings`, with no deduplication — read only by owner
    detection.
22. The system shall leave `besprechung.selfNameStopwords` untouched in name, location and
    meaning.
23. The system shall classify an item as foreign when its text begins with an assignee prefix
    of the form `<name>: ` and that name matches none of `ownNames`; every other item,
    including one with no prefix, is the user's own.
24. The system shall place foreign items below the own items of the same group, under a
    sub-bullet `- Warte auf:` at four-space indent, with the foreign items indented eight
    spaces beneath it.
24a. The system shall order foreign items within a group's `- Warte auf:` block in the same
     relative order they appear in the source's item list (source order), never reordering by
     assignee name or any other key.
25. The system shall write no `- Warte auf:` sub-bullet when a group has no foreign items.
26. The system shall never drop, hide, filter or reorder-away an item on the basis of owner
    detection.

### Triage walk

27. The system shall extend `TriageStop` with a third kind, `intake`, alongside `task` and
    `reminder`.
28. The system shall order stops reminders first, then intake groups, then tasks.
29. The system shall order intake stops among themselves by due date ascending with dateless
    groups last, tie-broken by note path and then by line index — matching
    `selectDueReminders`.
30. The system shall treat a group as due when its parent line carries no date or carries a
    date on or before the walk's pinned today, and shall omit it when the date is later.
31. The system shall offer at every intake stop: take over (⌘D), discard (⌘X), snooze to
    tomorrow / +1 week / next Monday (⌘1/⌘2/⌘3), snooze to a chosen date (⌘T), open and stop
    (Enter), skip (Esc), stop (⌘.), and open the item selection (⌘S; see requirement 33a for
    the sub-modal's cancel behaviour).
32. The system shall, on take over, move every item of the group above the `#### Unsortiert`
    boundary as top-level bullets appended to the curated part, dropping the `- Warte auf:`
    separator, and shall then remove the whole group. Own and foreign items alike land at
    indent 0 — the curated list has no separator to hang foreign items under, so preserving
    their eight-space indent there would leave them orphaned beneath an own item. Each item's
    own continuation lines keep their relative indent.
33. The system shall, on the item selection, present one checkbox per item, all preselected,
    and on confirmation move only the ticked items and remove the whole group regardless.
33a. The system shall, on dismissing the item-selection modal without confirming (Esc or
     click-outside), return to the intake stop unchanged: no mutation occurs and the group
     remains exactly as before the modal opened.
34. The system shall, on discard, remove the whole group and move nothing, leaving both the
    curated part and every other group byte-identical.
35. The system shall, on snooze, write the new date as the last comma-separated segment of
    the parent line and leave the sub-bullets untouched.
36. The system shall, on open and stop, open the target note positioned at the group's parent
    line and end the walk.
37. The system shall exclude notes carrying the configured `doneTag` from intake selection.
38. The system shall keep the walk on the current stop and report the failure when a mutation
    at an intake stop fails, matching the existing reminder and task stops. A mutation fails
    either when the vault write itself fails, or when `takeOverGroup`/`dropGroup`/
    `snoozeGroup` returns `null` because the group's parent line is no longer present in the
    note (see Data Models); both cases surface the same way.
39. The system shall count intake actions in the closing summary notice. The notice has two
    shapes and the choice is load-bearing: the pre-existing five-bucket sentence when the
    walk had no intake stop, and a seven-bucket one adding `T übernommen, D verworfen`
    when it had at least one. The gate is the *presence* of an intake stop, not the
    outcome — a walk whose intake stops were all skipped still reports `0 übernommen,
    0 verworfen`. Making this unconditional would break `sdd_tasknotes-triage-walk`'s
    c8 and c11, which pin the five-bucket string literally.
39b. The system reads an intake stop's group fresh, but renders take-over from the group
    object as read at presentation time while deleting the line range computed live. A
    sub-bullet hand-added to a group between its presentation and the keystroke is
    therefore removed without being carried up. The window is seconds wide and outside
    requirement 39a's rationale (sibling-stop mutation, which is handled correctly);
    recorded rather than closed.
39a. The system shall always read a Vorgang note fresh from disk immediately before presenting
     or acting on an intake stop belonging to it, never from a cached or prefetched copy taken
     when the walk started — because several intake groups can share one note and an earlier
     stop's mutation (take-over, discard, snooze) changes that note before a later stop on the
     same note is reached.

### Display

40. The system shall include `# Nächste Schritte` in `buildTriagePreview`, with the curated
    part and the intake separated by the literal `#### Unsortiert` heading text appearing in
    the rendered preview between them. This change is global and the function's signature is
    unchanged (`buildTriagePreview(content: string): string`): every stop that shows a Vorgang
    note — task and reminder stops included, not only intake stops — renders
    `# Nächste Schritte` with this boundary, because a second, intake-only preview path would
    duplicate the function for no gain.
41. The system shall show the target note's curated part alongside the group being decided at
    every intake stop, satisfied by the same `buildTriagePreview` function used for every
    other stop type, not a separate intake-only preview path.

### Interactions

42. The system shall carry a source Vorgang's intake groups into the target Vorgang's intake
    when merging, appending them after the target's existing groups. Carryover is a raw
    splice, not a build/parse round-trip: `parseIntakeGroups` is not used for the merge. The
    system shall read the source's `# Nächste Schritte` body via `extractNextStepsBody`, take
    the lines from just BELOW its `#### Unsortiert` heading onward — not the heading itself,
    which would emit a second boundary in the target, where this same requirement creates
    one. Each carried group is byte-for-byte identical, including hand edits such as an
    emptied `- Warte auf:`; only blank lines surrounding the whole block are trimmed, while
    interior blanks separating groups survive. When the source has no boundary, there are
    no intake lines to carry. Then read
    the target's `# Nächste Schritte` body the same way, create `# Nächste Schritte` and/or
    `#### Unsortiert` in the target first when either is missing (requirements 2 and 3), and
    append the source's intake lines verbatim after the target's existing intake lines. This
    keeps a hand-edited group — including one with an already-emptied `- Warte auf:` — from
    being silently reformatted by a merge (see requirement 5c).
43. The system shall block closing a Vorgang whose intake is non-empty — meaning
    `parseIntakeGroups(content).length > 0`, regardless of any group's item count — until the
    user confirms, reusing the hard-block pattern of `vorgang-close`'s existing guards: the
    confirmation is the first check in the command, evaluated before the doneTag write, the
    rename, and the diary entry, so declining leaves every one of those untouched — the same
    all-or-nothing shape the other `vorgang-close` guards already have.

## Data Models

```typescript
// src/features/vorgang/intake-engine.ts

/** One filed source's action items, the unit that carries state. */
export interface IntakeGroup {
	/** Full text of the parent line, the mutation key (as ReminderItem.line is). */
	line: string;
	/** Wikilink target of the parent, via extractWikilinkTarget (requirement 5a),
	 *  e.g. "Besprechung Acme Kickoff" or "E-Mail-Thread: Betreff, 01.09.2026".
	 *  Note the leading "#" of an in-note anchor is NOT part of it —
	 *  extractWikilinkTarget consumes it. The full anchor lives in `line`,
	 *  which is also the mutation key, so nothing is lost. */
	source: string;
	/** Due date from the parent's trailing segment; null means due now. */
	due: Date | null;
	/** Items the user owns, without indentation. */
	ownItems: IntakeItem[];
	/** Items behind "- Warte auf:", without indentation, in source order (requirement 24a). */
	foreignItems: IntakeItem[];
	/** Index of the parent line in the note's line array. -1 for a group built by
	 *  buildIntakeGroup but not yet inserted or parsed from a note. */
	lineIndex: number;
}

/** One action item plus the lines nested underneath it. */
export interface IntakeItem {
	text: string;
	/** Further-indented lines belonging to this item, verbatim, relative indent preserved. */
	children: string[];
}
```

```typescript
// src/features/vorgang/intake-engine.ts — exported functions

/**
 * Returns the full body of the "# Nächste Schritte" section (either spelling, via
 * NEXT_STEP_HEADERS), from just after the header to the next heading matching
 * `^#{1,3} ` or end of note — curated part, boundary and intake together. Unlike
 * sliceSectionBody, does not stop at the "#### Unsortiert" h4 boundary. Returns
 * [] when neither spelling of the header is present. The read path for callers
 * that need the section's text — Phase 5's merge carryover above all. The
 * functions inside this module that need line indices use the private
 * boundary helpers directly instead, since a detached slice cannot carry them.
 */
export function extractNextStepsBody(content: string): string[];

/**
 * Builds one group from raw item lines (top-level entries at indent 0, each
 * optionally followed by its own further-indented continuation lines, exactly
 * as extracted from a Besprechung section or typed into the email preview).
 * A top-level entry may or may not carry a leading bullet marker: extractSection
 * yields "- Angebot einholen" while the email preview yields whatever the user
 * typed. buildIntakeGroup accepts both and normalises — a leading "- ", "* " or
 * "+ " is stripped, so IntakeItem.text is always the bare text. Continuation
 * lines are kept verbatim with their relative indent. source is the wikilink
 * target without brackets, exactly as the caller passes it — "Besprechung Acme
 * Kickoff" for a note link, "#E-Mail-Thread: Betreff, 01.09.2026" WITH the "#"
 * for an in-note anchor. build and parse are deliberately not a fixed point on
 * this field: parseIntakeGroups derives source through extractWikilinkTarget,
 * which consumes the "#". Nothing depends on the round trip — the full anchor
 * lives in `line`, which is the mutation key. due is always null and lineIndex is
 */
export function buildIntakeGroup(itemLines: string[], source: string, ownNames: string[]): IntakeGroup;

/**
 * Appends group below the note's "#### Unsortiert" boundary, after the last
 * existing group. Creates "# Nächste Schritte" (requirement 2, including the
 * no-Fakten fallback) and/or "#### Unsortiert" (requirement 3) first when
 * either is missing. Writes the group unconditionally, including a zero-item
 * one (requirement 19); callers that must skip an empty group (requirement 15)
 * check before calling.
 */
export function insertIntakeGroup(content: string, group: IntakeGroup): string;

/**
 * Parses every group in the note's intake region (below "#### Unsortiert",
 * via extractNextStepsBody) into IntakeGroup[], in note order (oldest first).
 * A group with an empty "- Warte auf:" (requirement 5c) parses with
 * foreignItems: []. Not used for merge carryover (requirement 42), which
 * splices raw lines instead.
 */
export function parseIntakeGroups(content: string): IntakeGroup[];

/**
 * Moves every item of group (own and foreign, in that order) above the
 * boundary as top-level bullets appended to the curated part, each line's
 * indent reduced by four spaces, dropping the "- Warte auf:" separator; then
 * removes group's parent line and all of its sub-bullets from the intake
 * region. When selectedIndices is given, only the items at those indices
 * (own items first, then foreign, 0-based) are moved above the boundary —
 * the rest are discarded along with the whole group, which is always removed.
 * Returns null, without modifying content, when group.line is no longer
 * present in content (e.g. removed by a sibling stop's mutation or a hand
 * edit since the last read) — mirrors removeReminderLine's not-found contract.
 * Also returns null when "# Nächste Schritte" or "#### Unsortiert" is gone: a
 * parsed group cannot exist without them, so that is the same "structure moved
 * under us" failure class, and the walk's onMutationError path treats it alike.
 */
export function takeOverGroup(content: string, group: IntakeGroup, selectedIndices?: number[]): { newContent: string } | null;

/**
 * Removes group's parent line and all of its sub-bullets; moves nothing.
 * Returns null, without modifying content, when the section or the boundary
 * is gone, or when group.line is no longer present below the boundary.
 */
export function dropGroup(content: string, group: IntakeGroup): { newContent: string } | null;

/**
 * Rewrites group's parent line with due as its new trailing comma-separated
 * date segment (replacing any prior one), formatted via formatDate(due,
 * locale); sub-bullets are untouched. Returns null, without modifying
 * content, when the section or the boundary is gone, or when group.line is no
 * longer present below the boundary.
 */
export function snoozeGroup(content: string, group: IntakeGroup, due: Date, locale: DateLocale): { newContent: string } | null;
```

```typescript
// src/features/task-triage/task-triage-engine.ts — extended

export type TriageStop =
	| { kind: "task"; task: TriageTask }
	| { kind: "reminder"; reminder: ReminderItem }
	| { kind: "intake"; group: IntakeGroup; notePath: string; noteBasename: string };

/** One candidate group gathered from a note during walk setup, before due
 *  filtering and ordering. */
export interface IntakeStopCandidate {
	group: IntakeGroup;
	notePath: string;
	noteBasename: string;
}

/** Filters candidates to due groups (requirement 30) and orders them by due
 *  date ascending, dateless last, tie-broken by notePath then group.lineIndex
 *  (requirement 29) — mirroring selectDueReminders. */
export function selectDueIntakeGroups(candidates: IntakeStopCandidate[], todayIso: string): IntakeStopCandidate[];
```

```typescript
// src/features/task-triage/intake-select-modal.ts — new

export interface IntakeSelectModalOptions {
	/** The group whose items are offered for selection, all preselected
	 *  (requirement 33). */
	group: IntakeGroup;
	/** Called once, with the 0-based indices of the ticked items (own items
	 *  first, then foreign — the same order takeOverGroup's selectedIndices
	 *  parameter expects), when the user confirms. */
	onConfirm: (selectedIndices: number[]) => void;
	/** Called when the modal is dismissed without confirming — Esc or
	 *  click-outside. No mutation occurs; the intake stop is presented again
	 *  unchanged (requirement 33a). */
	onCancel: () => void;
}

export class IntakeSelectModal extends Modal {
	constructor(app: App, options: IntakeSelectModalOptions);
}
```

```typescript
// src/features/email-filing/email-format-engine.ts — new export

/**
 * Strips the characters that would break a wikilink or heading match — "]]",
 * "|", "#" — from a user-typed section title. Applied exactly once, before
 * the resulting value is used for both the h5 heading and the intake anchor
 * (requirement 9a), so the two can never drift apart. Distinct from
 * sanitizeSenderSubject, which additionally strips commas — harmless here
 * since the due segment is read from after the parent line's last "]]"
 * (requirement 8), not by splitting on commas.
 */
export function sanitizeSectionName(name: string): string;
```

```typescript
// src/types.ts — extended

export interface LuKitSettings {
	// … existing fields unchanged …
	/** Names that mean "the user" for owner detection. Distinct from
	 *  besprechung.selfNameStopwords, which lists tokens the filing ranker ignores. */
	ownNames: string[];
	besprechung: {
		// … existing fields unchanged …
		nextStepHeadings: string[];
	};
}
```

## File & Module Structure

| Path | Change |
|---|---|
| `src/features/vorgang/intake-engine.ts` | **new** — pure intake logic: `extractNextStepsBody`, `buildIntakeGroup`, `insertIntakeGroup`, `parseIntakeGroups`, `takeOverGroup`, `dropGroup`, `snoozeGroup` (the last three return `{ newContent: string } \| null`) |
| `src/features/vorgang/vorgang-engine.ts` | `NEXT_STEP_HEADERS`; header-tolerant section lookup for `sliceSectionBody`/`mergeH1Section` (unchanged cut-off, tolerant header match only); intake carryover in `mergeVorgangContent` as a raw splice of the source's post-boundary intake lines onto the target's intake region via `extractNextStepsBody` (not `insertIntakeGroup`/`parseIntakeGroups`) |
| `src/features/vorgang/vorgang-feature.ts` | `vorgang-close` intake guard: confirmation first, before any mutation, gated on `parseIntakeGroups(content).length > 0` |
| `src/features/besprechung/besprechung-engine.ts` | `extractNextStepItemLines` — flattens configured `nextStepHeadings` into raw item lines, analogous to `extractDecisionLines` |
| `src/features/besprechung/besprechung-feature.ts` | build and write the group (skip when empty) in both filing paths |
| `src/features/besprechung/besprechung-settings.ts` | `nextStepHeadings` field |
| `src/features/email-filing/email-preview-modal.ts` | next-steps multi-line input, ⌘K placeholder shortcut, `PreviewOutcome` unchanged in shape; the value travels alongside it as `string[] | null` — `null` writes no group, `[]` writes the zero-item placeholder group (⌘K on an empty field), non-empty writes those items. ⌘K with a filled field is a no-op, since the group is written either way. The modal exposes a directly-callable hook for the shortcut, following `TaskTriageModal`'s pinned-internals pattern, because `Modal.scope.register` is inert in the test stub |
| `src/features/email-filing/email-format-engine.ts` | **new export** `sanitizeSectionName` — applied once to the resolved section name before it is used for the h5 heading and the intake anchor (req. 9a) |
| `src/features/email-filing/email-filing-feature.ts` | build and write the group in both filing paths, anchored via `formatVorgangHeadingText` on the `sanitizeSectionName`-applied `sectionName` (req. 9, 9a) |
| `src/features/task-triage/task-triage-engine.ts` | `intake` stop kind, `IntakeStopCandidate`, `selectDueIntakeGroups`, `buildTriagePreview` extended to include `# Nächste Schritte` (req. 40, applies to every stop type showing a Vorgang note) |
| `src/features/task-triage/task-triage-feature.ts` | intake stop discovery (metadataCache boundary-heading filter, `doneTag` exclusion, fresh re-read per requirement 39a), mutations via `vault.process` handling the `null` not-found return from `takeOverGroup`/`dropGroup`/`snoozeGroup` (matching `mutateReminder`), summary buckets |
| `src/features/task-triage/task-triage-modal.ts` | intake stop rendering, ⌘S selection |
| `src/features/task-triage/intake-select-modal.ts` | **new** — checkbox selection over a group's items, all preselected; dismissal (Esc/click-outside) calls `onCancel` and mutates nothing (req. 33a) |
| `src/types.ts` | `ownNames` and `besprechung.nextStepHeadings` added to `LuKitSettings` and `DEFAULT_SETTINGS`; no other change — `mergeSettings`'s existing spreads already cover both new fields |
| `src/settings.ts` | "Eigene Namen" field in the Allgemein block |
| `tests/sdd_vorgang-next-steps/` | **new** — one test file per criterion, named `sdd_vorgang-next-steps_p<N>_c<M>_<slug>.test.ts` |

## Configuration

| Setting | Type | Default | Where |
|---|---|---|---|
| `ownNames` | `string[]` | `[]` | Allgemein — "Eigene Namen", comma-separated |
| `besprechung.nextStepHeadings` | `string[]` | `["Nächste Schritte"]` | Besprechung — comma-separated |

`mergeSettings` (`src/types.ts`) spreads `DEFAULT_SETTINGS` before saved values, so a stored
settings blob without either field falls back to the default. No migration code is required.

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Target note unreadable when writing a group | vault error during filing | filing completes without the group; the archive write already happened | German notice naming the note |
| `# Nächste Schritte` absent | legacy note | section created (req. 2), directly after the frontmatter when `# Fakten und Pointer` is also absent | none |
| Intake mutation fails at a stop | vault error on take over / discard / snooze | walk stays on the stop (req. 38) | German notice, entry stays open |
| Group's parent line no longer present at mutation time | hand-edit, or a sibling stop's mutation already removed it | the mutation function (`takeOverGroup`/`dropGroup`/`snoozeGroup`) returns `null`; the walk keeps the stop and reports the failure (req. 38) | German notice |
| Group's note deleted mid-walk | external change | stop skipped silently, counted in the closing summary | summary line only |
| Malformed group (parent without items, stray indent) | hand-edited note | parsed as a group with zero items; take over removes it, moves nothing | none |
| Hand-emptied `- Warte auf:` (req. 5c) | hand-edited note | parses to `foreignItems: []`; not re-emitted on next write of that group (not on merge splice) | none |
| Close blocked by non-empty intake | `vorgang-close`, `parseIntakeGroups(content).length > 0` | confirmation modal is the first check, before any mutation; declining aborts the close with nothing written | German confirm dialog |

## Phase 1 — Header tolerance and the merge repair

`NEXT_STEP_HEADERS` in `vorgang-engine.ts` plus a header-list-aware section lookup, applied to
`sliceSectionBody` and `mergeH1Section`. This repairs an existing defect: both helpers compare
headers exactly (`l.trim() === header`), and both spellings exist in the repo
(`examples/new/example-new-vorgang.md:13` lowercase, `example-new-bestellung.md:17`
capitalised), so `vorgang-merge` silently drops the Nächste-Schritte body of every lowercase
note today, uncovered by any test. `sliceSectionBody` and `mergeH1Section` keep their existing
`^#{1,5} ` cut-off unchanged — only the header-text comparison becomes tolerant of both
spellings; the true-end-of-section computation past an `#### Unsortiert` boundary is Phase 2's
`extractNextStepsBody`, not a change here.

No user-visible feature. Bisectable and valuable on its own.

**Phase complete when:** every scenario below passes and the full suite is green.

### Test Scenarios

1. GIVEN a source Vorgang whose section is spelled `# nächste Schritte` with two bullets, WHEN
   it is merged into a target, THEN both bullets appear under the target's
   `# Nächste Schritte`.
2. GIVEN a source spelled canonically `# Nächste Schritte`, WHEN merged, THEN the merge output
   is byte-identical to the pre-change output (regression guard).
3. GIVEN a note with both spellings present, WHEN a section lookup runs, THEN the canonical
   `# Nächste Schritte` spelling's content is used.
4. GIVEN a lowercase-spelled `# nächste Schritte` note, WHEN `sliceSectionBody` is called
   directly on it, THEN it returns the section body instead of empty (pinning the
   header-tolerant fix at the helper level, not only through merge).

## Phase 2 — Intake engine

`intake-engine.ts`: `extractNextStepsBody` (the true section end past the boundary, req. 5),
boundary discovery and creation including the no-`Fakten`-fallback (req. 1–3), group building
with owner split (req. 6–9, 9a, 23–26, 24a), append (req. 10, 15, 19), parsing back into
`IntakeGroup[]` including the group-boundary, blank-line and empty-`Warte auf:` rules
(req. 5a–5c), and the three mutations take-over / discard / snooze as pure string transforms,
each returning `{ newContent: string } | null` (req. 32–35, 38).

Pure module, no Obsidian imports, exhaustively unit-tested.

**Phase complete when:** every requirement in "Structure and ownership" and "Entry format" has
a passing unit test; every owner-detection classification requirement (23, 24, 24a, 25, 26)
has a passing unit test — requirements 21 and 22 are settings/types surface, verified by
Phase 3's gate, not here; and round-tripping build → parse → mutate → parse is stable.

### Test Scenarios

1. GIVEN a note without `# Nächste Schritte` but with `# Fakten und Pointer`, WHEN a group is
   inserted, THEN the section is created after `# Fakten und Pointer` with the boundary and
   the group below it.
2. GIVEN a note with no `# Fakten und Pointer` section at all, WHEN a group is inserted, THEN
   `# Nächste Schritte` is created directly after the frontmatter, before any other content,
   with the boundary and the group below it.
3. GIVEN a note whose `# Nächste Schritte` holds two curated bullets and no boundary, WHEN a
   group is inserted, THEN the boundary appears after the curated bullets and both survive
   byte-identical.
4. GIVEN an intake holding one group, WHEN a second group is inserted, THEN it is appended
   after the first and the first group's bytes are unchanged.
5. GIVEN a note where a prior take-over already added lines above the boundary, WHEN a new
   group is inserted, THEN every line above the boundary — including the take-over's lines —
   stays byte-identical and the new group lands below.
6. GIVEN a note whose `# Nächste Schritte` holds a boundary and two groups, WHEN
   `extractNextStepsBody` and `parseIntakeGroups` run, THEN both groups are returned, AND WHEN
   `sliceSectionBody` runs on the same note THEN it still returns only the curated part
   (pinning the deliberate divergence between the two read paths).
7. GIVEN items `["Angebot einholen", "Max: Rückmeldung"]` and `ownNames = ["Erika"]`, WHEN a
   group is built, THEN `Angebot einholen` is an own item and `Max: Rückmeldung` sits under
   `- Warte auf:` at eight-space indent.
8. GIVEN the same items and `ownNames = ["Max"]`, WHEN a group is built, THEN no
   `- Warte auf:` sub-bullet is written.
9. GIVEN an item with two further-indented lines, WHEN a group is built, THEN both lines
   follow it with their relative indent preserved.
10. GIVEN zero item lines, WHEN a group is built and inserted via `insertIntakeGroup`, THEN
    the group's parent bullet is written with no sub-bullets (the ⌘K case).
11. GIVEN a non-empty item-lines input, WHEN the group is built and inserted the same way ⌘K
    would insert it, THEN the result holds exactly one group with the typed items (⌘K on a
    non-empty field is a no-op, not a second write).
12. GIVEN the intake region contains a blank line between two groups, WHEN parsed, THEN the
    blank line is skipped and appears in no group's items.
13. GIVEN a group whose `- Warte auf:` sub-bullet has no indented lines beneath it, WHEN
    parsed, THEN `foreignItems` is `[]`, AND WHEN that group is next written (take-over or a
    fresh insertion), THEN no `- Warte auf:` line appears.
14. GIVEN a group, WHEN it is snoozed to 13.02.2026, THEN the parent line ends `, 13.02.2026`
    and the sub-bullets are unchanged.
15. GIVEN a group snoozed twice, WHEN parsed, THEN exactly one trailing date remains.
16. GIVEN a parent line whose anchor itself contains a comma and a date
    (`- Aus [[#E-Mail-Thread: Angebot, 01.09.2026]]`), WHEN parsed, THEN `due` is null; AND
    WHEN the same line is snoozed twice (13.02.2026, then 20.02.2026) and reparsed, THEN
    exactly one trailing due date remains (20.02.2026), distinct from the comma inside the
    anchor.
17. GIVEN the anchor-embedded-comma line from scenario 16, WHEN it is snoozed once, THEN
    `due` is the newly appended date, not the date embedded inside the anchor.
18. GIVEN a group with own and foreign items, WHEN it is taken over, THEN all items become
    top-level bullets appended to the curated part, indent reduced by four spaces, the
    separator is gone, and the group's exact former line range no longer appears anywhere in
    the note (not merely "group count decreased by one").
19. GIVEN a group with two foreign items from different assignees, WHEN it is built, THEN
    they appear under `- Warte auf:` in source order (requirement 24a).
20. GIVEN any set of item lines, WHEN a group is built from them and then taken over, THEN
    the total number of items now above the boundary equals the count of item lines
    originally passed in (pins requirement 26 as a structural invariant).

## Phase 3 — Inflow

Wire both source types: `nextStepHeadings` setting and extraction
(`extractNextStepItemLines`) in `besprechung-engine`/`besprechung-feature` for both filing
paths (req. 13–17); next-steps input and ⌘K in `email-preview-modal`, group writing in
`email-filing-feature` for both paths, anchored via `formatVorgangHeadingText` on the resolved
and sanitised `sectionName` (req. 18–20, 9, 9a); `ownNames` in settings (req. 21–22); duplicate
protection (req. 11–12).

**Phase complete when:** filing a Besprechung and filing an email each produce exactly one
group in the target, re-filing produces none, the `ownNames` and
`besprechung.nextStepHeadings` settings exist with their documented defaults (req. 13, 21, 22),
and the suite is green.

### Test Scenarios

1. GIVEN a Besprechung with a `# Nächste Schritte` section holding three bullets, WHEN it is
   filed through the pending walk, THEN the target Vorgang's intake holds one group with
   three items linking the Besprechung.
2. GIVEN the same Besprechung, WHEN it is filed through the single-shot command, THEN the
   result is identical to scenario 1.
3. GIVEN a Besprechung already linked in the target's `# Inhalt`, WHEN it is filed again,
   THEN no second group appears.
4. GIVEN a Besprechung whose configured heading is absent, WHEN it is filed, THEN no group is
   written and the h5 section is unaffected.
5. GIVEN `nextStepHeadings = ["Nächste Schritte"]` and `sectionHeadings` containing the same
   heading, WHEN a Besprechung is filed, THEN the content appears both in the h5 body and in
   the intake.
6. GIVEN the email preview with an empty next-steps field, WHEN the user confirms without
   ⌘K, THEN no group is written.
7. GIVEN the email preview with two typed lines, WHEN the user confirms without ⌘K, THEN one
   group with two items is written, anchored to the h5 section created by that filing.
8. GIVEN the email preview, WHEN the user presses ⌘K with an empty field and confirms, THEN
   one group with no sub-bullets is written, anchored to the created h5 section.
9. GIVEN the email preview with two typed lines, WHEN the user also presses ⌘K and confirms,
   THEN exactly one group is written holding the two typed items, unaffected by ⌘K.
10. GIVEN the user edits the section title in the preview before confirming, WHEN the email
    is filed, THEN the intake anchor (`- Aus [[#<edited title>, <date>]]`) matches the edited
    h5 heading byte-for-byte.
11. GIVEN the user types a section title containing `]]` and `#` before confirming, WHEN the
    email is filed, THEN the h5 heading and the intake anchor are identical to each other
    (both sanitised via `sanitizeSectionName`, req. 9a) and the group parses back correctly.
12. GIVEN a thread whose message ids are already filed in the target, WHEN it is filed again,
    THEN no second group appears.

## Phase 4 — Triage stop

Third stop kind, selection over the vault filtered by boundary heading and `doneTag`,
ordering, key bindings, the ⌘S selection modal including its cancel path (req. 33a), the
fresh-read guarantee (req. 39a), the `null` not-found contract shared with the reminder
mutations (req. 38), and the two preview changes (req. 27–41). Intake mutations run through
`app.vault.process`, following `mutateReminder`'s shape: a found-flag captured inside the
callback, throwing when the engine mutation returns `null`, caught by the existing
`onMutationError` path (notice + re-present the same stop) — every mutation in this codebase
uses `vault.process`, never `vault.modify`, since only that callback shape carries the
found/not-found signal cleanly.

**Phase complete when:** a walk over a vault with reminders, intake groups and tasks presents
them in that order, each intake action mutates the note correctly, and the summary counts
intake actions.

### Test Scenarios

1. GIVEN a vault with one due reminder, two intake groups and one due task, WHEN the walk
   runs, THEN the stops appear in the order reminder, intake, intake, task.
2. GIVEN two intake groups, one dateless and one snoozed to yesterday, WHEN the walk runs,
   THEN the snoozed one comes first and the dateless one last.
3. GIVEN a group snoozed to tomorrow, WHEN the walk runs, THEN it is not presented.
4. GIVEN a Vorgang carrying the done tag with a non-empty intake, WHEN the walk runs, THEN
   its groups are not presented.
5. GIVEN two intake groups in the same Vorgang note, WHEN the first is taken over, THEN the
   second stop's preview and mutation operate on the freshly re-read note content (its
   `lineIndex` and text reflect the first stop's write, not the pre-walk snapshot).
6. GIVEN an intake stop, WHEN the user presses ⌘D, THEN the items are above the boundary, the
   group is gone, and the walk advances.
7. GIVEN an intake stop with three items, WHEN the user opens ⌘S, unticks one and confirms,
   THEN two items are above the boundary and the whole group is gone.
8. GIVEN an intake stop, WHEN the user opens ⌘S and dismisses the modal (Esc or
   click-outside) without confirming, THEN the intake stop is presented again unchanged: no
   mutation occurred and the group is exactly as before.
9. GIVEN three intake groups, WHEN the middle one is discarded, THEN the curated part above
   the boundary is byte-identical AND the first and third groups are each byte-for-byte
   identical to their pre-discard bytes.
10. GIVEN an intake stop whose write fails, WHEN the user presses ⌘D, THEN a notice appears
    and the same stop is presented again, with the note byte-identical to before the attempt.
11. GIVEN a group whose parent line was already removed by a sibling stop's mutation earlier
    in the same walk (or by a hand edit), WHEN the walk attempts a mutation on that stop, THEN
    `takeOverGroup`/`dropGroup`/`snoozeGroup` returns `null`, a German notice appears, and the
    walk reports the failure without crashing.
12. GIVEN any Vorgang stop (task, reminder, or intake), WHEN a preview is built, THEN it
    contains `# Nächste Schritte` with the literal `#### Unsortiert` heading separating the
    curated part from the intake.
13. GIVEN an intake stop, WHEN it is presented, THEN the preview shows the note's curated
    part alongside the group being decided.
14. GIVEN a completed walk with one take-over, one discard and one snooze, WHEN it ends, THEN
    the summary notice reports each.

## Phase 5 — Merge and close

Intake carryover in `mergeVorgangContent` as a raw splice of the source's post-boundary intake
lines (extracted via `extractNextStepsBody`) onto the target's intake region, creating
`# Nächste Schritte`/`#### Unsortiert` in the target first when either is missing (req. 42),
and the `vorgang-close` guard, confirmation-first, gated on `parseIntakeGroups(content).length
> 0` (req. 43).

**Phase complete when:** merging carries groups across without duplicating them within a
single merge, the target's own pre-existing groups and the source's carried-over groups are
each byte-identical after the merge, and closing a Vorgang with a non-empty intake requires
confirmation before any mutation.

### Test Scenarios

1. GIVEN a source Vorgang with two intake groups and a target with one, WHEN they are merged,
   THEN the target holds three groups in order, the source's two appended after the target's
   one; the target's pre-existing group is byte-for-byte identical to its pre-merge bytes; and
   each of the source's two carried-over groups is byte-for-byte identical to its bytes in the
   source before the merge.
2. GIVEN a source with an intake and a target without a `# Nächste Schritte` section, WHEN
   they are merged, THEN the section and boundary are created in the target and the groups
   land below it.
3. GIVEN a source whose curated part and intake both hold bullets, WHEN merged, THEN the
   curated bullets land above the target's boundary and the groups below it, with none
   crossing.
4. GIVEN a Vorgang with a non-empty intake, WHEN the user runs `vorgang-close`, THEN a
   confirmation is required before any write, and declining leaves the note byte-identical
   (no doneTag, no rename, no diary entry).
5. GIVEN a Vorgang with an empty intake, WHEN the user runs `vorgang-close`, THEN no
   confirmation prompt appears and the existing behaviour is unchanged.

## Decision Log

**One SDD in five phases, not several SDDs.** This was the PRD's remaining open decision.
Separate SDDs were rejected: the parts are not independently deliverable — without the write
path there is nothing to drain, and without the drain the intake is the runaway list the PRD
exists to prevent — and three separate cycles would each carry refine, validate, verify,
review and finish for one coherent change. All ten archived SDDs in this repository are
single documents with phases; this follows them. Phase 1 is deliberately a defect fix with no
feature content, so the repair is bisectable independently of the feature that uncovered it.

**Phase 3 alone is a known incomplete state, deliberately left ungated.** Phase 3 (inflow)
alone leaves the intake growing with no drain (Phase 4), which is the very failure mode the
PRD exists to prevent. This is deliberately not made a phase gate, because no phase gate can
assert what happens between commits — a gate can only check the state at the end of its own
phase, not the interval before the next one starts. Each phase's own gate stands on its own;
sequencing discipline (not shipping Phase 3 alone for long) is a delivery concern, not a
specification the SDD can enforce.

**`intake-engine.ts` as a new module rather than growth in `vorgang-engine.ts`.**
`vorgang-engine.ts` is already 425 lines and owns TOC and h5 section mechanics. The intake is
a distinct structure with its own parse/build/mutate lifecycle, imported by three other
features; folding it in would make the Vorgang engine the de-facto home of every feature's
logic. Rejected alternative: `src/shared/` — the intake is part of a Vorgang note's structure,
not a cross-cutting primitive, and nothing outside the Vorgang domain constructs one.

**`sliceSectionBody`/`mergeH1Section` stay boundary-blind; a new function reads past the
boundary instead.** Making the two existing helpers boundary-aware would change behaviour for
every current caller of the curated-part cut-off, and the curated part is exactly what those
callers want. Adding `extractNextStepsBody` as a second, purpose-built read path keeps the
existing helpers' contract intact while giving every intake-aware caller — build, parse,
mutate, and Phase 5's merge carryover on both source and target — one true, shared notion of
where `# Nächste Schritte` actually ends.

**Merge carryover splices raw bytes rather than rebuilding groups via `parseIntakeGroups`/
`insertIntakeGroup`.** A round trip through parse-then-rebuild would reformat a hand-edited
group on every merge — for instance re-emitting a `- Warte auf:` line that requirement 5c
would otherwise suppress on a fresh write, silently changing bytes the user never touched.
Splicing the source's post-boundary lines verbatim onto the target's intake region preserves
them exactly, at the cost of `parseIntakeGroups` not being reused here — an acceptable
trade-off since the merge doesn't need to interpret the groups, only relocate them.

**Reusing the reminder mutation shape rather than the reminder functions themselves.** The
walk's due semantics, snooze suffix and dateless-means-due behaviour are copied from
`work-diary-engine.ts`'s reminders, but the functions are not: a reminder is a flat line in a
single shared note, a group is a nested block in one of many notes, and the mutation key
differs. Sharing the code would mean generalising both call sites over a difference that is
real. The convention is shared; the implementation is not — including the `{ newContent:
string } | null` return shape, borrowed from `removeReminderLine`/`rescheduleReminderLine` for
the same reason: a fresh read can still race against another stop's mutation on the same note,
and the caller needs a typed way to detect "the line is gone" rather than reinventing it.

**Line text as the mutation key.** Consistent with `ReminderItem.line` and its
`lines.indexOf(line)` lookup: an index alone is invalid the moment the note is edited between
presenting and acting, which is exactly what happens when several groups live in one note —
and is why requirement 39a requires a fresh read immediately before every intake stop.

**Intake ordered oldest-first, against the note's other conventions.** `# Inhalt` and the h5
sections are newest-first; the intake is not. Its order is arrival order, and a queue that
grows at the top makes "what have I not looked at" harder, not easier.

**⌘S for the item selection.** ⌘D, ⌘X, ⌘1/⌘2/⌘3, ⌘T, ⌘. and Esc are already bound by the
walk; ⌘S is free and mnemonic for "selection". ⌘A was considered and rejected — it reads as
"select all" in a modal that is about selecting some.

**⌘K is unconditional, not "wins over typed text."** ⌘K means "write the group even if it has
no items" — a bypass of the empty-group skip, not an alternative source of items. When the
next-steps field already holds text, the group is written from that text regardless of ⌘K, so
pressing it in that case changes nothing. No precedence rule between "typed text" and "⌘K" was
needed because they are not alternatives to begin with.

**The section-name link-safety sanitiser is narrow, not `sanitizeSenderSubject`.**
`sanitizeSenderSubject` also strips commas, which are ordinary and harmless in a subject line
("Angebot, zweite Runde") — the due-segment parser already distinguishes a genuine snooze
suffix from a comma inside the anchor by looking only after the parent line's last `]]`
(requirement 8). Reusing `sanitizeSenderSubject` would over-strip user-typed titles for a
hazard (comma ambiguity) that does not exist at this call site; a purpose-built
`sanitizeSectionName` strips only what would actually break the wikilink or heading match.

**Merge is not made idempotent against re-merging the same source.** `buildStubContent`
replaces the source note's entire body with a "Zusammengeführt in [[…]]" sentence, so after
one merge the source has no intake left to carry over — a second merge of the same pair reads
an empty source intake and contributes nothing. Duplicate protection was therefore not added
to the merge path; it is unnecessary by construction, and adding it would only guard sequences
that were already established to happen at most once. See Out of Scope.

Decisions inherited from the PRD and not re-opened here: the boundary is `#### Unsortiert`,
the parent prefix `- Aus [[…]]`, the foreign separator `- Warte auf:`, the email shortcut ⌘K,
append-only rather than replace, duplicate protection anchored outside the block, the group
as lifecycle unit, and a separate `ownNames` setting leaving `selfNameStopwords` untouched.
The PRD's Decision Log carries the reasoning for each.

## Open Decisions

None.

## Out of Scope

- Automatic deduplication of semantically equal items across groups — no string comparison
  recognises them; the curated part shown at the stop resolves it by eye.
- LLM extraction of action items from email prose — the preview input covers the case.
- Automatic TaskNotes creation from intake items — the intake is the precursor, not a
  competing system.
- Any guarantee or measurement of intake size — deliberately unbounded in v1 pending real use.
- Managing the curated part above the boundary — ordering, wording and pruning stay manual.
- Owner detection beyond a leading `<name>: ` prefix — no parsing of assignees embedded in
  prose, and no measurement of the detection's hit rate in v1.
- Back-filling intakes from Besprechungen or threads filed before this feature ships.
- Duplicate protection on merge, and idempotency of re-merging the same source Vorgang.
  `buildStubContent` empties the source's body on merge, so a second merge of the same pair
  reads no intake to carry over and cannot double it; guarding against a sequence that cannot
  occur was judged not worth the code.
