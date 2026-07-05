import { describe, it, expect } from "vitest";
import { resolveAttachmentFileNames } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c1", () => {
	it("resolves a collision against an existing file, leaving a non-colliding name untouched", () => {
		const existingNames = new Set(["rechnung.pdf"]);
		const attachmentNames = ["rechnung.pdf", "foto.jpg"];

		const result = resolveAttachmentFileNames(existingNames, attachmentNames);

		expect(result).toEqual([
			{ original: "rechnung.pdf", resolved: "rechnung 2.pdf" },
			{ original: "foto.jpg", resolved: "foto.jpg" },
		]);
	});
});
