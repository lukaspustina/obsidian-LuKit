import { describe, it, expect } from "vitest";
import {
	buildIntakeGroup,
	insertIntakeGroup,
	parseIntakeGroups,
	takeOverGroup,
} from "../../src/features/vorgang/intake-engine";

describe("insertIntakeGroup preserves prior take-over lines above the boundary (SDD vorgang-next-steps p2 c5)", () => {
	it("leaves every line above the boundary byte-identical and appends the new group below it", () => {
		const initialContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Fact one",
			"",
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Angebot einholen",
			"    - Warte auf:",
			"        - Max: Rückmeldung geben",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const firstGroup = parseIntakeGroups(initialContent)[0];
		const takenOver = takeOverGroup(initialContent, firstGroup);
		if (takenOver === null) throw new Error("expected takeOverGroup to find the group");
		const afterTakeOver = takenOver.newContent;

		const afterTakeOverLines = afterTakeOver.split("\n");
		const boundaryIndex = afterTakeOverLines.findIndex((l) => l.trim() === "#### Unsortiert");
		expect(boundaryIndex).toBeGreaterThanOrEqual(0);
		const linesAboveBoundaryBeforeInsert = afterTakeOverLines.slice(0, boundaryIndex);
		// The prior take-over must have actually landed above the boundary.
		expect(linesAboveBoundaryBeforeInsert.join("\n")).toContain("Angebot einholen");
		expect(linesAboveBoundaryBeforeInsert.join("\n")).toContain("Rückmeldung geben");

		const newGroup = buildIntakeGroup(["Neues Angebot pruefen"], "Besprechung Acme Folgetermin", []);
		const afterInsert = insertIntakeGroup(afterTakeOver, newGroup);
		const afterInsertLines = afterInsert.split("\n");

		expect(afterInsertLines.slice(0, boundaryIndex)).toEqual(linesAboveBoundaryBeforeInsert);
		expect(afterInsertLines[boundaryIndex].trim()).toBe("#### Unsortiert");

		const newGroupIndex = afterInsertLines.findIndex((l) => l === "- Aus [[Besprechung Acme Folgetermin]]");
		expect(newGroupIndex).toBeGreaterThan(boundaryIndex);
	});
});
