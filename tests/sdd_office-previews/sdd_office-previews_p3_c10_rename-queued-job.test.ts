import { afterEach, describe, expect, it } from "vitest";
import { createHarness, tinyPng, type Harness } from "../helpers/office-previews-harness";

const CACHE_KEY = "lukit.officePreviews.cache";
const FAILURES_KEY = "lukit.officePreviews.failures";

describe("SDD office-previews p3 c10", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	function keysOf(storageKey: string): string[] {
		let raw = h.storage.get(storageKey);
		if (typeof raw === "string") raw = JSON.parse(raw) as unknown;
		return typeof raw === "object" && raw !== null ? Object.keys(raw) : [];
	}

	it("moves the queued job, the cache entry and the failure entry to the new path", async () => {
		h = createHarness();
		await h.start();

		const oldPath = "Alt/Angebot.docx";
		const newPath = "Neu/Angebot.docx";

		// A failed render leaves a failure entry (and a cache entry) for the old path.
		h.renderer.failWith("exit");
		h.createSource(oldPath, "version one");
		await h.drain();
		expect(h.renderer.renderedPaths()).toEqual([oldPath]);
		expect(await h.status()).toMatchObject({ failed: 1 });

		// A changed fingerprint queues the source again; the job is still waiting.
		h.changeSource(oldPath, "version two");
		await h.advance(5_001);
		await h.settle();
		expect(await h.status()).toMatchObject({ queued: 1, failed: 1 });

		h.renameSource(oldPath, newPath);
		await h.settle();
		await h.advance(5_001);

		expect(await h.status()).toMatchObject({ queued: 1, failed: 1 });
		expect(keysOf(FAILURES_KEY)).toEqual([newPath]);
		expect(keysOf(CACHE_KEY)).toContain(newPath);
		expect(keysOf(CACHE_KEY)).not.toContain(oldPath);

		// The job now runs against the new path.
		const before = h.renderer.calls.length;
		h.renderer.result = (_abs, kind) => ({ ok: true, bytes: kind === "jpg" ? tinyPng() : tinyPng() });
		await h.drain();

		expect(h.renderer.renderedPaths().slice(before)).toEqual([newPath]);
		expect(h.previewMarker(newPath)).not.toBeNull();
		expect(await h.status()).toMatchObject({ queued: 0, failed: 0 });
	});
});
