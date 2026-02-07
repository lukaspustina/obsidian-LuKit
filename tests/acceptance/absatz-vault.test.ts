import { describe, it, expect } from "vitest";
import { createMockVault, createMockTFile } from "../helpers/obsidian-mocks";
import { addAbsatz } from "../../src/features/absatz/absatz-engine";

const friday = new Date(2026, 1, 6);

describe("Absatz vault.process() integration", () => {
	it("inserts absatz via process() atomically", async () => {
		const initial = [
			"# Fakten",
			"- Status: Active",
			"",
			"# Inhalt",
			"- [[#Kick-Off, 15.01.2026]]",
			"",
			"##### Kick-Off, 15.01.2026",
			"- Initial meeting",
		].join("\n");

		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		let cursorLineIndex = 0;
		await vault.process(file, (content) => {
			const result = addAbsatz(content, "Review", friday);
			cursorLineIndex = result.cursorLineIndex;
			return result.newContent;
		});

		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("- [[#Review, 06.02.2026]]");
		expect(result).toContain("##### Review, 06.02.2026");
		const lines = result.split("\n");
		expect(lines[cursorLineIndex]).toBe("- ");
	});

	it("creates Inhalt section when missing", async () => {
		const initial = "# Fakten\n- Status: Active";
		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		await vault.process(file, (content) => {
			const { newContent } = addAbsatz(content, "New Section", friday);
			return newContent;
		});

		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("# Inhalt");
		expect(result).toContain("- [[#New Section, 06.02.2026]]");
		expect(result).toContain("##### New Section, 06.02.2026");
	});
});
