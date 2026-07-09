import { describe, it, expect } from "vitest";
import { preselectAttachment } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachment-selection p1 c2", () => {
	it("preselects small images off and large images on", () => {
		expect(preselectAttachment({ name: "logo.png", mimeType: "image/png", size: 40_000 })).toBe(false);
		expect(preselectAttachment({ name: "foto.jpg", mimeType: "image/jpeg", size: 800_000 })).toBe(true);
	});
});
