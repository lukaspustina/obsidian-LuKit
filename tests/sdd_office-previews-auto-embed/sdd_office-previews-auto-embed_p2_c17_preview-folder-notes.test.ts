import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p2 c17", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
		vi.restoreAllMocks();
	});

	it("skips notes under the preview folder, embeds into a sibling-named folder and a normal note, emits no Notice and logs only English path-free lines", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		h = createHarness();
		await h.start();

		h.putFile("_previews/Notiz.md", "Siehe [[Angebot.docx]]\n");
		h.putFile("_previews-notes/x.md", "Siehe [[Angebot.docx]]\n");
		h.putFile("Notizen/M.md", "Siehe [[Angebot.docx]]\n");

		h.createSource("_resources/Angebot.docx", "document body");
		await h.drain();
		await h.settle();

		expect(h.readText("_previews/Notiz.md")).toBe("Siehe [[Angebot.docx]]\n");
		expect(h.readText("_previews-notes/x.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText("Notizen/M.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");

		expect(h.notices()).toEqual([]);
		for (const call of warn.mock.calls) {
			const line = call.map(String).join(" ");
			expect(line.startsWith("LuKit office previews: ")).toBe(true);
			expect(line).not.toMatch(/[\/\\]|\.md\b|Angebot|Notiz/);
			expect(line).toMatch(/^[\x20-\x7E]+$/);
		}
	});
});
