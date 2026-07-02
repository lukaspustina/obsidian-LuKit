import { describe, it, expect } from "vitest";
import { rescheduleReminderLine } from "../../src/features/work-diary/work-diary-engine";
import { formatDate } from "../../src/shared/date-format";

function makeContent(reminderLine: string): string {
	return [
		"---",
		"tags: []",
		"---",
		"# Erinnerungen",
		reminderLine,
		"---",
		"##### Do, 02.07.2026",
	].join("\n");
}

describe("rescheduleReminderLine locale round-trip", () => {
	it("rewrites the date suffix exactly per formatDate for locale en", () => {
		const line = "- Call dentist, 07/01/2026";
		const content = makeContent(line);
		const newDate = new Date(2026, 6, 3);

		const result = rescheduleReminderLine(content, line, newDate, "en");

		expect(result).not.toBeNull();
		const expectedLine = `- Call dentist, ${formatDate(newDate, "en")}`;
		expect(expectedLine).toBe("- Call dentist, 07/03/2026");
		expect(result!.newContent).toContain(expectedLine);
		expect(result!.newContent).not.toContain(line);
	});

	it("rewrites the date suffix exactly per formatDate for locale iso", () => {
		const line = "- Call dentist, 2026-07-01";
		const content = makeContent(line);
		const newDate = new Date(2026, 6, 3);

		const result = rescheduleReminderLine(content, line, newDate, "iso");

		expect(result).not.toBeNull();
		const expectedLine = `- Call dentist, ${formatDate(newDate, "iso")}`;
		expect(expectedLine).toBe("- Call dentist, 2026-07-03");
		expect(result!.newContent).toContain(expectedLine);
		expect(result!.newContent).not.toContain(line);
	});
});
