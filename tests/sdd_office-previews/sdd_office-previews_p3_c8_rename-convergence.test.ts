import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p3 c8", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	async function reconcile(): Promise<void> {
		h.setEnabled(false);
		h.setEnabled(true);
		await h.advance(120_000);
		await h.drain();
	}

	it("renders nothing and keeps the moved preview byte-identical across two reconciles", async () => {
		h = createHarness();
		const oldPath = "Alt/Angebot.docx";
		const newPath = "Neu/Angebot.docx";
		const content = "document content";
		const original = markedPreview(oldPath, sha256Of(content));
		h.addSource(oldPath, content);
		h.putFile(h.mirror(oldPath), original);
		await h.start();
		expect(h.renderer.calls).toHaveLength(0);

		h.renameSource(oldPath, newPath);
		await h.settle();
		await h.drain();

		// The preview moved with the source.
		expect(h.preview(newPath)).toEqual(original);
		expect(h.exists(h.mirror(oldPath))).toBe(false);
		expect(h.renderer.calls).toHaveLength(0);

		await reconcile();
		await reconcile();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview(newPath)).toEqual(original);
	});
});
