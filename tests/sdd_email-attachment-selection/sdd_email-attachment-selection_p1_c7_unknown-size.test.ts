import { describe, it, expect } from "vitest";
import { preselectAttachment } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachment-selection p1 c7", () => {
	it("treats an image with unknown size as small (not preselected)", () => {
		const result = preselectAttachment({ name: "grafik.png", mimeType: "image/png", size: -1 });

		expect(result).toBe(false);
	});

	it("treats a non-image with unknown size as preselected", () => {
		const result = preselectAttachment({ name: "vertrag.pdf", mimeType: "application/pdf", size: -1 });

		expect(result).toBe(true);
	});
});
