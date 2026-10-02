# SDD Implementation Report: office-previews.md

**Date**: 2026-10-01
**Phases run**: 1, 2, 3, 4 (one phase per wave — `adlc phase-plan` resolved a strict chain)
**Overall status**: all-shipped
**Documentation commit**: b3b104f (README, TODO, CLAUDE.md); 829ad00 (format experiment recorded in the SDD)
**SDD amendments suggested**: 16 (all for phases already run; listed below)

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 1 | Engine and Renderer | shipped | 38c1a6a |
| 2 | Queue, Write Path, Reconcile and Settings | shipped | 439ecd1 |
| 3 | Lifecycle | shipped | 7c2dc53 |
| 4 | Embed after drop | shipped | 5713a7f |

Follow-up commit: 22e3a13 — p1 c18 reads the format experiment from the SDD (active or archived), because `/sdd-finish` deletes this report.

Test naming: the runner collects `tests/**/*.test.ts`, which admits the per-criterion name, so every scenario is `tests/sdd_office-previews/sdd_office-previews_p<N>_c<M>_<slug>.test.ts` (82 files). Shared test infrastructure: `tests/helpers/office-previews-harness.ts`, extensions to `tests/helpers/obsidian-stub.ts` (`Platform`, `TFolder`, `FileSystemAdapter`, `MarkdownView`, `TFile.stat.size`). Extra regression tests from the phase reviews: `tests/unit/office-previews-guards.test.ts`, `tests/unit/office-previews-engine.test.ts`.

Process deviations (stated, not silent):
- Dependency analysis and planning were done by the orchestrator, not by separate agents; production code was written by the orchestrator, not a coder-agent loop. No test hit an iteration cap.
- Test writers: Phase 1 one agent per criterion; Phase 2 a Workflow run of 27 agents (the operator had not opted in to Workflow — same work and cost as 27 Agent calls); Phases 3–4 one agent per 5–7 criteria, still one file per criterion.
- Test files changed after their baseline commits, each with a `path: reason` line in `.adlc/cycle/office-previews/test-changes.md` and no assertion weakened: p1 c13/c14 (TMPDIR isolation, flaky leak check), p2 c4 (setup respects req 33), harness (digest stub; settle in 1 ms rounds), `tests/unit/types.test.ts` (new settings block), p4 c3/c17 (sources added after the startup reconcile), p1 c18 (reads the SDD), guards test (added review regressions).
- Real-process renderer tests (p1 c13–c17) and the verify gate were run outside the Claude sandbox: `qlmanage`, `sips` and `textutil` cannot write to the sandbox's temp dir.

## SDD Amendments Needed

All amendments concern phases that already ran; none blocks.

| # | Phase | Repaired in phase | Amendment |
|---|---|---|---|
| A1 | 1 | yes — resolved 2026-10-02 | Operator dropped `ods`/`odp` from `SUPPORTED_EXTENSIONS` (Quick Look hangs on them); SDD req 3/4 and the Decision Log updated. |
| A2 | 1 | yes | The renderer settles `timeout` immediately on expiry (req 10 "regardless of whether the kill succeeds"); `dispose()` suppresses the EDR warning for its own kill. |
| A3 | 1 | no | `DropRecord` lives in the engine (re-exported by `drop-embed.ts`); `tests/unit/office-previews-renderer.test.ts` from the File table was not created (p1 c13–c17 cover it); the JPEG COM ≤ 65533 cap is not enforced (unreachable with a 64-char sha). |
| A4 | 2 | no | `PreviewQueueDeps.recheck(path, immediate)` and `PreviewQueue.isImmediate(path)` — Data Models show `recheck(path)` only. |
| A5 | 2 | no | Reconcile shuffles source **paths**; `PreviewStore` API is `inspect(mirror): absent / marked / foreign`, `write`, `ensureParent`, `exists`, `remove`, `removeEmptyParents`. |
| A6 | 2 | no | Mock-layer extensions live in `tests/helpers/office-previews-harness.ts`, not `obsidian-mocks.ts`; the harness stubs `crypto.subtle.digest` (native digest resolves outside the fake clock). |
| A7 | 2 | yes | The "current" set is also filled by event-path verification and shrinks on a render/failure decision. |
| A8 | 2 | yes | `run()` re-inspects the mirror path right before writing: a foreign file that arrived during the render is a `collision`, never overwritten (req 16). |
| A9 | 3 | yes | A job whose source was renamed or deleted during its render writes nothing and records no failure. |
| A10 | 3 | yes | Rename bookkeeping (debounce, queued job incl. its delay and `immediate` flag, cache and failure entry) moves at event time; only the preview file operations are serialised. |
| A11 | 3 | yes | A rename from a source to a non-source path drops the old path's bookkeeping (preview untouched). |
| A12 | 3 | yes | Deviates from req 14's literal text: a new mirror path holding a marked preview with the source's current fingerprint (moved by another device) counts as current, not a collision. |
| A13 | 3 | no | Rename/delete while the feature is disabled leaves previews and bookkeeping behind (follows from req 2 + 17) — add to Context's accepted consequences. |
| A14 | 4 | yes | Obsidian writes the dropped `![[…]]` link only after saving the attachment; a missing link is retried on each note `modify` until the 60 s deadline instead of being treated as removed. |
| A15 | 4 | yes | Req 27 Notice also covers a dropped source that collided or could not be read. |
| A16 | 4 | yes | A dropped source whose preview is already current still gets its embed (onPreview on decision `current`). |

