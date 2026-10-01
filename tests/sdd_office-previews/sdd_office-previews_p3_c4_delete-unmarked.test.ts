import { afterEach, describe, expect, it } from "vitest";
import { createHarness, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p3 c4", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("leaves an unmarked file at the mirror path untouched when the source is deleted", async () => {
		h = createHarness();
		const source = "Projekte/Angebot.docx";
		const foreign = tinyPng(7);
		h.addSource(source);
		h.putFile(h.mirror(source), foreign);

		await h.start();
		expect(h.renderer.calls).toHaveLength(0);

		h.deleteFile(source);
		await h.drain();

		expect(h.adapterCalls.filter((c) => c.op === "remove" && c.path === h.mirror(source))).toHaveLength(0);
		expect(h.read(h.mirror(source))).toEqual(foreign);
		expect(h.exists("_previews/Projekte")).toBe(true);
		expect(h.renderer.calls).toHaveLength(0);
	});

	it("handles a source delete without any preview without error", async () => {
		h = createHarness();
		const source = "Projekte/Angebot.docx";

		await h.start(); // empty vault: nothing rendered
		h.addSource(source);
		expect(h.exists(h.mirror(source))).toBe(false);

		h.deleteFile(source);
		await h.drain();

		expect(h.adapterCalls.filter((c) => c.op === "remove")).toHaveLength(0);
		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toMatchObject({ queued: 0, failed: 0 });
	});
});
