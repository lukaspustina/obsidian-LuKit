# SDD: Office Previews — Automatic Embedding

Status: Done
Finished: 2026-10-05
Original: specs/sdd/office-previews-auto-embed.md
Refined: 2026-10-02
Base: specs/done/sdd/office-previews-2026-10-02.md

## Overview

Office previews today reach a note only after a drag & drop; every other preview has to be embedded by hand, so in a vault of ~930 documents the feature shows nothing where the user reads (live test in `Lu`, 2026-10-02). This delta embeds every preview automatically into every note that links its document — after drops, after "render now", after background renders and for placeholders — while the base's guarantees (marker ownership, no locks across Macs, source documents untouched) stay as they are. Existing previews are backfilled by an explicit command run on one Mac.

## Context & Constraints

- Everything in the base SDD's Context & Constraints still holds (TypeScript strict, no `any`, feature module pattern, German UI / English logs, no PII in tests, Obsidian Sync with several Macs, `isDesktopOnly`, macOS only).
- Built state this delta starts from (release v1.25.0, plus local-only commits): placeholders on failed renders (`writePlaceholder`, marker `placeholder: true`), render-now from the file explorer's context menu and from the active preview image, render-now result Notices, lock files ignored, emptied mirror folders removed via `removeEmptyDir` (`fs.rmdir`). Existing: `DropEmbed.isPending(sourcePath)` (`drop-embed.ts:70`), `InsertionPlan { lineIndex; replacement }` and `planPreviewInsertion` (`office-previews-engine.ts:42`, 292-306), `WIKILINK_RE` (engine:274), `sourceForPreview` (engine:72), `isSource`/`normalizePreviewFolder` (engine:54), `PreviewStore.inspect`, `DROP_EMBED_DEADLINE_MS` (60 s), `NOTICE_DISABLED`, `DropEmbedDeps`, single-worker `PreviewQueue`.
- This work ships as v1.26.0.
- Obsidian realities measured live (2026-10-02, `obsidian-cli eval`): `vault.process` / `editor.transaction` are the write paths (base req 26); `metadataCache.resolvedLinks[note][target]` lists every resolved link — embed or plain link — from a note to a file (resolved targets only); Obsidian Sync merges concurrent edits of one Markdown file, so two devices inserting the same embed can leave it twice.
- Operator decisions (2026-10-02), not to be reopened: (1) all linking notes, automatically, in the background, no confirmation step; (2) only the Mac that rendered (or placeholdered) a preview edits notes; (3) several documents on one line → one embed line per document below it; (4) placeholders are embedded too; (5) existing lines are not rewritten — no `![[x.docx]]` → `[[x.docx]]` conversion outside the drop path; (6) existing previews are backfilled by an explicit command run on one Mac, new renders embed automatically; (7) links added later are not watched — re-running the backfill command covers them; (8) embed lines of deleted documents stay in the notes.

## Architecture

```
run() ──(this device wrote a preview or a placeholder)──> AutoEmbed.embedEverywhere(source, mirrorPath)   [enqueues, returns at once; run never awaits the pass]
                                                              │
   per source, before entering the chain: await the image TFile (vault `create`, DROP_EMBED_DEADLINE_MS)
                                                              │
                         metadataCache.resolvedLinks ─────────┤ notes linking the source (embed or link)
                                                              │
                  one feature-wide promise chain (all AutoEmbed note writes, all sources; order = chain-entry order)
                                                              │
        per note: macrotask yield (deps.setTimeout(r, 0)), re-resolve image from mirrorPath, then
        planAutoEmbed(content, …) (pure) ── editor.transaction (open note) | vault.process (closed note)

Backfill command ──> AutoEmbed.backfill(): marked images in the mirror folder (ascending mirror path) ──> source→notes index (built once) ──> same chain
```

