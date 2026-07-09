import { describe, it, expect } from "vitest";
import { preselectAttachment } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachment-selection p1 c1", () => {
	it("preselects a PDF attachment regardless of size (non-images/documents always checked)", () => {
		const result = preselectAttachment({ name: "vertrag.pdf", mimeType: "application/pdf", size: 10_000 });

		expect(result).toBe(true);
	});
});
