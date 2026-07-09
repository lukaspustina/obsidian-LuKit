import { describe, it, expect } from "vitest";
import { preselectAttachment } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachment-selection p1 c4", () => {
	it("falls back to the file extension when mimeType is empty, detecting an image", () => {
		const result = preselectAttachment({ name: "logo.png", mimeType: "", size: 40_000 });

		expect(result).toBe(false);
	});

	it("falls back to the file extension when mimeType is empty, detecting a non-image", () => {
		const result = preselectAttachment({ name: "vertrag.pdf", mimeType: "", size: 40_000 });

		expect(result).toBe(true);
	});

	it("matches the extension fallback case-insensitively", () => {
		const result = preselectAttachment({ name: "LOGO.PNG", mimeType: "", size: 40_000 });

		expect(result).toBe(false);
	});
});
