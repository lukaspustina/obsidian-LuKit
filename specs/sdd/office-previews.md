# SDD: Office Previews

Status: Ready for Implementation
Original: specs/sdd/office-previews.md
Refined: 2026-10-01

## Overview

LuKit renders an image of the first page (or slide, or sheet) of every Office, iWork and OpenDocument file in the vault, using macOS Quick Look, and keeps these images current as documents are added, changed, renamed or deleted. A preview is a plain image embedded in the note (`![[Angebot.docx.png]]`), so it shows on desktop and on mobile alike. When the user drags or pastes a document into a note, LuKit renders it at once and inserts the preview embed below the document link; previews of documents that arrive any other way are embedded by hand.

## Context & Constraints

- TypeScript strict, Obsidian plugin, feature module pattern (`<name>-engine.ts` pure, `<name>-feature.ts` Obsidian API, injectable impure bridge as in `email-filing/mail-bridge.ts` and `task-triage/tasknotes-bridge.ts`).
- `esbuild.config.mjs` externalizes `child_process` and `path` today. This feature additionally needs `fs` and `os` (temp dir, reading `qlmanage` output, cleanup) — add both to `external`. SHA-256 uses the global `crypto.subtle.digest` (Electron renderer), so `crypto` is not externalized.
- The user has two vaults (`Bumbelu`, `Lu`), both synced with **Obsidian Sync** to several Macs and mobile devices. Measured: `Lu` holds ~930 Office files (451 docx, 58 doc, 203 xlsx, 4 xls, 212 pptx, 1 ppt), `Bumbelu` ~64. Neither vault holds iWork or OpenDocument files today.
- Vaults contain company documents: everything stays local — no network access, no uploads.
- Original documents are never modified. LuKit deletes nothing it did not create itself.
- Sync must not produce conflicts. Facts from the Obsidian Sync documentation (checked 2026-10-01):
  - *"For all other files [non-Markdown] … Obsidian uses a 'last modified wins' approach."* Two devices writing the same image therefore cannot create a conflict file; the later write wins.
  - *"Files and folders beginning with a `.` are treated as hidden and excluded from sync."* No shared state can live in a dot-folder.
  - Image sync is a selective-sync toggle that has to be on for the previews to reach mobile devices (operator precondition, not checked by LuKit).
- Plugin UI German, diagnostics English, no PII in tests (CLAUDE.md).
- Accepted consequences: (a) `_previews` images appear in the file explorer, graph and quick switcher; a plugin cannot configure Obsidian's excluded files. (b) Two Macs may render the same document when sync latency exceeds the random delay; duplicate work is acceptable. (c) A device that excludes Office files from selective sync cannot read sources, so its reconcile queues nothing for them. (d) Quick Look behaviour may change with a macOS update; if every render fails, the status command shows it (Q5).

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
vault events ─┐ (debounced per path)  ┌─ QuickLookRenderer (bridge: qlmanage + sips, timeout)
startup scan ─┼─> PreviewQueue ──────>┤
command ──────┤   (jitter, 1 worker,  └─ PreviewStore (vault adapter: read/write/rename/delete
editor-drop ──┘    hash re-check)                    under _previews/, marker read/write)
   │                    │
   │                    └─ DeviceCache (app.saveLocalStorage: path → mtime,size,sha256; failures)
   └─ DropEmbed (drop tracking, matching, link/embed insertion)
