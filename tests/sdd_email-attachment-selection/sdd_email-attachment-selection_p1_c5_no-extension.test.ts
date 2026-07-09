import { describe, it, expect } from "vitest";
import { preselectAttachment } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachment-selection p1 c5", () => {
	it("treats a name without an extension as a non-image when mimeType is empty", () => {
		const result = preselectAttachment({ name: "IMG1234", mimeType: "", size: 40_000 });

		expect(result).toBe(true);
	});
});
