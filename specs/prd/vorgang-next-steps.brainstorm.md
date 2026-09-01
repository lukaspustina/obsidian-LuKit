# PRD Brainstorm: vorgang-next-steps

Generated: 2026-09-01
Status: Brief (input to /prd-create)

German domain terms are kept verbatim throughout — `Vorgang`, `Besprechung`,
`# Nächste Schritte`, `# Fakten und Pointer` — because they name literal strings in the
vault and in the code. The concept introduced here is called the **intake** (never "inbox",
which in this codebase means the Apple Mail inbox).

## Problem

Friction in an existing workflow. LuKit files Besprechungen and email threads into Vorgang
notes without gaps — but exclusively into the **archive**: extracted sections land in the
body of the dated h5 section. Verified: no filing path ever writes to `# Nächste Schritte`;
only `ensureVorgangSkeleton` creates the heading (`vorgang-engine.ts:129`) and
`mergeVorgangContent` appends bullets when merging two Vorgänge (`:390`). Also verified:
`buildTriagePreview` (`task-triage-engine.ts:160`) shows `# Fakten und Pointer` plus the
three newest h5 sections and **skips `# Nächste Schritte` entirely** — the triage walk shows
everything about a due task except what to do about it. The consequence: a Vorgang collects
completely and still knows nothing about itself. Opening the note reveals neither the state
nor the next step, although all the data is there.

The obvious automation — just write the next steps along — produces the inverse problem: a
growing list where completed items reappear and the same thing is stated three times. The
decisions log under `# Fakten und Pointer` is not the model for this but the
counter-example: decisions are monotonic and may accumulate, open items have a lifecycle.

## Users

One: the maintainer as sole user. No further personas, no handover, no multi-user semantics.

## Use Cases

1. I file a Besprechung; its next steps land as one group in the target Vorgang's intake,
   without me typing anything.
2. I file an email and know what follows from it — I type it into the preview; or I don't
   know yet and set a placeholder marker via shortcut, without text.
3. I file an email that is purely informational — no intake entry is created, I delete
   nothing.
4. I walk the triage in the morning; after the reminders come the intake groups, one
   decision per group, and only then the due tasks.
5. A group holds five items of which two matter — I open the selection, tick two, take them
   over; the rest goes with the group.
6. The intake holds an item that already exists in substance in my curated list — I see both
   side by side at the stop and discard the group.
7. A group is not relevant right now — ⌘2, it returns in a week instead of tomorrow.
8. I open a Vorgang; at the top is what I have to do, below it — visibly separated — what
   has come in unsorted since I last looked.
9. I merge two Vorgänge; the source's open items are not lost.
10. I removed an item from the intake; the same Besprechung is filed again — it does not
    come back.

## Goals

**G1 — The state is readable without searching.** Opening a Vorgang and every triage stop
show the curated part and the intake as visibly separate, readable sections, with no
scrolling through the h5 chronology. Observable: `buildTriagePreview` includes
`# Nächste Schritte` along with the ownership boundary.

