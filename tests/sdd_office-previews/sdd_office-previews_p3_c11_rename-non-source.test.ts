import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

interface RenameMock { mock: { calls: unknown[][] } }

describe("SDD office-previews p3 c11", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("handles a rename from a non-source path to a source path as a create", async () => {
		h = createHarness();
		h.addSource("Projekte/a.tmp", "tmp body");
		await h.start();
		expect(h.renderer.calls).toHaveLength(0);

		h.renameSource("Projekte/a.tmp", "Projekte/a.docx");
		await h.drain();

		expect(h.renderer.renderedPaths()).toEqual(["Projekte/a.docx"]);
		expect(h.previewMarker("Projekte/a.docx")).toEqual({ version: 1, sha256: sha256Of("tmp body") });
		expect(await h.status()).toMatchObject({ failed: 0, queued: 0 });
	});

	it("leaves existing previews untouched when a file is renamed into the preview folder", async () => {
		h = createHarness();
		const source = "Projekte/Angebot.docx";
		const other = "Projekte/Bericht.docx";
		h.addSource(source);
		h.addSource(other);
		h.putFile(h.mirror(source), markedPreview(source, sha256Of(`content of ${source}`)));
		h.putFile(h.mirror(other), markedPreview(other, sha256Of(`content of ${other}`)));
		await h.start();
		expect(h.renderer.calls).toHaveLength(0);
		const before = [h.preview(source), h.preview(other)].map((b) => Array.from(b ?? []));

		h.renameSource(source, "_previews/Projekte/Angebot.docx");
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect((h.plugin.app as { fileManager: { renameFile: RenameMock } }).fileManager.renameFile.mock.calls).toHaveLength(0);
		expect(h.adapterCalls.filter((c) => c.op === "remove")).toHaveLength(0);
		expect([h.preview(source), h.preview(other)].map((b) => Array.from(b ?? []))).toEqual(before);
		expect(await h.status()).toMatchObject({ failed: 0 });
	});
});
