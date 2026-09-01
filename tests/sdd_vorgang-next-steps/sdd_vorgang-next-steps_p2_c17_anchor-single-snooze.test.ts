import { describe, it, expect } from "vitest";
import { parseIntakeGroups, snoozeGroup } from "../../src/features/vorgang/intake-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("single snooze of an anchor-embedded-comma line (SDD vorgang-next-steps p2 c17)", () => {
	it("sets due to the newly appended date, not the date embedded inside the anchor", () => {
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

		const group = parseIntakeGroups(content)[0];
		const result = snoozeGroup(content, group, new Date(2026, 1, 13), locale);
		expect(result).not.toBeNull();

		const snoozedGroup = parseIntakeGroups(result!.newContent)[0];
		expect(snoozedGroup.due).toEqual(new Date(2026, 1, 13));
		expect(snoozedGroup.due).not.toEqual(new Date(2026, 8, 1));
	});
});
