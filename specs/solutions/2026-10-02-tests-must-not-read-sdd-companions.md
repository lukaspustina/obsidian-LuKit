# A test that reads a companion file breaks at archival

Date: 2026-10-02 · SDD: `specs/done/sdd/office-previews-2026-10-02.md`

**What failed:** acceptance test p1 c18 checked the format-experiment table in `specs/sdd/office-previews.report.md`. `/sdd-finish` deletes that report, so the suite would have gone red the moment the cycle archived — caught only while writing the roll-up.

**What worked:** the experiment table moved into the SDD itself (`### Format Experiment`), which is archived, and the test resolves the SDD at `specs/sdd/<stem>.md` or, after archival, the newest `specs/done/sdd/<stem>-<date>.md`.

**Rule:** a test may read the SDD (it survives as the record), never `<stem>.report.md` or `<stem>.validate-findings.md`.
