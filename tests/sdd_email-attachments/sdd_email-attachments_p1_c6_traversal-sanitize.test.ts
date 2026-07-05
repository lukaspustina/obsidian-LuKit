import { describe, it, expect } from "vitest";
import { resolveAttachmentFileNames } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c6", () => {
	it("strips a leading ../../ traversal segment to its basename", () => {
		const result = resolveAttachmentFileNames(new Set(), ["../../evil.pdf"]);
		expect(result).toEqual([{ original: "../../evil.pdf", resolved: "evil.pdf" }]);
	});

	it("strips a single subdirectory segment to its basename", () => {
		const result = resolveAttachmentFileNames(new Set(), ["foo/bar.pdf"]);
		expect(result).toEqual([{ original: "foo/bar.pdf", resolved: "bar.pdf" }]);
	});

	it("strips a Windows-style backslash traversal segment to its basename", () => {
		const result = resolveAttachmentFileNames(new Set(), ["..\\evil.pdf"]);
		expect(result).toEqual([{ original: "..\\evil.pdf", resolved: "evil.pdf" }]);
	});

	it("basename is everything after the last / or \\, and resolved never contains a path separator or .. segment", () => {
		const result = resolveAttachmentFileNames(new Set(), ["../../evil.pdf", "foo/bar.pdf", "..\\evil.pdf"]);
		for (const { resolved } of result) {
			expect(resolved).not.toMatch(/[/\\]/);
			expect(resolved.split(".")).not.toContain("..");
		}
	});

	it("resolves the batch-internal collision between the two evil.pdf traversal names to a suffixed second name", () => {
		const result = resolveAttachmentFileNames(new Set(), ["../../evil.pdf", "foo/bar.pdf", "..\\evil.pdf"]);
		expect(result).toEqual([
			{ original: "../../evil.pdf", resolved: "evil.pdf" },
			{ original: "foo/bar.pdf", resolved: "bar.pdf" },
			{ original: "..\\evil.pdf", resolved: "evil 2.pdf" },
		]);
	});
});
