import { describe, it, expect } from "vitest";
import {
	migrateVorgangNote,
	migrateDiaryNote,
	detectNoteType,
} from "../../src/features/migration/migration-engine";

describe("Migrate Vorgang note command flow", () => {
	it("full flow with realistic old Vorgang note", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"Author: Lukas",
			"---",
			"",
			"",
			"**Fakten**",
			"- Auftraggeber: Daniel",
			"- Status: Aktiv",
			"",
			"**nächste Schritte**",
			"- Vertragswechsel überlegen",
			"",
			"**Inhalt**",
			"- Abstimmung mit Daniel, 01.02.2026",
			"- Kick-Off, 15.01.2026",
			"- Erste Analyse, 10.01.2026",
			"",
			"**Abstimmung mit Daniel, 01.02.2026**",
			"- Discussed budget allocation",
			"- Agreed on Q2 timeline",
			"",
			"**Kick-Off, 15.01.2026**",
			"- Initial meeting with stakeholders",
			"- Defined project scope",
			"",
			"**Erste Analyse, 10.01.2026**",
			"- Reviewed existing documentation",
		].join("\n");

		// Step 1: Detect note type
		expect(detectNoteType(content)).toBe("vorgang");

		// Step 2: Dry-run preview
		const { changeCount: previewCount } = migrateVorgangNote(content, {
			addTag: "Vorgang",
		});
		// 3 top-level→h1 + 3 entry bold→h5 + 3 TOC entries + 1 tag = 10
		expect(previewCount).toBe(10);

		// Step 3: Apply migration
		const { newContent, changeCount } = migrateVorgangNote(content, {
			addTag: "Vorgang",
		});
		expect(changeCount).toBe(10);

		// Top-level sections converted to h1
		expect(newContent).toContain("# Fakten und Pointer");
		expect(newContent).toContain("# Nächste Schritte");
		expect(newContent).toContain("# Inhalt");
		expect(newContent).not.toContain("**Fakten**");
		expect(newContent).not.toContain("**nächste Schritte**");
		expect(newContent).not.toContain("**Inhalt**");

		// All bold entry headers converted to h5
		expect(newContent).toContain("##### Abstimmung mit Daniel, 01.02.2026");
		expect(newContent).toContain("##### Kick-Off, 15.01.2026");
		expect(newContent).toContain("##### Erste Analyse, 10.01.2026");
		expect(newContent).not.toContain(
			"**Abstimmung mit Daniel, 01.02.2026**",
		);
		expect(newContent).not.toContain("**Kick-Off, 15.01.2026**");
		expect(newContent).not.toContain("**Erste Analyse, 10.01.2026**");

		// All TOC entries converted to wikilinks
		expect(newContent).toContain(
			"- [[#Abstimmung mit Daniel, 01.02.2026]]",
		);
		expect(newContent).toContain("- [[#Kick-Off, 15.01.2026]]");
		expect(newContent).toContain("- [[#Erste Analyse, 10.01.2026]]");

		// Tag added to frontmatter
		expect(newContent).toContain("tags:");
		expect(newContent).toContain("  - Vorgang");

		// Original content preserved
		expect(newContent).toContain("- Auftraggeber: Daniel");
		expect(newContent).toContain("- Discussed budget allocation");
		expect(newContent).toContain("- Defined project scope");
		expect(newContent).toContain("- Reviewed existing documentation");

		// Frontmatter preserved
		const lines = newContent.split("\n");
		expect(lines[0]).toBe("---");
		expect(lines[1]).toBe("Created at: 2024-03-28");
		expect(lines[2]).toBe("Author: Lukas");
	});

	it("idempotent: running twice gives same result", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
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

		const first = migrateVorgangNote(content, { addTag: "Vorgang" });
		expect(first.changeCount).toBeGreaterThan(0);

		const second = migrateVorgangNote(first.newContent, {
			addTag: "Vorgang",
		});
		expect(second.changeCount).toBe(0);
		expect(second.newContent).toBe(first.newContent);
	});

	it("partially migrated note (mix of old and new)", () => {
		const content = [
			"# Inhalt",
			"- [[#New Section, 01.02.2026]]",
			"- Old Section, 15.01.2026",
			"- [[#Another New, 10.01.2026]]",
			"",
			"##### New Section, 01.02.2026",
			"- new note",
			"",
			"**Old Section, 15.01.2026**",
			"- old note",
			"",
			"##### Another New, 10.01.2026",
			"- another note",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content);

		expect(changeCount).toBe(2); // 1 bold→h5 + 1 TOC entry

		// Old section migrated
		expect(newContent).toContain("##### Old Section, 15.01.2026");
		expect(newContent).toContain("- [[#Old Section, 15.01.2026]]");

		// Already-new sections untouched
		expect(newContent).toContain("- [[#New Section, 01.02.2026]]");
		expect(newContent).toContain("##### New Section, 01.02.2026");
		expect(newContent).toContain("- [[#Another New, 10.01.2026]]");
		expect(newContent).toContain("##### Another New, 10.01.2026");
	});

	it("note with content but nothing to migrate", () => {
		const content = [
			"---",
			"title: Already Modern",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			"- Status: Done",
			"",
			"# Inhalt",
			"- [[#Review, 01.02.2026]]",
			"",
			"##### Review, 01.02.2026",
			"- All good",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content, {
			addTag: "Vorgang",
		});

		expect(changeCount).toBe(0);
		expect(newContent).toBe(content);
	});
});

describe("Migrate Diary note command flow", () => {
	it("full flow with realistic old diary note", () => {
		const content = [
			"# Work Diary",
			"",
			"**Fr, 06.02.2026**",
			"- Buy more groceries",
			"- Clean the kitchen",
			"",
			"**Do, 05.02.2026**",
			"- Buy groceries",
			"- Clean the kitchen",
		].join("\n");

		// Step 1: Detect note type
		expect(detectNoteType(content)).toBe("diary");

		// Step 2: Dry-run preview
		const { changeCount: previewCount } = migrateDiaryNote(content);
		expect(previewCount).toBe(2);

		// Step 3: Apply migration
		const { newContent, changeCount } = migrateDiaryNote(content);
		expect(changeCount).toBe(2);

		expect(newContent).toContain("##### Fr, 06.02.2026");
		expect(newContent).toContain("##### Do, 05.02.2026");
		expect(newContent).not.toContain("**Fr, 06.02.2026**");
		expect(newContent).not.toContain("**Do, 05.02.2026**");

		// Content preserved
		expect(newContent).toContain("- Buy more groceries");
		expect(newContent).toContain("- Buy groceries");
	});

	it("idempotent: running diary migration twice", () => {
		const content = [
			"**Fr, 06.02.2026**",
			"- entry",
		].join("\n");

		const first = migrateDiaryNote(content);
		expect(first.changeCount).toBe(1);

		const second = migrateDiaryNote(first.newContent);
		expect(second.changeCount).toBe(0);
		expect(second.newContent).toBe(first.newContent);
	});
});

describe("Auto-detection", () => {
	it("detects old-format Vorgang by bold Inhalt", () => {
		const content = "**Fakten**\n- stuff\n\n**Inhalt**\n- entry";
		expect(detectNoteType(content)).toBe("vorgang");
	});

	it("detects new-format Vorgang by h1 Inhalt", () => {
		const content = "# Inhalt\n- [[#entry]]";
		expect(detectNoteType(content)).toBe("vorgang");
	});

	it("detects diary for note without Inhalt", () => {
		const content = "# Work Diary\n\n**Fr, 06.02.2026**\n- stuff";
		expect(detectNoteType(content)).toBe("diary");
	});
});
