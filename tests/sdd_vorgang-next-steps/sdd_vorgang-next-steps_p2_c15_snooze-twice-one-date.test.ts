import { describe, it, expect } from "vitest";
import {
	buildIntakeGroup,
	insertIntakeGroup,
	parseIntakeGroups,
	snoozeGroup,
} from "../../src/features/vorgang/intake-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("snoozeGroup replaces rather than appends a trailing date (SDD vorgang-next-steps p2 c15)", () => {
	it("leaves exactly one trailing date after snoozing a group twice", () => {
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

		const locale: DateLocale = "de";
		const group = buildIntakeGroup(["Angebot einholen"], "Besprechung Acme Kickoff", []);
		const content = insertIntakeGroup(baseContent, group);

		const firstGroup = parseIntakeGroups(content)[0];
		const firstResult = snoozeGroup(content, firstGroup, new Date(2026, 1, 13), locale);
		expect(firstResult).not.toBeNull();

		// The parent line changed after the first snooze, so the second snooze must
		// operate on a group re-parsed from that result — group.line is the mutation
		// key, and a stale one would no longer be found.
		const secondGroup = parseIntakeGroups(firstResult!.newContent)[0];
		const secondResult = snoozeGroup(
			firstResult!.newContent,
			secondGroup,
			new Date(2026, 1, 20),
			locale
		);
		expect(secondResult).not.toBeNull();

		const lines = secondResult!.newContent.split("\n");
		const parentLine = lines.find((l) => l.startsWith("- Aus [[Besprechung Acme Kickoff]]"));
		expect(parentLine).toBeDefined();

		const afterAnchor = parentLine!.slice(parentLine!.lastIndexOf("]]") + 2);
		const dateMatches = afterAnchor.match(/\d{2}\.\d{2}\.\d{4}/g);

		expect(dateMatches).toHaveLength(1);
		expect(dateMatches![0]).toBe("20.02.2026");
	});
});
