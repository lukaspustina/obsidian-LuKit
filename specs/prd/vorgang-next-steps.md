# PRD: Next Steps in Vorgang Notes

Status: Ready for Design
Original: specs/prd/vorgang-next-steps.md
Refined: 2026-09-01

German domain terms are used verbatim — `Vorgang`, `Besprechung`, `# Nächste Schritte`,
`# Fakten und Pointer` — because they name literal strings in the vault and in the code.
The concept this PRD introduces is called the **intake**, never "inbox", which in this
codebase means the Apple Mail inbox.

## Problem

LuKit files Besprechungen and email threads into Vorgang notes without gaps, but exclusively
into the archive: extracted content lands in the body of a dated h5 section, and no filing
path has ever written to `# Nächste Schritte` — only `ensureVorgangSkeleton` creates the
heading (`vorgang-engine.ts:129`) and `mergeVorgangContent` appends to it when merging two
Vorgänge (`:390`). The triage walk makes it worse: `buildTriagePreview`
(`task-triage-engine.ts:160`) renders `# Fakten und Pointer` plus the three newest h5
sections and skips `# Nächste Schritte` entirely, so a due task is presented with everything
about it except what to do about it. The result is a note that has collected every fact and
still cannot answer "where does this stand and what is next" without reading the whole
chronology.

## Users

The maintainer, as sole author and sole user of the vault. No second persona, no handover,
no multi-user semantics. Every decision below optimises for one person deciding fast and
repeatedly, not for legibility to a team.

## Use Cases

1. I file a Besprechung; its next steps land as one group in the target Vorgang's intake
   without me typing anything.
2. I file an email and know what follows from it — I type that into the preview before
   confirming.
3. I file an email that clearly needs a follow-up I cannot yet name — I press ⌘K and get a
   placeholder marker pointing back at the filed thread.
4. I file an email that is purely informational — no intake entry appears and I delete
   nothing.
5. I walk the triage in the morning; after the reminders come the intake groups, one
   decision per group, and only then the due tasks.
6. A group holds five items of which two matter — I open the selection, tick two, take them
   over, and the rest leaves with the group.
7. The intake shows an item that already exists in substance in my curated list — I see both
   side by side at the stop and discard the group.
8. A group is not relevant this week — I press ⌘2 and it returns in seven days instead of
   tomorrow.
9. I open a Vorgang; the top of `# Nächste Schritte` says what I have to do, and below a
   visible boundary sits everything that arrived unsorted since I last looked.
10. I merge two Vorgänge; the source's open items arrive in the target instead of being
    stranded in the stub.
11. I removed an item from the intake weeks ago; the same Besprechung gets filed again and
    the item does not come back.
12. I close a Vorgang whose intake still holds unresolved items; the plugin stops me with a
    confirmation first, so the group doesn't quietly become unreachable.

## Goals

Bounds here are stated as verifiable conditions rather than adoption percentages: with a
single user, a cohort statistic would be theatre. Each goal names what must be observably
true for the feature to have worked.

**G1 — The state of a Vorgang is readable without searching.** Opening a Vorgang, and every
triage stop that concerns it, show the curated part and the intake as two visibly separated,
readable blocks, with no scrolling through the h5 chronology. Verifiable: `buildTriagePreview`
output contains `# Nächste Schritte` including the ownership boundary, for both a Vorgang
with an empty intake and one with entries.

**G2 — No action item is lost between filing and the curated list.** Two independent
guarantees, kept distinct because they involve different entities: a *filed source*
(Besprechung or email thread) is never merged — only a *Vorgang* is.
(a) *Filing-time dedup*: every filed source carrying items produces exactly one intake
group, including the three cases where the current code would drop it — the section is
missing (AC 2), the heading uses the lowercase spelling (AC 3), or the same source is filed
again into the same Vorgang (AC 4).
(b) *Merge carryover*: when the Vorgang holding an intake group is merged into another
Vorgang, the group survives in the target (AC 20).
Verifiable: one test each for AC 2, AC 3, AC 4, and AC 20.

**G3 — Completed items never return.** An item removed from the intake does not reappear,
even when the same Besprechung or the same email thread is filed again. Verifiable: remove
an item, re-file the source, assert no second entry — for both source types.

