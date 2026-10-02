# SDD: Office Previews — Automatic Embedding

Status: Ready for Implementation
Original: specs/sdd/office-previews-auto-embed.md
Refined: 2026-10-02
Base: specs/done/sdd/office-previews-2026-10-02.md

## Overview

Office previews today reach a note only after a drag & drop; every other preview has to be embedded by hand, so in a vault of ~930 documents the feature shows nothing where the user reads (live test in `Lu`, 2026-10-02). This delta embeds every preview automatically into every note that links its document — after drops, after "render now", after background renders and for placeholders — while the base's guarantees (marker ownership, no locks across Macs, source documents untouched) stay as they are. Existing previews are backfilled by an explicit command run on one Mac.

## Context & Constraints

- Everything in the base SDD's Context & Constraints still holds (TypeScript strict, feature module pattern, German UI / English logs, no PII in tests, Obsidian Sync with several Macs, `isDesktopOnly`).
- Built state this delta starts from (release v1.25.0, plus local-only commits): placeholders on failed renders (`writePlaceholder`, marker `placeholder: true`), render-now from the file explorer's context menu and from the active preview image, render-now result Notices, lock files ignored, emptied mirror folders removed via `removeEmptyDir` (`fs.rmdir`).
- This work ships as v1.26.0.
- Obsidian realities measured live (2026-10-02, `obsidian-cli eval`): `vault.process` / `editor.transaction` are the write paths (base req 26); `metadataCache.resolvedLinks[note][target]` lists every resolved link — embed or plain link — from a note to a file; Obsidian Sync merges concurrent edits of one Markdown file, so two devices inserting the same embed can leave it twice.
- Operator decisions (2026-10-02), not to be reopened: (1) all linking notes, automatically, in the background, no confirmation step; (2) only the Mac that rendered (or placeholdered) a preview edits notes; (3) several documents on one line → one embed line per document below it; (4) placeholders are embedded too; (5) existing lines are not rewritten — no `![[x.docx]]` → `[[x.docx]]` conversion outside the drop path; (6) existing previews are backfilled by an explicit command run on one Mac, new renders embed automatically; (7) links added later are not watched — re-running the backfill command covers them; (8) embed lines of deleted documents stay in the notes.

## Architecture

```
run() ──(this device wrote a preview or a placeholder)──> AutoEmbed.embedEverywhere(source, previewFile)
                                                              │
                         metadataCache.resolvedLinks ─────────┤ notes linking the source (embed or link)
                                                              │
                  one feature-wide promise chain (all AutoEmbed note writes, all sources)
                                                              │
                                     per note, macrotask yield between notes
                                                              │
                     planAutoEmbed(content, …) (pure) ── editor.transaction | vault.process

Backfill command ──> AutoEmbed.backfill(): marked images in the mirror folder ──> source→notes index (built once) ──> same chain
```

`DropEmbed` keeps its own flow for the note that received the drop (with the embed→link conversion). `AutoEmbed` skips any note for which `DropEmbed.isPending(notePath, sourcePath)` is true, so the drop path is the only writer for that note while its drop record is pending. When the drop record ends (embed written, or the 60 s deadline passes without a link) `AutoEmbed` does not revisit the note; the idempotence scan makes a later backfill run safe.

## Requirements

### Added

