import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";
import { CACHE_STORAGE_KEY } from "../../src/features/office-previews/device-cache";

const N = 30;

describe("SDD office-previews p2 c12", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	function seedCurrentSources(): void {
		for (let i = 0; i < N; i++) {
			const path = `Docs/file-${i}.docx`;
			const content = `content of document ${i}`;
			h.addSource(path, content);
			h.putFile(h.mirror(path), markedPreview(path, sha256Of(content)));
		}
	}

	const cacheSaves = (): number => h.saveLocalStorageCalls.filter((c) => c.key === CACHE_STORAGE_KEY).length;

	it("does not write device storage once per fingerprinted file during reconcile", async () => {
		h = createHarness();
		seedCurrentSources();

		await h.start();

		// Every source was fingerprinted (each one is verified current), yet storage was not hit per file.
		expect((await h.status()).current).toBe(N);
		expect(h.renderer.calls).toHaveLength(0);
		expect(cacheSaves()).toBeLessThan(N / 2);
	});

	it("flushes the cache at the end of the reconcile", async () => {
		h = createHarness();
		seedCurrentSources();

		await h.start();

		expect(cacheSaves()).toBeGreaterThanOrEqual(1);
		expect(cacheSaves()).toBeLessThanOrEqual(2);
		expect(h.storage.has(CACHE_STORAGE_KEY)).toBe(true);
	});

	it("does not write the cache before the reconcile has run", async () => {
		h = createHarness();
		seedCurrentSources();

		h.layoutReady();
		await h.advance(119_000);

		expect(cacheSaves()).toBe(0);
	});
});
