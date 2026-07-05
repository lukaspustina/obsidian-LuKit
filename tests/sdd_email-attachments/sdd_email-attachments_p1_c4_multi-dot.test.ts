import { describe, it, expect } from "vitest";
import { resolveAttachmentFileNames } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c4: multi-dot suffix placement before the last dot", () => {
	it("inserts the collision suffix before the last dot for a multi-part filename", () => {
		const result = resolveAttachmentFileNames(new Set(["archiv.tar.gz"]), ["archiv.tar.gz"]);
		expect(result).toEqual([{ original: "archiv.tar.gz", resolved: "archiv.tar 2.gz" }]);
	});

	it("bumps to the next suffix when the first-resolved name also already exists", () => {
		const result = resolveAttachmentFileNames(
			new Set(["archiv.tar.gz", "archiv.tar 2.gz"]),
			["archiv.tar.gz"],
		);
		expect(result).toEqual([{ original: "archiv.tar.gz", resolved: "archiv.tar 3.gz" }]);
	});
});
