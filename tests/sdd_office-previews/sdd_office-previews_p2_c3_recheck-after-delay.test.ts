import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";
import { JITTER_MIN_MS, MODIFY_DEBOUNCE_MS } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p2 c3", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("renders nothing when a current preview appears before the delay ends", async () => {
		h = createHarness();
		const path = "Docs/Angebot.docx";
		const content = "angebot content";
		h.layoutReady();
		h.createSource(path, content);

		// Debounce passes, the job is queued and its jitter delay is running.
		await h.advance(MODIFY_DEBOUNCE_MS + 1);
		expect((await h.status()).queued).toBe(1);
		expect(h.renderer.calls).toHaveLength(0);

		// Another device's preview with the current fingerprint arrives during the delay.
		const current = markedPreview(path, sha256Of(content));
		h.putFile(h.mirror(path), current);

		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.read(h.mirror(path))).toEqual(current);
	});

	it("renders once when no current preview appears during the delay (control)", async () => {
		h = createHarness();
		const path = "Docs/Angebot.docx";
		h.layoutReady();
		h.createSource(path, "angebot content");

		await h.advance(MODIFY_DEBOUNCE_MS + 1);
		expect((await h.status()).queued).toBe(1);

		await h.drain();

		expect(h.renderer.renderedPaths()).toEqual([path]);
		expect(h.previewMarker(path)?.sha256).toBe(sha256Of("angebot content"));
	});

	it("still renders when the preview that appears during the delay is stale", async () => {
		h = createHarness();
		const path = "Docs/Angebot.docx";
		h.layoutReady();
		h.createSource(path, "new content");

		await h.advance(MODIFY_DEBOUNCE_MS + 1);
		h.putFile(h.mirror(path), markedPreview(path, sha256Of("old content")));
		await h.advance(JITTER_MIN_MS - 1);

		await h.drain();

		expect(h.renderer.renderedPaths()).toEqual([path]);
		expect(h.previewMarker(path)?.sha256).toBe(sha256Of("new content"));
	});
});
