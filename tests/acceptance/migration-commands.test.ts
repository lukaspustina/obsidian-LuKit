import { describe, it, expect } from "vitest";
import { migrateVorgangNote } from "../../src/features/migration/migration-engine";

describe("Migrate Vorgang note command flow", () => {
	it("full flow with realistic old Vorgang note", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"Author: Lukas",
			"---",
			"",
			"# Fakten",
			"- Auftraggeber: Daniel",
			"- Status: Aktiv",
			"",
			"# Inhalt",
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

		const { newContent, changeCount } = migrateVorgangNote(content);

		expect(changeCount).toBe(6); // 3 bold→h5 + 3 TOC entries

		// All bold headers converted to h5
		expect(newContent).toContain("##### Abstimmung mit Daniel, 01.02.2026");
		expect(newContent).toContain("##### Kick-Off, 15.01.2026");
		expect(newContent).toContain("##### Erste Analyse, 10.01.2026");
		expect(newContent).not.toContain("**Abstimmung mit Daniel, 01.02.2026**");
		expect(newContent).not.toContain("**Kick-Off, 15.01.2026**");
		expect(newContent).not.toContain("**Erste Analyse, 10.01.2026**");

		// All TOC entries converted to wikilinks
		expect(newContent).toContain(
			"- [[#Abstimmung mit Daniel, 01.02.2026]]",
		);
		expect(newContent).toContain("- [[#Kick-Off, 15.01.2026]]");
		expect(newContent).toContain("- [[#Erste Analyse, 10.01.2026]]");

		// Original content preserved
		expect(newContent).toContain("# Fakten");
		expect(newContent).toContain("- Auftraggeber: Daniel");
		expect(newContent).toContain("- Discussed budget allocation");
		expect(newContent).toContain("- Defined project scope");
		expect(newContent).toContain("- Reviewed existing documentation");

		// Frontmatter preserved
		const lines = newContent.split("\n");
		expect(lines[0]).toBe("---");
		expect(lines[1]).toBe("Created at: 2024-03-28");
		expect(lines[3]).toBe("---");
	});

	it("idempotent: running twice gives same result", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"---",
			"",
			"# Inhalt",
			"- Meeting, 01.02.2026",
			"",
			"**Meeting, 01.02.2026**",
			"- Discussed items",
		].join("\n");

		const first = migrateVorgangNote(content);
		expect(first.changeCount).toBe(2);

		const second = migrateVorgangNote(first.newContent);
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
			"---",
			"",
			"# Fakten",
			"- Status: Done",
			"",
			"# Inhalt",
			"- [[#Review, 01.02.2026]]",
			"",
			"##### Review, 01.02.2026",
			"- All good",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content);

		expect(changeCount).toBe(0);
		expect(newContent).toBe(content);
	});
});
