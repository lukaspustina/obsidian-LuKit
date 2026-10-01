# SDD: Office Previews

Status: Draft
Created: 2026-10-01

## Overview

LuKit renders an image of the first page (or slide, or sheet) of every Office, iWork and OpenDocument file in the vault, using macOS Quick Look, and keeps these images current as documents are added, changed, renamed or deleted. A preview is a plain image embedded in the note (`![[Angebot.docx.png]]`), so it shows on desktop and on mobile alike. When the user drags or pastes a document into a note, LuKit renders it at once and inserts the preview embed below the document link; previews of documents that arrive any other way are embedded by hand.

## Context & Constraints

- TypeScript strict, Obsidian plugin, feature module pattern (`<name>-engine.ts` pure, `<name>-feature.ts` Obsidian API, injectable impure bridge as in `email-filing/mail-bridge.ts` and `task-triage/tasknotes-bridge.ts`).
- `child_process` and `path` are already externalized in `esbuild.config.mjs` (used by the mail bridge).
- The user has two vaults (`Bumbelu`, `Lu`), both synced with **Obsidian Sync** to several Macs and mobile devices. Measured: `Lu` holds ~930 Office files (451 docx, 58 doc, 203 xlsx, 4 xls, 212 pptx, 1 ppt), `Bumbelu` ~64.
- Vaults contain company documents: everything stays local — no network access, no uploads.
- Original documents are never modified. LuKit deletes nothing it did not create itself.
- Sync must not produce conflicts. Facts from the Obsidian Sync documentation (checked 2026-10-01):
  - *"For all other files [non-Markdown] … Obsidian uses a 'last modified wins' approach."* Two devices writing the same image therefore cannot create a conflict file; the later write wins.
  - *"Files and folders beginning with a `.` are treated as hidden and excluded from sync."* No shared state can live in a dot-folder.
  - Image sync is a selective-sync toggle that has to be on for the previews to reach mobile devices (operator precondition, not checked by LuKit).
- Plugin UI German, diagnostics English, no PII in tests (CLAUDE.md).

## Experiments (2026-10-01)

Random sample of 64 real documents from `Lu`, rendered with `qlmanage -t -s 1200 -o <dir> <file>` into a scratch directory (images not inspected by the agent; fidelity judged by the operator: "gefällt mir sehr gut").

| Format | Rendered | Time per document | Image |
|---|---|---|---|
| docx | 15/15 | ~0.2 s | portrait 856×1200 |
| doc | 15/15 | ~0.2 s | portrait |
| xlsx | 14/15 | ~0.2 s — **one 400 KB file hung for >10 min** until killed | mixed, mostly landscape |
| xls | 4/4 | ~0.2 s | mixed |
| pptx | 15/15 | ~0.25 s | 1200×677 |

Image size per format (average): PNG 1200 px — docx 270 KB, xlsx 253 KB, pptx 609 KB; JPEG q80 1200 px — docx 243 KB, xlsx 289 KB, pptx 108 KB. PNG suits text on white, JPEG suits slides.

Consequences: a hard timeout is mandatory; a document that failed once must not be retried on every run; file size does not predict a hang.

## Architecture

```
vault events ─┐                       ┌─ QuickLookRenderer (bridge: qlmanage + sips, timeout)
startup scan ─┼─> PreviewQueue ──────>┤
command ──────┘   (jitter, 1 worker,  └─ PreviewStore (vault adapter: read/write/rename/delete
                   hash re-check)                    under _previews/, marker read/write)
                        │
                        └─ DeviceCache (app.saveLocalStorage: path → mtime,size,hash; failures)
```

Distribution across Macs without locks: every Mac with LuKit may render. Before rendering, a device checks whether the preview already exists and carries the current source fingerprint; if so, it does nothing. A job only starts after a random delay, so usually the image from the Mac where the document originated has arrived by then. Two Macs rendering the same document at once cost duplicate work, not a conflict ("last modified wins").

## Requirements

