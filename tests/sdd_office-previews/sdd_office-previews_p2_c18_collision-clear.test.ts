import { afterEach, describe, expect, it } from "vitest";
import { createHarness, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p2 c18", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("clears the collision entry and queues the source when the foreign file at the mirror path is deleted", async () => {
		h = createHarness();
		const source = "Projekte/Angebot.docx";
		const foreign = "user-owned image without a marker";
		h.addSource(source);
		h.putFile(h.mirror(source), foreign);

		await h.start();

		// Collision recorded, nothing rendered, foreign file untouched.
		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toMatchObject({ failed: 1 });
		expect(h.readText(h.mirror(source))).toBe(foreign);

		// The user removes the foreign file.
		h.deleteFile(h.mirror(source));
		await h.settle();

		// The collision entry is gone.
		expect(await h.status()).toMatchObject({ failed: 0 });

		// The source gets rendered and the preview carries the current fingerprint.
		await h.drain();
		expect(h.renderer.renderedPaths()).toEqual([source]);
		expect(h.previewMarker(source)).toEqual({ version: 1, sha256: sha256Of(`content of ${source}`) });
		expect(await h.status()).toMatchObject({ failed: 0, queued: 0 });
	});

	it("keeps the collision entry when an unrelated path is deleted", async () => {
		h = createHarness();
		const source = "Projekte/Angebot.docx";
		h.addSource(source);
		h.putFile(h.mirror(source), "user-owned image without a marker");
		h.putFile("Notizen/andere.png", "unrelated");

		await h.start();
		expect(await h.status()).toMatchObject({ failed: 1 });

		h.deleteFile("Notizen/andere.png");
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toMatchObject({ failed: 1 });
	});
});
