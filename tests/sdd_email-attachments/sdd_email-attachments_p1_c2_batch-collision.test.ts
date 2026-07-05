import { describe, it, expect } from "vitest";
import { resolveAttachmentFileNames } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c2", () => {
	it("resolves a batch-internal collision between two same-named attachments, preserving input order", () => {
		const result = resolveAttachmentFileNames(new Set<string>(), ["a.pdf", "a.pdf"]);

		expect(result).toEqual([
			{ original: "a.pdf", resolved: "a.pdf" },
			{ original: "a.pdf", resolved: "a 2.pdf" },
		]);
	});
});