1. The system shall run the preview feature only in the desktop app on macOS (`Platform.isDesktopApp && Platform.isMacOS`); on any other platform it shall register no listeners and render nothing.
2. The system shall render previews only while the setting `officePreviews.enabled` is on (default off).
3. The system shall treat files with the extensions `docx`, `doc`, `xlsx`, `xls`, `pptx`, `ppt`, `pages`, `numbers`, `key`, `odt`, `ods`, `odp` (case-insensitive) as preview sources, excluding any file below the preview folder.
4. The system shall write the preview of `<dir>/<name>.<ext>` to `<previewFolder>/<dir>/<name>.<ext>.<imgExt>`, where `previewFolder` is the setting `officePreviews.folder` (default `_previews`) and `imgExt` is `jpg` for `pptx`, `ppt`, `key`, `odp` and `png` for all other source types.
5. The system shall render with Quick Look at 1200 px on the longest edge, convert presentation previews to JPEG at quality 80, and never write into or modify the source document.
6. The system shall embed a marker in every preview it writes — a PNG `tEXt` chunk or a JPEG `COM` segment — holding the marker version, the source fingerprint and the source path.
7. The system shall compute the source fingerprint as the SHA-256 of the file content, and cache it per device keyed by path, mtime and size so that an unchanged file is not re-read.
8. The system shall skip rendering a source whose preview exists and carries the source's current fingerprint.
9. The system shall delay every render job by a random interval between 30 and 120 seconds after it was queued and re-check requirement 8 immediately before rendering.
10. The system shall process the queue with exactly one render at a time and abort a render after 20 seconds, killing the Quick Look process.
11. The system shall record a failed render (timeout, non-zero exit, no output image) per device together with the source fingerprint and shall not retry that source until its fingerprint changes.
12. The system shall, two minutes after the workspace layout is ready, queue every source whose preview is missing or carries a different fingerprint, in an order randomized per device.
13. The system shall queue a source on its vault `create` and `modify` events.
14. The system shall, on a source `rename` event, move a preview that carries the LuKit marker to the new mirror path via `app.fileManager.renameFile`, so Obsidian updates embeds according to the user's link settings, creating missing mirror folders first.
15. The system shall, on a source `delete` event, delete the preview at the mirror path only if it carries the LuKit marker.
16. The system shall never delete or overwrite a file under the preview folder that does not carry the LuKit marker; on such a collision it shall skip the source and record it as failed.
17. The system shall not delete previews outside of a source `delete` event (no orphan sweep).
18. The system shall offer the command `office-preview-render-active` („Office-Vorschau: Aktuelles Dokument jetzt erzeugen“), which renders the active source file immediately, bypassing the delay and the failure memory.
19. The system shall offer the command `office-preview-status` („Office-Vorschau: Status“), which shows a Notice with the counts of current, queued and failed sources.
20. The system shall, after moving or deleting a preview, remove each emptied parent folder below the preview folder, never the preview folder itself and never a folder outside it.
21. The system shall store `officePreviews.enabled` and `officePreviews.folder` in the synced plugin settings, and the device cache and failure memory in device-local storage (`app.saveLocalStorage`).
22. The system shall keep whatever image Quick Look returns as the preview, including a generic file icon for a protected or broken document; only a timeout, a non-zero exit or a missing image counts as a failure.
23. The system shall, when a source file is created in the vault within 10 seconds after an `editor-drop` or `editor-paste` event in a Markdown editor, treat it as dropped into that editor's note.
24. The system shall render a dropped source immediately, bypassing the random delay and the failure memory.
25. The system shall, once the dropped source's preview exists, insert `![[<preview basename>]]` on a new line directly below the line that holds the source's link or embed in that note, located by searching the note's current content at insertion time (never by an offset recorded at drop time), through the editor API so a single undo removes it.
26. The system shall fall back to `vault.process` on the note when the note is no longer open in an editor, and shall insert nothing when the note no longer contains a link to the source or already contains an embed of its preview.
27. The system shall insert nothing for a dropped source whose render failed, and show a German Notice naming the document.

## Data Models

```ts
// office-previews-engine.ts (pure)
export type SourceKind = "text" | "sheet" | "slides";
export interface PreviewMarker {
	version: 1;
	sha256: string;      // hex
	source: string;      // vault path of the source at render time
}
export interface CacheEntry { mtime: number; size: number; sha256: string }
export interface FailureEntry { sha256: string; reason: "timeout" | "exit" | "no-output" | "collision"; at: string }

// office-previews-settings.ts
export interface OfficePreviewSettings {
	enabled: boolean;    // default false
	folder: string;      // default "_previews"
}
```

## File & Module Structure

