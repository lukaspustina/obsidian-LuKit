import { describe, it, expect } from "vitest";
import { removeReminderLine, rescheduleReminderLine } from "../../src/features/work-diary/work-diary-engine";

describe("removeReminderLine/rescheduleReminderLine return null for a stale line (SDD erinnerungen-triage p1 c6)", () => {
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
	const staleLine = "- Gibt es nicht, 01.07.2026";

	it("removeReminderLine returns null without throwing", () => {
		expect(() => removeReminderLine(content, staleLine)).not.toThrow();
		expect(removeReminderLine(content, staleLine)).toBeNull();
	});

	it("rescheduleReminderLine returns null without throwing", () => {
		expect(() => rescheduleReminderLine(content, staleLine, new Date(2026, 6, 3), "de")).not.toThrow();
		expect(rescheduleReminderLine(content, staleLine, new Date(2026, 6, 3), "de")).toBeNull();
	});
});