**G4 — A decision costs one keystroke in the common case.** Taking over or discarding a
whole group requires exactly one key at the triage stop; the multi-item selection is reached
by one further key and is never on the path of the common case. Verifiable: the walk's
action contract exposes take-over and discard as single-key actions for every intake stop.

Owner detection (AC 9–10) is deliberately outside G1–G4: v1 accepts the fuzziness of name
matching as a tradeoff to observe its real hit rate before committing to a bound, the same
reasoning the Decision Log applies to intake size (Non-Goal 4). No goal above is falsified
by owner detection alone missing or misplacing an item.

## Acceptance Criteria

**Structure and ownership**

1. WHEN the system writes to the intake of a Vorgang THE SYSTEM SHALL place all content
   below the h4 boundary heading `#### Unsortiert` inside `# Nächste Schritte` and leave
   every line above that heading byte-identical.
2. WHEN `# Nächste Schritte` is absent from the target note THE SYSTEM SHALL create the
   section before writing, positioned after `# Fakten und Pointer`.
3. WHEN the target note spells the heading `# nächste Schritte` THE SYSTEM SHALL treat it as
   the same section as `# Nächste Schritte`.
4. WHEN a source is filed a second time into the same Vorgang THE SYSTEM SHALL add no
   further intake group, determined from the `# Inhalt` TOC link or the filed `message://`
   ids, never from the current contents of the intake.

**Entry format**

5. WHEN a Besprechung with next steps is filed THE SYSTEM SHALL write one parent bullet of
   the form `- Aus [[<source note>]]`, with each top-level bullet of the source as a
   sub-bullet indented by four spaces, carrying its own indented lines along.
6. WHEN an email thread is filed with next-step text THE SYSTEM SHALL write one parent
   bullet of the form `- Aus [[#<h5 heading>]]`, anchoring the h5 section created by that
   same filing — a deep link, not a plain note link, so the marker resolves to the exact
   thread even when the note holds several filed sections.
6a. THE SYSTEM SHALL write parent bullets without a trailing date. The trailing
    comma-separated date on a parent line is the group's **due field**, written only by
    snooze (AC 13) and read only by due selection (AC 12); a group's origin date is carried
    by the linked source, not duplicated into the due field.
7. WHEN the user presses ⌘K in the email preview THE SYSTEM SHALL write a parent bullet with
   no sub-bullets. ⌘K is free of the preview's existing Enter and ⌘/Ctrl+Enter bindings and
   of the picker's ⌘P / ⌘N / ⌘. bindings.
8. WHEN the email preview's next-step field is empty and the shortcut was not used THE
   SYSTEM SHALL write no intake group at all.

**Owner detection**

9. WHEN a source item names an assignee matching none of the names configured in the global
   own-names setting (AC 24) THE SYSTEM SHALL place it below the own items, under the
   intermediate bullet `- Warte auf:`, within the same group. The comparison method — exact
   match, case-insensitive, substring, or token overlap — is an SDD design choice; this PRD
   fixes only that detection is applied, not how strings are compared.
10. THE SYSTEM SHALL never drop, hide, or filter an item on the basis of owner detection.

**Triage walk**

11. WHEN the walk starts THE SYSTEM SHALL present stops in the order reminders, intake
    groups, tasks.
12. WHEN an intake group's parent line carries no date THE SYSTEM SHALL treat the group as
    due; WHEN it carries a date on or before today THE SYSTEM SHALL likewise treat it as
    due; WHEN it carries a date later than today THE SYSTEM SHALL omit it from the walk.
13. WHEN the user snoozes an intake stop THE SYSTEM SHALL write the new date as the last
    comma-separated segment of the parent line and leave the sub-bullets untouched.
14. WHEN the user takes over an intake group THE SYSTEM SHALL move its items above the
    boundary and remove the group, parent line included.
15. WHEN the user opens the selection at an intake stop and confirms a subset THE SYSTEM
    SHALL move only the ticked items above the boundary and remove the whole group
    regardless.
16. WHEN a mutation at an intake stop fails THE SYSTEM SHALL keep the walk on that stop and
    report the failure, consistent with the existing reminder and task stops.
17. THE SYSTEM SHALL exclude notes carrying the configured done tag from intake selection.

**Display**

18. WHEN a stop concerns a Vorgang THE SYSTEM SHALL render `# Nächste Schritte` in the
    preview with curated part and intake visibly separated.
