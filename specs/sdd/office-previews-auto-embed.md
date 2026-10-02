# SDD: Office Previews — Automatic Embedding

Status: Draft
Created: 2026-10-02
Base: specs/done/sdd/office-previews-2026-10-02.md

## Overview

Office previews today reach a note only after a drag & drop; every other preview has to be embedded by hand, so in a vault of ~930 documents the feature shows nothing where the user reads (live test in `Lu`, 2026-10-02). This delta embeds every preview automatically into every note that links its document — after drops, after "render now", after background renders and for placeholders — while the base's guarantees (marker ownership, no locks across Macs, source documents untouched) stay as they are.

## Context & Constraints

- Everything in the base SDD's Context & Constraints still holds (TypeScript strict, feature module pattern, German UI / English logs, no PII in tests, Obsidian Sync with several Macs, `isDesktopOnly`).
- Built state this delta starts from (release v1.25.0, plus local-only commits): placeholders on failed renders (`writePlaceholder`, marker `placeholder: true`), render-now from the file explorer's context menu and from the active preview image, render-now result Notices, lock files ignored, emptied mirror folders removed via `removeEmptyDir` (`fs.rmdir`).
- **Repository state to repair before Phase 1** (not part of the design, recorded so the next session does it first): commit `4ba84ca` carries the render-now feedback feature under a `docs(office-previews)` subject, and the local, unpushed release commit `5a98bd3` / tag `v1.25.1` sit on top. Split `4ba84ca` into `feat(office-previews): report the result of render-now as a Notice` and `docs(office-previews): note the render-now Notices`, drop tag `v1.25.1` and the release commit (needs `git reset --soft 5560598` and `git tag -d v1.25.1`, which the operator approves or runs). This work ships as v1.26.0.
- Obsidian realities measured live (2026-10-02, `obsidian-cli eval`): `vault.process` / `editor.transaction` are the write paths (base req 26); `metadataCache.resolvedLinks[note][target]` lists every resolved link — embed or plain link — from a note to a file; Obsidian Sync merges concurrent edits of one Markdown file, so two devices inserting the same embed can leave it twice.
- Operator decisions (2026-10-02): (1) all linking notes, automatically, in the background, no confirmation step; (2) only the Mac that rendered (or placeholdered) a preview edits notes; (3) several documents on one line → one embed line per document below it; (4) placeholders are embedded too; (5) existing lines are not rewritten — no `![[x.docx]]` → `[[x.docx]]` conversion outside the drop path.

## Architecture

```
run() ──(this device wrote a preview or a placeholder)──> AutoEmbed.embedEverywhere(source, previewFile)
                                                              │
                         metadataCache.resolvedLinks ─────────┤ notes linking the source (embed or link)
                                                              │
                                     per note, one at a time, macrotask yield between notes
                                                              │
                     planAutoEmbed(content, …) (pure) ── editor.transaction | vault.process
```

`DropEmbed` keeps its own flow for the note that received the drop (with the embed→link conversion); `AutoEmbed` covers every other linking note and runs after it, so the drop note is already satisfied and skipped as idempotent.

## Requirements

### Added

