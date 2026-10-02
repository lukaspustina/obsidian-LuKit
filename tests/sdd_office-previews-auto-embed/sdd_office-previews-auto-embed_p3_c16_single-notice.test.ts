import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews-auto-embed p3 c16", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("emits only the single summary Notice when a backfill embeds into several notes", async () => {
		h = createHarness();
		const sources = ["_resources/Angebot.docx", "_resources/Zahlen.xlsx", "_resources/Folien.pptx"];
		sources.forEach((src, i) => {
			const content = `content of ${src}`;
			h.addSource(src, content);
			h.putFile(h.mirror(src), markedPreview(src, sha256Of(content)));
			h.putFile(`Notizen/M${i + 1}.md`, `Siehe [[${src.split("/")[1]}]]\n`);
		});
		await h.start();
		await h.settle();
		const before = h.notices().length;

		await h.runCommand("office-previews-embed-missing");
		await h.settle();

		expect(h.readText("Notizen/M1.md")).toBe("Siehe [[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.readText("Notizen/M2.md")).toBe("Siehe [[Zahlen.xlsx]]\n![[Zahlen.xlsx.png]]\n");
		expect(h.readText("Notizen/M3.md")).toBe("Siehe [[Folien.pptx]]\n![[Folien.pptx.jpg]]\n");
		expect(h.notices().slice(before)).toEqual(["Einbettungen ergänzt: 3 in 3 Notizen"]);
	});
});
