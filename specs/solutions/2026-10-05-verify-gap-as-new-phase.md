# A verify gap in a closed phase goes in as a new phase

Date: 2026-10-05 · SDD: `specs/done/sdd/office-previews-auto-embed-2026-10-05.md`

**What failed (would have):** `/sdd-verify` returned PARTIAL for Phase 2 (two untested sub-cases) plus a MAJOR from its correctness pass, after Phases 1–3 were committed. `/sdd-implement --phase 2` deletes and rewrites that phase's tests, which would have thrown away 18 green scenario files to add two.

**What worked:** append "Phase 4" to the SDD (`Depends on: Phase 2`), with the fix and the missing sub-cases as its scenarios, and run `/sdd-implement --phase 4`. Scenarios that already pass at the baseline are recorded as such (behaviour implemented earlier, now pinned). Verify then reports the phase-2 gap as covered by phase 4.

**Rule of thumb:** a closed phase is history; a gap found after it is new work with its own baseline.
