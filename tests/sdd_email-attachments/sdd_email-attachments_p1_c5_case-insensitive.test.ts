import { describe, it, expect } from "vitest";
import { resolveAttachmentFileNames } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c5", () => {
	it("resolves a case-insensitive collision (APFS semantics), keeping the attachment's own casing", () => {
		const existingNames = new Set(["Invoice.PDF"]);
		const result = resolveAttachmentFileNames(existingNames, ["invoice.pdf"]);
		expect(result).toEqual([{ original: "invoice.pdf", resolved: "invoice 2.pdf" }]);
	});
});
