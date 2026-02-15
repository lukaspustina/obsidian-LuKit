import { describe, it, expect } from "vitest";
import { createMockVault, createMockTFile } from "../helpers/obsidian-mocks";
import {
	migrateVorgangNote,
	migrateDiaryNote,
} from "../../src/features/migration/migration-engine";

describe("Migration vault.process() integration", () => {
	it("migrates Vorgang via process() atomically", async () => {
		const initial = [
			"---",
			"title: Vorgang",
			"---",
			"",
			"**Fakten**",
			"- stuff",
			"",
			"**Inhalt**",
			"- Meeting, 01.02.2026",
			"",
			"**Meeting, 01.02.2026**",
			"- Discussed items",
		].join("\n");

		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		let changeCount = 0;
		await vault.process(file, (content) => {
			const result = migrateVorgangNote(content, { addTag: "Vorgang" });
			changeCount = result.changeCount;
			return result.newContent;
		});

		// 2 top-level→h1 + 1 entry bold→h5 + 1 TOC entry + 1 tag = 5
		expect(changeCount).toBe(5);
		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("# Fakten und Pointer");
		expect(result).toContain("# Inhalt");
		expect(result).toContain("##### Meeting, 01.02.2026");
		expect(result).toContain("- [[#Meeting, 01.02.2026]]");
		expect(result).toContain("  - Vorgang");
		expect(result).not.toContain("**Meeting, 01.02.2026**");
		expect(result).not.toContain("**Fakten**");
		expect(result).not.toContain("**Inhalt**");
	});

	it("migrates diary via process() atomically", async () => {
		const initial = [
			"# Work Diary",
			"",
			"**Fr, 06.02.2026**",
			"- Buy groceries",
			"",
			"**Do, 05.02.2026**",
			"- Clean kitchen",
		].join("\n");

		const file = createMockTFile("diary.md");
		const vault = createMockVault({ "diary.md": initial });

		let changeCount = 0;
		await vault.process(file, (content) => {
			const result = migrateDiaryNote(content);
			changeCount = result.changeCount;
			return result.newContent;
		});

		expect(changeCount).toBe(2);
		const result = vault.files.get("diary.md")!;
		expect(result).toContain("##### Fr, 06.02.2026");
		expect(result).toContain("##### Do, 05.02.2026");
		expect(result).not.toContain("**Fr, 06.02.2026**");
	});

	it("dry-run preview then apply via process()", async () => {
		const initial = [
			"---",
			"title: Test",
			"---",
			"",
			"**Inhalt**",
			"- Old Section, 10.01.2026",
			"",
			"**Old Section, 10.01.2026**",
			"- Notes",
		].join("\n");

		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		// Dry-run: read without modifying
		const content = await vault.read(file);
		const { changeCount: previewCount } = migrateVorgangNote(content, {
			addTag: "Vorgang",
		});
		// 1 top-level→h1 + 1 entry bold→h5 + 1 TOC entry + 1 tag = 4
		expect(previewCount).toBe(4);

		// Apply via process()
		await vault.process(file, (current) => {
			const { newContent } = migrateVorgangNote(current, {
				addTag: "Vorgang",
			});
			return newContent;
		});

		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("# Inhalt");
		expect(result).toContain("##### Old Section, 10.01.2026");
		expect(result).toContain("- [[#Old Section, 10.01.2026]]");
		expect(result).toContain("  - Vorgang");
	});

	it("process() returns zero changes for already-migrated note", async () => {
		const initial = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			"- stuff",
			"",
			"# Inhalt",
			"- [[#Review, 01.02.2026]]",
			"",
			"##### Review, 01.02.2026",
			"- All good",
		].join("\n");

		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		let changeCount = 0;
		await vault.process(file, (content) => {
			const result = migrateVorgangNote(content, { addTag: "Vorgang" });
			changeCount = result.changeCount;
			return result.newContent;
		});

		expect(changeCount).toBe(0);
		expect(vault.files.get("vorgang.md")).toBe(initial);
	});

	it("Vorgang migration with frontmatter preservation", async () => {
		const initial = [
			"---",
			"Created at: 2024-03-28",
			"Author: Lukas",
			"tags:",
			"  - existing",
			"---",
			"",
			"**Fakten**",
			"- stuff",
			"",
			"**Inhalt**",
			"- Entry, 01.02.2026",
			"",
			"**Entry, 01.02.2026**",
			"- note",
		].join("\n");

		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		await vault.process(file, (content) => {
			return migrateVorgangNote(content, { addTag: "Vorgang" }).newContent;
		});

		const result = vault.files.get("vorgang.md")!;
		// Existing fields preserved
		expect(result).toContain("Created at: 2024-03-28");
		expect(result).toContain("Author: Lukas");
		// Existing tag preserved, new tag appended
		expect(result).toContain("  - existing");
		expect(result).toContain("  - Vorgang");
	});
});