**After the verify halt (2026-10-02):** the p2 c25 gap is closed by `tests/unit/office-previews-renderer.test.ts` (real `dispose()` kills the child, temp dir removed); the correctness pass's 1 major + 6 minors are fixed in 6d30345 with regressions in `tests/unit/office-previews-correctness.test.ts` (rename during re-render requeues; write re-checks the source after inspecting the mirror; png↔jpg rename renders anew; moved collision entry cleared; wrongly typed settings tolerated; dot-folder rejected in any segment; no drop-embed write after unload during the note read). SDD req 14 and 21 carry the new rules.

**After the second verify halt (2026-10-02):** p4 c5/c16 gained direct assertions (`DropEmbed.recordCount`, deadline `clearTimeout`); the two majors of the second correctness pass are fixed in 807d5b0 (delete bookkeeping at event time + kept preview when the source is back; unindexed preview on rename removed and re-rendered); the six minors are follow-ups in TODO.md.

`Next: review amendments above, /sdd-refine specs/sdd/office-previews.md` (wording only — no phase left to run).

## Manual Test Plan

Requires Obsidian on this Mac with the built plugin, image sync on, and Settings > LuKit > Office-Vorschauen > **Vorschauen erzeugen** on.

1. Wait 2 min after startup, then run **Office-Vorschau: Status anzeigen** — expected: `… aktuell, … in der Warteschlange, … fehlgeschlagen` with the queue draining over the next minutes and images appearing under `_previews/` mirroring the document folders.
2. Drag a small `.docx` into a note — expected: within ~1 s the line `![[X.docx]]` becomes `[[X.docx]]` and `![[X.docx.png]]` appears below; one ⌘Z reverts both.
3. Drag a small and a large document in one drop — expected: both get their embed (exercises the link-written-after-save retry).
4. Rename a document with a preview into a new folder — expected: the preview moves to the mirrored folder (`_previews/<new folder>/…`), embeds follow, the old mirror folder disappears if empty.
5. Delete a document — expected: its preview is deleted; a hand-placed image without the LuKit marker at a mirror path is never touched.
6. Change and save a document (or pick one whose render failed), then run **Office-Vorschau: Aktuelles Dokument jetzt erzeugen** — expected: preview rendered at once; on a document whose preview is already current nothing is re-rendered (req 18 keeps steps 1–3).
7. On a second Mac: after sync, status shows the same documents as `aktuell` with no re-rendering.

## How to Resume Blocked Phases

None blocked.

---

## Phase 1: Engine and Renderer

**Status**: shipped
**Commit**: 38c1a6a
**Test Baseline**: 1472adb
**Baseline Marker Removed**: none — first run of this phase

