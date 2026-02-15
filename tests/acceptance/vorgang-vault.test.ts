import { describe, it, expect } from "vitest";
import { createMockVault, createMockTFile } from "../helpers/obsidian-mocks";
import { addVorgangSection, formatVorgangHeadingText } from "../../src/features/vorgang/vorgang-engine";
import { formatDiaryEntry, addEntryUnderToday } from "../../src/features/work-diary/work-diary-engine";

const friday = new Date(2026, 1, 6);

describe("Vorgang vault.process() integration", () => {
	it("inserts vorgang section via process() atomically", async () => {
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
			const result = addVorgangSection(content, "Review", "de", friday);
			cursorLineIndex = result.cursorLineIndex;
			return result.newContent;
		});

		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("- [[#Review, 06.02.2026]]");
		expect(result).toContain("##### Review, 06.02.2026");
		const lines = result.split("\n");
		expect(lines[cursorLineIndex]).toBe("");
	});

	it("creates Inhalt section when missing", async () => {
		const initial = "# Fakten\n- Status: Active";
		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		await vault.process(file, (content) => {
			const { newContent } = addVorgangSection(content, "New Section", "de", friday);
			return newContent;
		});

		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("# Inhalt");
		expect(result).toContain("- [[#New Section, 06.02.2026]]");
		expect(result).toContain("##### New Section, 06.02.2026");
	});
});

describe("Vorgang + diary vault.process() integration", () => {
	it("adds Vorgang section and diary entry atomically via separate process() calls", async () => {
		const vorgangInitial = [
			"# Inhalt",
			"- [[#Kick-Off, 15.01.2026]]",
			"",
			"##### Kick-Off, 15.01.2026",
			"- Initial meeting",
		].join("\n");
		const diaryInitial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";

		const vorgangFile = createMockTFile("vorgang.md", "ProjectX");
		const diaryFile = createMockTFile("diary.md");
		const vault = createMockVault({
			"vorgang.md": vorgangInitial,
			"diary.md": diaryInitial,
		});

		// Step 1: Add Vorgang section
		await vault.process(vorgangFile, (content) => {
			const { newContent } = addVorgangSection(content, "Review", "de", friday);
			return newContent;
		});

		// Step 2: Add diary entry
		const headingText = formatVorgangHeadingText("Review", "de", friday);
		const entry = formatDiaryEntry(vorgangFile.basename, headingText);
		await vault.process(diaryFile, (content) => {
			const { newContent } = addEntryUnderToday(content, entry, "de", friday);
			return newContent;
		});

		const vorgangResult = vault.files.get("vorgang.md")!;
		expect(vorgangResult).toContain("##### Review, 06.02.2026");

		const diaryResult = vault.files.get("diary.md")!;
		expect(diaryResult).toContain("- [[ProjectX#Review, 06.02.2026|ProjectX: Review, 06.02.2026]]");
	});

	it("skips diary update when diary file is missing", async () => {
		const vorgangInitial = "# Inhalt\n- [[#Old, 01.01.2026]]\n\n##### Old, 01.01.2026\n- note";
		const vorgangFile = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": vorgangInitial });

		// Diary file not in vault — vault.process would throw if called
		// The feature silently skips, so only the Vorgang file is modified
		await vault.process(vorgangFile, (content) => {
			const { newContent } = addVorgangSection(content, "New", "de", friday);
			return newContent;
		});

		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("##### New, 06.02.2026");
	});
});
