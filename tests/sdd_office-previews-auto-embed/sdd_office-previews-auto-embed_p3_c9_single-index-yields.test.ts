import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p3 c9", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("reads resolvedLinks once per run, yields between notes and embeds every note", async () => {
		h = createHarness();
		const count = 40;
		const sources: string[] = [];
		for (let i = 0; i < count; i++) {
			const src = `_resources/Angebot${i}.docx`;
			const content = `content of ${src}`;
			sources.push(src);
			h.addSource(src, content);
			h.putFile(h.mirror(src), markedPreview(src, sha256Of(content)));
			h.putFile(`Notizen/M${i}.md`, `Notiz ${i} mit [[Angebot${i}.docx]]\n`);
		}
		await h.start();
		expect(h.renderer.calls).toHaveLength(0);

		const readsBefore = h.resolvedLinksReads;
		const timersBefore = h.zeroDelayTimers;

		await h.runCommand("office-previews-embed-missing");
		await h.advance(count * 5);
		await h.settle();

		expect(h.resolvedLinksReads - readsBefore).toBe(1);
		expect(h.zeroDelayTimers - timersBefore).toBeGreaterThanOrEqual(count - 1);
		for (let i = 0; i < count; i++) {
			expect(h.readText(`Notizen/M${i}.md`)).toBe(
				`Notiz ${i} mit [[Angebot${i}.docx]]\n![[Angebot${i}.docx.png]]\n`,
			);
		}
	});
});