```

Distribution across Macs without locks: every Mac with LuKit may render. Before rendering, a device checks whether the preview already exists and carries the current source fingerprint; if so, it does nothing. A job only starts after a random delay, so usually the image from the Mac where the document originated has arrived by then. Two Macs rendering the same document at once cost duplicate work, not a conflict ("last modified wins").

Constants (exported from `office-previews-engine.ts`):

| Name | Value |
|---|---|
| `RENDER_TIMEOUT_MS` | 20_000 |
| `JITTER_MIN_MS` / `JITTER_MAX_MS` | 30_000 / 120_000 |
| `RECONCILE_DELAY_MS` | 120_000 |
| `MODIFY_DEBOUNCE_MS` | 5_000 |
| `DROP_WINDOW_MS` | 10_000 |
| `DROP_EMBED_DEADLINE_MS` | 60_000 |
| `RENDER_LONGEST_EDGE` | 1200 |
| `JPEG_QUALITY` | 80 |

## Requirements

1. The system shall run the preview feature only in the desktop app on macOS (`Platform.isDesktopApp && Platform.isMacOS`); on any other platform it shall register no listeners and no commands and render nothing.
2. The system shall render previews only while the setting `officePreviews.enabled` is on (default off).
3. The system shall treat files with the extensions in `SUPPORTED_EXTENSIONS` (case-insensitive) as preview sources, excluding any file below the preview folder. `SUPPORTED_EXTENSIONS` is `docx, doc, xlsx, xls, pptx, ppt, pages, numbers, key, odt, ods, odp` (operator decision, 2026-10-01). The Phase 1 format experiment records which of them rendered; it never removes an extension — a format that fails the experiment is reported as an open decision for the operator.
4. The system shall write the preview of `<dir>/<name>.<ext>` to `<previewFolder>/<dir>/<name>.<ext>.<imgExt>`, where `previewFolder` is the setting `officePreviews.folder` (default `_previews`) and `imgExt` is `jpg` for `pptx`, `ppt`, `key`, `odp` and `png` for all other source types. The source extension keeps its case (`Folien.PPTX` → `_previews/Folien.PPTX.jpg`).
5. The system shall render with Quick Look at 1200 px on the longest edge (`qlmanage -t -s 1200 -o <tmpdir> <absSource>`, output read from `<tmpdir>/<basename of source incl. ext>.png`), convert presentation previews to JPEG at quality 80 (`sips -s format jpeg -s formatOptions 80 <in.png> --out <out.jpg>`), and never write into or modify the source document (observable: source hash unchanged after a render). The absolute source path is `FileSystemAdapter.getBasePath()` joined with the vault path.
6. The system shall embed a marker in every preview it writes, holding the marker version, the source fingerprint and the source path (encoding in Data Models). The marker's `source` is informational only: it is never compared and never rewritten (a rewrite would change the image and re-sync it).
7. The system shall compute the source fingerprint as the lowercase hex SHA-256 of the file content (`vault.adapter.readBinary` + `crypto.subtle.digest("SHA-256")`, no file-size cap), and cache it per device keyed by vault path, mtime and size so that an unchanged file is not re-read. A renamed source misses the cache once (one re-hash); the cache entry for the old path is moved on rename and dropped on delete; there is no other pruning.
8. The system shall decide per source, in this order: (1) mirror path occupied by a file without a valid marker (marker absent, unparsable or `version !== 1`) → collision, no render (requirement 16); (2) mirror path holds a marker with `sha256` equal to the source fingerprint → skip; (3) otherwise render. Only `sha256` is compared.
9. The system shall delay every render job by a random interval between 30 and 120 seconds after it was queued and re-check requirement 8 immediately before rendering.
10. The system shall process the queue with exactly one render at a time and abort a render after 20 seconds by sending SIGKILL to the spawned `qlmanage` (or `sips`) process; the render result is `timeout` regardless of whether the kill succeeds.
11. The system shall record a failed render (timeout, non-zero exit, no output image, write error) per device together with the source fingerprint and shall not retry that source until its fingerprint changes. A `collision` entry is additionally cleared, and its source queued, when a vault `create` or `delete` event hits that source's mirror path.
12. The system shall, two minutes (`RECONCILE_DELAY_MS`) after the workspace layout is ready, evaluate every source sequentially (one `await` per file, so the UI is not blocked) in an order randomized per device, and queue every source whose preview is missing or carries a different fingerprint and that has no failure entry with the current fingerprint. With an empty device cache this hashes all sources once.
13. The system shall queue a source on its vault `create` and `modify` events. Events are coalesced per path: the fingerprint is computed after `MODIFY_DEBOUNCE_MS` of quiet on that path, and a path already queued keeps one job (its delay restarts).
14. The system shall, on a source `rename` event whose new path is a source, move a preview that carries the LuKit marker from the old mirror path to the new mirror path via `app.fileManager.renameFile`, so Obsidian updates embeds according to the user's link settings, creating missing mirror folders first, and move the device cache entry, failure entry and queued job to the new path. If the new mirror path holds a file, neither file is changed and a `collision` is recorded for the source. If no marked preview exists at the old mirror path (missing or unmarked), the source is handled as a `create`. A rename whose new path is not a source (including a path below the preview folder) leaves existing previews untouched (requirement 17). Rename events (also from folder renames, one per file) are processed one at a time in event order.
15. The system shall, on a source `delete` event, delete the preview at the mirror path only if it carries the LuKit marker; a missing preview is not an error.
16. The system shall never delete or overwrite a file under the preview folder that does not carry the LuKit marker; on such a collision it shall skip the source and record it as failed (`collision`).
17. The system shall not delete previews outside of a source `delete` event (no orphan sweep).
18. The system shall offer the command `office-preview-render-active` („Office-Vorschau: Aktuelles Dokument jetzt erzeugen“), which renders the active source file immediately (front of the queue), bypassing the delay and the failure memory. If the feature is disabled it shows the Notice „Office-Vorschauen sind in den Einstellungen ausgeschaltet.“; if the active file is not a source it shows „Die aktive Datei ist kein unterstütztes Office-Dokument.“.
19. The system shall offer the command `office-preview-status` („Office-Vorschau: Status“), which shows the Notice `Office-Vorschau: <n> aktuell, <n> in der Warteschlange, <n> fehlgeschlagen`. „aktuell“ counts the sources verified current or rendered by this device since the plugin loaded (in-memory set of paths); „in der Warteschlange“ is the queue length; „fehlgeschlagen“ is the number of failure entries.
20. The system shall, after moving or deleting a preview, remove each emptied parent folder below the preview folder (`adapter.list` check, bottom-up), never the preview folder itself and never a folder outside it; errors during this cleanup are ignored.
21. The system shall store `officePreviews.enabled` and `officePreviews.folder` in the synced plugin settings (`LuKitSettings.officePreviews`, merged in `mergeSettings` so a `data.json` without the key gets defaults), and the device cache and failure memory in device-local storage (`app.saveLocalStorage` / `loadLocalStorage`, keys `lukit.officePreviews.cache` and `lukit.officePreviews.failures`). The folder value is normalized by `normalizePreviewFolder`: trimmed, leading and trailing `/` stripped; an empty result, a `..` segment, or a first segment starting with `.` falls back to `_previews`. Changing the folder at runtime leaves existing previews where they are (no migration).
22. The system shall keep whatever image Quick Look returns as the preview, including a generic file icon for a protected or broken document; only a timeout, a non-zero exit or a missing image counts as a failure. A render with exit 0 and an output image is a success and is marker-stamped like any other.
23. The system shall observe `editor-drop` and `editor-paste` without preventing their default handling, record the note path, the file names from the event's `DataTransfer.files` and the timestamp (nothing is recorded when the feature is disabled, the platform is unsupported, or no file names are available), and treat a source file created within `DROP_WINDOW_MS` afterwards as dropped into that note when its basename equals a recorded name or that name with Obsidian's collision suffix (`Angebot 1.docx`, pattern `<name> <digits>.<ext>`). With several matching records, the most recent wins; records older than `DROP_WINDOW_MS` are pruned on each event. Matching is on the basename only; an unrelated synced file with a matching name inside the window is accepted as a match.
24. The system shall render a dropped source immediately (front of the queue), bypassing the random delay and the failure memory.
25. The system shall, once the dropped source's preview exists, locate the line holding the source's link or embed by searching the note's current content at insertion time (never by an offset recorded at drop time), turn an embed `![[<source>]]` on it into a link `[[<source>]]` so the document stays openable by click, and insert the preview embed on a new line directly below — as one editor change, so a single undo reverts both. Details: only wikilinks (`[[…]]`, `![[…]]`, optional `|alias`) are handled, matched by `metadataCache.getFirstLinkpathDest(linkpath, notePath)` resolving to the source file; markdown-style links are not handled (nothing inserted); the first matching line from the top is used; a plain link line (no `!`) is left unchanged and only the embed line is inserted; the embed text is `"!" + app.fileManager.generateMarkdownLink(previewFile, notePath)`.
26. The system shall write through one `editor.transaction({ changes: [...] })` containing a single change that replaces the link line with the (converted) line plus `\n` plus the embed line (no selection argument, so the cursor does not move; works on the last line without trailing newline), using the first `MarkdownView` found by `workspace.iterateAllLeaves` whose `file.path` equals the note. It shall fall back to `vault.process` on the note when no such view exists, and shall change nothing at all (byte-identical content, no link conversion) when the note no longer contains a link to the source or already contains an embed of its preview anywhere.
27. The system shall insert nothing for a dropped source whose render failed, and show the German Notice `Office-Vorschau fehlgeschlagen: <document basename>` once per drop (no path).
28. The system shall insert nothing if the preview does not exist `DROP_EMBED_DEADLINE_MS` after the dropped source was matched (queue wait plus render).
29. The system shall resolve a queued job's path at run time: a job whose source no longer exists, or whose absolute file is not on disk, is dropped without recording a failure.
30. The system shall, if the source changes while it is rendered, stamp the marker with the fingerprint computed before the render; the following `modify` event requeues the source.
31. The system shall run drop handling in `drop-embed.ts` and the device cache in `device-cache.ts`; the matcher and the link-line transform are pure functions in the engine.

## File & Module Structure

| Path | Purpose |
|---|---|
| `esbuild.config.mjs` | Add `fs`, `os` to `external` |
| `src/types.ts` | `LuKitSettings.officePreviews`, `DEFAULT_SETTINGS`, `mergeSettings` |
| `src/main.ts` | Register `OfficePreviewsFeature` |
| `src/features/office-previews/office-previews-engine.ts` | Pure: constants, `SUPPORTED_EXTENSIONS`, `isSource`, `mirrorPath`, `imageExtFor`, `normalizePreviewFolder`, `encodeMarker`/`decodeMarker`, `writeMarkerPng`/`writeMarkerJpeg`/`readMarker` (CRC32 included), `jitterMs(random)`, `matchDrop`, `transformLinkLine` |
| `src/features/office-previews/quicklook-renderer.ts` | Impure bridge: `qlmanage` into a temp dir (`fs.mkdtemp` under `os.tmpdir()`, removed in `finally`, also after kill), `sips` to JPEG, timeout + SIGKILL; injectable |
| `src/features/office-previews/preview-queue.ts` | Delayed single-worker queue with re-check hook |
| `src/features/office-previews/preview-store.ts` | Vault adapter access: read marker, write image (creating parent folders), rename via `fileManager.renameFile`, delete, empty-folder cleanup |
| `src/features/office-previews/device-cache.ts` | `app.saveLocalStorage` cache and failure memory with shape validation |
| `src/features/office-previews/drop-embed.ts` | Drop/paste tracking, matching, insertion (editor / `vault.process`) |
| `src/features/office-previews/office-previews-feature.ts` | `LuKitFeature`: platform gating, events, startup reconcile, commands, settings section (`renderSettings`), `helpEntries()` |
| `src/features/office-previews/office-previews-settings.ts` | Settings interface and defaults |
| `tests/helpers/obsidian-stub.ts` | Extend with a mutable `Platform` (`isDesktopApp`, `isMacOS`) |
| `tests/unit/office-previews-engine.test.ts` | Engine tests |
| `tests/unit/office-previews-renderer.test.ts` | Real-process renderer tests (`describe.skipIf(process.platform !== "darwin")`) |
| `tests/acceptance/office-previews-*.test.ts` | Feature flows with a fake renderer, fake clock and seeded RNG |
| `README.md`, `TODO.md` | Document the feature (CLAUDE.md rule) |

## Data Models

```ts
// office-previews-engine.ts (pure)
export type ImageExt = "png" | "jpg";
export interface PreviewMarker {
	version: 1;
	sha256: string;      // lowercase hex
	source: string;      // vault path of the source at render time; informational only
}
// PNG: tEXt chunk directly after IHDR, keyword "lukit-preview", value = JSON of PreviewMarker
//      with every non-ASCII character escaped as \uXXXX (tEXt is Latin-1); CRC32 over type+data.
// JPEG: COM segment (0xFFFE) directly after SOI, or after a leading APP0 segment if present;
//      payload = "lukit-preview=" + JSON (UTF-8), at most 65533 bytes.
// readMarker(bytes): PreviewMarker | null — null for no marker, corrupt/non-image input, or version !== 1.
export interface CacheEntry { mtime: number; size: number; sha256: string }
export interface FailureEntry {
	sha256: string;
	reason: "timeout" | "exit" | "no-output" | "write" | "collision";
	at: string;          // ISO 8601
}