### Acceptance Criteria
| # | Criterion | Tests | Status |
|---|-----------|-------|--------|
| c1–c12 | mapping, image-ext, is-source, folder-normalize, PNG/JPEG marker, invalid marker, fingerprint, jitter, link-line, insertion-plan, match-drop | `sdd_office-previews_p1_c1…c12_*` | passing |
| c13–c17 | renderer timeout / exit / external kill / real qlmanage / JPEG | `sdd_office-previews_p1_c13…c17_*` | passing (outside sandbox) |
| c18 | format experiment recorded | `…_p1_c18_format-experiment` | passing |
| c19 | esbuild externals | `…_p1_c19_esbuild-externals` | passing |

### Reviewer Findings
**Blockers**: timeout settled only on `close` — fixed in phase.
**SDD Amendments Needed**: A1, A2, A3.
**Deferred (stuck)**: none
**Nits**: JPEG 0xFF fill bytes between segments read as unmarked (theoretical); renderer test temp-dir race (fixed via TMPDIR isolation).

### Behavioral Verification
Library-only phase (engine + bridge, no entry point); the real renderer was exercised end to end by p1 c16/c17 and the format experiment below.

### Format Experiment

Recorded in the SDD (`## Format Experiment`) so it survives archival: docx, doc, xlsx, xls, pptx, ppt, pages, numbers, key, odt pass; ods, odp fail (hang).

## Phase 2: Queue, Write Path, Reconcile and Settings

**Status**: shipped
**Commit**: 439ecd1
**Test Baseline**: c7d9480
**Baseline Marker Removed**: none — first run of this phase

### Acceptance Criteria
| # | Criterion | Status |
|---|-----------|--------|
| c1–c27 | skip-when-current … help-entries (`sdd_office-previews_p2_c*`) | passing |

### Reviewer Findings
**Blockers**: storage write after dispose; foreign file overwritten during render — both fixed; README/TODO — moved to the closing step (b3b104f) per the skill's shared-docs rule.
**SDD Amendments Needed**: A4–A8.
**Deferred (stuck)**: none (review deferrals D1–D4 fixed in phase).
**Nits**: help entries listed on unsupported platforms; renderer constructed on every platform; folder field normalizes per keystroke.

### Behavioral Verification
Skipped with justification: the entry points are Obsidian commands and vault events, which need a running Obsidian; the acceptance tests drive them headlessly through the harness. Manual Test Plan steps 1, 6, 7.

## Phase 3: Lifecycle

**Status**: shipped
**Commit**: 7c2dc53
**Test Baseline**: 3b55442
**Baseline Marker Removed**: none — first run of this phase

### Acceptance Criteria
| # | Criterion | Status |
|---|-----------|--------|
| c1–c15 | rename-move … cleanup-error (`sdd_office-previews_p3_c*`) | passing (c4, c9 already passed at RED: regression guards) |

### Reviewer Findings
**Blockers**: vault writes after unload inside lifecycle tasks — fixed.
**SDD Amendments Needed**: A9–A13.
**Deferred (stuck)**: none. Open: whether `fileManager.renameFile` accepts a parent folder created via `adapter.mkdir` before the vault indexes it — Manual Test Plan step 4.

### Behavioral Verification
Skipped with justification (Obsidian vault events); Manual Test Plan steps 4, 5.

## Phase 4: Embed after drop

**Status**: shipped
**Commit**: 5713a7f
**Test Baseline**: d019668
**Baseline Marker Removed**: none — first run of this phase

### Acceptance Criteria
| # | Criterion | Status |
|---|-----------|--------|
| c1–c21 | drop-happy … drop-teardown (`sdd_office-previews_p4_c*`) | passing |

### Reviewer Findings
**Blockers**: none.
**SDD Amendments Needed**: A14–A16.
**Deferred (stuck)**: none. Untested by the harness: the wait for a not-yet-indexed preview (`onFileCreated`) — Manual Test Plan step 2.
**Nits**: CRLF notes in the `vault.process` fallback mix line endings; a drop already `defaultPrevented` by another plugin is still recorded (expires harmlessly).

### Behavioral Verification
Skipped with justification (editor-drop needs Obsidian); Manual Test Plan steps 2, 3.
