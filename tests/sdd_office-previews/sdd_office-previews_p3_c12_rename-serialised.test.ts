import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

type RenameFn = (file: { path: string }, newPath: string) => Promise<void>;
interface RenameMock {
	mockImplementation(fn: RenameFn): unknown;
	getMockImplementation(): RenameFn | undefined;
	mock: { calls: unknown[][] };
}

describe("SDD office-previews p3 c12", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("processes the renames of a folder rename one at a time in event order and ignores renameFile's own events", async () => {
		h = createHarness();
		const names = ["1", "2", "3"];
		for (const n of names) {
			const src = `Alt/${n}.docx`;
			h.addSource(src);
			h.putFile(h.mirror(src), markedPreview(src, sha256Of(`content of ${src}`)));
		}
		await h.start();
		expect(h.renderer.calls).toHaveLength(0);

		const fm = (h.plugin.app as { fileManager: { renameFile: RenameMock } }).fileManager.renameFile;
		const original = fm.getMockImplementation();
		if (original === undefined) throw new Error("renameFile has no implementation");
		let active = 0;
		let maxActive = 0;
		const started: string[] = [];
		fm.mockImplementation(async (file, newPath) => {
			started.push(newPath);
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise<void>((resolve) => setTimeout(resolve, 100));
			try {
				await original(file, newPath);
			} finally {
				active--;
			}
		});

		for (const n of names) h.renameSource(`Alt/${n}.docx`, `Neu/${n}.docx`);
		for (let i = 0; i < 10; i++) await h.advance(100);
		await h.drain();

		expect(started).toEqual(names.map((n) => h.mirror(`Neu/${n}.docx`)));
		expect(maxActive).toBe(1);
		// No handling of the rename events renameFile fires below the preview folder.
		expect(fm.mock.calls).toHaveLength(3);
		expect(h.renderer.calls).toHaveLength(0);
		for (const n of names) {
			expect(h.previewMarker(`Neu/${n}.docx`)).toEqual({ version: 1, sha256: sha256Of(`content of Alt/${n}.docx`) });
			expect(h.exists(h.mirror(`Alt/${n}.docx`))).toBe(false);
		}
		expect(await h.status()).toMatchObject({ failed: 0, queued: 0 });
	});
});
