import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p4 c20", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("records nothing for a drop while the feature is disabled", async () => {
		h = createHarness({ enabled: false });
		const note = "Notizen/N.md";
		const original = "Intro\n![[Angebot.docx]]\n";
		h.putFile(note, original);
		const ed = h.openNote(note);
		await h.start();

		h.drop(note, ["Angebot.docx"]);
		h.paste(note, ["Angebot.docx"]);
		// Enabling afterwards must not reveal a record: the source is not treated as dropped.
		h.setEnabled(true);
		h.createSource("_resources/Angebot.docx");
		await h.settle();
		expect(h.renderer.calls).toHaveLength(0);
		expect(ed.getValue()).toBe(original);

		// Control: with the feature enabled a drop is recorded and embedded.
		const note2 = "Notizen/M.md";
		h.putFile(note2, "Intro\n![[Bericht.docx]]\n");
		const ed2 = h.openNote(note2);
		h.drop(note2, ["Bericht.docx"]);
		h.createSource("_resources/Bericht.docx");
		await h.settle();
		expect(ed2.getValue()).toBe("Intro\n[[Bericht.docx]]\n![[Bericht.docx.png]]\n");
	});

	it("observes nothing on an unsupported platform", async () => {
		h = createHarness({ platform: { isMacOS: false } });
		const note = "Notizen/N.md";
		const original = "Intro\n![[Angebot.docx]]\n";
		h.putFile(note, original);
		const ed = h.openNote(note);
		await h.start();

		expect(h.workspaceListeners.get("editor-drop") ?? []).toHaveLength(0);
		expect(h.workspaceListeners.get("editor-paste") ?? []).toHaveLength(0);

		h.drop(note, ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.drain();
		expect(h.renderer.calls).toHaveLength(0);
		expect(ed.getValue()).toBe(original);
	});

	it("registers the drop and paste observers on a supported platform", async () => {
		h = createHarness();
		await h.start();

		expect((h.workspaceListeners.get("editor-drop") ?? []).length).toBeGreaterThan(0);
		expect((h.workspaceListeners.get("editor-paste") ?? []).length).toBeGreaterThan(0);
	});
});
