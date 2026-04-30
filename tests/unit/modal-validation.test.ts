import { describe, it, expect } from "vitest";
import { validateText, validateTextAndDate } from "../../src/shared/modal-validation";

describe("validateText", () => {
	it("rejects empty input with 'Text required.'", () => {
		expect(validateText("")).toEqual({ ok: false, error: "Text required." });
	});

	it("rejects whitespace-only input", () => {
		expect(validateText("   \t  ")).toEqual({ ok: false, error: "Text required." });
	});

	it("trims and returns valid input", () => {
		expect(validateText("  hello  ")).toEqual({ ok: true, text: "hello" });
	});
});

describe("validateTextAndDate", () => {
	it("rejects empty text with 'Text required.'", () => {
		expect(validateTextAndDate("", "06.02.2026", "de")).toEqual({
			ok: false,
			error: "Text required.",
		});
	});

	it("rejects unparseable date with locale-specific hint (de)", () => {
		expect(validateTextAndDate("hi", "31/02/2026", "de")).toEqual({
			ok: false,
			error: "Invalid date — expected DD.MM.YYYY",
		});
	});

	it("rejects unparseable date with locale-specific hint (iso)", () => {
		expect(validateTextAndDate("hi", "13.02.2026", "iso")).toEqual({
			ok: false,
			error: "Invalid date — expected YYYY-MM-DD",
		});
	});

	it("rejects unparseable date with locale-specific hint (en)", () => {
		expect(validateTextAndDate("hi", "garbage", "en")).toEqual({
			ok: false,
			error: "Invalid date — expected MM/DD/YYYY",
		});
	});

	it("returns trimmed text and parsed date for valid input", () => {
		const result = validateTextAndDate("  hello  ", "06.02.2026", "de");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.text).toBe("hello");
			expect(result.date.getFullYear()).toBe(2026);
			expect(result.date.getMonth()).toBe(1);
			expect(result.date.getDate()).toBe(6);
		}
	});

	it("validates text BEFORE date so empty-text error wins over bad-date error", () => {
		const result = validateTextAndDate("", "garbage", "de");
		expect(result).toEqual({ ok: false, error: "Text required." });
	});
});