// quicklook-renderer.ts
export type RenderResult =
	| { ok: true; bytes: Uint8Array }
	| { ok: false; reason: "timeout" | "exit" | "no-output" };   // a sips failure is "exit"
export interface PreviewRenderer {
	render(absSource: string, kind: ImageExt, timeoutMs: number): Promise<RenderResult>;
}
export function createQuickLookRenderer(opts?: { qlmanage?: string; sips?: string }): PreviewRenderer;
// defaults: "/usr/bin/qlmanage", "/usr/bin/sips"; a spawn error (binary missing) → "exit"

// preview-queue.ts
export interface PreviewQueueDeps {
	random: () => number;                         // injected RNG
	setTimeout: (fn: () => void, ms: number) => unknown;
	clearTimeout: (h: unknown) => void;
	recheck: (path: string) => Promise<"render" | "skip">;
	run: (path: string) => Promise<void>;         // render + write + failure recording
}
export class PreviewQueue {
	constructor(deps: PreviewQueueDeps);
	enqueue(path: string, opts?: { immediate?: boolean }): void;  // immediate: front, no delay; duplicate path: one job, delay restarts
	rename(oldPath: string, newPath: string): void;
	remove(path: string): void;
	get length(): number;
}
// Due jobs run in due-time order, one at a time; recheck is called right before run.

