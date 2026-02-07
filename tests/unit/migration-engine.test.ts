import { describe, it, expect } from "vitest";
import {
	isStandaloneBold,
	convertBoldToH5,
	convertTocEntries,
	migrateVorgangNote,
} from "../../src/features/migration/migration-engine";

describe("isStandaloneBold", () => {
	it("matches standard bold line", () => {
		expect(isStandaloneBold("**Name, 01.02.2026**")).toEqual({
			inner: "Name, 01.02.2026",
		});
	});

	it("matches bold line with leading/trailing whitespace", () => {
		expect(isStandaloneBold("  **Name, 01.02.2026**  ")).toEqual({
			inner: "Name, 01.02.2026",
		});
	});

	it("rejects inline bold (text before bold)", () => {
		expect(isStandaloneBold("some text **Name**")).toBeNull();
	});

	it("rejects inline bold (text after bold)", () => {
		expect(isStandaloneBold("**Name** some text")).toBeNull();
	});

	it("rejects multiple bold spans", () => {
		expect(isStandaloneBold("**one** and **two**")).toBeNull();
	});

	it("rejects already h5 lines", () => {
		expect(isStandaloneBold("##### Name, 01.02.2026")).toBeNull();
	});

	it("rejects empty bold", () => {
		expect(isStandaloneBold("****")).toBeNull();
	});

	it("rejects whitespace-only bold", () => {
		expect(isStandaloneBold("**   **")).toBeNull();
	});

	it("rejects plain text", () => {
		expect(isStandaloneBold("just some text")).toBeNull();
	});

	it("matches bold with special characters", () => {
		expect(isStandaloneBold("**Besprechung: Fibunet, 15.03.2025**")).toEqual({
			inner: "Besprechung: Fibunet, 15.03.2025",
		});
	});
});

describe("convertBoldToH5", () => {
	it("converts standalone bold lines to h5", () => {
		const lines = ["Some text", "**Section One, 01.02.2026**", "- bullet"];
		const count = convertBoldToH5(lines);
		expect(count).toBe(1);
		expect(lines[1]).toBe("##### Section One, 01.02.2026");
	});

	it("converts multiple bold lines", () => {
		const lines = [
			"**First, 01.02.2026**",
			"- note",
			"**Second, 15.01.2026**",
			"- note",
		];
		const count = convertBoldToH5(lines);
		expect(count).toBe(2);
		expect(lines[0]).toBe("##### First, 01.02.2026");
		expect(lines[2]).toBe("##### Second, 15.01.2026");
	});

	it("skips inline bold", () => {
		const lines = ["This has **bold** in the middle"];
		const count = convertBoldToH5(lines);
		expect(count).toBe(0);
		expect(lines[0]).toBe("This has **bold** in the middle");
	});

	it("skips frontmatter", () => {
		const lines = [
			"---",
			"**not a header**",
			"title: test",
			"---",
			"**This is a header, 01.02.2026**",
		];
		const count = convertBoldToH5(lines);
		expect(count).toBe(1);
		expect(lines[1]).toBe("**not a header**");
		expect(lines[4]).toBe("##### This is a header, 01.02.2026");
	});

	it("handles file with no bold lines", () => {
		const lines = ["# Title", "Some content", "- bullet"];
		const count = convertBoldToH5(lines);
		expect(count).toBe(0);
	});

	it("handles empty array", () => {
		const lines: string[] = [];
		const count = convertBoldToH5(lines);
		expect(count).toBe(0);
	});

	it("does not skip --- after frontmatter is closed", () => {
		const lines = [
			"---",
			"title: test",
			"---",
			"**Header, 01.02.2026**",
			"---",
			"**Also Header, 02.02.2026**",
		];
		const count = convertBoldToH5(lines);
		expect(count).toBe(2);
		expect(lines[3]).toBe("##### Header, 01.02.2026");
		expect(lines[5]).toBe("##### Also Header, 02.02.2026");
	});
});

