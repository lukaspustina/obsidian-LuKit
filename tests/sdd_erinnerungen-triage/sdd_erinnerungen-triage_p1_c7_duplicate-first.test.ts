import { describe, it, expect } from "vitest";
import { removeReminderLine } from "../../src/features/work-diary/work-diary-engine";

describe("removeReminderLine duplicate lines (SDD erinnerungen-triage p1 c7)", () => {
	it("removes only the first occurrence of two textually identical reminder lines", () => {
		const line = "- Zahnarzt anrufen, 01.07.2026";
		const content = [
			"---",
			"tags: []",
			"---",
			"",
			"# Erinnerungen",
			"",
			line,
			line,
			"",
			"---",
			"",
			"##### Mi, 01.07.2026",
			"- Eintrag",
		].join("\n");

		const before = content.split("\n").filter((entry) => entry === line).length;
		expect(before).toBe(2);

		const result = removeReminderLine(content, line);

		expect(result).not.toBeNull();
		const after = result!.newContent.split("\n").filter((entry) => entry === line).length;
		expect(after).toBe(1);
	});
});