19. WHEN an intake stop is presented THE SYSTEM SHALL show the note's curated part alongside
    the group being decided.

**Interactions**

20. WHEN a Vorgang is merged into another THE SYSTEM SHALL carry the source's intake groups
    into the target's intake.
21. WHEN the user closes a Vorgang whose intake is non-empty THE SYSTEM SHALL block the
    closure behind a confirmation dialog (reusing the shared confirm modal) and proceed only
    if the user confirms; declining leaves the Vorgang open and the intake untouched.

    *Grounding: `vorgang-close` sets the done tag, and AC 17 excludes done-tagged notes from
    intake selection — an unconfirmed close makes that Vorgang's open items permanently
    unreachable by the triage walk, a direct G2 violation.*

**Configuration**

22. THE SYSTEM SHALL expose a comma-separated `nextStepHeadings` setting defaulting to
    `Nächste Schritte`, parsed exactly as the existing `sectionHeadings` and
    `decisionHeadings` fields are.
23. WHEN a heading appears in both `sectionHeadings` and `nextStepHeadings` THE SYSTEM SHALL
    write its content to both the h5 section body and the intake.
24. THE SYSTEM SHALL expose a comma-separated own-names setting at the global level, beside
    `dateLocale` and `doneTag`, defaulting to empty, read only by owner detection (AC 9).
    THE SYSTEM SHALL leave `besprechung.selfNameStopwords` untouched in name, location, and
    meaning.

## Scope

Filing a Besprechung or an email thread into a Vorgang now also deposits its action items in
a dedicated, plugin-owned area of `# Nächste Schritte` — the intake — kept strictly below a
visible boundary so the curated list above stays the user's own. Items arrive grouped by
source, with the group as the unit that carries state. The triage walk gains a third kind of
stop between reminders and tasks, where each group is taken over, discarded, or postponed
with a single key, with an opt-in selection for the case where only part of a group matters.
Both walk previews start showing `# Nächste Schritte`, which they do not today. Merge and
close learn to respect the new area.

## Non-Goals

1. **Automatic deduplication of semantically equal items** — no string comparison recognises
   "Angebot einholen" as the same thing as "Angebot bei Acme anfragen"; showing the curated
   part at the stop resolves it at the moment of decision instead (AC 19).
2. **LLM extraction from email prose** — does not run in the plugin context and would not be
   deterministic; the preview input field covers the case.
3. **Automatic TaskNotes creation** — the intake is the precursor, not a competing system,
   and not every half-sentence from a protocol deserves frontmatter and a due date.
4. **Any guarantee about intake size** — v1 deliberately sets no goal for whether drain keeps
   pace with inflow; real use should show that first.
5. **Managing the curated part** — the plugin writes below the boundary and nowhere else;
   ordering, wording, and pruning above it stay manual by design.

## Constraints

### Prerequisite

The merge defect found during design is fixed beforehand, as its own `fix` commit, before
this feature starts. `sliceSectionBody` compares headers exactly (`l.trim() === header`) and
both spellings exist in the repo (`examples/new/example-new-vorgang.md:13` lowercase,
`examples/new/example-new-bestellung.md:17` capitalised), so `vorgang-merge` already drops
the Nächste-Schritte body of every lowercase note today, uncovered by any test. Sequence:
failing regression test, then a `NEXT_STEP_HEADERS` constant analogous to `FAKTEN_HEADERS`,
then green. Bisectable and valuable independently of this PRD.

### Technical

- TypeScript strict, no `any`, explicit return types on exported functions.
- New logic belongs in `<name>-engine.ts` (pure, no Obsidian imports), not in the feature
  classes; the engines are what the tests drive.
- Vitest. Baseline is 760 tests across 162 files, green. Coverage thresholds live in
  `vitest.config.ts` (lines and functions 80, branches 70) while line coverage currently
  sits at 66.44 %.
- Intake and reminder stops must work without TaskNotes; only task stops require
  TaskNotes ≥ 4.10.0.
- Obsidian desktop-only; the email side is macOS / Apple Mail via the osascript bridge.
- Intake discovery must not read every section note — filter on the boundary heading via
  `metadataCache.getFileCache().headings` first, in keeping with the walk's existing
  performance fast path.

### Product