**G2 — No action item is lost.** Every filed source carrying items produces exactly one
group — even when the section is missing (it gets created), even when the heading's spelling
differs, even on merge (the source's intake travels with it). Observable: one test each for
filing, merge, and a legacy note.

**G3 — Completed items never return.** A removed item does not reappear, even when the same
Besprechung or thread is filed again. Observable: delete an item, file the source again, no
second entry. The duplicate guard hangs on the TOC link (`tocAlreadyLinks`) and on the
`message://` ids (`extractFiledMessageIds`), never on the block's own content — unlike the
decisions log, which tests for the presence of `([[Besprechung]])` in the text and would
therefore write again after a deletion.

## Non-Goals

1. **No automatic deduplication of semantically equal items.** No string comparison
   recognises "Angebot einholen" as the same thing as "Angebot bei Acme anfragen"; showing
   the curated part at the stop resolves it at the moment of decision instead.
2. **No LLM extraction from email prose.** It does not run in the plugin context and would
   not be deterministic — the input field in the preview covers the case.
3. **No automatic TaskNotes creation.** The intake is the precursor, not a competing system;
   not every half-sentence from a protocol deserves frontmatter and a due date.
4. **No guarantee about intake size.** v1 does not measure whether drain keeps pace with
   inflow — real-world use should show that before a goal is attached to it.

Explicitly **not** excluded: owner detection. It was considered as a non-goal and
deliberately taken into v1; the fuzziness of name matching is accepted in order to see in
real-world use how large the problem actually is.

## Functional Surface

**Triggers:** mixed — on filing (Besprechung walk, single Besprechung, email walk, single
email) and in the triage walk.
**Configuration surface:** settings panel (new `nextStepHeadings`; reuse of
`selfNameStopwords`).
**Core actions:** take over group (⌘D), discard group (⌘X), selection dialog, snooze
(⌘1/⌘2/⌘3/⌘T), placeholder-marker shortcut in the email preview.

### FR1 — Structure and ownership boundary

- **FR1.1** Inside `# Nächste Schritte`, an **h4 heading** separates the curated part
  (above) from the intake (below). h4 because it is one level above the dated h5 sections and
  visually quieter than h2; visible rather than a `%%` comment, because here a human clears
  across the boundary by hand.
- **FR1.2** The system writes exclusively below the boundary. The part above is never
  changed automatically.
- **FR1.3** If `# Nächste Schritte` is absent, the section is created (precedent:
  `mergeH1Section` via `createAfterHeader`). A lost action item weighs more than the
  decisions log's no-op on a missing Fakten header.
- **FR1.4** The header match tolerates both attested spellings (`# Nächste Schritte`,
  `# nächste Schritte`) via a `NEXT_STEP_HEADERS` constant, analogous to `FAKTEN_HEADERS`.

### FR2 — Entry format

- **FR2.1** An entry is a **group**: one parent bullet per source, its items as sub-bullets
  indented by 4 spaces (same look as the decisions log).
- **FR2.2** The **parent is the lifecycle unit** — never a sub-bullet. No sub-bullet carries
  its own state, its own date, or its own stop.
- **FR2.3** Besprechungen: the parent links the source note
  (`- Aus [[Besprechung X]], <date>`).
- **FR2.4** Emails: the parent anchors to the h5 section created during filing
  (`- Aus [[#E-Mail-Thread: Betreff, <date>]], <date>`) — the shape `formatVorgangBullet`
  already builds. A group **without** sub-bullets is therefore the placeholder marker.
- **FR2.5** Append-only: the system never removes from the intake automatically.

### FR3 — Inflow from Besprechungen

- **FR3.1** New setting `besprechung.nextStepHeadings: string[]`, default
  `["Nächste Schritte"]`, editable as a comma-separated field — same pattern as
  `decisionHeadings`, independent of `sectionHeadings`.
- **FR3.2** A heading listed in both fields appears twice: as the immutable protocol in the
  h5 section, and as drainable stock in the intake. Intended, not redundant.
- **FR3.3** A sub-bullet is one top-level bullet of the source; indented lines travel with
  it.
- **FR3.4** Both filing paths feed the intake: the walk ("Alle offenen ablegen") and the
  single-shot ("Aktuelle Notiz ablegen").

### FR4 — Inflow from emails

- **FR4.1** The email preview gains an input field for next steps, **empty by default**.
- **FR4.2** Empty field = **no group**. Filing therefore means "done or purely
  informational"; informational mail produces no entry.
- **FR4.3** A shortcut sets the placeholder marker (group without sub-bullets).
- **FR4.4** Applies equally to the walk and the single-shot command.

### FR5 — Owner detection

- **FR5.1** The system detects a foreign assignee on a sub-bullet (patterns such as
  `Max: …`) against the own names in `selfNameStopwords`.
- **FR5.2** Effect: **separation in the text**. Own items stay at the top, foreign ones
  below them under an intermediate bullet ("Warte auf:").
- **FR5.3** Nothing is filtered or silently dropped — a misdetection is visible in the note
  and correctable there. That is the precondition for judging the hit rate in daily use.

### FR6 — Due dates and drain in the triage walk

- **FR6.1** Intake groups are a **third stop type** alongside reminder and task.
- **FR6.2** Order: reminders → intake → tasks (cheap before expensive; process the inflow,
  then work).
- **FR6.3** Due semantics as for a reminder: dateless = due now, snooze writes a date suffix
  onto the **parent** line (last `", "` segment). Reuses `selectDueReminders`,
  `rescheduleReminderLine`, `removeReminderLine`, `snoozeDate`.
- **FR6.4** ⌘D takes the group over into the curated part, ⌘X discards it, ⌘1/⌘2/⌘3/⌘T
  postpone it.
- **FR6.5** A further key opens a **selection with checkboxes** per item. The selection is
  one-off: it decides what travels, after which the group is gone as a whole.
- **FR6.6** Selection excludes notes carrying `doneTag` and filters via
  `metadataCache.getFileCache().headings` on the boundary heading, rather than reading every
  section note.

### FR7 — Display

- **FR7.1** `buildTriagePreview` includes `# Nächste Schritte`, curated part and intake
  visibly separated.
- **FR7.2** The intake stop shows the curated part alongside — without it, the duplicate
  check at the moment of decision is impossible (see non-goal 1).

### FR8 — Interactions

- **FR8.1** `vorgang-merge` carries the source's intake into the target's intake. Without
  that it would stay behind in the stub — silent loss of open items, because the h4 boundary
  cuts `sliceSectionBody` short.
- **FR8.2** `vorgang-close` warns on a non-empty intake instead of closing it over in
  silence.

## Constraints

### Prerequisite

The merge defect uncovered during design is fixed **beforehand as its own `fix` commit**,
before the feature starts: `sliceSectionBody` compares exactly (`l.trim() === header`), both
spellings exist side by side in the repo (`examples/new/example-new-vorgang.md:13`
lowercase, `example-new-bestellung.md:17` capitalised), so `vorgang-merge` already skips the
Nächste-Schritte body of every lowercase note today. No test covers it. Sequence: regression
test red, then `NEXT_STEP_HEADERS`, then green — bisectable and valuable on its own.

### Technical

- TypeScript strict, no `any`, explicit return types on exports.
- Feature pattern: new logic goes into `<name>-engine.ts` (pure, no Obsidian imports), not
  into the feature classes.
- Vitest; baseline 760 tests across 162 files, green. Coverage thresholds in
  `vitest.config.ts` (lines/functions 80, branches 70) — line coverage currently sits at
  66.44 %.
- Task stops require TaskNotes ≥ 4.10.0; intake and reminder stops do not.
- Obsidian desktop-only; the email side is macOS / Apple Mail.

### Product

- UI, notices, and settings are German throughout; section names are German.
- Command naming convention `<Domänen-Präfix>: <Verbphrase>`; command ids never change.
- No PII in tests, fixtures, docs, or source — fictional placeholders (`Max Mustermann`,
  `Acme`, `Musterstadt`, `example.com`). The user's own name is a setting, never a constant.
- Distribution via BRAT; release via `just release <version>`.

## Open Decisions

1. **Wording of the boundary and the parent prefix.** The h4 heading ("Eingang"?) and the
   parent prefix ("Aus …"?) are not settled; both appear in every Vorgang note and should fit
   the established vocabulary.
2. **Home of `selfNameStopwords`.** Reuse under `besprechung.*` or promote to the global
   level like `doneTag` — three features will read the setting from now on.
3. **Cut of the implementation.** One SDD in phases (structure + inflow / walk stop / owner
   separation) or several separate SDDs. Belongs at the start of `/sdd-create`.

## References

- `specs/done/sdd/besprechung-entscheidungen-2026-08-15.md` — closest relative: routes
  extractions from Besprechungen into a state area of the Vorgang. Its append-only log is
  deliberately **not** the model here (monotonic vs. non-monotonic).
- `specs/done/sdd/tasknotes-triage-walk-2026-07-02.md` and
  `erinnerungen-triage-2026-07-02.md` — the walk mechanics and the precedent for a second
  stop type.
- `specs/done/sdd/vorgang-merge-2026-07-05.md` — affected via FR8.1.
- Müslidian (`~/Documents/src/obsidian-mueslidian`) — the ownership contract between plugin
  and user as the model; invisible markers there because an automaton replaces the block,
  a visible boundary here because a human clears it.
