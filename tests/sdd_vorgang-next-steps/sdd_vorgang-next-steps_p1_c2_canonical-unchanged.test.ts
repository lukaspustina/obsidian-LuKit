// Regression guard, not a RED test: this scenario is expected to PASS already
// today. Phase 1 (SDD vorgang-next-steps) makes the "# Nächste Schritte"
// header lookup tolerant of the lowercase "# nächste Schritte" spelling too;
// this test pins the CURRENT byte-for-byte output for the canonical spelling
// so that change cannot alter it. The expected string below was derived by
// hand-tracing today's mergeVorgangContent (sliceSectionBody, mergeH1Section,
// findH5InsertIndex) against the fixture — do not "fix" this test to match a
// future implementation; if it goes red, the canonical path regressed.
import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent leaves the canonical '# Nächste Schritte' spelling unchanged (SDD vorgang-next-steps p1 c2)", () => {
	it("produces byte-identical merge output for a canonically-spelled source", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- A",
			"",
			"# Nächste Schritte",
			"- Schritt 1",
			"- Schritt 2",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const targetContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- X",
			"",
			"# Nächste Schritte",
			"- Schritt Y",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 6, 5);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		const expectedContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- X",
			"- A",
			"",
			"# Nächste Schritte",
			"- Schritt Y",
			"- Schritt 1",
			"- Schritt 2",
			"",
			"# Inhalt",
			"",
		].join("\n");

		expect(result.newTargetContent).toBe(expectedContent);
		expect(result.mergedSections).toBe(0);
		expect(result.skippedDuplicates).toBe(0);
	});
});
