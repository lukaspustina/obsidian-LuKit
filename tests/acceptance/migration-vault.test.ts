import { describe, it, expect } from "vitest";
import { createMockVault, createMockTFile } from "../helpers/obsidian-mocks";
import { migrateVorgangNote } from "../../src/features/migration/migration-engine";

describe("Migration vault.process() integration", () => {
	it("migrates via process() atomically", async () => {
		const initial = [
			"---",
			"title: Vorgang",
			"---",
			"",
			"# Inhalt",
			"- Meeting, 01.02.2026",
			"",
			"**Meeting, 01.02.2026**",
			"- Discussed items",
		].join("\n");

		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		let changeCount = 0;
		await vault.process(file, (content) => {
			const result = migrateVorgangNote(content);
			changeCount = result.changeCount;
			return result.newContent;
		});

		expect(changeCount).toBe(2);
		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("##### Meeting, 01.02.2026");
		expect(result).toContain("- [[#Meeting, 01.02.2026]]");
		expect(result).not.toContain("**Meeting, 01.02.2026**");
	});

	it("dry-run preview then apply via process()", async () => {
		const initial = [
			"# Inhalt",
			"- Old Section, 10.01.2026",
			"",
			"**Old Section, 10.01.2026**",
			"- Notes",
		].join("\n");

		const file = createMockTFile("vorgang.md");
		const vault = createMockVault({ "vorgang.md": initial });

		// Dry-run: read without modifying
		const content = await vault.read(file);
		const { changeCount: previewCount } = migrateVorgangNote(content);
		expect(previewCount).toBe(2);

		// Apply via process()
		await vault.process(file, (current) => {
			const { newContent } = migrateVorgangNote(current);
			return newContent;
		});

		const result = vault.files.get("vorgang.md")!;
		expect(result).toContain("##### Old Section, 10.01.2026");
		expect(result).toContain("- [[#Old Section, 10.01.2026]]");
	});

	it("process() returns zero changes for already-migrated note", async () => {
		const initial = [
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
			const result = migrateVorgangNote(content);
			changeCount = result.changeCount;
			return result.newContent;
		});

		expect(changeCount).toBe(0);
		expect(vault.files.get("vorgang.md")).toBe(initial);
	});
});