describe("convertTocEntries", () => {
	it("converts plain TOC bullets to wikilinks", () => {
		const lines = [
			"# Inhalt",
			"- Section One, 01.02.2026",
			"- Section Two, 15.01.2026",
		];
		const count = convertTocEntries(lines);
		expect(count).toBe(2);
		expect(lines[1]).toBe("- [[#Section One, 01.02.2026]]");
		expect(lines[2]).toBe("- [[#Section Two, 15.01.2026]]");
	});

	it("skips already-linked entries", () => {
		const lines = [
			"# Inhalt",
			"- [[#Already Linked, 01.02.2026]]",
			"- Plain Entry, 15.01.2026",
		];
		const count = convertTocEntries(lines);
		expect(count).toBe(1);
		expect(lines[1]).toBe("- [[#Already Linked, 01.02.2026]]");
		expect(lines[2]).toBe("- [[#Plain Entry, 15.01.2026]]");
	});

	it("returns 0 when no # Inhalt exists", () => {
		const lines = ["# Title", "- Some bullet"];
		const count = convertTocEntries(lines);
		expect(count).toBe(0);
	});

	it("returns 0 when no bullets under # Inhalt", () => {
		const lines = ["# Inhalt", "", "##### Header"];
		const count = convertTocEntries(lines);
		expect(count).toBe(0);
	});

	it("skips empty bullets", () => {
		const lines = ["# Inhalt", "- ", "- Real Entry, 01.02.2026"];
		const count = convertTocEntries(lines);
		expect(count).toBe(1);
		expect(lines[1]).toBe("- ");
		expect(lines[2]).toBe("- [[#Real Entry, 01.02.2026]]");
	});

	it("only converts bullets within the Inhalt range", () => {
		const lines = [
			"# Inhalt",
			"- TOC Entry, 01.02.2026",
			"",
			"##### Header, 01.02.2026",
			"- Content bullet, not TOC",
		];
		const count = convertTocEntries(lines);
		expect(count).toBe(1);
		expect(lines[1]).toBe("- [[#TOC Entry, 01.02.2026]]");
		expect(lines[4]).toBe("- Content bullet, not TOC");
	});
});

describe("migrateVorgangNote", () => {
	it("migrates a full old-format note", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"Author: Lukas",
			"---",
			"",
			"# Fakten",
			"- Fact one",
			"",
			"# Inhalt",
			"- Abstimmung mit Daniel, 01.02.2026",
			"- Kick-Off, 15.01.2026",
			"",
			"**Abstimmung mit Daniel, 01.02.2026**",
			"- Discussed budget",
			"- Agreed on timeline",
			"",
			"**Kick-Off, 15.01.2026**",
			"- Initial meeting",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content);

		expect(changeCount).toBe(4); // 2 bold→h5 + 2 TOC entries
		expect(newContent).toContain("##### Abstimmung mit Daniel, 01.02.2026");
		expect(newContent).toContain("##### Kick-Off, 15.01.2026");
		expect(newContent).toContain(
			"- [[#Abstimmung mit Daniel, 01.02.2026]]",
		);
		expect(newContent).toContain("- [[#Kick-Off, 15.01.2026]]");
		expect(newContent).not.toContain("**Abstimmung mit Daniel, 01.02.2026**");
		expect(newContent).not.toContain("**Kick-Off, 15.01.2026**");
		// Preserves other content
		expect(newContent).toContain("# Fakten");
		expect(newContent).toContain("- Discussed budget");
	});

	it("returns changeCount 0 for already migrated note", () => {
		const content = [
			"# Inhalt",
			"- [[#Section, 01.02.2026]]",
			"",
			"##### Section, 01.02.2026",
			"- note",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content);

		expect(changeCount).toBe(0);
		expect(newContent).toBe(content);
	});

	it("is idempotent — running twice gives same result", () => {
		const content = [
			"# Inhalt",
			"- Old Entry, 01.02.2026",
			"",
			"**Old Entry, 01.02.2026**",
			"- note",
		].join("\n");

		const first = migrateVorgangNote(content);
		const second = migrateVorgangNote(first.newContent);

		expect(second.changeCount).toBe(0);
		expect(second.newContent).toBe(first.newContent);
	});

	it("handles mixed old and new format", () => {
		const content = [
			"# Inhalt",
			"- [[#New Entry, 01.02.2026]]",
			"- Old Entry, 15.01.2026",
			"",
			"##### New Entry, 01.02.2026",
			"- new note",
			"",
			"**Old Entry, 15.01.2026**",
			"- old note",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content);

		expect(changeCount).toBe(2); // 1 bold→h5 + 1 TOC entry
		expect(newContent).toContain("##### Old Entry, 15.01.2026");
		expect(newContent).toContain("- [[#Old Entry, 15.01.2026]]");
		expect(newContent).toContain("- [[#New Entry, 01.02.2026]]");
		expect(newContent).toContain("##### New Entry, 01.02.2026");
	});

	it("handles note with no # Inhalt section", () => {
		const content = [
			"# Title",
			"",
			"**Bold Section, 01.02.2026**",
			"- note",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content);

		expect(changeCount).toBe(1); // only the bold→h5
		expect(newContent).toContain("##### Bold Section, 01.02.2026");
	});

	it("handles empty content", () => {
		const { newContent, changeCount } = migrateVorgangNote("");

		expect(changeCount).toBe(0);
		expect(newContent).toBe("");
	});

	it("preserves frontmatter intact", () => {
		const content = [
			"---",
			"title: Test",
			"tags: [vorgang]",
			"---",
			"",
			"**Section, 01.02.2026**",
			"- note",
		].join("\n");

		const { newContent } = migrateVorgangNote(content);
		const lines = newContent.split("\n");

		expect(lines[0]).toBe("---");
		expect(lines[1]).toBe("title: Test");
		expect(lines[2]).toBe("tags: [vorgang]");
		expect(lines[3]).toBe("---");
		expect(lines[5]).toBe("##### Section, 01.02.2026");
	});
});
