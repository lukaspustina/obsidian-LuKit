import { describe, it, expect } from "vitest";
import { resolveAttachmentFileNames } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c3: no-extension and leading-dot suffix placement", () => {
	it("appends the suffix at the end for an extensionless attachment colliding with an existing file", () => {
		const result = resolveAttachmentFileNames(new Set(["README"]), ["README"]);
		expect(result).toEqual([{ original: "README", resolved: "README 2" }]);
	});

	it("appends the suffix at the end for a leading-dot name (no real extension) on collision", () => {
		const result = resolveAttachmentFileNames(new Set([".gitignore"]), [".gitignore"]);
		expect(result).toEqual([{ original: ".gitignore", resolved: ".gitignore 2" }]);
	});
});
