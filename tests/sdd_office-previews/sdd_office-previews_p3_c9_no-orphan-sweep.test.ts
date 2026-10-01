import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p3 c9", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("keeps an orphan marked preview through startup reconcile when no delete event occurred", async () => {
		h = createHarness();
		const orphanSource = "Weg/Geloescht.docx";
		const orphan = markedPreview(orphanSource, sha256Of("gone content"));
		h.putFile(h.mirror(orphanSource), orphan);

		const livePath = "Projekte/Angebot.docx";
		h.addSource(livePath);
		h.putFile(h.mirror(livePath), markedPreview(livePath, sha256Of(`content of ${livePath}`)));

		await h.start();

		expect(h.exists(h.mirror(orphanSource))).toBe(true);
		expect(h.preview(orphanSource)).toEqual(orphan);
		expect(h.adapterCalls.filter((c) => c.op === "remove")).toHaveLength(0);
		expect(h.renderer.calls).toHaveLength(0);
	});
});