- UI, notices, and settings are German throughout; section names in notes are German.
- Command naming follows `<Domänen-Präfix>: <Verbphrase>`; existing command ids never
  change, because Obsidian stores hotkeys by id.
- No PII anywhere in the repo — fictional placeholders only (`Max Mustermann`, `Acme`,
  `Musterstadt`, `example.com`). The user's own name is a setting defaulting to empty, never
  a constant.
- Distribution via BRAT; release via `just release <version>`.

## Decision Log

**Where the state lives.** Three alternatives were weighed against keeping it in the Vorgang
behind an ownership boundary. *TaskNotes with the Vorgang rendering a projection* was
rejected because not every line of a protocol deserves a task file and the noise would land
in the triage walk, and because the note would then only show its state when a query renders
it. *A prose "state" paragraph instead of a list* was rejected because no automation can
write it — only the user or an LLM outside the plugin. *No stored state at all, just a better
reading view* was seriously considered as the frugal option, since `buildTriagePreview`
already trims Vorgang notes to `# Fakten und Pointer` plus the three newest sections; it was
rejected because that shows what last happened, not what is to be done.

**Append rather than replace.** The initial recommendation was to replace the plugin-owned
block wholesale on every filing, which makes deduplication, completion detection, and decay
unnecessary by construction. It was rejected in favour of append-only because replacement
silently drops an item from an older Besprechung that a newer one does not repeat, and
completeness was judged more valuable than compactness. Append-only is only safe because the
duplicate guard sits on the TOC link and the `message://` ids, both untouched by editing the
intake — the decisions log's guard, which tests for `([[Besprechung]])` in the text, would
re-write a deleted entry and is explicitly not the model here.

**Intake, not inventory.** Reframing the block as an inflow tray rather than a list of open
items is what makes redundancy between two sources expected instead of defective, and is the
reason automatic deduplication could be dropped from scope entirely.

**How the intake is drained.** *A separate per-Vorgang cleanup command* was rejected because
it shares the weakness of "I'll check regularly", only with a command attached. *Display in
the triage preview with manual cleanup in the note* was rejected because the walk is
keyboard-driven and any detour into the note breaks the flow, which is exactly where such
steps die. *Building the write path first and deferring the drain* was rejected because
append-only without a built drain is the feared list, just slower.

**Due semantics.** *Coupling intake visibility to the Vorgang's own due task* was rejected
because intakes of Vorgänge without a due task — precisely the ones that fall off the radar —
would grow unseen. *One stop per Vorgang holding all its groups* was rejected for breaking
the one-stop-one-decision principle and requiring a new interaction form. *Every open group
every day with no snooze* was rejected as the stacking spiral that makes a walk something one
dismisses. Reminder semantics won because dateless-means-due plus a date suffix is already
built, tested, and keyed to the same keys.

**Entry shape.** A flat list carrying its source on every line was recommended and rejected
by the user in favour of grouping by source, with the added constraint that only the parent
is ever operated on. That constraint removes the objection that had motivated the flat
option — sub-bullet lifecycles fragmenting the group — and collapses walk volume from one
stop per item to one stop per filed source.

**Take-over granularity.** *All-or-nothing* was rejected because tipping a whole group into
the curated list moves the growth problem one level up rather than solving it. *Take-over
only by opening the note* was rejected for the same flow-breaking reason as the display-only
drain. The chosen fast path plus opt-in selection keeps the parent as the lifecycle unit: the
selection is one-off, no sub-bullet retains state afterwards.

**Boundary marker.** *Marker comments in Müslidian's style* were rejected on two grounds:
`sliceSectionBody` does not stop at comment lines, so a merge would carry the source's intake
and its markers into the target and append the source's curated bullets behind them, and an
invisible boundary is exactly the one a human clears across incorrectly. *A separate
top-level section* was rejected because it separates the intake from the list its items move
into. *No marker, recognition by line shape* was rejected because any hand-written line
containing a link would be annexed. h4 was chosen over h2 as visually quieter, and it is
mechanically safe: `sliceSectionBody` and `mergeH1Section` break on `#{1,5}` while
`parseH5Sections` and `newestH5Sections` require five hashes.

