import { describe, it, expect } from "vitest";
import { buildIntakeGroup, insertIntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("insertIntakeGroup writes a zero-item group with no sub-bullets (SDD vorgang-next-steps p2 c10)", () => {
	it("writes the parent bullet with nothing indented beneath it", () => {
		const baseContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const group = buildIntakeGroup([], "Besprechung Acme Kickoff", []);
		const result = insertIntakeGroup(baseContent, group);

		const lines = result.split("\n");
		const parentIndex = lines.indexOf("- Aus [[Besprechung Acme Kickoff]]");

		expect(parentIndex).toBeGreaterThanOrEqual(0);

		const nextLine = lines[parentIndex + 1];
		expect(nextLine === undefined || !nextLine.startsWith("    ")).toBe(true);
	});
});
