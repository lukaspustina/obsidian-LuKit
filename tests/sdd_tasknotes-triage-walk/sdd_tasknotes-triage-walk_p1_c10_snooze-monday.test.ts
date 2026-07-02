import { describe, it, expect } from "vitest";
import { snoozeDate } from "../../src/features/task-triage/task-triage-engine";

describe("snoozeDate - nextMonday when today is itself a Monday", () => {
	it("returns the Monday one week ahead, not today", () => {
		expect(snoozeDate("nextMonday", "2026-07-06")).toBe("2026-07-13");
	});

	it("returns tomorrow (Monday) when today is Sunday", () => {
		expect(snoozeDate("nextMonday", "2026-07-05")).toBe("2026-07-06");
	});
});
