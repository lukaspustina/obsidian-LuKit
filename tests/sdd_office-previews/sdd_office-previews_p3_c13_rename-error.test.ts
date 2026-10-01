import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

interface RenameMock {
	mockRejectedValue(e: unknown): unknown;
	mock: { calls: unknown[][] };
}

describe("SDD office-previews p3 c13", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("leaves the preview as is and records no failure when renameFile throws", async () => {
		h = createHarness();
		const source = "Projekte/Angebot.docx";
		const moved = "Neu/Angebot.docx";
		h.addSource(source);
		h.putFile(h.mirror(source), markedPreview(source, sha256Of(`content of ${source}`)));
		await h.start();
		const before = Array.from(h.preview(source) ?? []);

		const fm = (h.plugin.app as { fileManager: { renameFile: RenameMock } }).fileManager.renameFile;
		fm.mockRejectedValue(new Error("rename failed"));

		h.renameSource(source, moved);
		await h.settle();

		// The move was attempted and failed.
		expect(fm.mock.calls).toHaveLength(1);
		expect(Array.from(h.preview(source) ?? [])).toEqual(before);
		expect(h.exists(h.mirror(moved))).toBe(false);
		expect(await h.status()).toMatchObject({ failed: 0 });
	});
});
