import { describe, it, expect } from "vitest";
import {
	formatDate,
	formatWeekday,
	formatDateWithWeekday,
} from "../../src/shared/date-format";

describe("formatDate", () => {
	const friday = new Date(2026, 1, 6); // Feb 6, 2026

	it("formats German date (DD.MM.YYYY)", () => {
		expect(formatDate(friday, "de")).toBe("06.02.2026");
	});

	it("formats English date (MM/DD/YYYY)", () => {
		expect(formatDate(friday, "en")).toBe("02/06/2026");
	});

	it("formats ISO date (YYYY-MM-DD)", () => {
		expect(formatDate(friday, "iso")).toBe("2026-02-06");
	});

	it("zero-pads single-digit day and month", () => {
		const date = new Date(2026, 0, 5); // Jan 5
		expect(formatDate(date, "de")).toBe("05.01.2026");
		expect(formatDate(date, "en")).toBe("01/05/2026");
		expect(formatDate(date, "iso")).toBe("2026-01-05");
	});

	it("handles double-digit day and month", () => {
		const date = new Date(2026, 11, 25); // Dec 25
		expect(formatDate(date, "de")).toBe("25.12.2026");
		expect(formatDate(date, "en")).toBe("12/25/2026");
		expect(formatDate(date, "iso")).toBe("2026-12-25");
	});
});

describe("formatWeekday", () => {
	it("returns German weekday abbreviations", () => {
		const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
		for (let i = 0; i < 7; i++) {
			const date = new Date(2026, 0, 4 + i); // Jan 4 is Sunday
			expect(formatWeekday(date, "de")).toBe(days[i]);
		}
	});

	it("returns English weekday abbreviations", () => {
		const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		for (let i = 0; i < 7; i++) {
			const date = new Date(2026, 0, 4 + i);
			expect(formatWeekday(date, "en")).toBe(days[i]);
		}
	});

	it("returns null for ISO locale", () => {
		const date = new Date(2026, 1, 6);
		expect(formatWeekday(date, "iso")).toBeNull();
	});
});

describe("formatDateWithWeekday", () => {
	const friday = new Date(2026, 1, 6);

	it("combines German weekday and date", () => {
		expect(formatDateWithWeekday(friday, "de")).toBe("Fr, 06.02.2026");
	});

	it("combines English weekday and date", () => {
		expect(formatDateWithWeekday(friday, "en")).toBe("Fri, 02/06/2026");
	});

	it("returns date only for ISO (no weekday)", () => {
		expect(formatDateWithWeekday(friday, "iso")).toBe("2026-02-06");
	});
});
