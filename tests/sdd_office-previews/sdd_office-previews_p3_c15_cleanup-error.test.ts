import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

interface AdapterMocks {
	list: { mockRejectedValueOnce(e: unknown): unknown; mock: { calls: unknown[][] } };
	rmdir: { mockRejectedValueOnce(e: unknown): unknown; mock: { calls: unknown[][] } };
}

describe("SDD office-previews p3 c15", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	const adapter = (): AdapterMocks => (h.plugin.app as { vault: { adapter: AdapterMocks } }).vault.adapter;

	async function setup(): Promise<string> {
		h = createHarness();
		const source = "Projekte/Alt/Angebot.docx";
		h.addSource(source);
		h.putFile(h.mirror(source), markedPreview(source, sha256Of(`content of ${source}`)));
		await h.start();
		return source;
	}

	it("ignores an adapter.list error during empty-folder cleanup", async () => {
		const source = await setup();
		adapter().list.mockRejectedValueOnce(new Error("list failed"));

		h.deleteFile(source);
		await h.settle();

		expect(h.exists(h.mirror(source))).toBe(false);
		expect(adapter().list.mock.calls.length).toBeGreaterThan(0);
		expect(await h.status()).toMatchObject({ failed: 0 });
	});

	it("ignores a folder removal error during empty-folder cleanup", async () => {
		const source = await setup();
		adapter().rmdir.mockRejectedValueOnce(new Error("rmdir failed"));

		h.deleteFile(source);
		await h.settle();

		expect(h.exists(h.mirror(source))).toBe(false);
		expect(adapter().rmdir.mock.calls.length).toBeGreaterThan(0);
		expect(await h.status()).toMatchObject({ failed: 0 });
	});
});
