import { describe, it, expect, afterEach, vi } from "vitest";
import { createDeviceCache } from "../../src/features/office-previews/device-cache";
import { createHarness, markedPreview, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";

// Regressions from the phase 2 review: no device-storage write after dispose,
// and no overwrite of a foreign file that arrives while a render runs.

describe("office-previews guards", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
		vi.useRealTimers();
	});

	it("device cache writes nothing after dispose, even when an entry arrives later", async () => {
		vi.useFakeTimers();
		const saves: string[] = [];
		const cache = createDeviceCache(
			{ load: () => null, save: (key) => { saves.push(key); } },
			{ setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) },
		);
		cache.dispose();
		await cache.getFingerprint("a.docx", 1, 1, async () => new Uint8Array([1]));
		cache.setFailure("a.docx", { sha256: "x", reason: "exit", at: "2026-10-01T00:00:00.000Z" });
		cache.flush();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(saves).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("records a collision instead of overwriting a foreign file that arrived during the render", async () => {
		h = createHarness();
		await h.start();
		h.renderer.hold();
		h.createSource("Angebot.docx");
		for (let i = 0; i < 30 && h.renderer.held.length === 0; i++) await h.advance(10_000);
		expect(h.renderer.held).toHaveLength(1);

		const foreign = tinyPng(77);
		h.putFile(h.mirror("Angebot.docx"), foreign);
		h.renderer.release();
		await h.settle();

		expect(h.read(h.mirror("Angebot.docx"))).toEqual(foreign);
		expect((await h.status()).failed).toBe(1);
	});

	async function holdFirstRender(path: string): Promise<Harness> {
		const harness = createHarness();
		await harness.start();
		harness.renderer.hold();
		harness.createSource(path);
		for (let i = 0; i < 30 && harness.renderer.held.length === 0; i++) await harness.advance(10_000);
		expect(harness.renderer.held).toHaveLength(1);
		return harness;
	}

	it("writes no preview at the old path when the source is renamed during its render", async () => {
		h = await holdFirstRender("Alt/Angebot.docx");
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		h.renderer.release();
		await h.settle();
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(false);
		expect((await h.status()).failed).toBe(0);
	});

	it("writes no preview and records no failure when the source is deleted during its render", async () => {
		h = await holdFirstRender("Angebot.docx");
		h.deleteFile("Angebot.docx");
		h.renderer.release({ ok: false, reason: "exit" });
		await h.settle();
		expect(h.exists(h.mirror("Angebot.docx"))).toBe(false);
		expect(await h.status()).toMatchObject({ failed: 0 });
	});

	it("drops the failure entry when a source is renamed to a non-source name", async () => {
		h = createHarness();
		h.renderer.failWith("exit");
		h.addSource("Angebot.docx");
		await h.start();
		expect((await h.status()).failed).toBe(1);
		h.renameSource("Angebot.docx", "Angebot.tmp");
		await h.settle();
		expect((await h.status()).failed).toBe(0);
	});

	it("counts a renamed source current when its new mirror path already holds the current preview", async () => {
		h = createHarness();
		h.addSource("Alt/Angebot.docx", "body");
		h.putFile(h.mirror("Alt/Angebot.docx"), markedPreview("Alt/Angebot.docx", sha256Of("body")));
		await h.start();
		h.putFile(h.mirror("Neu/Angebot.docx"), markedPreview("Neu/Angebot.docx", sha256Of("body")));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();
		expect(await h.status()).toMatchObject({ failed: 0 });
		expect(h.renderer.calls).toHaveLength(0);
	});
});
