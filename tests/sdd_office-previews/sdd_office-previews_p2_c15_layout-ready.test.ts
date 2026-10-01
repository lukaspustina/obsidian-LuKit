import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import { MODIFY_DEBOUNCE_MS } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p2 c15", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("queues nothing for create events fired before layout ready", async () => {
		h = createHarness();

		// Obsidian emits `create` for every existing file while the vault loads.
		h.createSource("Docs/a.docx");
		h.createSource("Docs/b.xlsx");
		h.createSource("Slides/c.pptx");

		// Long enough for debounce + maximum jitter, but layout is never ready.
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview("Docs/a.docx")).toBeUndefined();
		expect(h.preview("Docs/b.xlsx")).toBeUndefined();
		expect(h.preview("Slides/c.pptx")).toBeUndefined();
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 0 });
	});

	it("registers no vault listener before layout ready and all four once it is ready", () => {
		h = createHarness();

		for (const event of ["create", "modify", "rename", "delete"]) {
			expect(h.vaultListeners.get(event) ?? []).toHaveLength(0);
		}
		expect(h.plugin.registered).toHaveLength(0);

		h.layoutReady();

		for (const event of ["create", "modify", "rename", "delete"]) {
			expect((h.vaultListeners.get(event) ?? []).length).toBeGreaterThan(0);
		}
	});

	it("queues a create event that arrives after layout ready", async () => {
		h = createHarness();
		h.createSource("Docs/early.docx");
		h.layoutReady();

		h.createSource("Docs/late.docx");
		await h.advance(MODIFY_DEBOUNCE_MS + 1);

		expect((await h.status()).queued).toBe(1);
		await h.drain();
		expect(h.renderer.renderedPaths()).toContain("Docs/late.docx");
	});
});
