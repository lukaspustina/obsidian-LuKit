import { afterEach, describe, expect, it, type Mock } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

interface AppMocks {
	vault: { process: Mock };
}

const NOTE = "Notizen/N.md";
const SOURCE = "_resources/Angebot.docx";

describe("SDD office-previews p4 c9", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("leaves an open note unchanged when the link was deleted before the render finished", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, "text with ![[Angebot.docx]]\n");
		const editor = h.openNote(NOTE);
		h.renderer.hold();

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();
		expect(h.renderer.held).toHaveLength(1);

		editor.setValue("text without a link\n");
		h.renderer.release();
		await h.settle();

		expect(h.preview(SOURCE)).toBeDefined();
		expect(editor.getValue()).toBe("text without a link\n");
		expect(editor.transactions).toHaveLength(0);
	});

	it("leaves a closed note byte-identical when the link was deleted before the render finished", async () => {
		h = createHarness();
		await h.start();
		h.putFile(NOTE, "text with ![[Angebot.docx]]\n");
		h.renderer.hold();

		h.drop(NOTE, ["Angebot.docx"]);
		h.createSource(SOURCE);
		await h.settle();
		expect(h.renderer.held).toHaveLength(1);

		h.putFile(NOTE, "text without a link\n");
		h.renderer.release();
		await h.settle();

		expect(h.preview(SOURCE)).toBeDefined();
		expect(h.readText(NOTE)).toBe("text without a link\n");
		expect((h.plugin.app as unknown as AppMocks).vault.process).not.toHaveBeenCalled();
	});
});
