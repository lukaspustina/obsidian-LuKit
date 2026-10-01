import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p2 c1", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("does not call the renderer when the queued source already has a preview with the current fingerprint", async () => {
		h = createHarness();
		const path = "Projekte/Angebot.docx";
		const content = "current document body";
		h.layoutReady();
		h.addSource(path, content);
		const current = markedPreview(path, sha256Of(content));
		h.putFile(h.mirror(path), current);

		// Queue the source through the normal create path and let the job become due.
		h.emit("create", path);
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview(path)).toEqual(current);
		expect(h.previewMarker(path)).toEqual({ version: 1, sha256: sha256Of(content) });
	});

	it("skips a current presentation preview (jpg) as well", async () => {
		h = createHarness();
		const path = "Folien.pptx";
		const content = "current slides";
		h.layoutReady();
		h.addSource(path, content);
		h.putFile(h.mirror(path), markedPreview(path, sha256Of(content)));

		h.emit("modify", path);
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
	});

	it("still renders a source whose preview is missing (control)", async () => {
		h = createHarness();
		const path = "Neu.docx";
		h.layoutReady();
		h.createSource(path, "fresh document");
		await h.drain();

		expect(h.renderer.renderedPaths()).toEqual([path]);
		expect(h.previewMarker(path)?.sha256).toBe(sha256Of("fresh document"));
	});
});
