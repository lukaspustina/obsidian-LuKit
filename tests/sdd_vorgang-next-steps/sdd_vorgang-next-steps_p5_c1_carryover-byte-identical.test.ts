import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

// SDD vorgang-next-steps, Phase 5, Test Scenario 1 / Requirement 42: merging
// a source Vorgang with two intake groups into a target with one carries both
// source groups across, appended after the target's existing group, and every
// group's bytes — target's pre-existing one and both carried-over ones — stay
// byte-for-byte identical to their pre-merge form. `mergeVorgangContent` does
// not yet splice the intake region (Phase 1's sliceSectionBody-based merge
// stops at the "#### Unsortiert" h4 boundary and never sees the groups below
// it), so this fails today: the source's two groups do not appear anywhere in
// the result — the correct RED, not a syntax error.

function findBlock(lines: string[], block: string[]): number {
	outer: for (let i = 0; i <= lines.length - block.length; i++) {
		for (let j = 0; j < block.length; j++) {
			if (lines[i + j] !== block[j]) continue outer;
		}
		return i;
	}
	return -1;
}

describe("mergeVorgangContent carries intake groups across byte-identically (SDD vorgang-next-steps p5 c1)", () => {
	it("appends the source's two groups after the target's one, all byte-for-byte unchanged", () => {
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
			"- Aus [[Besprechung Acme Erstgespräch]]",
			"    - Angebot einholen",
			"- Aus [[Besprechung Acme Folgetermin]]",
			"    - Vertrag prüfen",
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
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Kickoff-Punkt",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 8, 1);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);
		const resultLines = result.newTargetContent.split("\n");

		const targetGroupBlock = ["- Aus [[Besprechung Acme Kickoff]]", "    - Kickoff-Punkt"];
		const sourceGroup1Block = ["- Aus [[Besprechung Acme Erstgespräch]]", "    - Angebot einholen"];
		const sourceGroup2Block = ["- Aus [[Besprechung Acme Folgetermin]]", "    - Vertrag prüfen"];

		const idxTarget = findBlock(resultLines, targetGroupBlock);
		const idxG1 = findBlock(resultLines, sourceGroup1Block);
		const idxG2 = findBlock(resultLines, sourceGroup2Block);

		// Order: target's existing group, then the source's two groups in order.
		expect(idxTarget).toBeGreaterThanOrEqual(0);
		expect(idxG1).toBeGreaterThan(idxTarget);
		expect(idxG2).toBeGreaterThan(idxG1);

		// Byte-identity, not mere presence: each group's exact line range matches
		// its pre-merge bytes verbatim.
		expect(resultLines.slice(idxTarget, idxTarget + targetGroupBlock.length).join("\n")).toBe(
			targetGroupBlock.join("\n"),
		);
		expect(resultLines.slice(idxG1, idxG1 + sourceGroup1Block.length).join("\n")).toBe(
			sourceGroup1Block.join("\n"),
		);
		expect(resultLines.slice(idxG2, idxG2 + sourceGroup2Block.length).join("\n")).toBe(
			sourceGroup2Block.join("\n"),
		);

		// Exactly three groups total — carryover does not duplicate within one merge.
		expect(resultLines.filter((l) => l.startsWith("- Aus [[")).length).toBe(3);
	});
});