| Path | Purpose |
|---|---|
| `src/features/office-previews/office-previews-engine.ts` | Pure: supported extensions, mirror path mapping, image format choice, marker encode/decode, PNG `tEXt` and JPEG `COM` insertion and parsing, jitter computation |
| `src/features/office-previews/quicklook-renderer.ts` | Impure bridge: `qlmanage` into a temp dir, `sips` to JPEG, timeout + kill; injectable |
| `src/features/office-previews/preview-queue.ts` | Delayed single-worker queue with re-check hook |
| `src/features/office-previews/office-previews-feature.ts` | `LuKitFeature`: settings, platform gating, events, startup reconcile, commands, device cache |
| `src/features/office-previews/office-previews-settings.ts` | Settings interface and defaults |
| `tests/unit/office-previews-engine.test.ts` | Engine tests |
| `tests/acceptance/office-previews-*.test.ts` | Feature flows with a fake renderer |

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Render hangs | Quick Look exceeds 20 s | Process killed, failure recorded | Counted in status |
| Render fails | non-zero exit or no image | Failure recorded | Counted in status |
| Name collision | non-LuKit file at the mirror path | Skip, failure `collision` | Counted in status |
| Source unreadable | read error while hashing | Skip this source, retry on next event | Console (English, no path) |
| Not macOS desktop | platform check | Feature inert | Settings show a German hint |

## Implementation Phases

## Phase 1 — Engine and Renderer

Pure engine (path mapping, format choice, marker encode/decode in PNG and JPEG, fingerprint helper) and the Quick Look bridge with timeout. Includes one experiment recorded in the report: iWork/OpenDocument rendering on a generated sample of each format.

Phase complete when: engine has full branch coverage; a real-process test renders a generated sample document and a deliberately hanging command is killed after the timeout.

### Test Scenarios

- GIVEN `Projekte/_resources/Angebot.docx` WHEN the mirror path is computed THEN it is `_previews/Projekte/_resources/Angebot.docx.png`.
- GIVEN `Folien.PPTX` WHEN the image format is chosen THEN it is `jpg`.
- GIVEN a PNG WHEN a marker is written and read back THEN the decoded marker equals the input and the image still decodes (signature and IEND intact, CRC valid).
- GIVEN a JPEG WHEN a marker is written and read back THEN the decoded marker equals the input.
- GIVEN an image without marker WHEN read THEN the result is null.
- GIVEN a render command that never exits WHEN rendered with a 20 s timeout THEN the process is killed and the result is `timeout`.

## Phase 2 — Queue, Reconcile and Settings

Settings block (toggle, folder) with platform gating, device cache in `app.saveLocalStorage`, delayed single-worker queue, startup reconcile in randomized order, failure memory, the two commands.

Phase complete when: acceptance tests with a fake renderer cover skip-when-current, delay + re-check, failure memory, and the startup reconcile.

### Test Scenarios

- GIVEN a source whose preview carries the current fingerprint WHEN it is queued THEN nothing is rendered.
- GIVEN a queued source WHEN another device's preview with the current fingerprint appears before the delay elapses THEN nothing is rendered.
- GIVEN a source that failed with fingerprint F WHEN the startup reconcile runs and the fingerprint is still F THEN it is not queued.
- GIVEN the same source after its content changed WHEN reconciled THEN it is queued again.
- GIVEN the feature disabled WHEN a source is created THEN nothing is queued.
- GIVEN a non-macOS platform WHEN the plugin loads THEN no vault listener is registered.

## Phase 3 — Lifecycle

`create`/`modify`/`rename`/`delete` handling, marker-guarded rename and delete, collision handling.

Phase complete when: acceptance tests cover rename (preview moved via `fileManager.renameFile`), delete (only marked previews), and collision (unmarked file untouched).

### Test Scenarios

- GIVEN a source with a marked preview WHEN the source is renamed THEN the preview moves to the new mirror path via `fileManager.renameFile`.
- GIVEN a source with a marked preview WHEN the source is deleted THEN the preview is deleted.
- GIVEN an unmarked file at the mirror path WHEN the source is deleted THEN the file is left untouched.
- GIVEN an unmarked file at the mirror path WHEN the source is rendered THEN the file is not overwritten and the source is recorded as `collision`.

## Phase 4 — Embed after drop

`editor-drop`/`editor-paste` tracking, immediate render, insertion of the preview embed below the document link (editor API, `vault.process` fallback).

Phase complete when: acceptance tests cover drop → immediate render → embed below the link, typing between drop and insertion, a closed note, a removed link, and a failed render.

### Test Scenarios

