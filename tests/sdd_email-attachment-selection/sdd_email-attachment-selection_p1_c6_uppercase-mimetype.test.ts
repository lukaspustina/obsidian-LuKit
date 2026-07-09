import { describe, it, expect } from "vitest";
import { preselectAttachment } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachment-selection p1 c6", () => {
	it("treats an uppercase image/* mimeType the same as lowercase (case-insensitive prefix match)", () => {
		const result = preselectAttachment({ name: "foto.png", mimeType: "IMAGE/PNG", size: 40_000 });

		expect(result).toBe(false);
	});
});
