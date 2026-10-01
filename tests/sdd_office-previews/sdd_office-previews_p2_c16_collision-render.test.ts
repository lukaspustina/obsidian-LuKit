import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p2 c16", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	const SOURCE = "Projekte/Angebot.docx";

	function renderWithOccupant(occupant: Uint8Array): Uint8Array {
		h = createHarness();
		h.layoutReady();
		h.putFile(h.mirror(SOURCE), occupant);
		h.createSource(SOURCE, "source content");
		return occupant;
	}

	it("does not overwrite an unmarked file at the mirror path and records a collision", async () => {
		const occupant = renderWithOccupant(tinyPng(7));
		await h.drain();

		expect(h.read(h.mirror(SOURCE))).toEqual(occupant);
		expect(h.renderer.calls).toHaveLength(0);
		expect(h.adapterCalls.filter((c) => c.op === "writeBinary" && c.path === h.mirror(SOURCE))).toHaveLength(0);
		expect(h.adapterCalls.filter((c) => c.op === "remove" && c.path === h.mirror(SOURCE))).toHaveLength(0);
		expect((await h.status()).failed).toBe(1);
	});

	it("treats a file with a marker of version 2 as a collision as well", async () => {
		const occupant = renderWithOccupant(markedPreview(SOURCE, sha256Of("source content"), 2));
		await h.drain();

		expect(h.read(h.mirror(SOURCE))).toEqual(occupant);
		expect(h.renderer.calls).toHaveLength(0);
		expect(h.adapterCalls.filter((c) => c.op === "writeBinary" && c.path === h.mirror(SOURCE))).toHaveLength(0);
		expect((await h.status()).failed).toBe(1);
	});
});
