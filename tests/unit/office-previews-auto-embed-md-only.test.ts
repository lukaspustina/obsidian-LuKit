import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const CANVAS = "Boards/Planung.canvas";
const CANVAS_JSON = '{"nodes":[{"id":"a","type":"text","text":"[[Angebot.docx]]"}],"edges":[]}';

describe("auto embed writes into Markdown notes only", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("leaves a canvas that resolvedLinks lists untouched and still embeds into the note", async () => {
		h = createHarness();
		h.putFile("Notizen/M.md", "siehe [[Angebot.docx]]\n");
		h.putFile(CANVAS, CANVAS_JSON);
		await h.start();
		// Obsidian may list a canvas in resolvedLinks; the fake only indexes .md, so add it.
		const cache = (h.plugin.app as { metadataCache: { resolvedLinks: Record<string, Record<string, number>> } }).metadataCache;
		const base = Object.getOwnPropertyDescriptor(cache, "resolvedLinks")?.get;
		Object.defineProperty(cache, "resolvedLinks", {
			configurable: true,
			get: () => ({ ...(base?.call(cache) ?? {}), [CANVAS]: { [SOURCE]: 1 } }),
		});

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(h.readText("Notizen/M.md")).toBe("siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText(CANVAS)).toBe(CANVAS_JSON);
	});
});
