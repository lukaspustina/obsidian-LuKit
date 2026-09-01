import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

// SDD vorgang-next-steps, Phase 5, Test Scenario 3 / Requirement 42: when the
// source's "# Nächste Schritte" holds both curated bullets and an intake, a
// merge keeps the two apart in the target — curated bullets land above the
// target's "#### Unsortiert" boundary (alongside the target's own curated
// bullet), the source's group lands below it (after the target's own group),
// and neither crosses the boundary. `mergeVorgangContent` today never reads
// past the boundary for groups, so the source's group never appears in the
// result at all — the correct RED, not a syntax error.

describe("mergeVorgangContent keeps curated bullets and intake groups on their own sides of the boundary (SDD vorgang-next-steps p5 c3)", () => {
	it("merges curated bullets above and groups below, none crossing", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Nächste Schritte",
			"- Kuratierter Punkt aus Quelle",
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
			"",
			"# Nächste Schritte",
			"- Bestehender kuratierter Punkt",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Folgetermin]]",
			"    - Vertrag prüfen",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 8, 1);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);
		const content = result.newTargetContent;

		const idxBoundary = content.indexOf("#### Unsortiert");
		const idxCuratedExisting = content.indexOf("- Bestehender kuratierter Punkt");
		const idxCuratedSource = content.indexOf("- Kuratierter Punkt aus Quelle");
		const idxGroupExisting = content.indexOf("- Aus [[Besprechung Acme Folgetermin]]");
		const idxGroupSource = content.indexOf("- Aus [[Besprechung Acme Kickoff]]");

		expect(idxBoundary).toBeGreaterThanOrEqual(0);

		// Curated bullets land above the boundary.
		expect(idxCuratedExisting).toBeGreaterThanOrEqual(0);
		expect(idxCuratedExisting).toBeLessThan(idxBoundary);
		expect(idxCuratedSource).toBeGreaterThanOrEqual(0);
		expect(idxCuratedSource).toBeLessThan(idxBoundary);

		// Groups land below the boundary.
		expect(idxGroupExisting).toBeGreaterThan(idxBoundary);
		expect(idxGroupSource).toBeGreaterThan(idxBoundary);

		// None crossing: no group parent bullet above the boundary, no curated
		// bullet from either note below it.
		const above = content.slice(0, idxBoundary);
		const below = content.slice(idxBoundary);
		expect(above).not.toContain("- Aus [[");
		expect(below).not.toContain("- Kuratierter Punkt aus Quelle");
		expect(below).not.toContain("- Bestehender kuratierter Punkt");
	});
});
