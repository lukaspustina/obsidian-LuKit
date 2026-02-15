import { describe, it, expect } from "vitest";
import {
	isStandaloneBold,
	isKnownTopLevelSection,
	getTopLevelSectionName,
	convertTopLevelBoldToH1,
	convertEntryBoldToH5,
	convertTocEntries,
	addFrontmatterTag,
	detectNoteType,
	migrateVorgangNote,
	migrateDiaryNote,
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

describe("isKnownTopLevelSection", () => {
	it("recognizes 'Fakten'", () => {
		expect(isKnownTopLevelSection("Fakten")).toBe(true);
	});

	it("recognizes 'fakten' (case-insensitive)", () => {
		expect(isKnownTopLevelSection("fakten")).toBe(true);
	});

	it("recognizes 'FAKTEN' (case-insensitive)", () => {
		expect(isKnownTopLevelSection("FAKTEN")).toBe(true);
	});

	it("recognizes 'Fakten und Pointer'", () => {
		expect(isKnownTopLevelSection("Fakten und Pointer")).toBe(true);
	});

	it("recognizes 'nächste Schritte'", () => {
		expect(isKnownTopLevelSection("nächste Schritte")).toBe(true);
	});

	it("recognizes 'Nächste Schritte' (case-insensitive)", () => {
		expect(isKnownTopLevelSection("Nächste Schritte")).toBe(true);
	});

	it("recognizes 'Inhalt'", () => {
		expect(isKnownTopLevelSection("Inhalt")).toBe(true);
	});

	it("rejects entry-style names", () => {
		expect(isKnownTopLevelSection("Meeting, 01.02.2026")).toBe(false);
	});

	it("rejects arbitrary text", () => {
		expect(isKnownTopLevelSection("Something Else")).toBe(false);
	});
});

describe("getTopLevelSectionName", () => {
	it("renames 'Fakten' to 'Fakten und Pointer'", () => {
		expect(getTopLevelSectionName("Fakten")).toBe("Fakten und Pointer");
	});

	it("renames 'fakten' to 'Fakten und Pointer' (case-insensitive)", () => {
		expect(getTopLevelSectionName("fakten")).toBe("Fakten und Pointer");
	});

	it("capitalizes 'nächste Schritte'", () => {
		expect(getTopLevelSectionName("nächste Schritte")).toBe(
			"Nächste Schritte",
		);
	});

	it("preserves already-capitalized 'Inhalt'", () => {
		expect(getTopLevelSectionName("Inhalt")).toBe("Inhalt");
	});

	it("capitalizes 'inhalt'", () => {
		expect(getTopLevelSectionName("inhalt")).toBe("Inhalt");
	});

	it("passes through 'Fakten und Pointer' unchanged", () => {
		expect(getTopLevelSectionName("Fakten und Pointer")).toBe(
			"Fakten und Pointer",
		);
	});
});

describe("convertTopLevelBoldToH1", () => {
	it("converts known sections to h1", () => {
		const lines = [
			"**Fakten**",
			"- stuff",
			"",
			"**nächste Schritte**",
			"- todo",
			"",
			"**Inhalt**",
			"- entry",
		];
		const count = convertTopLevelBoldToH1(lines);
		expect(count).toBe(3);
		expect(lines[0]).toBe("# Fakten und Pointer");
		expect(lines[3]).toBe("# Nächste Schritte");
		expect(lines[6]).toBe("# Inhalt");
	});

	it("converts 'Fakten und Pointer' bold to h1", () => {
		const lines = ["**Fakten und Pointer**", "- stuff"];
		const count = convertTopLevelBoldToH1(lines);
		expect(count).toBe(1);
		expect(lines[0]).toBe("# Fakten und Pointer");
	});

	it("skips frontmatter", () => {
		const lines = [
			"---",
			"**Fakten**",
			"title: test",
			"---",
			"**Fakten**",
		];
		const count = convertTopLevelBoldToH1(lines);
		expect(count).toBe(1);
		expect(lines[1]).toBe("**Fakten**");
		expect(lines[4]).toBe("# Fakten und Pointer");
	});

	it("skips non-top-level bold", () => {
		const lines = ["**Meeting, 01.02.2026**", "- notes"];
		const count = convertTopLevelBoldToH1(lines);
		expect(count).toBe(0);
		expect(lines[0]).toBe("**Meeting, 01.02.2026**");
	});

	it("handles empty array", () => {
		const lines: string[] = [];
		const count = convertTopLevelBoldToH1(lines);
		expect(count).toBe(0);
	});
});

describe("convertEntryBoldToH5", () => {
	it("converts standalone bold lines to h5", () => {
		const lines = ["Some text", "**Section One, 01.02.2026**", "- bullet"];
		const count = convertEntryBoldToH5(lines);
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
		const count = convertEntryBoldToH5(lines);
		expect(count).toBe(2);
		expect(lines[0]).toBe("##### First, 01.02.2026");
		expect(lines[2]).toBe("##### Second, 15.01.2026");
	});

	it("skips inline bold", () => {
		const lines = ["This has **bold** in the middle"];
		const count = convertEntryBoldToH5(lines);
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
		const count = convertEntryBoldToH5(lines);
		expect(count).toBe(1);
		expect(lines[1]).toBe("**not a header**");
		expect(lines[4]).toBe("##### This is a header, 01.02.2026");
	});

	it("handles file with no bold lines", () => {
		const lines = ["# Title", "Some content", "- bullet"];
		const count = convertEntryBoldToH5(lines);
		expect(count).toBe(0);
	});

	it("handles empty array", () => {
		const lines: string[] = [];
		const count = convertEntryBoldToH5(lines);
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
		const count = convertEntryBoldToH5(lines);
		expect(count).toBe(2);
		expect(lines[3]).toBe("##### Header, 01.02.2026");
		expect(lines[5]).toBe("##### Also Header, 02.02.2026");
	});

	it("skips known top-level section names", () => {
		const lines = [
			"**Fakten**",
			"**Inhalt**",
			"**nächste Schritte**",
			"**Meeting, 01.02.2026**",
		];
		const count = convertEntryBoldToH5(lines);
		expect(count).toBe(1);
		expect(lines[0]).toBe("**Fakten**");
		expect(lines[1]).toBe("**Inhalt**");
		expect(lines[2]).toBe("**nächste Schritte**");
		expect(lines[3]).toBe("##### Meeting, 01.02.2026");
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

	it("handles mixed plain and wikilink TOC entries", () => {
		const lines = [
			"# Inhalt",
			"- [[#Already Done, 01.02.2026]]",
			"- Still Plain, 15.01.2026",
			"- [[#Also Done, 10.01.2026]]",
			"- Also Plain, 05.01.2026",
		];
		const count = convertTocEntries(lines);
		expect(count).toBe(2);
		expect(lines[1]).toBe("- [[#Already Done, 01.02.2026]]");
		expect(lines[2]).toBe("- [[#Still Plain, 15.01.2026]]");
		expect(lines[3]).toBe("- [[#Also Done, 10.01.2026]]");
		expect(lines[4]).toBe("- [[#Also Plain, 05.01.2026]]");
	});
});

describe("addFrontmatterTag", () => {
	it("adds tags field when none exists", () => {
		const lines = ["---", "title: Test", "---", "", "content"];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(1);
		expect(lines).toEqual([
			"---",
			"title: Test",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"content",
		]);
	});

	it("appends to existing tag list", () => {
		const lines = [
			"---",
			"tags:",
			"  - existing",
			"---",
			"",
			"content",
		];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(1);
		expect(lines).toEqual([
			"---",
			"tags:",
			"  - existing",
			"  - Vorgang",
			"---",
			"",
			"content",
		]);
	});

	it("skips duplicate tag in list format", () => {
		const lines = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"content",
		];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(0);
		expect(lines).toEqual([
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"content",
		]);
	});

	it("skips duplicate tag in inline format", () => {
		const lines = ["---", "tags: [Vorgang, other]", "---"];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(0);
	});

	it("appends to inline format", () => {
		const lines = ["---", "tags: [existing]", "---"];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(1);
		expect(lines[1]).toBe("tags: [existing, Vorgang]");
	});

	it("returns 0 when no frontmatter", () => {
		const lines = ["# Title", "content"];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(0);
	});

	it("returns 0 for empty content", () => {
		const lines: string[] = [];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(0);
	});

	it("returns 0 for unclosed frontmatter", () => {
		const lines = ["---", "title: Test"];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(0);
	});

	it("preserves other frontmatter fields", () => {
		const lines = [
			"---",
			"Created at: 2024-03-28",
			"Author: Lukas",
			"---",
			"",
			"content",
		];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(1);
		expect(lines[1]).toBe("Created at: 2024-03-28");
		expect(lines[2]).toBe("Author: Lukas");
		expect(lines[3]).toBe("tags:");
		expect(lines[4]).toBe("  - Vorgang");
		expect(lines[5]).toBe("---");
	});

	it("handles empty tags field", () => {
		const lines = ["---", "tags:", "---"];
		const count = addFrontmatterTag(lines, "Vorgang");
		expect(count).toBe(1);
		expect(lines).toEqual(["---", "tags:", "  - Vorgang", "---"]);
	});
});

describe("detectNoteType", () => {
	it("detects Vorgang with bold Inhalt", () => {
		const content = [
			"**Fakten**",
			"- stuff",
			"",
			"**Inhalt**",
			"- entry",
		].join("\n");
		expect(detectNoteType(content)).toBe("vorgang");
	});

	it("detects Vorgang with h1 Inhalt", () => {
		const content = [
			"# Fakten und Pointer",
			"- stuff",
			"",
			"# Inhalt",
			"- [[#entry]]",
		].join("\n");
		expect(detectNoteType(content)).toBe("vorgang");
	});

	it("detects diary (no Inhalt)", () => {
		const content = [
			"# Work Diary",
			"",
			"**Fr, 06.02.2026**",
			"- did stuff",
		].join("\n");
		expect(detectNoteType(content)).toBe("diary");
	});

	it("detects diary for empty content", () => {
		expect(detectNoteType("")).toBe("diary");
	});

	it("detects Vorgang with case variation", () => {
		const content = "**inhalt**\n- entry";
		expect(detectNoteType(content)).toBe("vorgang");
	});
});

describe("migrateDiaryNote", () => {
	it("converts bold dates to h5", () => {
		const content = [
			"# Work Diary",
			"",
			"**Fr, 06.02.2026**",
			"- Buy groceries",
			"",
			"**Do, 05.02.2026**",
			"- Clean kitchen",
		].join("\n");

		const { newContent, changeCount } = migrateDiaryNote(content);

		expect(changeCount).toBe(2);
		expect(newContent).toContain("##### Fr, 06.02.2026");
		expect(newContent).toContain("##### Do, 05.02.2026");
		expect(newContent).not.toContain("**Fr, 06.02.2026**");
		expect(newContent).not.toContain("**Do, 05.02.2026**");
	});

	it("is idempotent", () => {
		const content = [
			"##### Fr, 06.02.2026",
			"- Buy groceries",
		].join("\n");

		const { newContent, changeCount } = migrateDiaryNote(content);

		expect(changeCount).toBe(0);
		expect(newContent).toBe(content);
	});

	it("handles empty content", () => {
		const { newContent, changeCount } = migrateDiaryNote("");
		expect(changeCount).toBe(0);
		expect(newContent).toBe("");
	});

	it("does not convert top-level sections", () => {
		const content = [
			"**Fakten**",
			"- stuff",
			"",
			"**Fr, 06.02.2026**",
			"- diary entry",
		].join("\n");

		const { newContent, changeCount } = migrateDiaryNote(content);

		expect(changeCount).toBe(1);
		expect(newContent).toContain("**Fakten**");
		expect(newContent).toContain("##### Fr, 06.02.2026");
	});
});

describe("migrateVorgangNote", () => {
	it("migrates a full old-format note with all steps", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"Author: Lukas",
			"---",
			"",
			"**Fakten**",
			"- Fact one",
			"",
			"**nächste Schritte**",
			"- Todo item",
			"",
			"**Inhalt**",
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

		const { newContent, changeCount } = migrateVorgangNote(content, {
			addTag: "Vorgang",
		});

		// 3 top-level→h1 + 2 entry bold→h5 + 2 TOC entries + 1 tag = 8
		expect(changeCount).toBe(8);
		expect(newContent).toContain("# Fakten und Pointer");
		expect(newContent).toContain("# Nächste Schritte");
		expect(newContent).toContain("# Inhalt");
		expect(newContent).toContain("##### Abstimmung mit Daniel, 01.02.2026");
		expect(newContent).toContain("##### Kick-Off, 15.01.2026");
		expect(newContent).toContain(
			"- [[#Abstimmung mit Daniel, 01.02.2026]]",
		);
		expect(newContent).toContain("- [[#Kick-Off, 15.01.2026]]");
		expect(newContent).toContain("  - Vorgang");
		expect(newContent).not.toContain("**Fakten**");
		expect(newContent).not.toContain("**nächste Schritte**");
		expect(newContent).not.toContain("**Inhalt**");
		expect(newContent).not.toContain("**Abstimmung mit Daniel, 01.02.2026**");
		expect(newContent).not.toContain("**Kick-Off, 15.01.2026**");
		// Preserves other content
		expect(newContent).toContain("- Discussed budget");
	});

	it("works without tag option", () => {
		const content = [
			"---",
			"title: Test",
			"---",
			"",
			"**Inhalt**",
			"- Entry, 01.02.2026",
			"",
			"**Entry, 01.02.2026**",
			"- note",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content);

		// 1 top-level→h1 + 1 entry bold→h5 + 1 TOC entry = 3
		expect(changeCount).toBe(3);
		expect(newContent).toContain("# Inhalt");
		expect(newContent).toContain("##### Entry, 01.02.2026");
		expect(newContent).toContain("- [[#Entry, 01.02.2026]]");
		// No tag added
		expect(newContent).not.toContain("tags:");
	});

	it("returns changeCount 0 for already migrated note", () => {
		const content = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			"- stuff",
			"",
			"# Inhalt",
			"- [[#Section, 01.02.2026]]",
			"",
			"##### Section, 01.02.2026",
			"- note",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content, {
			addTag: "Vorgang",
		});

		expect(changeCount).toBe(0);
		expect(newContent).toBe(content);
	});

	it("is idempotent — running twice gives same result", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"---",
			"",
			"**Fakten**",
			"- stuff",
			"",
			"**Inhalt**",
			"- Old Entry, 01.02.2026",
			"",
			"**Old Entry, 01.02.2026**",
			"- note",
		].join("\n");

		const first = migrateVorgangNote(content, { addTag: "Vorgang" });
		const second = migrateVorgangNote(first.newContent, {
			addTag: "Vorgang",
		});

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

	it("handles partially migrated note with # Inhalt and mixed TOC", () => {
		const content = [
			"---",
			"Created at: 2024-03-28",
			"---",
			"",
			"# Fakten und Pointer",
			"- stuff",
			"",
			"# Inhalt",
			"- [[#Done Entry, 01.02.2026]]",
			"- Still Plain, 15.01.2026",
			"",
			"##### Done Entry, 01.02.2026",
			"- done note",
			"",
			"**Still Plain, 15.01.2026**",
			"- old note",
		].join("\n");

		const { newContent, changeCount } = migrateVorgangNote(content, {
			addTag: "Vorgang",
		});

		// 1 bold→h5 + 1 TOC entry + 1 tag = 3
		expect(changeCount).toBe(3);
		expect(newContent).toContain("##### Still Plain, 15.01.2026");
		expect(newContent).toContain("- [[#Still Plain, 15.01.2026]]");
		expect(newContent).toContain("- [[#Done Entry, 01.02.2026]]");
		expect(newContent).toContain("##### Done Entry, 01.02.2026");
		expect(newContent).toContain("# Fakten und Pointer");
		expect(newContent).toContain("  - Vorgang");
	});

	it("handles note with no # Inhalt section (diary-like but with top-level)", () => {
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
});
