import { describe, it, expect } from "vitest";
import {
	preselectAttachment,
	IMAGE_PRESELECT_MIN_BYTES,
} from "../../src/features/email-filing/email-format-engine";
import type { MailAttachment } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachment-selection p1 c3", () => {
	it("pins the threshold constant to 500_000 bytes", () => {
		expect(IMAGE_PRESELECT_MIN_BYTES).toBe(500_000);
	});

	it("preselects an image at exactly the threshold (inclusive)", () => {
		const att: MailAttachment = { name: "foto.png", mimeType: "image/png", size: 500_000 };

		expect(preselectAttachment(att)).toBe(true);
	});

	it("does not preselect an image one byte below the threshold", () => {
		const att: MailAttachment = { name: "foto.png", mimeType: "image/png", size: 499_999 };

		expect(preselectAttachment(att)).toBe(false);
	});
});
