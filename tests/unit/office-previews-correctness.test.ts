import { describe, it, expect, afterEach, type Mock } from "vitest";
import { mergeSettings } from "../../src/types";
import { createHarness, markedPreview, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";

// Regressions for the findings of the sdd-verify correctness pass (2026-10-01).

interface AppMocks {
	vault: { adapter: { exists: Mock }; read: Mock; process: Mock };
}

describe("office-previews correctness-pass regressions", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
	});

	const app = (): AppMocks => (h as Harness).plugin.app as AppMocks;

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

	it("re-renders a source renamed while its re-render runs instead of keeping the stale preview", async () => {
		h = await heldReRender("Alt/Angebot.docx");
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		h.renderer.unhold();
		h.renderer.release();
		await h.settle();
		await h.drain();

		expect(h.previewMarker("Neu/Angebot.docx")?.sha256).toBe(sha256Of("v2"));
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(false);
	});

	it("does not write to the old mirror path when the rename lands while the mirror is inspected", async () => {
		h = await heldReRender("Alt/Angebot.docx");
		const oldMirror = h.mirror("Alt/Angebot.docx");
		const before = h.read(oldMirror);
		const exists = app().vault.adapter.exists;
		const original = exists.getMockImplementation() as (p: string) => Promise<boolean>;
		let renamed = false;
		exists.mockImplementation(async (p: string) => {
			if (!renamed && p === oldMirror) {
				renamed = true;
				(h as Harness).renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
			}
			return original(p);
		});
		const writesBefore = h.adapterCalls.length;
		h.renderer.release();
		await h.settle();

		expect(renamed).toBe(true);
		expect(before).toBeDefined();
		expect(h.adapterCalls.slice(writesBefore).filter((c) => c.op === "writeBinary" && c.path === oldMirror)).toEqual([]);
	});

	it("re-renders in the new format when a rename changes png to jpg instead of moving the png", async () => {
		h = createHarness();
		h.addSource("Bericht.docx", "body");
		h.putFile(h.mirror("Bericht.docx"), markedPreview("Bericht.docx", sha256Of("body")));
		await h.start();

		h.renameSource("Bericht.docx", "Bericht.pptx");
		await h.settle();
		await h.drain();

		expect(h.exists("_previews/Bericht.docx.png")).toBe(false);
		const jpg = h.read("_previews/Bericht.pptx.jpg");
		expect(jpg).toBeDefined();
		expect([jpg?.[0], jpg?.[1]]).toEqual([0xff, 0xd8]);
		expect(h.renderer.renderedPaths()).toEqual(["Bericht.pptx"]);
	});

	it("does not let a moved collision entry block a source whose new mirror path is free", async () => {
		h = createHarness();
		h.addSource("Alt/Angebot.docx", "body");
		h.putFile(h.mirror("Alt/Angebot.docx"), tinyPng(9));
		await h.start();
		expect((await h.status()).failed).toBe(1);

		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();
		await h.drain();

		expect(h.previewMarker("Neu/Angebot.docx")?.sha256).toBe(sha256Of("body"));
		expect((await h.status()).failed).toBe(0);
	});

	it("loads settings whose office preview values have the wrong type", () => {
		const merged = mergeSettings({ officePreviews: { enabled: "yes", folder: 42 } } as unknown as Parameters<typeof mergeSettings>[0]);
		expect(merged.officePreviews).toEqual({ enabled: false, folder: "_previews" });
	});

	it("writes nothing into a closed note when the plugin unloads while the note is read", async () => {
		h = createHarness();
		await h.start();
		const note = "Notizen/N.md";
		const original = "Intro\n![[Angebot.docx]]\n";
		h.putFile(note, original);
		const read = app().vault.read;
		const originalRead = read.getMockImplementation() as (f: { path: string }) => Promise<string>;
		read.mockImplementation(async (f: { path: string }) => {
			const content = await originalRead(f);
			if (f.path === note) (h as Harness).unload();
			return content;
		});

		h.drop(note, ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();

		expect(app().vault.process).not.toHaveBeenCalled();
		expect(h.readText(note)).toBe(original);
	});

	it("keeps the preview of a source that is deleted and re-created at once", async () => {
		h = createHarness();
		h.addSource("Angebot.docx", "body");
		h.putFile(h.mirror("Angebot.docx"), markedPreview("Angebot.docx", sha256Of("body")));
		await h.start();

		// Office safe-save / sync: delete and create of the same path before the lifecycle runs.
		h.deleteFile("Angebot.docx");
		h.createSource("Angebot.docx", "body");
		await h.settle();
		await h.drain();

		expect(h.previewMarker("Angebot.docx")?.sha256).toBe(sha256Of("body"));
		expect(await h.status()).toMatchObject({ queued: 0, failed: 0 });
	});

	it("re-renders a renamed source whose preview the vault has not indexed yet", async () => {
		h = createHarness();
		h.addSource("Alt/Angebot.docx", "body");
		h.putFile(h.mirror("Alt/Angebot.docx"), markedPreview("Alt/Angebot.docx", sha256Of("body")));
		await h.start();
		const oldMirror = h.mirror("Alt/Angebot.docx");
		const lookup = (h.plugin.app as { vault: { getAbstractFileByPath: Mock } }).vault.getAbstractFileByPath;
		const original = lookup.getMockImplementation() as (p: string) => unknown;
		lookup.mockImplementation((p: string) => (p === oldMirror ? null : original(p)));

		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();
		await h.drain();

		expect(h.previewMarker("Neu/Angebot.docx")?.sha256).toBe(sha256Of("body"));
		expect(h.exists(oldMirror)).toBe(false);
	});
});
