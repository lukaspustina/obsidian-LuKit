import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const isPreview = (p: string): boolean => p.startsWith("_previews/");

describe("SDD office-previews-auto-embed p4 c1", () => {
	it("returns null when the body already embeds the image Markdown-style", () => {
		const content = "see [[Angebot.docx]]\n![Angebot.docx.png](_previews/_resources/Angebot.docx.png)";
		const result = planAutoEmbed(
			content,
			(p) => p === "Angebot.docx",
			(p) => p === "_previews/_resources/Angebot.docx.png",
			isPreview,
			"![[Angebot.docx.png]]",
		);
		expect(result).toBeNull();
	});

	it("positive control: the same note without the Markdown embed yields a plan", () => {
		const result = planAutoEmbed(
			"see [[Angebot.docx]]",
			(p) => p === "Angebot.docx",
			(p) => p === "_previews/_resources/Angebot.docx.png",
			isPreview,
			"![[Angebot.docx.png]]",
		);
		expect(result).not.toBeNull();
		expect(result?.newContent).toBe("see [[Angebot.docx]]\n![[Angebot.docx.png]]");
	});

	it("returns null for a URL-encoded Markdown embed (decoded before resolving)", () => {
		const content = "see [[Neue Datei.docx]]\n![x](_previews/_resources/Neue%20Datei.docx.png)";
		const result = planAutoEmbed(
			content,
			(p) => p === "Neue Datei.docx",
			(p) => p === "_previews/_resources/Neue Datei.docx.png",
			isPreview,
			"![[Neue Datei.docx.png]]",
		);
		expect(result).toBeNull();
	});
});
