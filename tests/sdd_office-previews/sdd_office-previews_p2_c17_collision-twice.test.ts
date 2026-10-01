import { afterEach, describe, expect, it } from "vitest";
import { createHarness, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p2 c17", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	const SOURCE = "Projekte/Angebot.docx";

	it("reconciled twice with an unmarked file at the mirror path: 0 renders, identical bytes, failureCount 1", async () => {
		h = createHarness();
		const occupant = tinyPng(9);
		h.putFile(h.mirror(SOURCE), occupant);
		h.addSource(SOURCE, "source content");

		await h.start();
		const bytesAfterFirst = h.read(h.mirror(SOURCE));
		expect(h.renderer.calls).toHaveLength(0);
		expect((await h.status()).failed).toBe(1);

		// Second reconcile pass: a fresh harness sharing device storage simulates a reload.
		const storage = h.storage;
		const files = new Map<string, Uint8Array>();
		for (const p of h.files()) {
			const b = h.read(p);
			if (b) files.set(p, b);
		}
		h.unload();
		h.dispose();

		h = createHarness({ storage });
		for (const [p, b] of files) h.putFile(p, b);
		await h.start();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.read(h.mirror(SOURCE))).toEqual(bytesAfterFirst);
		expect(h.read(h.mirror(SOURCE))).toEqual(occupant);
		expect((await h.status()).failed).toBe(1);
	});
});