1. The system shall, whenever this device writes a preview or a placeholder for a source (base `run` success path or `writePlaceholder` returning true), insert an embed of that image into every Markdown note whose `metadataCache.resolvedLinks` entry contains the source path — embeds and plain links alike, in any part of the note.
2. The system shall perform these insertions only on the device that wrote the image; a device that finds a preview current, a placeholder, or receives an image through sync shall not edit notes.
3. The system shall insert, in each linking note, one embed line directly below every line that holds a wikilink resolving to the source, unless the note already contains an embed resolving to the image anywhere (idempotent; the same scan as base req 26). Only the first matching line per note receives the embed (consistent with base req 25).
4. The system shall, when a line links several documents (e.g. the email-filing line `Anhänge: ![[a.docx]], ![[b.xlsx]], ![[c.pdf]]`), place each document's embed on its own line below that line, after any embed lines already directly below it that resolve to previews or placeholders of documents linked on the same line; the resulting order follows the order in which the images were written.
5. The system shall not rewrite the linking line itself: `![[x.docx]]` stays an embed and a plain link stays a link (the drop path's conversion, base req 25, is unchanged and applies only to the drop note).
6. The system shall copy the linking line's leading whitespace onto the inserted embed line without a list marker, and build the embed text as `"!" + app.fileManager.generateMarkdownLink(imageFile, notePath)` (base req 25/26).
7. The system shall write each note through one `editor.transaction` when the note is open in a `MarkdownView`, else through `vault.process`, re-planning on the content at write time; a note whose plan comes out empty is left byte-identical.
8. The system shall process linking notes one at a time with a macrotask yield between notes, skip notes below the preview folder, and stop on `disposed` or when the feature is disabled.
9. The system shall embed placeholders exactly like previews; when a later successful render replaces a placeholder at the same mirror path, the existing embeds stay valid and no further note edit happens.
10. The system shall not emit a Notice for automatic embedding; console lines stay English and path-free (base req 34).

### Modified

- **Base req 25 (drop)** — before: "insert the preview embed … once the dropped source's preview exists"; after: unchanged for the drop note; every other note linking the dropped source is handled by Added req 1–8 after the drop note.
- **Base Overview / Out of Scope** — before: "previews of documents that arrive any other way are embedded by hand" and "Changing notes automatically, except the embed after a drag & drop"; after: notes are changed automatically by inserting embed lines below links (Added req 1–9); no other automatic note change.

### Removed

- None.

## File & Module Structure

| Path | Purpose |
|---|---|
| `src/features/office-previews/office-previews-engine.ts` | Pure `planAutoEmbed(content, isSourceLink, isImageEmbed, embedText): InsertionPlan \| null` (no conversion, insertion after the line's existing preview-embed block, idempotence scan) |
| `src/features/office-previews/auto-embed.ts` | `AutoEmbed`: linking notes from `resolvedLinks`, sequential insertion (editor / `vault.process`), disposal guard |
| `src/features/office-previews/office-previews-feature.ts` | Calls `AutoEmbed` after this device wrote a preview or placeholder; ordering after `DropEmbed` |
| `tests/helpers/office-previews-harness.ts` | `metadataCache.resolvedLinks` derived from the fake vault's notes |
| `tests/sdd_office-previews-auto-embed/…` | One file per Test Scenario |
| `README.md`, `CLAUDE.md`, `TODO.md` | Document the behaviour |

## Implementation Phases

## Phase 1 — Insertion planner

**Depends on:** none

Pure `planAutoEmbed` in the engine: find the first line linking the source, skip the whole note when an embed of the image exists anywhere, place the new embed line after the link line's block of directly following image-embed lines, copy indentation, never touch the link line.

Phase complete when: the planner's scenarios pass with full branch coverage.

### Test Scenarios

- c1 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` and no embeds WHEN planning for `b.xlsx` THEN the line stays unchanged and `![[b.xlsx.png]]` is inserted directly below it.
- c2 GIVEN the same line followed by `![[a.docx.png]]` WHEN planning for `b.xlsx` THEN the new embed goes below `![[a.docx.png]]`.
- c3 GIVEN `see [[a.docx]] for details` WHEN planning THEN `![[a.docx.png]]` is inserted below and the line is unchanged.
- c4 GIVEN a note that already embeds the image anywhere WHEN planning THEN null.
- c5 GIVEN `  - ![[a.docx]]` WHEN planning THEN the embed line is `  ![[a.docx.png]]` and the list line is unchanged.
- c6 GIVEN no line links the source WHEN planning THEN null.

## Phase 2 — Automatic embedding after a render

**Depends on:** Phase 1

`AutoEmbed` wired into `run` (success and placeholder), linking notes from `resolvedLinks`, editor/`vault.process` writes, sequential with yields, drop note first via `DropEmbed`, disposal and disable guards.

Phase complete when: acceptance tests through the harness cover all scenarios below and a live check in the test vault (obsidian-cli) shows embeds appearing in two linking notes after a background render.

### Test Scenarios

- c1 GIVEN two notes linking `Angebot.docx` (one embed, one plain link) WHEN this device renders its preview THEN both notes gain `![[Angebot.docx.png]]` below the link line and neither link line changes.
- c2 GIVEN a note already embedding the preview WHEN the preview is re-rendered THEN the note is byte-identical.
- c3 GIVEN a render failure with a placeholder written THEN linking notes gain the placeholder embed; WHEN a later render succeeds THEN no note changes again.
- c4 GIVEN another device's preview arriving via sync (create event of a marked image, no local render) THEN no note changes.
- c5 GIVEN a reconcile that finds a preview current THEN no note changes.
- c6 GIVEN a drop of `Angebot.docx` into note N while note M also links it WHEN the preview exists THEN N gets the drop result (link conversion + embed) and M gets only the embed line, each exactly once.
- c7 GIVEN an open note in the editor WHEN embedding THEN exactly one `editor.transaction`; GIVEN a closed note THEN one `vault.process`.
- c8 GIVEN 50 linking notes WHEN embedding THEN they are written one at a time with a macrotask yield between them; GIVEN unload mid-way THEN no further note is written.
- c9 GIVEN the feature disabled during embedding THEN embedding stops.
- c10 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` WHEN both previews are written THEN two embed lines follow the line, in write order.

## Phase 3 — Existing previews

**Depends on:** Phase 2

Embedding for previews that already exist without embeds (the ~930 in `Lu` rendered by v1.25.x), per the answer to Open Decision 1.

Phase complete when: the chosen backfill path embeds every existing preview into its linking notes exactly once, verified live in a copy-free test vault and by an acceptance test.

### Test Scenarios

- c1 GIVEN previews that exist from an earlier version and linking notes without embeds WHEN the backfill runs THEN every linking note gains the embed once, and a second run changes nothing.
- c2 GIVEN two devices WHEN the backfill runs THEN only the device the decision designates edits notes.

## Decision Log

| Decision | Chosen | Rejected and why |
|---|---|---|
| Scope of notes | Every note linking the source, automatically (operator) | Confirmation command per batch: the operator wants no extra step |
| Which device edits | Only the device that wrote the image (operator) | Every device on sight of a preview: Obsidian Sync merges concurrent Markdown edits and can duplicate embeds |
| Several documents per line | One embed line per document below the line (operator) | One combined line of embeds: less readable, harder to keep idempotent per document |
| Placeholders | Embedded like previews (operator) | Only real previews: a failed document would stay invisible in the note |
| Rewriting links | Never outside the drop path (operator) | Converting every `![[x.docx]]` to `[[x.docx]]`: changes hundreds of user lines; email filing writes embeds on purpose; would defeat an Office-viewer plugin |

## Open Decisions

1. **Backfill of previews that already exist.** v1.25.x rendered previews in `Lu` without embedding them, and no device recorded which images it wrote. Options: (a) a command "Office-Vorschauen: Fehlende Einbettungen ergänzen" run once on one Mac — explicit, single editor, no sync race; (b) the reconcile embeds every current preview on the device whose device cache holds that source's fingerprint — automatic, but every Mac that hashed the source qualifies, so two Macs may both edit; (c) both: the command for the existing stock, automatic only for new renders. Impact: (b) contradicts decision 2 for the existing stock; (a)/(c) need one manual action.
2. **Links added later.** When a note gains a link to a document whose preview already exists (e.g. a new note referencing an old file), should the embed follow automatically? Options: (a) yes — on note `modify`, for new links to sources with an image, on the device where the edit happened; (b) no — only renders trigger embedding, and Open Decision 1's command covers later links when run again. Impact: (a) widens the feature into editing-time automation on every note change; (b) leaves such notes without an embed until the next render of that document.
3. **Deleted documents.** When a source is deleted, its marked preview is deleted (base req 15) and the inserted embed lines become broken. Options: (a) remove embed lines LuKit inserted (it would need to recognise them — e.g. the exact embed text below a link line); (b) leave them, as today. Impact: (a) adds automatic deletion of note lines; (b) leaves broken embeds after deletions.

## Out of Scope

- Converting existing links or embeds (`![[x.docx]]` ↔ `[[x.docx]]`) outside the drop note.
- Markdown-style links (`[x](Angebot.docx)`) — base Out of Scope still applies.
- A per-feature toggle for automatic embedding; it follows `officePreviews.enabled`.
- Notices for background embedding.
- Rename handling beyond Obsidian's own link update (the embed follows the renamed image via `fileManager.renameFile`, base req 14).
