# An embed scan must read both link styles Obsidian writes

Date: 2026-10-05 · SDD: `specs/done/sdd/office-previews-auto-embed-2026-10-05.md`

**What failed:** the auto-embed idempotence scan and preview-embed block recognised only `![[…]]`. With "Use [[Wikilinks]]" off, `fileManager.generateMarkdownLink` writes `![alt](url-encoded/path)`, so the scan never saw the embed it had just written and every re-render or backfill stacked another one. Found by the correctness pass, not by any criterion: every fixture used the harness's wikilink default.

**What worked:** one exported `containsEmbedOf` that accepts both forms (Markdown target URL-decoded, `<…>` unwrapped, one level of balanced parentheses — copies are named `Angebot (1).docx`), shared by the planner, the block detection and the drop path; a harness `linkStyle: "markdown"` so a test can run the other setting.

**Rule of thumb:** whatever reads back what `generateMarkdownLink` wrote must accept every format that setting can produce, and the fixture must exercise both.
