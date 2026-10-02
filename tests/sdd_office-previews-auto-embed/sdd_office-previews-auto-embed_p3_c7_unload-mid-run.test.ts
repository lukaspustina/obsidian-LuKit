import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const EMBED = "![[Angebot.docx.png]]";
const NOTE_COUNT = 10;
const WRITES_BEFORE_UNLOAD = 3;

function notePaths(): string[] {
	return Array.from({ length: NOTE_COUNT }, (_, i) => `Notizen/M${String(i).padStart(2, "0")}.md`);
}

function original(n: number): string {
	return `Notiz ${n}: siehe [[Angebot.docx]]\n`;
}

describe("SDD office-previews-auto-embed p3 c7", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("writes the first notes, then no further note and no summary Notice after unload mid-run", async () => {
		h = createHarness();
		const content = `content of ${SOURCE}`;
		h.addSource(SOURCE);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of(content)));
		const paths = notePaths();
		paths.forEach((p, i) => h.putFile(p, original(i)));
		await h.start();
		expect(h.vaultProcess.mock.calls).toHaveLength(0);

		const impl = h.vaultProcess.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
		let writes = 0;
		h.vaultProcess.mockImplementation(async (...args: unknown[]) => {
			const result = await impl(...args);
			writes += 1;
			if (writes === WRITES_BEFORE_UNLOAD) h.unload();
			return result;
		});

		await h.runCommand("office-previews-embed-missing");
		await h.settle();
		await h.advance(200);
		await h.settle();

		const embedded = paths.filter((p) => (h.readText(p) ?? "").includes(EMBED));
		expect(embedded).toHaveLength(WRITES_BEFORE_UNLOAD);
		expect(h.vaultProcess.mock.calls).toHaveLength(WRITES_BEFORE_UNLOAD);
		for (const p of paths.filter((x) => !embedded.includes(x))) {
			expect(h.readText(p)).toBe(original(paths.indexOf(p)));
		}
		expect(h.notices().filter((n) => n.startsWith("Einbettungen ergänzt"))).toEqual([]);
	});
});
