import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";
import type { DropEmbed } from "../../src/features/office-previews/drop-embed";

const N = "Notizen/N.md";
const M = "Notizen/M.md";
const SOURCE = "_resources/Angebot.docx";

interface PendingProbe {
	isPending(notePath: string, sourcePath: string): boolean;
}

describe("SDD office-previews-auto-embed p3 c10", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("skips the note with a pending drop record for the source while another linking note gains the embed", async () => {
		h = createHarness();
		const content = `content of ${SOURCE}`;
		h.putFile(N, "text with ![[Angebot.docx]]\n");
		h.putFile(M, "see [[Angebot.docx]]\n");
		await h.start();
		const drop = (h.feature as unknown as { dropEmbed: DropEmbed }).dropEmbed as unknown as PendingProbe;

		// Stale marker: the held render keeps the drop record pending.
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of("older content")));
		h.drop(N, ["Angebot.docx"]);
		await h.advance(1000);
		h.renderer.hold();
		h.createSource(SOURCE, content);
		await h.settle();
		expect(drop.isPending(N, SOURCE)).toBe(true);

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		expect(drop.isPending(N, SOURCE)).toBe(true);
		expect(h.readText(N)).toBe("text with ![[Angebot.docx]]\n");
		expect(h.readText(M)).toBe("see [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
	});
});