- `DropEmbed` keeps its own flow for the note that received the drop (with the embed→link conversion). `AutoEmbed` skips a note when `DropEmbed.isPending(notePath, sourcePath)` is true, so the drop path is the only writer for that note while its drop record is pending. When the drop record ends (embed written, or the 60 s deadline passes without a link) `AutoEmbed` does not revisit the note; the idempotence scan makes a later backfill run safe.
- Liveness: `AutoEmbed` takes `live: () => boolean` (disposed, `officePreviews.enabled`, and the generation captured at enqueue still current — the pattern of `reconcile`'s `live()`). `stopWork()` (feature, `setEnabled(false)`) bumps the generation and clears the backfill-running flag; the chain itself is kept, so a later pass still waits for a write in flight; queued-but-not-started sources are dropped (their stale generation ends them), not resumed on re-enable.

## Requirements

### Added

1. Whenever this device writes a preview or a placeholder for a source (base `run` success path or `writePlaceholder` returning true), the system shall call `AutoEmbed.embedEverywhere(sourcePath, mirrorPath)`, which inserts an embed of that image into every Markdown note whose `metadataCache.resolvedLinks` entry contains the source path — embeds and plain links alike. `run` shall not await the pass: `embedEverywhere` enqueues on the AutoEmbed chain and returns, with an internal catch.
2. The system shall perform these insertions only on the device that wrote the image; a device that finds a preview current, a placeholder, or receives an image through sync shall not edit notes. The sole exception is the operator-invoked backfill command (req 11).
3. The planner (`planAutoEmbed`) shall scan the note body only. Skipped regions: YAML frontmatter; fenced code blocks (``` and ~~~ fences per CommonMark — an opening backtick fence's info string holds no backtick, a closing fence holds only trailing whitespace; fences inside a blockquote/callout count after stripping the `>` prefixes; a fence line may carry any leading tabs/spaces, so a fence nested in a list item is skipped too (review 2026-10-05); an unclosed fence runs to EOF); inline code spans (a backtick run closed by a backtick run of equal length; unclosed backticks are not a span). Indented code blocks, `%%comments%%`, HTML comments and math are NOT skipped. The anchor is the first body line (from the top) outside the skipped regions holding a wikilink that resolves to the source; a match inside a skipped region is ignored and the next body match is the anchor. Wikilinks with alias or heading (`[[x.docx#h|a]]`) count as links to the source; the planner strips `#heading` and `|alias` (and unescapes `\|` in table rows) before calling the resolver.
4. The planner shall return null when the note already contains, in the body outside skipped regions, an embed (`![[…]]`) resolving to the image (idempotent; scan parameterized on the image, via the shared helper of req 16). A plain link `[[x.docx.png]]` and an embed of the source document itself (`![[a.docx]]`) do not count; an embed inside a code fence does not count.
5. The insert index shall be the end of the anchor line's preview-embed block. The preview-embed block is the maximal run of consecutive lines directly after the anchor line (after the last contiguous table row for a table anchor) each consisting solely of optional leading whitespace and `>` prefixes plus one `![[…]]` (size/alias allowed, e.g. `![[x.png|200]]`) that resolves to a file under the preview folder, regardless of which document it belongs to; a blank line, any other line, or an embed that does not resolve under the preview folder (including a stale embed of a removed image) ends the block. The new embed is inserted after the block. For a line linking several documents (e.g. `Anhänge: ![[a.docx]], ![[b.xlsx]], ![[c.pdf]]`) each document's embed therefore gets its own line below, in chain-entry order.
6. The planner shall not rewrite the anchor line itself: `![[x.docx]]` stays an embed and a plain link stays a link (the drop path's conversion, base req 25, is unchanged and applies only to the drop note).
7. The system shall build the embed text as `"!" + app.fileManager.generateMarkdownLink(imageFile, notePath)` (base req 25/26) and shape the inserted line by the anchor line's context:
   - plain or list line (including ordered and task-list lines): copy the leading whitespace of the anchor line only (tabs included; continuation indentation is not computed), no list marker — a top-level `- [[a.docx]]` and `1. [[a.docx]]` therefore get a flush embed; the embed may detach from the list item;
   - blockquote/callout line (`> …`): copy the `>` prefix(es) with their spacing, so the embed stays inside the quote;
   - table row (a line whose trimmed text, after stripping `>` prefixes, starts with `|`): insert after the last contiguous table row, with no prefix — or with the `>` prefix for a table inside a blockquote.
   The `vault.process` result uses `\r\n` when the first line break in the note is CRLF, else `\n`; a note without a trailing newline keeps that property.
8. The system shall write each note through one `editor.transaction` when the note is open in a `MarkdownView` (first view showing it), else through `vault.process`, re-planning at write time on the fresh content (`editor.getValue()` for the editor path, the callback argument for `vault.process`). The editor path inserts `"\n" + text` at the end of line `lineIndex` (also when that is the last line without trailing newline; CodeMirror normalises EOL); the `vault.process` path returns `newContent`. Link resolution on the fresh text goes through `app.metadataCache.getFirstLinkpathDest` (never the possibly stale `resolvedLinks`), so the harness can fake it; if all links resolve to null (note changed since listing) the plan is null, silently. A note whose plan is null is left byte-identical, with no write call.
9. The system shall process linking notes one at a time with a macrotask yield between notes via `deps.setTimeout(r, 0)` (never `globalThis`), skip notes inside the preview folder (prefix match with trailing slash via `normalizePreviewFolder`; `_previews-notes/x.md` is not skipped for folder `_previews`), and re-check `live()` before each note write; it shall re-resolve the image `TFile` from `mirrorPath(source, folder)` before each note write and skip when the source (`sourceFile(path)`) or the mirror is gone.
10. The system shall embed placeholders exactly like previews. When a later successful render replaces a placeholder at the same mirror path (same extension), the planner's idempotence scan yields null and no note edit happens (no special-casing). When the replacement has a different extension (PNG placeholder → JPG render for pptx/ppt/key, or a rename that changes the image type, base req 14), it counts as a new write: the new image is embedded through the normal path, directly below the anchor (the stale PNG embed no longer resolves and ends the block), and the stale line stays (decision 8). An embed the user removed is re-added on the next re-render; accepted.
11. The system shall register the command "Office-Vorschauen: Fehlende Einbettungen ergänzen" (id `office-previews-embed-missing`; `CMD_*`/`NAME_*` constants, German `helpEntries()` entry, registered inside the existing platform gate) that, on the invoking device only and only after `workspace.onLayoutReady`:
    - iterates every png/jpg image under the preview folder that `PreviewStore.inspect` reports as marker-valid (marker-less files are skipped, base ownership rule), placeholders included;
    - derives each source path with `sourceForPreview(path, folder)` and skips non-sources;
    - processes the images in ascending mirror-path order (plain code-unit comparison of the path string), so the order of newly inserted embeds below a multi-document line is deterministic; embeds already present keep their place, so the order is "ascending among inserted embeds" (automatic embeds follow chain-entry order, not path order);
    - builds the source→linking-notes inverted index from `metadataCache.resolvedLinks` once per run (accepted: notes created or renamed during the run are not seen; running again covers them);
    - embeds through the same planner and write chain as req 1–9, skipping notes with a pending drop record;
    - ends with one summary Notice `Einbettungen ergänzt: X in Y Notizen` (X embeds inserted, Y notes changed; shown also for 0 and 0; not shown when the run was stopped by dispose/disable);
    - rejects re-entry while a run is active (Notice `Einbettung läuft bereits.`), shows `NOTICE_DISABLED` and does nothing when the feature is disabled, and stops on dispose.
12. The system shall serialize all AutoEmbed note writes (automatic and backfill, across sources) on one feature-wide promise chain, so concurrent renders, or a render and a running backfill, never plan against the same note at once; write order equals chain-entry order.
13. The system shall, before a source enters the chain, await the image's `TFile` via `AutoEmbed.onFileCreated(path)` (forwarded from the feature's `onCreate`, like `dropEmbed.onFileCreated`) when `adapter.writeBinary` has not yet been indexed, with deadline `DROP_EMBED_DEADLINE_MS`; one waiting source shall not block the chain; on timeout it skips that source and logs one English path-free line.
14. The system shall handle a per-note failure (`vault.process` throws, note deleted or renamed between listing and write) with a try/catch, one English path-free log line with prefix `LuKit office previews: ` (error type only), continuing with the next note and recording no failure for the source.
15. The README shall state that backfill on more than one Mac is unsupported (Sync merge may duplicate embeds). Documentation requirement, not testable.
16. `planAutoEmbed` shall reuse `WIKILINK_RE` and the idempotence scan of `planPreviewInsertion` through a small exported engine helper parameterized on the image (no second regex); the existing pins `sdd_office-previews_p4_c10..c13` stay green.
17. The system shall emit no Notice for automatic embedding; console lines stay English and path-free with prefix `LuKit office previews: ` (base req 34).
18. Wherever an embed is recognised — the idempotence scan (req 4), the preview-embed block (req 5) and the drop path's `planPreviewInsertion` — a Markdown-style embed `![alt](target)` counts like `![[…]]`: the target is URL-decoded (`%20` etc.), may be wrapped in `<…>`, and a trailing `"title"` is ignored; it resolves through the same resolver. This covers vaults with Obsidian's "Use [[Wikilinks]]" off, where `generateMarkdownLink` yields `![…](…)` and the scan would otherwise never match, stacking one embed per re-render. A link to the source itself stays wikilink-only (`[x](Angebot.docx)` is not an anchor, base Out of Scope).

### Modified

- **Base req 25 (drop)** — before: "insert the preview embed … once the dropped source's preview exists"; after: unchanged for the drop note; every other note linking the dropped source is handled by Added req 1–9; the drop note is excluded from AutoEmbed while its drop record is pending (Architecture).
- **`DropEmbed.isPending`** — before: `isPending(sourcePath)`; after: `isPending(notePath, sourcePath): boolean` returning `pending.get(sourcePath)?.notePath === notePath`; the call site in `tests/sdd_office-previews/sdd_office-previews_p4_c16_deadline.test.ts:128` is updated.
- **Base Overview / Out of Scope** — before: "previews of documents that arrive any other way are embedded by hand" and "Changing notes automatically, except the embed after a drag & drop"; after: notes are changed automatically by inserting embed lines below links (Added req 1–11); no other automatic note change.
- **`sdd_office-previews_p2_c27_help-entries.test.ts`** — before: asserts the two commands; after: asserts three (adds `office-previews-embed-missing`). README command table updated.

### Removed

- None.

## File & Module Structure

| Path | Purpose |
|---|---|
| `src/features/office-previews/office-previews-engine.ts` | Pure `planAutoEmbed`, type `AutoEmbedPlan`, exported shared scan helper (parameterized on the image) used by `planPreviewInsertion` and `planAutoEmbed` |
| `src/features/office-previews/auto-embed.ts` | `AutoEmbed`: linking notes from `resolvedLinks`, feature-wide write chain, per-note yield and image re-resolve, editor / `vault.process` writes, `onFileCreated` wait (small private method), `backfill()`, liveness |
| `src/features/office-previews/drop-embed.ts` | Modifies `isPending(notePath, sourcePath)` |
| `src/features/office-previews/office-previews-feature.ts` | Constructs `AutoEmbed`, calls `embedEverywhere` after this device wrote a preview or placeholder, forwards `onCreate` to `AutoEmbed.onFileCreated`, `stopWork()` resets AutoEmbed, registers the backfill command (platform gate, `helpEntries()`) |
| `tests/helpers/office-previews-harness.ts` | Extensions listed in Phase 2 |
| `tests/sdd_office-previews-auto-embed/sdd_office-previews-auto-embed_p<N>_c<M>_<slug>.test.ts` | One file per Test Scenario (planner included); no `tests/acceptance` |
| `tests/sdd_office-previews/sdd_office-previews_p4_c16_deadline.test.ts`, `…_p2_c27_help-entries.test.ts` | Updated per Modified |
| `README.md`, `CLAUDE.md`, `TODO.md` | Document the behaviour, the backfill command, the one-Mac limitation (req 15), the accepted limits in the Decision Log |

## Data Models

```ts
// engine; distinct from the existing InsertionPlan { lineIndex; replacement }
export interface AutoEmbedPlan {
  lineIndex: number;   // index (in the EOL-split lines) after which the embed line is inserted
  text: string;        // full inserted line, prefix included, without EOL
  newContent: string;  // content after insertion, note's EOL rule of req 7 (used by vault.process only)
}

// linkPath = text of the wikilink with #heading and |alias already stripped and `\|` unescaped by the planner
export type LinkResolver = (linkPath: string) => boolean;

export function planAutoEmbed(
  content: string,
  isSourceLink: LinkResolver,    // resolves to the source document
  isImageEmbed: LinkResolver,    // resolves to the image being embedded (idempotence); an embed of the source document itself does NOT count
  isPreviewEmbed: LinkResolver,  // resolves to any file under the preview folder (block detection)
  embedText: string,             // "!" + generateMarkdownLink(...)
): AutoEmbedPlan | null;

// auto-embed.ts
export interface AutoEmbedOptions {
  folder: () => string;          // read lazily
  live: () => boolean;           // disposed, enabled, generation captured at enqueue
  isDropPending: (notePath: string, sourcePath: string) => boolean;
}
export class AutoEmbed {
  constructor(app: App, deps: DropEmbedDeps, options: AutoEmbedOptions);
  embedEverywhere(sourcePath: string, mirrorPath: string): Promise<void>; // enqueues, internal catch
  onFileCreated(path: string): void;
  isBackfilling(): boolean;
  // collect: the feature's marked sources in ascending mirror-path order (it owns PreviewStore); null when stopped (reset, dispose, disable)
  backfill(collect: () => Promise<string[]>): Promise<{ embeds: number; notes: number } | null>;
  reset(): void;                 // called by stopWork(): new generation (drops waiting/queued passes), chain kept, clears backfill-running flag
}
```

## API Contracts

- Obsidian: `app.metadataCache.resolvedLinks`, `app.metadataCache.getFirstLinkpathDest` (resolvers), `app.fileManager.generateMarkdownLink`, `app.vault.process`, `MarkdownView.editor.getValue()` / `.transaction`, vault `create` event, `workspace.onLayoutReady`.
- Internal: `DropEmbed.isPending(notePath, sourcePath)`; `readMarker` (base, never throws); `PreviewStore.inspect`; `sourceForPreview`; `normalizePreviewFolder`; `deps.setTimeout`.

## Configuration

No new settings. Behaviour follows `officePreviews.enabled`. New command id `office-previews-embed-missing` (immutable once shipped).

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Image not indexed | `adapter.writeBinary` without `TFile` after `DROP_EMBED_DEADLINE_MS` | Skip the source, log one line; other sources not blocked | No |
| Note write fails | `vault.process` throws | try/catch per note, log error type, next note, no source failure recorded | No |
| Note gone | Deleted/renamed between listing and write | Same as above | No |
| Source or mirror gone | Source or image missing at write time (rename/delete on the lifecycle chain) | Skip the note | No |
| Links unresolved at write time | `getFirstLinkpathDest` null for all links | Null plan, note byte-identical, no log | No |
| Match only in frontmatter/code | Planner finds no body link line | Null plan, note byte-identical | No |
| Drop pending | `DropEmbed.isPending(note, source)` true | Note skipped by AutoEmbed | No |
| Backfill re-entry | Command invoked while running | Reject | Notice `Einbettung läuft bereits.` |
| Feature disabled | Backfill command invoked while disabled | Nothing happens | `NOTICE_DISABLED` |
| Disposed / disabled | Unload or `officePreviews.enabled` false (or disable→enable) mid-pass | Old pass stops before the next note, no resume | No |

## Implementation Phases

## Phase 1 — Insertion planner

**Depends on:** none

Pure `planAutoEmbed` and `AutoEmbedPlan` in the engine (signature in Data Models, requirements 3–7, 16): anchor = first body line linking the source outside skipped regions, null when an embed of the image exists in the body, insert after the anchor line's preview-embed block with quote/table/whitespace shaping and the note's EOL, never touch the anchor line.

Phase complete when: all scenarios pass, `npm run test` is green including `sdd_office-previews_p4_c10..c13`, and `npx vitest run --coverage --coverage.include=src/features/office-previews/office-previews-engine.ts` shows 100% branch coverage for the lines of `planAutoEmbed` and its new helper (v8 reports per file; the file holds other functions, judged by these). Committable on its own (no caller until Phase 2).

### Test Scenarios

- c1 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` and no embeds WHEN planning for `b.xlsx` THEN `lineIndex` is 0, `text` is `![[b.xlsx.png]]` and line 0 is byte-identical in `newContent`.
- c2 GIVEN the same line followed by `![[a.docx.png]]` WHEN planning for `b.xlsx` THEN `lineIndex` is 1.
- c3 GIVEN `see [[a.docx]] for details` WHEN planning THEN `![[a.docx.png]]` is inserted below and the line is unchanged.
- c4 GIVEN a note that already embeds the image in the body WHEN planning THEN null; GIVEN it only contains `[[a.docx.png]]` (plain link) or `![[a.docx.png]]` only inside a fenced block plus a body link to the source THEN a plan is returned.
- c5 GIVEN `  - ![[a.docx]]` WHEN planning THEN `text` is `  ![[a.docx.png]]` and the list line is unchanged.
- c6 GIVEN no line links the source WHEN planning THEN null.
- c7 GIVEN two lines linking the source WHEN planning THEN only the first (from the top) receives an embed.
- c8 GIVEN the only link in YAML frontmatter WHEN planning THEN null; GIVEN it only in a ``` fence, a ~~~ fence, an unclosed fence, or an inline code span (single and double backtick) THEN null.
- c9 GIVEN the link in frontmatter and again in the body WHEN planning THEN the body line is the anchor.
- c10 GIVEN `> [[a.docx]]` WHEN planning THEN `text` is `> ![[a.docx.png]]`; GIVEN `> ![[a.docx.png]]` directly below `> [[b.xlsx]]`-style anchor with another preview embed in the quote THEN the quoted preview-embed block is recognised and the new line goes after it.
- c11 GIVEN a table row `| [[a.docx]] | x |` followed by another row then text WHEN planning THEN `lineIndex` is the second row and `text` has no prefix; GIVEN a preview embed directly after that last row THEN the new line goes after that embed.
- c12 GIVEN `\t[[a.docx]]` THEN `text` is `\t![[a.docx.png]]`; GIVEN `1. [[a.docx]]` THEN `text` is `![[a.docx.png]]`; GIVEN `- [[a.docx]]` THEN `text` is `![[a.docx.png]]`.
- c13 GIVEN a CRLF note (first line break CRLF) WHEN planning THEN every inserted EOL in `newContent` is `\r\n` and no bare `\n` appears; GIVEN a note whose anchor is the last line without trailing newline THEN `newContent` has no trailing newline.
- c14 GIVEN an unrelated embed (not under the preview folder) directly below the anchor WHEN planning THEN it is not part of the block, `lineIndex` is the anchor line and the anchor is byte-identical; GIVEN a blank line after the block THEN the block ends there; GIVEN a block line `![[x.png|200]]` under the preview folder THEN it belongs to the block.
- c15 GIVEN `[[a.docx#h|alias]]` WHEN planning THEN it counts as a link to the source; GIVEN a table row with `[[a.docx\|alias]]` THEN the resolver receives `a.docx` and it counts.
- c16 GIVEN a note containing only `![[a.docx]]` (an embed of the source) WHEN planning THEN a plan is returned.
- c17 GIVEN the c2 plan WHEN its `newContent` is re-planned for the same image THEN null and byte-stable; the same for the table (c11), quote (c10) and CRLF (c13) shapes.
- c18 GIVEN a note `![[a.docx]]` WHEN planned and the result re-planned THEN a plan first, then null (source embed does not count, image embed does).

## Phase 2 — Automatic embedding after a render

**Depends on:** Phase 1

Start with a preparatory commit inside this phase: `DropEmbed.isPending(notePath, sourcePath)` plus the p4_c16 call-site update, suite green. Then `AutoEmbed` (Data Models) wired into `run` (success and placeholder) and `onCreate`, `stopWork()` reset, linking notes from `resolvedLinks`, editor/`vault.process` writes through one feature-wide chain, sequential with yields, drop-pending skip, image-`create` wait, image re-resolve, per-note error handling, `live()` guards.

Harness extensions in `tests/helpers/office-previews-harness.ts` (exact list): `metadataCache.resolvedLinks` as a live, access-counting getter computed from `.md` entries via the existing `getFirstLinkpathDest`, with a freeze option (for "content changed / note deleted between listing and write"); an option to defer the vault `create` emit for a written mirror path; `vault.process` failure injection via `mockRejectedValueOnce`; sync arrival via `addSource` with marker PNG bytes (`writeMarkerPng`), no new API. `h.settle()` advances only 20 rounds — tests with 50+ notes use `h.advance` or more rounds.

Phase complete when: all scenarios below pass and the full `npm run test` is green including the updated `sdd_office-previews_p2_c27` and `p4_c16`. Additionally a manual, non-gating smoke step in the test vault (`obsidian-cli`, result noted in the commit message) shows embeds appearing in two linking notes after a background render.

### Test Scenarios

- c1 GIVEN two notes linking `Angebot.docx` (one embed, one plain link) WHEN this device renders its preview THEN both notes gain `![[Angebot.docx.png]]` below the link line and neither link line changes.
- c2 GIVEN a note already embedding the preview WHEN the preview is re-rendered THEN zero `vault.process` / `editor.transaction` calls for it and it is byte-identical.
- c3 GIVEN a render failure with a placeholder written THEN linking notes gain the placeholder embed; WHEN a later render of the same extension succeeds THEN no note write happens.
- c4 GIVEN a marked PNG arriving via `addSource` (sync arrival, no local render) THEN no note write.
- c5 GIVEN a reconcile that finds a preview current THEN no note write.
- c6 GIVEN a drop of `Angebot.docx` into note N while note M also links it WHEN the preview exists THEN N gets the drop result (link conversion + embed) and M gets only the embed line, each exactly once; `isPending(N, s)` is true and `isPending(M, s)` false while the record is pending; AutoEmbed does not write N in that time and N is written exactly once in total.
- c7 GIVEN an open note in the editor WHEN embedding THEN exactly one `editor.transaction` and zero `vault.process`; GIVEN a closed note THEN one `vault.process` and zero `editor.transaction`.
- c8 GIVEN 50 linking notes WHEN embedding THEN notes are written one at a time and the injected `deps.setTimeout(_, 0)` is called at least 49 times between writes; GIVEN unload mid-way THEN no further note is written.
- c9 GIVEN `officePreviews.enabled` set to false during embedding THEN embedding stops before the next note; GIVEN disable then enable mid-pass THEN the old pass writes no further note.
- c10 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` WHEN both previews are written (a first) THEN two embed lines follow the line in write order.
- c11 GIVEN two renders enqueued for sources linked from the same note THEN `run` returns before embedding finishes, the note writes are serialized on one chain and the note ends with both embeds, each once, in enqueue order.
- c12 GIVEN a pptx whose placeholder (PNG) is embedded WHEN a later render writes a JPG at the changed mirror path THEN the JPG embed is directly below the link line and the stale PNG line stays below it; WHEN a second render follows THEN the note is unchanged.
- c13 GIVEN `vault.process` rejects for one note WHEN embedding THEN the remaining notes are still written, one English path-free log line with prefix `LuKit office previews: ` is emitted, and no failure is recorded for the source.
- c14 GIVEN a note deleted between listing and write (frozen listing) THEN it is skipped and the run continues.
- c15 GIVEN the image has no `TFile` yet WHEN its vault `create` event fires within `DROP_EMBED_DEADLINE_MS` THEN embedding proceeds; GIVEN no event by the deadline THEN the source is skipped, one line is logged, and another source's embedding is not blocked.
- c16 GIVEN a note whose content changes between listing and write WHEN embedding THEN the write re-plans on the fresh content, resolving links through `getFirstLinkpathDest`; GIVEN the image renamed in between THEN the current mirror file is embedded; GIVEN source or mirror gone THEN the note is skipped.
- c17 GIVEN a note under `_previews/` that links the source THEN it is skipped; GIVEN `_previews-notes/x.md` THEN it is not skipped; GIVEN any embedding THEN no Notice is emitted and every log line is English and path-free.
- c18 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` after both previews are embedded WHEN renders run again in order b, a THEN the note is byte-identical and the embed order stays a, b.

## Phase 3 — Existing previews

**Depends on:** Phase 2

Command "Office-Vorschauen: Fehlende Einbettungen ergänzen" (id `office-previews-embed-missing`, requirement 11) embeds every existing marked preview or placeholder (the ~930 in `Lu` rendered by v1.25.x) into its linking notes via the Phase 2 path; runs only on the invoking device, builds the source→notes index once, and covers links added after a render when run again. Includes constants, `helpEntries()` entry, platform-gate registration, p2_c27 update, README command table and the req 15 statement.

Phase complete when: all scenarios below pass and the full `npm run test` is green. Additionally a manual, non-gating smoke step in a generated test vault shows the command embedding every existing preview exactly once.

### Test Scenarios

- c1 GIVEN previews from an earlier version and linking notes without embeds WHEN the backfill runs THEN every linking note gains the embed once, a second run makes zero writes, and one Notice `Einbettungen ergänzt: X in Y Notizen` is shown; a run with nothing to do shows `Einbettungen ergänzt: 0 in 0 Notizen`.
- c2 GIVEN a note that gained a link to an already-rendered document after its render WHEN the command runs again THEN that note gains the embed and no other note changes.
- c3 GIVEN a placeholder image with a valid marker WHEN the backfill runs THEN linking notes gain its embed.
- c4 GIVEN an image in the mirror folder without a valid marker WHEN the backfill runs THEN it is skipped.
- c5 GIVEN an open linking note WHEN the backfill runs THEN exactly one `editor.transaction` writes it.
- c6 GIVEN the command invoked while a run is active THEN the second invocation is rejected with the Notice `Einbettung läuft bereits.` and no second pass starts; GIVEN `stopWork()` mid-run THEN the flag is cleared and a new run is accepted.
- c7 GIVEN unload mid-run THEN no further note is written and no summary Notice is shown.
- c8 GIVEN the feature disabled WHEN the command is invoked THEN `NOTICE_DISABLED` is shown and nothing is written.
- c9 GIVEN 930 sources and many notes WHEN the backfill runs THEN the `resolvedLinks` access counter equals 1 for the run and `deps.setTimeout(_, 0)` yields separate notes.
- c10 GIVEN a note with a pending drop record for a source WHEN the backfill runs THEN that note is skipped.
- c11 GIVEN a device that wrote no image WHEN the command runs THEN it edits notes, whereas a sync arrival alone (Phase 2 c4) does not.
- c12 GIVEN `Anhänge: ![[a.docx]], ![[b.xlsx]]` with existing previews of both and no embeds WHEN the backfill runs THEN the embed lines follow in ascending mirror-path order (`a.docx.png`, then `b.xlsx.png`), and a second run changes nothing.
- c13 GIVEN the same line with `![[b.xlsx.png]]` already embedded WHEN the backfill runs twice THEN run 1 appends `a.docx.png` after `b.xlsx.png` and run 2 changes nothing.
- c14 GIVEN a note N that already embeds `a.docx.png` and gains a second line linking `a.docx` WHEN the backfill runs twice THEN N is unchanged (documented limit: per-note idempotence, first-line-only); GIVEN a note N' with a fresh link and no embed THEN N' gains the embed once and the second run is a no-op.
- c15 GIVEN a backfill running while a render's embedding targets the same note THEN both go through the one chain and the note ends with each embed exactly once.
- c16 GIVEN a backfill WHEN notes are embedded THEN no Notice other than the single summary is emitted.
- c17 GIVEN the command registered THEN it is registered only inside the platform gate and `helpEntries()` lists it (updated p2_c27 asserts three commands).

## Phase 4 — Markdown-style embeds and write-time re-resolve

**Depends on:** Phase 2

Added after `/sdd-verify` (2026-10-02, PARTIAL + one MAJOR from the correctness pass; operator decision 2026-10-05): requirement 18 in the engine (`containsEmbedOf` and the block-line shape accept `![alt](target)`), the harness's `linkStyle: "markdown"` (`generateMarkdownLink` → `[name](encodeURI(path))`, `resolvedLinks` also parsing `](…)` targets), and the two c16 sub-cases Phase 2 left untested. `auto-embed.ts`/`drop-embed.ts` are expected unchanged unless a test shows otherwise.

Phase complete when: all scenarios below pass and the full `npm run test` is green, including every Phase 1–3 scenario and the base pins.

### Test Scenarios

- c1 GIVEN a note `see [[Angebot.docx]]\n![Angebot.docx.png](_previews/_resources/Angebot.docx.png)` WHEN planning for that image THEN null.
- c2 GIVEN `[[a.docx]]` followed by `![](_previews/_resources/Neue%20Datei.docx.png)` (resolves under the preview folder) WHEN planning for `a.docx` THEN the Markdown embed line belongs to the block and `lineIndex` is 1; GIVEN `![x](<_previews/a b.docx.png> "Titel")` in the body for the image THEN null.
- c3 GIVEN the harness with `linkStyle: "markdown"` and a note linking `Angebot.docx` WHEN its preview is rendered and then re-rendered THEN the note holds exactly one Markdown embed of the preview and the re-render writes nothing.
- c4 GIVEN `linkStyle: "markdown"` and a drop of `Angebot.docx` into a note that already embeds its preview in Markdown form WHEN the drop's preview exists THEN no second embed is inserted.
- c5 GIVEN the image deleted between listing and write (frozen listing, image removed before the pass writes) WHEN embedding THEN that note is skipped (byte-identical, no `vault.process`) and the pass continues with the next note.
- c6 GIVEN the source renamed between listing and write (the lifecycle moves its mirror) WHEN the old pass reaches the note THEN it writes nothing; WHEN the renamed source is rendered THEN the note gains the embed of the current mirror, once.

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
| Backfill confirmation | None | A confirmation modal: an extra step the operator did not ask for |
| Only the first matching line per note | Embed below the first body line from the top | Every matching line: contradicts base req 25 |
| Frontmatter / code matches | Body only; skips frontmatter, ``` / ~~~ fences, inline code; indented code, comments, math not skipped | Plain line scan: could corrupt YAML or match non-links; full Markdown parsing: not required |
| Quote / table / list context | `>` prefix copied; table → after last contiguous row (block looked for after the table end); list → leading whitespace of the link line only, may detach | Splitting a table or leaving a callout; computing continuation indentation |
| EOL | CRLF iff the first line break is CRLF | Per-line detection of mixed EOL: not required |
| PNG placeholder → JPG render | New write, new embed directly below the anchor, stale line stays | Placeholders using the real extension: not required; old-embed removal contradicts decision 8 |
| Re-render after user removed the embed | Embed re-added; accepted | Remembering removals: needs persisted state |
| Drop vs AutoEmbed ordering | AutoEmbed skips notes with a pending drop record (`isPending(notePath, sourcePath)`), no revisit at the 60 s deadline | Relying on run order: DropEmbed waits for Obsidian to write the link, so it is a race; source-only `isPending` would suppress M |
| `run` and embedding | `embedEverywhere` enqueues and returns | Awaiting in `run`: the single-worker `PreviewQueue` would block every later render |
| Write serialization | One feature-wide promise chain; order = chain-entry order; image wait before entering the chain | Per-call sequencing: concurrent renders would plan against the same note; waiting inside the chain: one source would block all |
| Image reference | Re-resolved from `mirrorPath` before each note write | Carrying a `TFile` from render time: rename/delete on the lifecycle chain may invalidate it |
| Liveness | `live()` with generation; `stopWork()` resets chain and backfill flag; queued work dropped | Resuming on re-enable: would run an old pass |
| Block detection | Maximal run of lines (prefix + one embed, size/alias allowed) each resolving under the preview folder | Same-line-document matching: not decidable in the pure planner |
| Idempotence scan | Body-only, per image, embeds only; reuse engine helper | Second regex / per-note "any preview": breaks c16-type cases |
| Backfill split | The feature collects the marked sources (PreviewStore), AutoEmbed indexes `resolvedLinks` once and writes; `null` result suppresses the summary of a stopped run | AutoEmbed reading the store itself: a second owner of the mirror folder |
| Backfill source derivation | `PreviewStore.inspect` + `sourceForPreview`; `resolvedLinks` indexed once; ascending code-unit order | Per-source scan of `resolvedLinks`: O(sources × notes); string stripping |
| Backfill index staleness | Accepted; re-run covers it | Re-indexing per source: defeats the single index |
| Backfill on several Macs | Unsupported, stated in README | Guarding in code: no cross-Mac state exists (base: no locks) |
| Later link in a note that already embeds the image | Not embedded (per-note idempotence, first-line-only); documented limit | Per-line idempotence: contradicts base req 25 and would stack embeds |
| Rescan on re-render | Accepted: a re-render rescans its linking notes; the idempotence scan makes it a no-op | Caching per-note state: not required |
| Templates folder | No exclusion; notes there may receive embeds | Exclusion setting: not requested |
| Editor path write | `"\n" + text` at end of line `lineIndex` in one transaction; `vault.process` uses `newContent` | Using `newContent` in the editor: loses cursor/undo behaviour |
| Duplicate write logic (DropEmbed + AutoEmbed) | Not extracted; second occurrence | Extraction now: Rule of Three |
| Markdown-style embeds (Phase 4) | Recognised in idempotence, block and drop scans; source links stay wikilink-only | Detecting Markdown source links too: base Out of Scope; ignoring Markdown embeds: duplicates on every re-render in a vault without wikilinks |
| PNG-to-JPG handling | Falls out of per-image idempotence; test only | Extra requirement code |

## Open Decisions

None.

## Unresolved Gaps

- Two Macs may both render the same source (no locks in the base) and both embed; the idempotence scan only helps once the other Mac's edit has synced, so duplicate embeds are possible. Accepted mitigation: none beyond the scan.

## Out of Scope

- Converting existing links or embeds (`![[x.docx]]` ↔ `[[x.docx]]`) outside the drop note.
- Markdown-style links to a source (`[x](Angebot.docx)`) as anchors — base Out of Scope still applies; Markdown-style *embeds* of a preview are recognised (req 18).
- A per-feature toggle for automatic embedding; it follows `officePreviews.enabled`.
- Notices for background embedding (the backfill command's summary Notice is the only one).
- Embedding on note edits (links added after a render); the backfill command covers them.
- Removing embed lines after a source is deleted.
- Rename handling beyond Obsidian's own link update (the embed follows the renamed image via `fileManager.renameFile`, base req 14).
