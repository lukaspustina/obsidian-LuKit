import { describe, it, expect } from "vitest";
import { buildIntakeGroup, insertIntakeGroup, parseIntakeGroups, takeOverGroup } from "../../src/features/vorgang/intake-engine";

describe("item count is preserved through build and take-over (SDD vorgang-next-steps p2 c20)", () => {
	it("keeps the total item count above the boundary equal to the input item lines, mixing own and foreign items", () => {
		const itemLines = [
			"- Angebot einholen",
			"- Max: Rückmeldung einholen",
			"- Rückfrage klären",
		];

		const baseContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Nächste Schritte",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const group = buildIntakeGroup(itemLines, "Besprechung Acme Kickoff", ["Erika"]);
		expect(group.ownItems).toHaveLength(2);
		expect(group.foreignItems).toHaveLength(1);

		const withGroup = insertIntakeGroup(baseContent, group);
		const insertedGroup = parseIntakeGroups(withGroup)[0];

		const result = takeOverGroup(withGroup, insertedGroup);
		expect(result).not.toBeNull();
		const newContent = result!.newContent;

		const lines = newContent.split("\n");
		const boundaryIndex = lines.findIndex((l) => l.trim() === "#### Unsortiert");
		expect(boundaryIndex).toBeGreaterThan(0);

		const curatedLines = lines.slice(0, boundaryIndex);
		const itemBulletCount = curatedLines.filter((l) => l.trim().startsWith("- ") && !l.trim().startsWith("- Aus ")).length;

		expect(itemBulletCount).toBe(itemLines.length);
	});
});
