import { describe, it, expect } from "vitest";
import { snoozeDate } from "../../src/features/task-triage/task-triage-engine";

describe("snoozeDate — Wednesday reference date", () => {
	const today = "2026-07-01"; // Wednesday

	it("returns today+1 day for \"tomorrow\"", () => {
		expect(snoozeDate("tomorrow", today)).toBe("2026-07-02");
	});

	it("returns today+7 days for \"week\"", () => {
		expect(snoozeDate("week", today)).toBe("2026-07-08");
	});

	it("returns the following Monday for \"nextMonday\"", () => {
		expect(snoozeDate("nextMonday", today)).toBe("2026-07-06");
	});

	it("handles a month-boundary case for \"tomorrow\"", () => {
		expect(snoozeDate("tomorrow", "2026-07-31")).toBe("2026-08-01");
	});
});
