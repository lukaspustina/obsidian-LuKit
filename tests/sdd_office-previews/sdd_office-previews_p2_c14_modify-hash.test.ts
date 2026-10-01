import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";
import { JITTER_MIN_MS, MODIFY_DEBOUNCE_MS } from "../../src/features/office-previews/office-previews-engine";

const SOURCE = "Docs/Angebot.docx";

describe("SDD office-previews p2 c14", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	/** A source with a current preview, reconciled so the device knows it is current. */
	async function setupCurrent(content: string): Promise<void> {
		h = createHarness();
		h.addSource(SOURCE, content);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of(content)));
		await h.start();
		expect(h.renderer.calls).toHaveLength(0);
	}

	it("queues the source after a modify event with a changed hash and re-renders it with the new fingerprint", async () => {
		await setupCurrent("version one");

		h.changeSource(SOURCE, "version two");
		await h.advance(MODIFY_DEBOUNCE_MS + 1);

		// Debounce elapsed: the job is queued, but the jitter has not run out yet.
		expect(h.renderer.calls).toHaveLength(0);
		expect((await h.status()).queued).toBe(1);

		await h.advance(JITTER_MIN_MS);
		await h.drain();

		expect(h.renderer.renderedPaths()).toEqual([SOURCE]);
		expect(h.previewMarker(SOURCE)).toEqual({ version: 1, sha256: sha256Of("version two") });
	});

	it("does not queue or render the source after a modify event with an unchanged hash", async () => {
		await setupCurrent("version one");

		// Content identical, only mtime changes.
		h.changeSource(SOURCE, "version one");
		await h.advance(MODIFY_DEBOUNCE_MS + 1);

		expect((await h.status()).queued).toBe(0);

		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.previewMarker(SOURCE)).toEqual({ version: 1, sha256: sha256Of("version one") });
	});
});
