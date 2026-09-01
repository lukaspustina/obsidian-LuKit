import { describe, it, expect } from "vitest";
import { parseIntakeGroups, snoozeGroup } from "../../src/features/vorgang/intake-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("intake anchor comma is not the due segment (SDD vorgang-next-steps p2 c16)", () => {
	it("parses due as null for an anchor containing its own comma and date", () => {
		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			"- Aus [[#E-Mail-Thread: Angebot, 01.09.2026]]",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const groups = parseIntakeGroups(content);
		expect(groups).toHaveLength(1);
		expect(groups[0].due).toBeNull();
	});

	it("keeps exactly one trailing due date after two snoozes, distinct from the anchor's date", () => {
		const locale: DateLocale = "de";
		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			"- Aus [[#E-Mail-Thread: Angebot, 01.09.2026]]",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const firstGroup = parseIntakeGroups(content)[0];
		const afterFirstSnooze = snoozeGroup(content, firstGroup, new Date(2026, 1, 13), locale);
		expect(afterFirstSnooze).not.toBeNull();

		const secondGroup = parseIntakeGroups(afterFirstSnooze!.newContent)[0];
		const afterSecondSnooze = snoozeGroup(afterFirstSnooze!.newContent, secondGroup, new Date(2026, 1, 20), locale);
		expect(afterSecondSnooze).not.toBeNull();

		const finalGroups = parseIntakeGroups(afterSecondSnooze!.newContent);
		expect(finalGroups).toHaveLength(1);
		expect(finalGroups[0].due).toEqual(new Date(2026, 1, 20));

		const parentLine = finalGroups[0].line;
		const afterLastLinkClose = parentLine.slice(parentLine.lastIndexOf("]]") + 2);
		expect(afterLastLinkClose).toBe(", 20.02.2026");
		expect(parentLine).toContain("Angebot, 01.09.2026");
	});
});
