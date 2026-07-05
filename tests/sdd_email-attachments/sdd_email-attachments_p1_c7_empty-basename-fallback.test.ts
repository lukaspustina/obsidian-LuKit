import { describe, it, expect } from "vitest";
import { resolveAttachmentFileNames } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c7", () => {
	it("falls back to 'Anhang' when the basename is empty (trailing slash)", () => {
		const result = resolveAttachmentFileNames(new Set(), ["docs/"]);
		expect(result).toEqual([{ original: "docs/", resolved: "Anhang" }]);
	});

	it("falls back to 'Anhang' when the basename is only dots ('..')", () => {
		const result = resolveAttachmentFileNames(new Set(), [".."]);
		expect(result).toEqual([{ original: "..", resolved: "Anhang" }]);
	});

	it("falls back to 'Anhang' when the basename is only dots ('.')", () => {
		const result = resolveAttachmentFileNames(new Set(), ["."]);
		expect(result).toEqual([{ original: ".", resolved: "Anhang" }]);
	});

	it("resolves a collision with an existing 'Anhang' file to 'Anhang 2'", () => {
		const result = resolveAttachmentFileNames(new Set(["Anhang"]), [".."]);
		expect(result).toEqual([{ original: "..", resolved: "Anhang 2" }]);
	});

	it("resolves a batch-internal collision between two empty-basename attachments to 'Anhang' and 'Anhang 2'", () => {
		const result = resolveAttachmentFileNames(new Set(), ["docs/", ".."]);
		expect(result).toEqual([
			{ original: "docs/", resolved: "Anhang" },
			{ original: "..", resolved: "Anhang 2" },
		]);
	});
});
