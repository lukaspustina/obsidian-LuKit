import { afterEach, describe, expect, it } from "vitest";
import { createHarness, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";
import { RECONCILE_DELAY_MS } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p2 c7", () => {
	const harnesses: Harness[] = [];
	const make = (opts: Parameters<typeof createHarness>[0] = {}): Harness => {
		const h = createHarness(opts);
		harnesses.push(h);
		return h;
	};

	afterEach(() => {
		for (const h of harnesses.splice(0)) h.dispose();
	});

	const SOURCE = "Docs/Vertrag.docx";
	const CONTENT = "protected document content";

	it("keeps a generic-icon-like image from a successful render and does not render it again on a second reconcile", async () => {
		const h = make();
		// A generic file icon: valid image, exit 0 -- indistinguishable from a real render.
		h.renderer.result = () => ({ ok: true, bytes: tinyPng(200) });
		h.addSource(SOURCE, CONTENT);

		await h.start();

		expect(h.renderer.calls).toHaveLength(1);
		expect(h.previewMarker(SOURCE)).toEqual({ version: 1, sha256: sha256Of(CONTENT) });
		expect((await h.status()).failed).toBe(0);

		// Second reconcile pass: toggle off and on, which schedules a new reconcile.
		h.setEnabled(false);
		h.setEnabled(true);
		await h.advance(RECONCILE_DELAY_MS);
		await h.drain();

		expect(h.renderer.calls).toHaveLength(1);
		expect((await h.status()).failed).toBe(0);
	});

	it("renders nothing on a new device with an empty cache because the marker equals the fingerprint", async () => {
		const first = make();
		first.renderer.result = () => ({ ok: true, bytes: tinyPng(200) });
		first.addSource(SOURCE, CONTENT);
		await first.start();
		const previewBytes = first.preview(SOURCE);
		expect(previewBytes).toBeDefined();
		first.dispose();
		harnesses.splice(harnesses.indexOf(first), 1);

		// New device: same synced files, fresh device-local storage (empty cache and failures).
		const second = make({ storage: new Map<string, unknown>() });
		second.addSource(SOURCE, CONTENT);
		second.putFile(second.mirror(SOURCE), previewBytes as Uint8Array);

		await second.start();

		expect(second.renderer.calls).toHaveLength(0);
		expect(second.previewMarker(SOURCE)).toEqual({ version: 1, sha256: sha256Of(CONTENT) });
		expect((await second.status()).failed).toBe(0);
	});
});