1. The system shall, whenever this device writes a preview or a placeholder for a source (base `run` success path or `writePlaceholder` returning true), insert an embed of that image into every Markdown note whose `metadataCache.resolvedLinks` entry contains the source path — embeds and plain links alike. The planner scans the note body only: it skips YAML frontmatter, fenced code blocks and inline code spans; a note whose only matching line lies in those regions yields a null plan.
2. The system shall perform these insertions only on the device that wrote the image; a device that finds a preview current, a placeholder, or receives an image through sync shall not edit notes. The sole exception is the operator-invoked backfill command (req 11).
3. The system shall insert, in each linking note, one embed line directly below the first line (from the top) holding a wikilink that resolves to the source, unless the note already contains an embed resolving to the image anywhere (idempotent; the same scan as base req 26). Wikilinks with alias or heading (`[[x.docx#h|a]]`) count as links to the source.
4. The system shall, when a line links several documents (e.g. `Anhänge: ![[a.docx]], ![[b.xlsx]], ![[c.pdf]]`), place each document's embed on its own line below that line, after the preview-embed block directly below it. The preview-embed block is the maximal run of consecutive lines each consisting solely of one embed that resolves to a file under the preview folder, regardless of which document it belongs to; a blank line or any other line ends the block. The resulting order follows the order in which the images were written.
5. The system shall not rewrite the linking line itself: `![[x.docx]]` stays an embed and a plain link stays a link (the drop path's conversion, base req 25, is unchanged and applies only to the drop note).
6. The system shall build the embed text as `"!" + app.fileManager.generateMarkdownLink(imageFile, notePath)` (base req 25/26) and shape the inserted line by the linking line's context:
   - plain or list line: copy the leading whitespace (tabs included), no list marker (the embed may detach from the list item);
   - blockquote/callout line (`> …`): copy the `>` prefix(es) with their spacing, so the embed stays inside the quote;
   - table row (a line whose trimmed text starts with `|`): insert after the last contiguous table row, with no prefix.
   The inserted line uses the note's EOL (`\r\n` if the note contains one, else `\n`); a note without a trailing newline keeps that property.
7. The system shall write each note through one `editor.transaction` when the note is open in a `MarkdownView`, else through `vault.process`, re-planning on the content at write time; link resolution on that fresh text goes through `app.metadataCache.getFirstLinkpathDest` (never the possibly stale `resolvedLinks`), so the harness can fake it. A note whose plan comes out empty is left byte-identical, with no write call.
8. The system shall process linking notes one at a time with a macrotask yield between notes, skip notes below the preview folder, and stop on `disposed` or when `officePreviews.enabled` is false (read before each note write; no further live-toggle mechanism).
9. The system shall embed placeholders exactly like previews. When a later successful render replaces a placeholder at the same mirror path (same extension), the existing embeds stay valid and no note edit happens. When the replacement has a different extension (PNG placeholder → JPG render for pptx/ppt/key, or a rename that changes the image type, base req 14), it counts as a new write: the new image is embedded through the normal path, and the old embed that no longer resolves stays (decision 8).
10. The system shall not emit a Notice for automatic embedding; console lines stay English and path-free (base req 34).
11. The system shall register the command "Office-Vorschauen: Fehlende Einbettungen ergänzen" (id `office-previews-embed-missing`) that, on the invoking device only:
    - iterates every image file under the preview folder whose `readMarker` is valid (marker-less files are skipped, base ownership rule), placeholders included;
    - derives each source path from the mirror path (strip folder prefix and image extension);
    - processes the images in ascending mirror-path order, so the order of embeds below a multi-document line is deterministic (it equals the write order of req 4);
    - builds the source→linking-notes inverted index from `metadataCache.resolvedLinks` once per run;
    - embeds through the same planner and write chain as req 1–8, skipping notes with a pending drop record;
    - ends with one summary Notice `Einbettungen ergänzt: X in Y Notizen` (X embeds inserted, Y notes changed);
    - rejects re-entry while a run is active (Notice `Einbettung läuft bereits.`), does nothing when the feature is disabled, and stops on dispose.
12. The system shall serialize all AutoEmbed note writes (automatic and backfill, across sources) on one feature-wide promise chain, so concurrent renders, or a render and a running backfill, never plan against the same note at once and write order equals render-completion order.
13. The system shall, before inserting, await the image's `TFile` via its vault `create` event (same timeout as `DropEmbed`) when `adapter.writeBinary` has not yet been indexed; on timeout it skips that source and logs one English path-free line.
14. The system shall handle a per-note failure (`vault.process` throws, note deleted or renamed between listing and write) with a try/catch, one English path-free log line (error type only), continuing with the next note and recording no failure for the source.
15. The system shall treat backfill on more than one Mac as unsupported (Sync merge may duplicate embeds); the README states this.

### Modified

- **Base req 25 (drop)** — before: "insert the preview embed … once the dropped source's preview exists"; after: unchanged for the drop note; every other note linking the dropped source is handled by Added req 1–8; the drop note is excluded from AutoEmbed while its drop record is pending (Architecture).
- **Base Overview / Out of Scope** — before: "previews of documents that arrive any other way are embedded by hand" and "Changing notes automatically, except the embed after a drag & drop"; after: notes are changed automatically by inserting embed lines below links (Added req 1–11); no other automatic note change.

### Removed

- None.

## File & Module Structure

| Path | Purpose |
|---|---|
| `src/features/office-previews/office-previews-engine.ts` | Pure `planAutoEmbed` (no conversion, insertion after the line's preview-embed block, frontmatter/code/table/quote handling, EOL, idempotence scan) |
| `src/features/office-previews/auto-embed.ts` | `AutoEmbed`: linking notes from `resolvedLinks`, feature-wide write chain, sequential insertion (editor / `vault.process`), image-`create` wait, `backfill()`, disposal/enabled guards |
| `src/features/office-previews/drop-embed.ts` | Adds `isPending(notePath, sourcePath): boolean` |
| `src/features/office-previews/office-previews-feature.ts` | Calls `AutoEmbed.embedEverywhere` after this device wrote a preview or placeholder; registers the backfill command; skips drop-pending notes |
| `tests/helpers/office-previews-harness.ts` | `metadataCache.resolvedLinks` derived from the fake vault's notes |
| `tests/unit/` and `tests/acceptance/` plus `tests/sdd_office-previews-auto-embed/…` | One file per Test Scenario (planner in unit, flows in acceptance) |
| `README.md`, `CLAUDE.md`, `TODO.md` | Document the behaviour, the backfill command and the one-Mac limitation |

## Data Models

```ts
export interface InsertionPlan {
  lineIndex: number;   // index (in the EOL-split lines) after which the embed line is inserted
  text: string;        // full inserted line, prefix included, without EOL
  newContent: string;  // content after insertion, EOL preserved
}

export type LinkResolver = (linkText: string) => boolean; // linkText = text inside [[ ]] before alias, may include #heading

export function planAutoEmbed(
  content: string,
  isSourceLink: LinkResolver,    // resolves to the source document
  isImageEmbed: LinkResolver,    // resolves to the image being embedded (idempotence); an embed of the source document itself (`![[a.docx]]`) does NOT count
  isPreviewEmbed: LinkResolver,  // resolves to any file under the preview folder (block detection)
  embedText: string,             // "!" + generateMarkdownLink(...)
): InsertionPlan | null;
```

`AutoEmbed` public surface:

```ts
embedEverywhere(sourcePath: string, image: TFile | string): Promise<void>;
backfill(): Promise<{ embeds: number; notes: number }>;
```

## API Contracts

- Obsidian: `app.metadataCache.resolvedLinks`, `app.metadataCache.getFirstLinkpathDest` (resolvers), `app.fileManager.generateMarkdownLink`, `app.vault.process`, `MarkdownView.editor.transaction`, vault `create` event.
- Internal: `DropEmbed.isPending(notePath, sourcePath)`; `readMarker` (base, never throws).

## Configuration

No new settings. Behaviour follows `officePreviews.enabled`. New command id `office-previews-embed-missing` (immutable once shipped).

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Image not indexed | `adapter.writeBinary` without `TFile` after the `DropEmbed` timeout | Skip the source, log one line | No |
| Note write fails | `vault.process` throws | try/catch per note, log error type, next note, no source failure recorded | No |
| Note gone | Deleted/renamed between listing and write | Same as above | No |
| Match only in frontmatter/code | Planner finds no body link line | Null plan, note byte-identical | No |
| Drop pending | `DropEmbed.isPending` true | Note skipped by AutoEmbed | No |
| Backfill re-entry | Command invoked while running | Reject | Notice `Einbettung läuft bereits.` |
| Disposed / disabled | Unload or `officePreviews.enabled` false mid-run | Stop before the next note | No |

## Implementation Phases

## Phase 1 — Insertion planner

**Depends on:** none

Pure `planAutoEmbed` in the engine (signature in Data Models): find the first body line linking the source, skip the whole note when an embed of the image exists anywhere, place the new embed line after the link line's preview-embed block, apply quote/table/whitespace shaping and the note's EOL, never touch the link line.

Phase complete when: all scenarios pass and `npx vitest run --coverage` reports 100% branch coverage for `planAutoEmbed`. Phase 1 is a pure function without a caller until Phase 2; it is committable on its own.

### Test Scenarios

- c1 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` and no embeds WHEN planning for `b.xlsx` THEN the line stays unchanged and `![[b.xlsx.png]]` is inserted directly below it.
- c2 GIVEN the same line followed by `![[a.docx.png]]` WHEN planning for `b.xlsx` THEN the new embed goes below `![[a.docx.png]]`.
- c3 GIVEN `see [[a.docx]] for details` WHEN planning THEN `![[a.docx.png]]` is inserted below and the line is unchanged.
- c4 GIVEN a note that already embeds the image anywhere WHEN planning THEN null.
- c5 GIVEN `  - ![[a.docx]]` WHEN planning THEN the embed line is `  ![[a.docx.png]]` and the list line is unchanged.
- c6 GIVEN no line links the source WHEN planning THEN null.
- c7 GIVEN two lines linking the source WHEN planning THEN only the first (from the top) receives an embed.
- c8 GIVEN the only link in YAML frontmatter WHEN planning THEN null; GIVEN it only in a fenced code block or inline code span THEN null.
- c9 GIVEN `> [[a.docx]]` WHEN planning THEN the inserted line is `> ![[a.docx.png]]`.
- c10 GIVEN a table row `| [[a.docx]] | x |` followed by another row and then text WHEN planning THEN the embed goes after the last contiguous table row.
- c11 GIVEN a tab-indented line and an ordered-list line `1. [[a.docx]]` WHEN planning THEN the whitespace is copied (tab / 3 spaces' worth of leading whitespace only, marker not copied).
- c12 GIVEN a CRLF note WHEN planning THEN the inserted line ends with `\r\n` and no bare `\n` appears; GIVEN a note whose link line is the last line without trailing newline THEN the result also has no trailing newline.
- c13 GIVEN an unrelated embed (not under the preview folder) directly below the link line WHEN planning THEN it is not part of the block and the new embed goes directly below the link line; GIVEN a blank line after the block THEN the block ends there.
- c14 GIVEN `[[a.docx#h|alias]]` WHEN planning THEN it counts as a link to the source.
- c15 GIVEN a note containing only `![[a.docx]]` (an embed of the source, not of the image) WHEN planning THEN a plan is returned (the source embed does not trigger idempotence).
- c16 GIVEN the c2 plan WHEN its `newContent` is re-planned for the same image THEN the result is null and the content is byte-stable (idempotence and sibling-block placement hold together).
- c17 GIVEN the link line followed by `![[unrelated.png]]` (not under the preview folder) WHEN planning for `b.xlsx` THEN the insert index is directly below the link line and the link line is byte-identical.

## Phase 2 — Automatic embedding after a render

**Depends on:** Phase 1

`AutoEmbed` wired into `run` (success and placeholder), linking notes from `resolvedLinks`, editor/`vault.process` writes through one feature-wide chain, sequential with yields, drop-pending skip via `DropEmbed.isPending`, image-`create` wait, per-note error handling, disposal and `officePreviews.enabled` guards.

Phase complete when: the harness acceptance tests cover all scenarios below. Additionally a smoke step in the test vault (`obsidian-cli`, result noted in the commit message) shows embeds appearing in two linking notes after a background render; it is manual and non-gating, the harness tests are the gate.

### Test Scenarios

- c1 GIVEN two notes linking `Angebot.docx` (one embed, one plain link) WHEN this device renders its preview THEN both notes gain `![[Angebot.docx.png]]` below the link line and neither link line changes.
- c2 GIVEN a note already embedding the preview WHEN the preview is re-rendered THEN the note is byte-identical.
- c3 GIVEN a render failure with a placeholder written THEN linking notes gain the placeholder embed; WHEN a later render of the same extension succeeds THEN no note changes again.
- c4 GIVEN another device's preview arriving via sync (create event of a marked image, no local render) THEN no note changes.
- c5 GIVEN a reconcile that finds a preview current THEN no note changes.
- c6 GIVEN a drop of `Angebot.docx` into note N while note M also links it WHEN the preview exists THEN N gets the drop result (link conversion + embed) and M gets only the embed line, each exactly once; AutoEmbed does not write N while its drop record is pending.
- c7 GIVEN an open note in the editor WHEN embedding THEN exactly one `editor.transaction`; GIVEN a closed note THEN one `vault.process`.
- c8 GIVEN 50 linking notes WHEN embedding THEN they are written one at a time with a macrotask yield between them; GIVEN unload mid-way THEN no further note is written.
- c9 GIVEN `officePreviews.enabled` set to false during embedding THEN embedding stops before the next note.
- c10 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` WHEN both previews are written THEN two embed lines follow the line, in write order.
- c11 GIVEN two renders finishing together for sources linked from the same note THEN the note writes are serialized on one chain and the note ends with both embeds, each once.
- c12 GIVEN a pptx whose placeholder (PNG) is embedded WHEN a later render writes a JPG at the changed mirror path THEN the JPG is embedded as a new line and the old line stays.
- c13 GIVEN `vault.process` throws for one note WHEN embedding THEN the remaining notes are still written, one English path-free log line is emitted, and no failure is recorded for the source.
- c14 GIVEN a note deleted between listing and write THEN it is skipped and the run continues.
- c15 GIVEN the image has no `TFile` yet WHEN its vault `create` event fires within the timeout THEN embedding proceeds; GIVEN no event by the timeout THEN the source is skipped and logged.
- c16 GIVEN a note whose content changes between listing and write WHEN embedding THEN the write re-plans on the fresh content, resolving links through `getFirstLinkpathDest`.
- c17 GIVEN a note inside the preview folder that links the source THEN it is skipped; GIVEN any embedding THEN no Notice is emitted and every log line is English and path-free.
- c18 GIVEN a note that already embeds the preview WHEN re-rendered THEN no write call (`vault.process` / `editor.transaction`) is made for it.
- c19 GIVEN the drop of c6 THEN note N is written exactly once in total (drop result only; AutoEmbed adds no second write).
- c20 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` after both previews are embedded WHEN both renders run again THEN the note is byte-identical and the embed order is unchanged (the idempotence scan is per image, not per note).

## Phase 3 — Existing previews

**Depends on:** Phase 2

Command "Office-Vorschauen: Fehlende Einbettungen ergänzen" (id `office-previews-embed-missing`, requirement 11) embeds every existing marked preview or placeholder (the ~930 in `Lu` rendered by v1.25.x) into its linking notes via the Phase 2 path; it runs only on the invoking device, builds the source→notes index once, and covers links added after a render when run again.

Phase complete when: acceptance tests cover all scenarios below. Additionally a smoke step in a generated test vault shows the command embedding every existing preview exactly once; it is manual and non-gating.

### Test Scenarios

- c1 GIVEN previews that exist from an earlier version and linking notes without embeds WHEN the backfill runs THEN every linking note gains the embed once, a second run changes nothing, and one summary Notice `Einbettungen ergänzt: X in Y Notizen` is shown.
- c2 GIVEN a note that gained a link to an already-rendered document after its render WHEN the command runs again THEN that note gains the embed and no other note changes.
- c3 GIVEN a placeholder image with a valid marker WHEN the backfill runs THEN linking notes gain its embed.
- c4 GIVEN an image in the mirror folder without a valid marker WHEN the backfill runs THEN it is skipped.
- c5 GIVEN an open linking note WHEN the backfill runs THEN exactly one `editor.transaction` writes it.
- c6 GIVEN the command invoked while a run is active THEN the second invocation is rejected with the Notice `Einbettung läuft bereits.`.
- c7 GIVEN unload mid-run THEN no further note is written; GIVEN the feature disabled THEN the command does nothing.
- c8 GIVEN 930 sources and many notes WHEN the backfill runs THEN `resolvedLinks` is indexed once (not scanned per source) and a macrotask yield separates notes.
- c9 GIVEN a note with a pending drop record for a source WHEN the backfill runs THEN that note is skipped.
- c10 GIVEN a device that wrote no image WHEN the command runs THEN it edits notes, whereas a sync arrival alone (c4 of Phase 2) does not.
- c11 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` with existing previews of both and no embeds WHEN the backfill runs THEN the embed lines follow in ascending mirror-path order (`a.docx.png`, then `b.xlsx.png`), and a second run changes nothing.
- c12 GIVEN a note N that already embeds `a.docx.png` and gains a second line linking `a.docx` WHEN the backfill runs twice THEN N is unchanged (documented limit: the per-note idempotence scan skips it, consistent with first-line-only); GIVEN a note N' with a fresh link and no embed THEN N' gains the embed once and the second run is a no-op.
- c13 GIVEN a backfill running while a render's embedding targets the same note THEN both go through the one feature-wide chain and the note ends with each embed exactly once.

## Decision Log

| Decision | Chosen | Rejected and why |
|---|---|---|
| Scope of notes | Every note linking the source, automatically (operator) | Confirmation command per batch: the operator wants no extra step |
| Which device edits | Only the device that wrote the image (operator) | Every device on sight of a preview: Obsidian Sync merges concurrent Markdown edits and can duplicate embeds |
| Several documents per line | One embed line per document below the line (operator) | One combined line of embeds: less readable, harder to keep idempotent per document |
| Placeholders | Embedded like previews (operator) | Only real previews: a failed document would stay invisible in the note |
| Rewriting links | Never outside the drop path (operator) | Converting every `![[x.docx]]` to `[[x.docx]]`: changes hundreds of user lines; email filing writes embeds on purpose; would defeat an Office-viewer plugin |
| Backfill of existing previews | Explicit command on one Mac; new renders embed automatically (operator) | Reconcile embeds automatically on every device holding the fingerprint: several Macs qualify, contradicting the single-editor decision |
| Links added later | Not watched; re-running the backfill command covers them (operator) | Embedding on note `modify`: turns the feature into editing-time automation on every note change |
| Deleted documents | Embed lines stay (operator) | Removing LuKit-inserted lines: automatic line deletion, a misrecognised line is data loss |
| Only the first matching line per note | Embed below the first body line from the top | Every matching line: contradicts base req 25 |
| Frontmatter / code matches | Planner scans body only, skips frontmatter, fenced and inline code | Plain line scan: could corrupt YAML or match non-links |
| Quote / table / list context | `>` prefix copied; table → after last contiguous row; list → whitespace only, may detach | Splitting a table or leaving a callout |
| PNG placeholder → JPG render | Counts as a new write, new embed, old broken embed stays | Placeholders using the real extension: not required; old-embed removal contradicts decision 8 |
| Drop vs AutoEmbed ordering | AutoEmbed skips notes with a pending drop record (`DropEmbed.isPending`), no revisit at the 60 s deadline | Relying on run order: DropEmbed waits for Obsidian to write the link, so it is a race |
| Write serialization | One feature-wide promise chain | Per-call sequencing: concurrent renders would plan against the same note |
| Block detection | Maximal run of lines each solely an embed of a file under the preview folder | Same-line-document matching: not decidable in the pure planner |
| Backfill source derivation | From mirror path of marker-valid images; `resolvedLinks` indexed once | Per-source scan of `resolvedLinks`: O(sources × notes) |
| Backfill on several Macs | Unsupported, stated in README | Guarding in code: no cross-Mac state exists (base: no locks) |
| Backfill order | Ascending mirror-path order, so multi-document line order is deterministic | Undefined or shuffled order: the order below a multi-document line would not be testable |
| Later link in a note that already embeds the image | Not embedded (per-note idempotence, first-line-only); documented limit, no operator decision touched | Per-line idempotence: contradicts base req 25 and would stack embeds |
| Rescan on re-render | Accepted: a re-render rescans its linking notes; the idempotence scan makes it a no-op | Caching per-note state: not required |

## Open Decisions

None.

## Unresolved Gaps

- Notes in a templates folder may receive embeds; no exclusion was specified.

## Out of Scope

- Converting existing links or embeds (`![[x.docx]]` ↔ `[[x.docx]]`) outside the drop note.
- Markdown-style links (`[x](Angebot.docx)`) — base Out of Scope still applies.
- A per-feature toggle for automatic embedding; it follows `officePreviews.enabled`.
- Notices for background embedding (the backfill command's summary Notice is the only one).
- Embedding on note edits (links added after a render); the backfill command covers them.
- Removing embed lines after a source is deleted.
- Rename handling beyond Obsidian's own link update (the embed follows the renamed image via `fileManager.renameFile`, base req 14).
