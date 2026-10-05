import { describe, it, expect, afterEach, type Mock } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

// Regressions for the minor races of correctness passes 2 and 3 (2026-10-02),
// one describe per TODO.md entry.

interface AdapterMocks {
	vault: { adapter: { exists: Mock } };
}

let h: Harness | undefined;

afterEach(() => {
	h?.dispose();
	h = undefined;
});

const adapter = (harness: Harness): AdapterMocks["vault"]["adapter"] => (harness.plugin.app as AdapterMocks).vault.adapter;

/** Runs `action` once, the first time the adapter is asked whether `path` exists. */
function onExists(harness: Harness, path: string, action: () => void): () => boolean {
	const exists = adapter(harness).exists;
	const original = exists.getMockImplementation() as (p: string) => Promise<boolean>;
	let fired = false;
	exists.mockImplementation(async (p: string) => {
		if (!fired && p === path) {
			fired = true;
			action();
		}
		return original(p);
	});
	return () => fired;
}

async function heldReRender(oldPath: string): Promise<Harness> {
	const harness = createHarness();
	harness.addSource(oldPath, "v1");
	harness.putFile(harness.mirror(oldPath), markedPreview(oldPath, sha256Of("v1")));
	await harness.start();
	harness.renderer.hold();
	harness.changeSource(oldPath, "v2");
	for (let i = 0; i < 30 && harness.renderer.held.length === 0; i++) await harness.advance(10_000);
	expect(harness.renderer.held).toHaveLength(1);
	return harness;
}

describe("a rename or delete during store.write", () => {
	it("leaves no preview at the old mirror path and no current entry for it after a rename", async () => {
		h = await heldReRender("Alt/Angebot.docx");
		const harness = h;
		const fired = onExists(harness, "_previews/Alt", () => harness.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx"));
		h.renderer.unhold();
		h.renderer.release();
		await h.settle();
		await h.drain();

		expect(fired()).toBe(true);
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(false);
		expect(h.previewMarker("Neu/Angebot.docx")?.sha256).toBe(sha256Of("v2"));
		expect(await h.status()).toEqual({ current: 1, queued: 0, failed: 0 });
	});

	it("leaves no preview and no current entry after a delete", async () => {
		h = await heldReRender("Alt/Angebot.docx");
		const harness = h;
		const fired = onExists(harness, "_previews/Alt", () => harness.deleteFile("Alt/Angebot.docx"));
		h.renderer.release();
		await h.settle();
		await h.drain();

		expect(fired()).toBe(true);
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(false);
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 0 });
	});

	it("leaves no placeholder at the old mirror path after a rename during its write", async () => {
		h = createHarness();
		await h.start();
		h.renderer.hold();
		h.createSource("Alt/Angebot.docx");
		for (let i = 0; i < 30 && h.renderer.held.length === 0; i++) await h.advance(10_000);
		expect(h.renderer.held).toHaveLength(1);
		const harness = h;
		const fired = onExists(harness, "_previews/Alt", () => harness.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx"));
		h.renderer.unhold();
		h.renderer.failWith("exit");
		h.renderer.release();
		await h.settle();
		await h.drain();

		expect(fired()).toBe(true);
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(false);
		// The failure moved with the rename; "render now" brings the placeholder back.
		expect((await h.status()).failed).toBe(1);
		expect(h.notices().filter((n) => n.includes("Alt/Angebot.docx"))).toEqual([]);
	});
});
