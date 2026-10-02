import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const COMMAND = "office-previews-embed-missing";

describe("SDD office-previews-auto-embed p3 c8", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("shows the disabled notice and writes nothing when the feature is off, while an enabled run embeds", async () => {
		h = createHarness();
		const src = "_resources/Angebot.docx";
		const content = `content of ${src}`;
		h.addSource(src);
		h.putFile(h.mirror(src), markedPreview(src, sha256Of(content)));
		h.putFile("Notizen/A.md", "Siehe [[Angebot.docx]]\n");
		h.putFile("Notizen/B.md", "Auch [[Angebot.docx]]\n");
		await h.start();

		// Positive control: enabled backfill embeds into the linking notes.
		await h.runCommand(COMMAND);
		await h.settle();
		expect(h.readText("Notizen/A.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText("Notizen/B.md")).toBe("Auch [[Angebot.docx]]\n![[Angebot.docx.png]]\n");

		// A new linking note, then the feature is switched off.
		h.putFile("Notizen/C.md", "Noch [[Angebot.docx]]\n");
		h.setEnabled(false);
		const writesBefore = h.vaultProcess.mock.calls.length;

		await h.runCommand(COMMAND);
		await h.settle();

		expect(h.lastNotice()).toBe("Office-Vorschauen sind in den Einstellungen ausgeschaltet.");
		expect(h.readText("Notizen/C.md")).toBe("Noch [[Angebot.docx]]\n");
		expect(h.vaultProcess.mock.calls).toHaveLength(writesBefore);
	});
});
