import { describe, it, expect } from "vitest";
import { insertIntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("insertIntakeGroup appends after an existing group (SDD vorgang-next-steps p2 c4)", () => {
	it("appends the second group after the first, leaving the first group's bytes unchanged", () => {
		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Fakt",
			"",
			"# Nächste Schritte",
			"- Kuratiertes Bullet",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Alt]]",
			"    - Altes Item",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const secondGroup: IntakeGroup = {
			line: "- Aus [[Besprechung Neu]]",
			source: "Besprechung Neu",
			due: null,
			ownItems: [{ text: "Neues Item", children: [] }],
			foreignItems: [],
			lineIndex: -1,
		};

		const result = insertIntakeGroup(content, secondGroup);
		const lines = result.split("\n");

		const indexFirstParent = lines.indexOf("- Aus [[Besprechung Alt]]");
		const indexFirstChild = lines.indexOf("    - Altes Item");
		const indexSecondParent = lines.indexOf("- Aus [[Besprechung Neu]]");
		const indexSecondChild = lines.indexOf("    - Neues Item");

		expect(indexFirstParent).toBeGreaterThanOrEqual(0);
		expect(indexFirstChild).toBeGreaterThan(indexFirstParent);
		expect(indexSecondParent).toBeGreaterThan(indexFirstChild);
		expect(indexSecondChild).toBeGreaterThan(indexSecondParent);

		// The first group's bytes are unchanged — asserted byte-for-byte, not merely "still present".
		const firstGroupBlock = ["- Aus [[Besprechung Alt]]", "    - Altes Item"].join("\n");
		expect(result).toContain(firstGroupBlock);
		expect(lines[indexFirstParent]).toBe("- Aus [[Besprechung Alt]]");
		expect(lines[indexFirstChild]).toBe("    - Altes Item");
	});
});
