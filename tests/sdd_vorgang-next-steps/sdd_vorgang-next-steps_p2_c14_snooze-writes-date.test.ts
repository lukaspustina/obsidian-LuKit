import { describe, it, expect } from "vitest";
import {
	buildIntakeGroup,
	insertIntakeGroup,
	parseIntakeGroups,
	snoozeGroup,
} from "../../src/features/vorgang/intake-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("snoozeGroup writes the due date onto the parent line (SDD vorgang-next-steps p2 c14)", () => {
	it("appends ', 13.02.2026' to the parent line and leaves sub-bullets untouched", () => {
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

		const group = buildIntakeGroup(["Angebot einholen"], "Besprechung Acme Kickoff", []);
		const content = insertIntakeGroup(baseContent, group);
		const parsed = parseIntakeGroups(content)[0];

		const locale: DateLocale = "de";
		const due = new Date(2026, 1, 13);
		const result = snoozeGroup(content, parsed, due, locale);

		expect(result).not.toBeNull();
		const newContent = result!.newContent;
		const lines = newContent.split("\n");

		const parentLine = lines.find((l) => l.startsWith("- Aus [[Besprechung Acme Kickoff]]"));
		expect(parentLine).toBe("- Aus [[Besprechung Acme Kickoff]], 13.02.2026");

		const subBulletLine = lines.find((l) => l.includes("Angebot einholen"));
		expect(subBulletLine).toBe("    - Angebot einholen");
	});
});
