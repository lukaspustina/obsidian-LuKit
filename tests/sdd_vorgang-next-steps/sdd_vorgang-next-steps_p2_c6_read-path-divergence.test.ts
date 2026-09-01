import { describe, it, expect } from "vitest";
import { extractNextStepsBody, parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { sliceSectionBody } from "../../src/features/vorgang/vorgang-engine";

describe("extractNextStepsBody and parseIntakeGroups see past the boundary while sliceSectionBody stops at it (SDD vorgang-next-steps p2 c6)", () => {
	it("returns both groups via the intake read path and only the curated part via sliceSectionBody", () => {
		const contentLines = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Nächste Schritte",
			"- Curated bullet",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Angebot einholen",
			"- Aus [[Besprechung Acme Folgetermin]]",
			"    - Rückmeldung geben",
			"",
			"# Inhalt",
			"",
		];
		const content = contentLines.join("\n");

		const body = extractNextStepsBody(content);
		expect(body).toContain("#### Unsortiert");
		expect(body).toContain("- Aus [[Besprechung Acme Kickoff]]");
		expect(body).toContain("- Aus [[Besprechung Acme Folgetermin]]");
		expect(body).not.toContain("# Inhalt");

		const groups = parseIntakeGroups(content);
		expect(groups).toHaveLength(2);
		expect(groups[0].source).toBe("Besprechung Acme Kickoff");
		expect(groups[1].source).toBe("Besprechung Acme Folgetermin");

		const curated = sliceSectionBody(contentLines, "# Nächste Schritte");
		expect(curated).toEqual(["- Curated bullet", ""]);
		expect(curated.join("\n")).not.toContain("#### Unsortiert");
		expect(curated.join("\n")).not.toContain("Besprechung Acme Kickoff");
	});
});