// device-cache.ts — values validated on read; corrupt or wrongly shaped JSON resets to {}
export interface DeviceCache {
	getFingerprint(path: string, mtime: number, size: number, read: () => Promise<Uint8Array>): Promise<string>;
	moveEntry(oldPath: string, newPath: string): void;
	removeEntry(path: string): void;
	getFailure(path: string): FailureEntry | undefined;
	setFailure(path: string, f: FailureEntry): void;
	clearFailure(path: string): void;
	failureCount(): number;
}

// office-previews-settings.ts
export interface OfficePreviewSettings {
	enabled: boolean;    // default false
	folder: string;      // default "_previews"
}

// drop-embed.ts
export interface DropRecord { notePath: string; names: string[]; at: number }
```

## API Contracts

| Command ID | Name | Behaviour |
|---|---|---|
| `office-preview-render-active` | Office-Vorschau: Aktuelles Dokument jetzt erzeugen | Requirement 18 |
| `office-preview-status` | Office-Vorschau: Status | Requirement 19 |

Command IDs never change once shipped.

Obsidian events: `vault.on("create" | "modify" | "rename" | "delete")` (registered via `registerEvent`), `workspace.onLayoutReady`, `workspace.on("editor-drop")`, `workspace.on("editor-paste")`. Obsidian APIs: `vault.adapter.readBinary/writeBinary/exists/mkdir/list/remove`, `app.fileManager.renameFile`, `app.fileManager.generateMarkdownLink`, `app.metadataCache.getFirstLinkpathDest`, `app.workspace.iterateAllLeaves`, `app.saveLocalStorage`/`loadLocalStorage`.

## Configuration

| Key | Location | Default | Notes |
|---|---|---|---|
| `officePreviews.enabled` | `data.json` (synced) | `false` | Mobile ignores it |
| `officePreviews.folder` | `data.json` (synced) | `_previews` | Normalized per requirement 21 |
| `lukit.officePreviews.cache` | device-local storage | `{}` | `Record<path, CacheEntry>` |
| `lukit.officePreviews.failures` | device-local storage | `{}` | `Record<path, FailureEntry>` |

Settings section: toggle + folder text field. On an unsupported platform the section shows the German hint „Office-Vorschauen sind nur in der Desktop-App auf macOS verfügbar.“ and no controls.

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Render hangs | Quick Look exceeds 20 s | SIGKILL, failure `timeout` recorded, temp dir removed | Counted in status |
| Render fails | non-zero exit (incl. `sips` failure, missing `qlmanage` binary, unwritable temp dir) | Failure `exit` recorded | Counted in status |
| No image | exit 0, no output file | Failure `no-output` recorded | Counted in status |
| Preview write fails | `writeBinary` / `mkdir` error (incl. over-long path component) | Failure `write` recorded | Counted in status |
| Name collision | non-LuKit file (no valid marker) at the mirror path | Skip, failure `collision` | Counted in status |
| Rename collision | file at the new mirror path | Neither file changed, failure `collision` | Counted in status |
| Rename/delete of preview fails | `renameFile` / `remove` error | Leave as is, no failure recorded | Console (English, no path) |
| Source unreadable | read error while hashing | Skip this source, retry on next event; for a dropped source: no failure recorded, no embed | Dropped source: Notice per requirement 27; otherwise console (English, no path) |
| Source not on disk | adapter is not a `FileSystemAdapter`, or file absent (selective sync) | Skip, no failure recorded | None |
| Device storage corrupt | invalid JSON or wrong shape in `loadLocalStorage` | Reset to `{}` | None |
| Marker unreadable | truncated/corrupt image or `version !== 1` | Treated as unmarked | None |
| Empty-folder cleanup fails | `adapter.list`/`remove` error or race with sync | Ignored | None |
| Embed deadline exceeded | no preview 60 s after the dropped source was matched | Insert nothing | None |
| Not macOS desktop | platform check | Feature inert, no listeners/commands | Settings show a German hint |

## Implementation Phases

Every phase is verified with `npm run test` and `npm run build` green; phases are independently committable.

## Phase 1 — Engine and Renderer

Pure engine (path mapping, `isSource`, format choice, folder normalization, marker encode/decode in PNG and JPEG, fingerprint reference, jitter) and the Quick Look bridge with timeout; `esbuild.config.mjs` externals; format experiment. Experiment: render one sample per format in `SUPPORTED_EXTENSIONS` with the real renderer (docx/doc/rtf-derived samples and `odt` generated at test time via `textutil -convert odt|docx|doc`; other formats from files the operator has on the machine, if any). A format passes when it renders to a PNG with exit 0 within 20 s. The result table (pass / fail / no sample obtainable) is recorded in the phase report; `SUPPORTED_EXTENSIONS` stays unchanged, and every `fail` is raised to the operator as an open decision.

Phase complete when: engine has full branch coverage; real-process tests (gated by `describe.skipIf(process.platform !== "darwin")`) render a `textutil`-generated sample document and a deliberately hanging command (a temp shell script `exec sleep 60` passed as `qlmanage`) is killed after the timeout; the experiment result table is recorded in the phase report.

### Test Scenarios

- GIVEN `Projekte/_resources/Angebot.docx` WHEN mapped THEN `_previews/Projekte/_resources/Angebot.docx.png`.
- GIVEN `Folien.PPTX` WHEN the format is chosen THEN `jpg`; GIVEN `a.odt`/`b.xlsx`/`c.key` THEN `png`/`png`/`jpg`; GIVEN `Folien.PPTX` WHEN mapped THEN `_previews/Folien.PPTX.jpg`.
- GIVEN a path starting with `_previews/` WHEN checked as a source THEN false; GIVEN `x.PDF` THEN false.
- GIVEN folder values `""`, `/a/`, `../x`, `.obsidian/p` WHEN normalized THEN `_previews`, `a`, `_previews`, `_previews`.
- GIVEN a PNG and marker M WHEN written then read THEN decoded equals M, signature and IEND intact, CRCs valid.
- GIVEN a JPEG and marker M WHEN written then read THEN decoded equals M and SOI/EOI intact.
- GIVEN an image without marker, or a corrupt or non-image buffer, or a marker with version 2 WHEN read THEN null.
- GIVEN a marker source path containing non-ASCII characters WHEN round-tripped THEN equal.
- GIVEN a known byte buffer WHEN fingerprinted THEN the SHA-256 hex matches the reference value.
- GIVEN a command that never exits WHEN rendered with timeout T THEN the result is `timeout`, the process is dead after T + 1 s, and the temp dir is removed.
- GIVEN a command exiting non-zero WHEN rendered THEN `exit`; GIVEN exit 0 without output file THEN `no-output`.
- GIVEN a generated sample document WHEN rendered by real qlmanage THEN a PNG of longest edge <= 1200 exists, and the source file hash is unchanged.
- GIVEN a presentation kind WHEN rendered THEN the output is a decodable JPEG.

## Phase 2 — Queue, Write Path, Reconcile and Settings

Settings block (toggle, folder) with platform gating and `mergeSettings`/`DEFAULT_SETTINGS`, `Platform` stub extension, device cache, `PreviewStore` write with marker and collision check, delayed single-worker queue, `create`/`modify` queueing with per-path debounce, startup reconcile in randomized order, failure memory, the two commands, `main.ts` registration, `helpEntries()`, README/TODO. After this phase a preview is produced end to end.

Phase complete when: acceptance tests with a fake renderer, fake timers and a seeded RNG cover skip-when-current, delay + re-check, failure memory, the startup reconcile, create/modify queueing and collision on render.

### Test Scenarios

- GIVEN a source whose preview carries the current fingerprint WHEN queued THEN the renderer is not called.
- GIVEN a queued job and a seeded RNG WHEN fake time advances THEN it runs not before 30 s and not after 120 s.
- GIVEN a queued job WHEN a current preview appears before the delay ends THEN nothing is rendered.
- GIVEN 3 due jobs WHEN run THEN never more than one render is in flight.
- GIVEN a source with failure entry F WHEN reconciled with unchanged fingerprint THEN not queued; GIVEN changed content THEN queued.
- GIVEN a failing renderer WHEN reconciled twice THEN the renderer is called once and the second pass queues 0.
- GIVEN a renderer returning a generic-icon-like image with exit 0 WHEN reconciled twice THEN the renderer is called once.
- GIVEN layout ready WHEN 119 s elapse THEN no reconcile; at 120 s the reconcile queues missing/stale sources only, in an order produced by the injected shuffle.
- GIVEN enabled=false WHEN a source is created THEN nothing is queued.
- GIVEN a non-macOS platform WHEN the plugin loads THEN no vault listener and no command is registered.
- GIVEN the same file path, size and mtime WHEN fingerprinted twice THEN the file is read once.
- GIVEN three modify events on one path within 5 s WHEN processed THEN one job is queued.
- GIVEN a modify event with a changed hash THEN the source is queued; with an unchanged hash THEN it is not rendered.
- GIVEN an unmarked file at the mirror path WHEN the source is rendered THEN the file is not overwritten and the source is recorded as `collision`.
- GIVEN a collision entry WHEN the foreign file is deleted (vault `delete` at the mirror path) THEN the entry is cleared and the source is queued.
- GIVEN a source modified during its render WHEN the render finishes THEN the marker holds the pre-render fingerprint.
- GIVEN `office-preview-render-active` on a failed source WHEN run THEN it renders at once ignoring the failure entry; on a non-source file THEN the German Notice; with the feature disabled THEN the disabled Notice.
- GIVEN `office-preview-status` WHEN run THEN the Notice shows counts matching the in-memory current set, the queue length and the failure memory.
- GIVEN a source file absent on disk WHEN its job runs THEN the job is dropped and no failure is recorded.
- GIVEN corrupt device-storage JSON WHEN loaded THEN the cache is empty and nothing throws.

## Phase 3 — Lifecycle

`rename`/`delete` handling with marker guard, collision on rename, mirror-folder creation, empty-folder cleanup, serialised rename processing.

Phase complete when: acceptance tests cover rename (preview moved via `fileManager.renameFile`), delete (only marked previews), rename collision, folder cleanup, and convergence after rename.

### Test Scenarios

- GIVEN a marked preview WHEN the source is renamed to a new folder THEN `fileManager.renameFile` moves it, missing folders are created first, and the emptied old parent folder is removed but `_previews` remains.
- GIVEN a marked preview WHEN the source is deleted THEN it is deleted and emptied parents are removed.
- GIVEN a source without preview WHEN it is renamed THEN it is queued like a create and nothing fails.
- GIVEN an unmarked file at the mirror path WHEN the source is deleted THEN untouched.
- GIVEN an unmarked file at the new mirror path WHEN the source is renamed THEN neither file is changed and a collision is recorded.
- GIVEN a preview exists without a marker at the old path WHEN the source is renamed THEN it is not moved.
- GIVEN a source with a missing preview WHEN it is deleted THEN no error occurs.
- GIVEN a renamed source with a moved marked preview WHEN reconcile runs THEN 0 renders occur and the preview bytes are unchanged (the stale marker `source` is ignored).
- GIVEN an orphan marked preview and no delete event WHEN startup reconcile runs THEN it still exists.
- GIVEN a queued job WHEN its source is renamed THEN the job runs against the new path.
- GIVEN a rename from `a.tmp` to `a.docx` WHEN processed THEN it is handled as a create.
- GIVEN a rename into the preview folder WHEN processed THEN existing previews are untouched.

## Phase 4 — Embed after drop

`drop-embed.ts`: `editor-drop`/`editor-paste` tracking, immediate render, insertion of the preview embed below the document link (editor API, `vault.process` fallback), deadline, failure Notice.

Phase complete when: acceptance tests cover drop → immediate render → embed below the link, typing between drop and insertion, a closed note, a removed link, a failed render, and the window/deadline boundaries.

### Test Scenarios

- GIVEN an `editor-drop` of `Angebot.docx` in note N WHEN `_resources/Angebot.docx` is created 1 s later THEN it is rendered without delay, the line `![[Angebot.docx]]` becomes `[[Angebot.docx]]`, and `![[Angebot.docx.png]]` is inserted on the line below.
- GIVEN the note already holds a plain link `[[Angebot.docx]]` WHEN the embed is inserted THEN the link line stays unchanged.
- GIVEN an `editor-drop` of `Angebot.docx` while `_resources/Angebot.docx` exists WHEN Obsidian creates `_resources/Angebot 1.docx` THEN it is matched to the drop.
- GIVEN an `editor-drop` of `Angebot.docx` WHEN an unrelated `Bericht.docx` is created within 10 s THEN it is not matched and is queued with the random delay.
- GIVEN a drop of `Angebot.docx` WHEN the file is created 10 s + 1 ms later THEN it is not matched.
- GIVEN the embed was inserted WHEN the user undoes once THEN both the link conversion and the preview line are reverted, and the insertion used exactly one editor transaction.
- GIVEN the user typed three lines above the link before the render finished WHEN the embed is inserted THEN it lands directly below the link, not at the drop-time offset.
- GIVEN N was closed before the render finished WHEN the embed is inserted THEN it is written through `vault.process` below the link.
- GIVEN the user deleted the link before the render finished WHEN the render finishes THEN N is not changed.
- GIVEN N already embeds the preview WHEN the source is dropped again THEN no second embed is inserted.
- GIVEN a note with both `![[Angebot.docx]]` and `![[Angebot.docx.png]]` WHEN the insertion runs twice THEN the content is byte-identical to the original (no link conversion).
- GIVEN a note with two `![[Angebot.docx]]` lines and no preview embed WHEN inserting THEN the first matching line from the top is used.
- GIVEN a source created 30 s after the last drop WHEN it is created THEN it is queued with the random delay and nothing is inserted.
- GIVEN the render of a dropped source fails WHEN it finishes THEN N is not changed and a Notice names the document.
- GIVEN a dropped source whose preview does not exist 60 s after matching WHEN the deadline passes THEN nothing is inserted.
- GIVEN an `editor-paste` with file names WHEN the file is created within 10 s THEN it is matched like a drop; GIVEN no file names THEN nothing is recorded.
- GIVEN a drop of two files WHEN both are created THEN each is matched and gets its own embed.
- GIVEN the feature disabled WHEN a drop occurs THEN nothing is recorded.

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
| Form after the drop | `[[Angebot.docx]]` (clickable, opens the document) with `![[Angebot.docx.png]]` below (operator decision) | Keep Obsidian's `![[Angebot.docx]]`: a grey box above the image whose click behaviour is unverified |
| Matching a created file to a drop | File name from `DataTransfer.files` (with collision suffix) within 10 s | Time window alone: any file synced in during the window would be embedded into the note |
| Locating the insertion point | Search the note's current content for the link at insertion time | Offset recorded at drop time: wrong as soon as the user keeps typing while the render runs |
| Orphans | Delete only on a `delete` event | Startup orphan sweep: a device that excludes Office files from selective sync would see every preview as orphaned and delete them all |
| Hashing | `adapter.readBinary` + global `crypto.subtle.digest`, no size cap | Externalizing Node `crypto`: extra esbuild change for no gain |
| Marker `source` field | Informational, never compared or rewritten | Comparing it: a moved preview would re-render forever; rewriting on rename: changes the image and re-syncs it |
| Kill | SIGKILL directly on the spawned process, `timeout` reported regardless | SIGTERM grace period: a hung Quick Look may ignore it and block the single worker |
| Unverified formats | All 12 extensions stay supported (operator decision); the Phase 1 experiment documents iWork/OpenDocument results and a failing format goes to the operator | Removing formats that fail or cannot be sampled automatically: overrides the operator's confirmed list without asking |
| Rename collision | Leave both files, record `collision` | Overwrite or delete the foreign file: violates requirement 16 |
| Collision retry | Clear the `collision` entry when the mirror path gets a `create`/`delete` event | Never retry: the source stays failed after the user removes the foreign file |
| Drop-time insertion form | `editor.transaction` with one change; `generateMarkdownLink` for the embed text | Two `replaceRange` calls: two undo steps. Hand-built `![[name]]`: ambiguous with duplicate basenames and ignores the user's link setting |
| Drop code placement | `drop-embed.ts` and `device-cache.ts` separate from the feature file | One feature file: mixes settings, events, reconcile, commands, cache and note editing |

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
- Markdown-style links (`[x](Angebot.docx)`) in the drop embed; hiding `_previews` from the explorer/graph.
