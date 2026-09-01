import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { DateLocale } from "../../src/shared/date-format";

// SDD vorgang-next-steps, Phase 5, Test Scenario 2 / Requirement 42: merging
// a source with an intake into a target that has no "# Nächste Schritte" at
// all creates the section and the "#### Unsortiert" boundary in the target
// (requirements 2 and 3), positioned after "# Fakten und Pointer", with the
// carried-over group below the boundary. `mergeVorgangContent` does not yet
// create this structure — nsBody is empty for the source (sliceSectionBody
// stops at the h4 boundary, leaving only a blank line), so today's merge
// leaves the target without "# Nächste Schritte" entirely — the correct RED,
// not a syntax error.

describe("mergeVorgangContent creates the Nächste-Schritte structure in a target that lacks it (SDD vorgang-next-steps p5 c2)", () => {
	it("creates the section and boundary after Fakten und Pointer, with the group below it", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Angebot einholen",
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
			"- Bestehender Fakt",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 8, 1);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);
		const content = result.newTargetContent;

		const idxFakten = content.indexOf("# Fakten und Pointer");
		const idxNS = content.indexOf("# Nächste Schritte");
		const idxBoundary = content.indexOf("#### Unsortiert");
		const idxGroup = content.indexOf("- Aus [[Besprechung Acme Kickoff]]");
		const idxInhalt = content.indexOf("# Inhalt");

		expect(idxFakten).toBeGreaterThanOrEqual(0);
		expect(idxNS).toBeGreaterThan(idxFakten);
		expect(idxBoundary).toBeGreaterThan(idxNS);
		expect(idxGroup).toBeGreaterThan(idxBoundary);
		expect(idxInhalt).toBeGreaterThan(idxGroup);

		const groups = parseIntakeGroups(content);
		expect(groups).toHaveLength(1);
		expect(groups[0].source).toBe("Besprechung Acme Kickoff");
		expect(groups[0].ownItems.map((i) => i.text)).toEqual(["Angebot einholen"]);
	});
});
