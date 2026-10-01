import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p3 c14", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("drops cache entry, failure entry and queued job on source delete", async () => {
		h = createHarness();
		const source = "Projekte/Angebot.docx";
		// Stale marked preview: the source content differs from the marker.
		h.addSource(source, "version 1");
		h.putFile(h.mirror(source), markedPreview(source, sha256Of("old version")));
		h.renderer.failWith("exit");

		await h.start();
		expect(h.renderer.calls).toHaveLength(1);
		expect(await h.status()).toMatchObject({ failed: 1 });

		// A changed source gets requeued (debounce done, jitter not yet elapsed).
		h.changeSource(source, "version 2");
		await h.advance(6_000);
		await h.settle();
		expect(await h.status()).toMatchObject({ queued: 1, failed: 1 });

		h.deleteFile(source);
		await h.settle();

		expect(await h.status()).toMatchObject({ queued: 0, failed: 0 });
		expect(h.exists(h.mirror(source))).toBe(false);

		// Reconcile queues nothing and leaves no folders behind.
		h.setEnabled(false);
		h.setEnabled(true);
		await h.advance(120_000);
		await h.drain();

		expect(h.renderer.calls).toHaveLength(1);
		expect(await h.status()).toMatchObject({ queued: 0, failed: 0 });
		expect(h.exists("_previews/Projekte")).toBe(false);
		expect(h.exists("_previews")).toBe(true);

		// The device cache and failure memory no longer mention the path.
		h.unload();
		expect(JSON.stringify(h.storage.get("lukit.officePreviews.cache") ?? null)).not.toContain(source);
		expect(JSON.stringify(h.storage.get("lukit.officePreviews.failures") ?? null)).not.toContain(source);
	});
});
