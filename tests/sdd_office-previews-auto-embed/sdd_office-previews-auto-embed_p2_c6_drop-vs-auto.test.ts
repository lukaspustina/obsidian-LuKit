import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import type { DropEmbed } from "../../src/features/office-previews/drop-embed";

const N = "Notizen/N.md";
const M = "Notizen/M.md";
const SOURCE = "_resources/Angebot.docx";

interface PendingProbe {
	isPending(notePath: string, sourcePath: string): boolean;
}

describe("SDD office-previews-auto-embed p2 c6", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("gives the drop note the drop result and every other linking note only the embed, each exactly once", async () => {
		h = createHarness();
		h.putFile(N, "text with ![[Angebot.docx]]\n");
		h.putFile(M, "see [[Angebot.docx]]\n");
		await h.start();
		const drop = (h.feature as unknown as { dropEmbed: DropEmbed }).dropEmbed as unknown as PendingProbe;

		h.drop(N, ["Angebot.docx"]);
		await h.advance(1000);
		h.renderer.hold();
		h.createSource(SOURCE);
		await h.settle();

		// Record is pending, the render has not finished.
		expect(h.preview(SOURCE)).toBeUndefined();
		expect(drop.isPending(N, SOURCE)).toBe(true);
		expect(drop.isPending(M, SOURCE)).toBe(false);

		h.renderer.release();
		await h.settle();

		expect(h.preview(SOURCE)).toBeDefined();
		expect(h.readText(N)).toBe("text with [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText(M)).toBe("see [[Angebot.docx]]\n![[Angebot.docx.png]]\n");

		const writesTo = (path: string): number =>
			h.vaultProcess.mock.calls.filter((call) => (call[0] as { path: string }).path === path).length;
		expect(writesTo(N)).toBe(1);
		expect(writesTo(M)).toBe(1);
	});
});
