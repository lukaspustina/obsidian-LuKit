## Phase 1: Engine and Renderer

### Format Experiment

Run 2026-10-01 on this Mac (`qlmanage -t -s 1200 -o <dir> <file>`, 20 s hard kill, outside the sandbox). docx/doc/odt generated with `textutil`; ods/odp generated as minimal valid ODF zips; all other formats from local files found via Spotlight (up to 4 per format, rendered into a scratch dir, images and names not recorded). A format passes when a sample renders to a PNG with exit 0 within 20 s.

| Extension | Result | Samples | Notes |
|---|---|---|---|
| `docx` | pass | 1 generated | ~0.2 s |
| `doc` | pass | 1 generated | ~0.2 s |
| `xlsx` | pass | 4 local | 4/4 rendered |
| `xls` | pass | 4 local | 4/4 rendered |
| `pptx` | pass | 4 local | 3/4 rendered; one 4 MB deck hung and was killed at 20 s (the hang class the timeout exists for) |
| `ppt` | pass | 1 local | ~0.3 s |
| `pages` | pass | 1 local | ~0.1 s |
| `numbers` | pass | 1 local | ~0.1 s |
| `key` | pass | 4 local | 4/4 rendered |
| `odt` | pass | 1 generated | ~0.1 s |
| `ods` | fail | 1 generated | hung, killed at 20 s — no Quick Look thumbnail generator for ODS on this macOS |
| `odp` | fail | 1 generated, 1 local | both hung, killed at 20 s |

`SUPPORTED_EXTENSIONS` is unchanged. **Open decision for the operator:** `ods` and `odp` never render; each such file costs one 20 s timeout per device and fingerprint before the failure memory stops retries (neither vault holds any today).