**Email default.** *Pre-filling the field with a self-reference* was proposed by the user and
argued against: it would make every filed message produce an entry and force active deletion
on informational mail, which is the majority, turning the Vorgang into a second inbox beside
the mailbox. *Creating entries only in the single-shot command* was rejected as a rule to
memorise. The self-reference survives as the parent bullet's anchor, which makes an
empty-bodied group a valid placeholder marker on its own.

**Owner detection.** Proposed as a non-goal and deliberately taken into v1: the fuzziness of
name matching is accepted in order to observe the hit rate in real use. *Preselection in the
selection dialog*, the `preselectAttachment` pattern, was recommended and rejected in favour
of separation in the note text, because text separation is visible on every read rather than
only when sorting — which is the point of taking the fuzziness on. It follows that detection
must never filter (AC 10), or a miss would be invisible.

**Where the own names live.** Reusing `besprechung.selfNameStopwords` was recommended — one
fact, one setting — and rejected in favour of a separate global setting (AC 24). The two
lists are not the same fact: `selfNameStopwords` holds *extra tokens the ranker should
ignore*, which may include terms that are not personal names at all, while owner detection
needs *personal names that mean "me"* and nothing else. A shared list would have degraded
both roles — a non-name stopword would produce false ownership matches, and a name added for
owner detection would silently weaken the filing ranker. The cost is accepted: two places to
maintain, with the risk that they drift.

**Permanent strings and bindings.** Settled during refinement: the boundary heading is
`#### Unsortiert` (chosen over `Eingang`, which sits one word away from `Posteingang` in a
feature that also processes mail, and over `Neu`, which stops being true once a group is
snoozed); the parent prefix is `- Aus [[…]]`; the foreign-owner separator is `- Warte auf:`
(chosen over neutral phrasings because it states why the item concerns the user at all); the
email-preview shortcut is ⌘K. The parent carries no date at creation — the trailing date
field is reserved for snooze (AC 6a), which is what forces the link to precede it, since
`extractDateFromTitle` reads the last comma-separated segment.

**Intake size as a goal.** Offered and deliberately not adopted: v1 makes no promise about
whether drain keeps pace with inflow, on the same reasoning as owner detection — measure in
use before committing to a bound.

**Closing with an open intake.** Two lighter alternatives were weighed against a blocking
confirmation. *A non-blocking Notice that still lets closure proceed* was rejected because G2
promises no item is lost, not merely that the user was told before it was — done-tagged
notes are excluded from intake selection (AC 17), so an unconfirmed close makes the group
permanently unreachable by the walk regardless of whether the Notice was read. *Deferring the
whole check to a fast-follow*, on the reasoning Non-Goal 4 applies to intake size, was
rejected because that reasoning doesn't transfer: intake size needs real-use data to bound,
but a done-tagged note falling out of triage reach is already fully specified by AC 17 today
— there is nothing left to observe first. The blocking confirmation reuses the hard-block
pattern `vorgang-close`'s other guards already establish.

## Open Decisions

1. **Cut of the implementation.** One SDD in phases (structure and inflow / walk stop / owner
   separation) or several separate SDDs. Impact: bisectability and how early the feature is
   usable end-to-end. Belongs at the start of `/sdd-create`, not before it.

Resolved during refinement, recorded in the Decision Log: every permanent string and key
binding (`#### Unsortiert`, `- Aus [[…]]`, `- Warte auf:`, ⌘K) and the home of the own-names
list (a separate global setting, AC 24, leaving `selfNameStopwords` untouched).

## References

- `specs/prd/vorgang-next-steps.brainstorm.md` — locked brief this PRD was written from.
- `specs/done/sdd/besprechung-entscheidungen-2026-08-15.md` — closest relative; routes
  extractions from Besprechungen into a state area of the Vorgang. Its append-only log is
  deliberately not the model here.
- `specs/done/sdd/tasknotes-triage-walk-2026-07-02.md` — walk mechanics, stop contract,
  summary buckets.
- `specs/done/sdd/erinnerungen-triage-2026-07-02.md` — precedent for a second stop type and
  for the dateless-means-due semantics this feature reuses.
- `specs/done/sdd/vorgang-merge-2026-07-05.md` — affected by AC 20 and by the prerequisite
  fix.
- `~/Documents/src/obsidian-mueslidian` — the ownership contract between plugin and user that
  this design borrows; invisible markers there because an automaton replaces the block, a
  visible boundary here because a human clears it.
