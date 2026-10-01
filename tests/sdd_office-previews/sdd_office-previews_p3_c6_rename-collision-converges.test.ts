import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p3 c6", () => {
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

	it("leaves both files untouched across two reconciles and renders once only after the source is modified", async () => {
		h = createHarness();
		const oldPath = "Alt/Angebot.docx";
		const newPath = "Neu/Angebot.docx";
		const content = "original content";
		h.addSource(oldPath, content);
		h.putFile(h.mirror(oldPath), markedPreview(oldPath, sha256Of(content)));
		await h.start();
		expect(h.renderer.calls).toHaveLength(0);

		// A marked preview of some other fingerprint already occupies the new mirror path.
		h.putFile(h.mirror(newPath), markedPreview(newPath, sha256Of("foreign content")));
		const oldPreviewBefore = h.preview(oldPath)?.slice();
		const occupantBefore = h.preview(newPath)?.slice();

		h.renameSource(oldPath, newPath);
		await h.settle();
		await h.drain();

		await reconcile();
		await reconcile();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview(oldPath)).toEqual(oldPreviewBefore);
		expect(h.preview(newPath)).toEqual(occupantBefore);

		// A changed fingerprint lifts the failure memory: exactly one render.
		h.changeSource(newPath, "changed content");
		await h.drain();

		expect(h.renderer.renderedPaths()).toEqual([newPath]);
		expect(h.previewMarker(newPath)).toEqual({ version: 1, sha256: sha256Of("changed content") });
	});
});
