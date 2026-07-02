import { describe, it, expect } from "vitest";
import { reminderOverdueLabel } from "../../src/features/task-triage/task-triage-engine";
import type { DateLocale } from "../../src/shared/date-format";

const TODAY = "2026-07-02";

describe("reminderOverdueLabel", () => {
	it("returns '3d überfällig' for a date 3 days overdue with locale de", () => {
		const locale: DateLocale = "de";

		const result = reminderOverdueLabel(new Date(2026, 5, 29), TODAY, locale);

		expect(result).toBe("3d überfällig");
	});

	it("returns '3d overdue' for a date 3 days overdue with locale en", () => {
		const locale: DateLocale = "en";

		const result = reminderOverdueLabel(new Date(2026, 5, 29), TODAY, locale);

		expect(result).toBe("3d overdue");
	});

	it("returns empty string for a null date", () => {
		const locale: DateLocale = "de";

		const result = reminderOverdueLabel(null, TODAY, locale);

		expect(result).toBe("");
	});

	it("returns empty string for a date due today", () => {
		const locale: DateLocale = "de";

		const result = reminderOverdueLabel(new Date(2026, 6, 2), TODAY, locale);

		expect(result).toBe("");
	});
});
