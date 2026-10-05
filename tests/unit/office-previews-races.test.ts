import { describe, it, expect, afterEach, type Mock } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

// Regressions for the minor races of correctness passes 2 and 3 (2026-10-02),
// one describe per TODO.md entry.

interface AdapterMocks {
	vault: { adapter: { exists: Mock; readBinary: Mock } };
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

/** Makes the adapter's lookups case-insensitive, like APFS; the vault index stays case-sensitive. */
function caseInsensitiveAdapter(harness: Harness): void {
	const { exists, readBinary } = adapter(harness);
	const originalExists = exists.getMockImplementation() as (p: string) => Promise<boolean>;
	const originalRead = readBinary.getMockImplementation() as (p: string) => Promise<ArrayBuffer>;
	const actual = (p: string): string =>
		[...harness.files(), ...harness.folders()].find((x) => x.toLowerCase() === p.toLowerCase()) ?? p;
	exists.mockImplementation(async (p: string) => originalExists(actual(p)));
	readBinary.mockImplementation(async (p: string) => originalRead(actual(p)));
}

describe("a case-only rename", () => {
	it("moves the preview to the new spelling on a case-insensitive file system", async () => {
		h = createHarness();
		h.addSource("Berichte/Report.docx", "body");
		h.putFile(h.mirror("Berichte/Report.docx"), markedPreview("Berichte/Report.docx", sha256Of("body")));
		await h.start();
		caseInsensitiveAdapter(h);

		h.renameSource("Berichte/Report.docx", "Berichte/report.docx");
		await h.settle();
		await h.drain();

		expect(h.files().filter((f) => f.startsWith("_previews/"))).toEqual(["_previews/Berichte/report.docx.png"]);
		expect(h.renderer.renderedPaths()).toEqual([]);
		expect(await h.status()).toEqual({ current: 1, queued: 0, failed: 0 });
	});
});

/** Holds the adapter's answer for `path` until the returned release is called. */
function blockExists(harness: Harness, path: string): () => void {
	const exists = adapter(harness).exists;
	const original = exists.getMockImplementation() as (p: string) => Promise<boolean>;
	let release = (): void => undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	exists.mockImplementation(async (p: string) => {
		if (p === path) await gate;
		return original(p);
	});
	return release;
}

describe("a renamed job that runs before its serialised handleRename", () => {
	it("leaves no orphaned preview at the old mirror path", async () => {
		h = createHarness();
		h.addSource("Alt/Angebot.docx", "v1");
		h.putFile(h.mirror("Alt/Angebot.docx"), markedPreview("Alt/Angebot.docx", sha256Of("v1")));
		h.addSource("Brief.docx", "brief");
		h.putFile(h.mirror("Brief.docx"), markedPreview("Brief.docx", sha256Of("brief")));
		await h.start();
		h.changeSource("Alt/Angebot.docx", "v2");
		await h.advance(10_000);
		expect((await h.status()).queued).toBe(1);

		// An earlier rename keeps the lifecycle chain busy.
		const release = blockExists(h, h.mirror("Brief.docx"));
		h.renameSource("Brief.docx", "Briefe/Brief.docx");
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.drain();
		expect(h.previewMarker("Neu/Angebot.docx")?.sha256).toBe(sha256Of("v2"));

		release();
		await h.settle();
		await h.drain();

		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(false);
		expect(h.previewMarker("Neu/Angebot.docx")?.sha256).toBe(sha256Of("v2"));
		expect(h.previewMarker("Briefe/Brief.docx")?.sha256).toBe(sha256Of("brief"));
		expect(await h.status()).toEqual({ current: 2, queued: 0, failed: 0 });
	});
});
