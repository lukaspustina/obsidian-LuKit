# A region boundary defined twice is defined wrong

Date: 2026-09-02 · SDD: `specs/done/sdd/vorgang-next-steps-2026-09-02.md`

The intake region closes at the next `^#{1,3} ` heading. Three separate functions
decided *where to create* that region, and all three searched with `^#{1,5} `. Every
mismatch had the same consequence — existing note content fell inside the plugin-owned
region, parsed as data, and became deletable by a keystroke meant for generated content.

**What failed:** fixing them one at a time. The defect was found four times across three
review stages, and each repair looked complete because its own test went green:

1. Phase 3 ruling — create the section after the frontmatter when the facts heading is
   absent. Correct about not losing items, wrong about placement.
2. Post-verify correctness pass — repaired that one to "before the first heading".
3. Independent review pass — found the same defect twice more: "first heading" still meant
   h1-h5, and the merge carryover had never been switched away from the old path at all.

**What worked:** deriving the insertion point from the same function that closes the
region, so the two cannot disagree — and routing every writer of the heading through the
intake engine (`createIntakeSection`, `ensureNextStepsSection`) instead of each reaching
for its own splice.

**And it took a fourth round.** The note first claimed that repair complete while
`mergeVorgangContent`'s curated-bullet path was still calling `mergeH1Section`'s own create
branch — a second writer of the same heading, with its own `^#{1,5} ` search. A second
independent review found it, in the very commit that repaired the third instance. Writing
"every writer now asks that function" is not the same as making it true, and the sentence
was easier to write than to check.

**The transferable part:** when a region has a defined end, exactly one function may
define it, and every writer must ask that function. A second regex describing the same
boundary is not duplication to tolerate under the rule of three — it is a defect with a
delay, and each local fix hides the next.

**How it was caught:** not by tests (71 SDD criteria and 854 tests were green throughout)
and not by the author, who had just declared the area repaired twice. It took a reader
with no model of the change, running probes rather than reading.
