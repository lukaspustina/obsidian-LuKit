# A fenced block inside a list item is tab-indented

Date: 2026-10-05 · SDD: `specs/done/sdd/office-previews-auto-embed-2026-10-05.md`

**What failed:** the planner's fence regex followed the CommonMark top-level rule (at most 3 leading spaces before the fence, `^ {0,3}`). A code block nested in a list item is indented by a tab (Obsidian's default) or 4+ spaces, so it was scanned as body: a link inside it became the anchor and the embed was written into the user's code. Found by the independent review.

**What worked:** accept any leading tabs/spaces on fence lines (`^[ \t]*`). Over-skipping costs at most a missed embed; under-skipping writes into code.

**Rule of thumb:** when a scanner decides where to write into a user's note, err toward skipping — and test against the indentation Obsidian actually produces, not the spec's base case.