- GIVEN an `editor-drop` in note N WHEN `_resources/Angebot.docx` is created 1 s later THEN it is rendered without delay and `![[Angebot.docx.png]]` is inserted on the line below `![[Angebot.docx]]` in N.
- GIVEN the user typed three lines above the link before the render finished WHEN the embed is inserted THEN it lands directly below the link, not at the drop-time offset.
- GIVEN N was closed before the render finished WHEN the embed is inserted THEN it is written through `vault.process` below the link.
- GIVEN the user deleted the link before the render finished WHEN the render finishes THEN N is not changed.
- GIVEN N already embeds the preview WHEN the source is dropped again THEN no second embed is inserted.
- GIVEN a source created 30 s after the last drop WHEN it is created THEN it is queued with the random delay and nothing is inserted.
- GIVEN the render of a dropped source fails WHEN it finishes THEN N is not changed and a Notice names the document.

## Decision Log

| Decision | Chosen | Rejected and why |
|---|---|---|
| Rendering engine | macOS Quick Look (`qlmanage`) — built in, local, ~0.2 s per document, fidelity approved by the operator | Microsoft Office via AppleScript → PDF: opens the apps visibly, seconds per document, dialogs on protected files. LibreOffice headless: not installed, heavy dependency, own rendering. Third-party Obsidian plugins: young, single maintainers, parse Office files in the renderer on every note open. |
| Delivery | LuKit feature (operator decision) | Standalone launchd tool outside Obsidian |
| Distribution across Macs | No locks: fingerprint in the image + random delay + re-check | Locks over Obsidian Sync cannot be correct (eventual consistency, no compare-and-swap, dot-folders not synced) and are unnecessary because non-Markdown files resolve "last modified wins". Lease files: still racy, constant sync churn and visible files. Fixed rendering device: no previews without that Mac. |
| Location | Central mirror folder `_previews/` at the vault root | Next to the document in `_resources/`: doubles the file count there |
| Rename | Move the preview via `fileManager.renameFile`, links follow the user's Obsidian setting | Rename without link update (embeds break); delete + re-render (embeds break) |
| Format | PNG 1200 px for text/sheets, JPEG q80 1200 px for slides (~250 MB for `Lu`) | PNG everywhere (~350 MB), JPEG 800 px (~100 MB, pages only readable as an impression) |
| Ownership | Marker inside the image | File name pattern alone: cannot tell a LuKit preview from a user's image |
| Protected documents | Keep Quick Look's output, even a generic icon | Detecting icons and recording a failure: extra code for a rare case the operator accepts |
| Embedding after drag & drop | LuKit inserts the preview embed automatically below the dropped link (operator decision, 2026-10-01 — deliberately overrides the handover's "notes are not changed automatically" for this one case) | Command at the cursor: one keystroke per drop. Render-time swap of the grey embed: LuKit is `isDesktopOnly`, so mobile would show the grey block. Manual embedding only: typing long names per drop |
| Locating the insertion point | Search the note's current content for the link at insertion time | Offset recorded at drop time: wrong as soon as the user keeps typing while the render runs |
| Orphans | Delete only on a `delete` event | Startup orphan sweep: a device that excludes Office files from selective sync would see every preview as orphaned and delete them all |

## Open Decisions

None.

## Resolved Questions (2026-10-01)

| # | Question | Decision |
|---|---|---|
| Q1 | Fingerprint | SHA-256 of the content with a per-device cache keyed by path, mtime, size — mtime is not guaranteed identical across synced devices |
| Q2 | Where the fingerprint lives | Inside the image (PNG `tEXt` / JPEG `COM`) — a synced manifest would lose entries under "last modified wins" |
| Q3 | Initial rollout on several Macs | Per-device randomized order, reconcile starts two minutes after layout ready, re-check before each render |
| Q4 | Protected or broken documents | Keep whatever Quick Look returns (possibly a generic icon); no special case |
| Q5 | Renderer | `qlmanage`; no bundled Swift helper (signing, notarization, toolchain outside the stack). If an update breaks it, every render fails and the status command shows it |
| Q6 | Empty mirror folders | Removed, only below the preview folder (requirement 20) |
| Q7 | Enable toggle | Synced in `data.json`; mobile ignores it |
| Q8 | Getting the preview into the note after drag & drop | Automatic embed below the dropped link (Phase 4); no separate toggle — it follows `enabled` |

## Out of Scope

- Changing notes automatically, except the embed after a drag & drop (Phase 4) and Obsidian's own link update on rename.
- Embedding previews in the email-filing `Anhänge:` line instead of the Office file (follow-up after this ships).
- Pages beyond the first; interactive document viewing.
- Rendering on Windows, Linux or mobile.
- PDFs and images (Obsidian previews them natively).
