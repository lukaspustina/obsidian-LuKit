import { afterEach, describe, expect, it } from "vitest";
import { DropEmbed } from "../../src/features/office-previews/drop-embed";
import { DROP_WINDOW_MS } from "../../src/features/office-previews/office-previews-engine";
import type { App } from "obsidian";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const NOTE = "Notizen/N.md";
const CONTENT = "![[Angebot.docx]]\n![[Bericht.docx]]\n";

describe("SDD office-previews p4 c5", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("does not match a file created DROP_WINDOW_MS + 1 ms after the drop", async () => {
		h = createHarness();
		h.putFile(NOTE, CONTENT);
		const ed = h.openNote(NOTE);
		await h.start();

		h.drop(NOTE, ["Angebot.docx"]);
		await h.advance(DROP_WINDOW_MS - 1000);
		// A later drop is an event that prunes the expired Angebot record.
		h.drop(NOTE, ["Bericht.docx"]);
		await h.advance(1000 + 1);
		h.createSource("_resources/Angebot.docx");
		await h.settle();
		expect(h.renderer.calls).toHaveLength(0);

		// The younger record (age 1001 ms) still matches.
		h.createSource("_resources/Bericht.docx");
		await h.settle();
		expect(h.renderer.renderedPaths()).toEqual(["_resources/Bericht.docx"]);
		expect(ed.getValue()).toBe("![[Angebot.docx]]\n[[Bericht.docx]]\n![[Bericht.docx.png]]\n");
	});

	it("queues a source created 30 s after the last drop with the random delay and converts nothing", async () => {
		h = createHarness();
		h.putFile(NOTE, CONTENT);
		const ed = h.openNote(NOTE);
		await h.start();

		h.drop(NOTE, ["Angebot.docx"]);
		await h.advance(30_000);
		h.drop(NOTE, ["Bericht.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();
		expect(h.renderer.calls).toHaveLength(0);

		h.createSource("_resources/Bericht.docx");
		await h.settle();
		expect(h.renderer.renderedPaths()).toEqual(["_resources/Bericht.docx"]);

		await h.drain();
		expect(h.renderer.renderedPaths()).toEqual(["_resources/Bericht.docx", "_resources/Angebot.docx"]);
		// The expired drop converts nothing; the automatic embed (SDD office-previews-auto-embed) still lands.
		expect(ed.getValue()).toBe("![[Angebot.docx]]\n![[Angebot.docx.png]]\n[[Bericht.docx]]\n![[Bericht.docx.png]]\n");
	});

	it("prunes records older than the window on the next drop event", () => {
		let now = 1_000_000;
		const embed = new DropEmbed({} as App, { setTimeout: () => 0, clearTimeout: () => undefined, now: () => now });
		embed.record(NOTE, ["Angebot.docx"]);
		embed.record(NOTE, ["Bericht.docx"]);
		expect(embed.recordCount()).toBe(2);

		now += DROP_WINDOW_MS + 1;
		embed.record(NOTE, ["Folien.pptx"]);

		expect(embed.recordCount()).toBe(1);
	});
});
