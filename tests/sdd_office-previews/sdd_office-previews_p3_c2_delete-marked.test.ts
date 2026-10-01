import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p3 c2", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("deletes the marked preview and removes emptied parents below the preview folder", async () => {
		h = createHarness();
		const source = "Projekte/Unter/Angebot.docx";
		h.addSource(source);
		h.putFile(h.mirror(source), markedPreview(source, sha256Of(`content of ${source}`)));

		await h.start();
		expect(h.exists(h.mirror(source))).toBe(true);

		h.deleteFile(source);
		await h.drain();

		expect(h.adapterCalls).toContainEqual({ op: "remove", path: h.mirror(source) });
		expect(h.exists(h.mirror(source))).toBe(false);
		expect(h.exists("_previews/Projekte/Unter")).toBe(false);
		expect(h.exists("_previews/Projekte")).toBe(false);
		expect(h.exists("_previews")).toBe(true);
		expect(h.renderer.calls).toHaveLength(0);
	});

	it("keeps a parent folder that still holds another preview", async () => {
		h = createHarness();
		const gone = "Projekte/Unter/Angebot.docx";
		const stays = "Projekte/Andere.docx";
		h.addSource(gone);
		h.addSource(stays);
		h.putFile(h.mirror(gone), markedPreview(gone, sha256Of(`content of ${gone}`)));
		h.putFile(h.mirror(stays), markedPreview(stays, sha256Of(`content of ${stays}`)));

		await h.start();
		h.deleteFile(gone);
		await h.drain();

		expect(h.exists(h.mirror(gone))).toBe(false);
		expect(h.exists("_previews/Projekte/Unter")).toBe(false);
		expect(h.exists("_previews/Projekte")).toBe(true);
		expect(h.exists(h.mirror(stays))).toBe(true);
	});
});
