import { describe, it, expect } from "vitest";
import { rescheduleReminderLine } from "../../src/features/work-diary/work-diary-engine";

describe("rescheduleReminderLine rewrites the date suffix (SDD erinnerungen-triage p1 c2)", () => {
	it("replaces the date suffix on the matching line, leaving all other lines byte-identical", () => {
		const lines = [
			"---",
			"tags: []",
			"---",
			"",
			"# Erinnerungen",
			"",
			"- Zahnarzt anrufen, 01.07.2026",
			"",
			"---",
			"",
			"##### Mi, 01.07.2026",
			"- Eintrag",
		];
		const content = lines.join("\n");
		const line = "- Zahnarzt anrufen, 01.07.2026";

		const result = rescheduleReminderLine(content, line, new Date(2026, 6, 3), "de");

		expect(result).not.toBeNull();
		const newContent = result?.newContent ?? "";
		const newLines = newContent.split("\n");

		const expectedLines = lines.map((l) => (l === line ? "- Zahnarzt anrufen, 03.07.2026" : l));
		expect(newLines).toEqual(expectedLines);

		expect(newContent).toContain("- Zahnarzt anrufen, 03.07.2026");
		expect(newContent).not.toContain(line);
	});
});
