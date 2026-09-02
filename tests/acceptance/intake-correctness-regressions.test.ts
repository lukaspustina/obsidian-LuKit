// Regressions for the two data-losing defects the post-verify correctness pass
// found. Both survived 71 green SDD criteria and 836 tests, because coverage and
// correctness are different questions.
//
// 1. findParentIndex resolved a stale lineIndex onto the FIRST of two
//    byte-identical parent lines, so taking over the second group moved its
//    items while splicing away the first group's lines. Identical anchors are
//    routine: an email anchor is subject + date, so two same-subject threads
//    filed the same day produce them.
// 2. On a note without "# Fakten und Pointer", the section was created directly
//    after the frontmatter, leaving the note's existing body INSIDE the intake
//    region (which only closes at the next h1-h3) — the body parsed as bogus
//    groups, and discarding one deleted the user's prose.
import { describe, it, expect } from "vitest";
import {
	parseIntakeGroups,
	insertIntakeGroup,
	buildIntakeGroup,
	takeOverGroup,
	dropGroup,
} from "../../src/features/vorgang/intake-engine";

describe("mutations disambiguate byte-identical parent lines by group content", () => {
	const twoIdenticalAnchors = [
		"---",
		"tags: [Vorgang]",
		"---",
		"",
		"# Nächste Schritte",
		"",
		"#### Unsortiert",
		"- Aus [[#E-Mail-Thread: Angebot, 01.09.2026]]",
		"    - Erste Sache",
		"- Aus [[#E-Mail-Thread: Angebot, 01.09.2026]]",
		"    - Zweite Sache",
		"",
		"# Inhalt",
		"",
	].join("\n");

	it("takes over the second group even when its lineIndex is stale", () => {
		const groups = parseIntakeGroups(twoIdenticalAnchors);
		expect(groups).toHaveLength(2);

		// Simulate what an earlier stop's mutation does: the group object was
		// parsed before the note shifted, so its lineIndex no longer points at
		// its own line. The scan fallback must not then pick the first duplicate.
		const stale = { ...groups[1], lineIndex: 999 };
		const result = takeOverGroup(twoIdenticalAnchors, stale);

		expect(result).not.toBeNull();
		const lines = result!.newContent.split("\n");
		const boundary = lines.indexOf("#### Unsortiert");

		expect(lines.slice(0, boundary)).toContain("- Zweite Sache");
		// The first group must survive untouched below the boundary.
		expect(lines.slice(boundary + 1)).toContain("    - Erste Sache");
		expect(lines.slice(boundary + 1).filter((l) => l.startsWith("- Aus [["))).toHaveLength(1);
	});

	it("discards the second group without deleting the first", () => {
		const groups = parseIntakeGroups(twoIdenticalAnchors);
		const stale = { ...groups[1], lineIndex: 999 };
		const result = dropGroup(twoIdenticalAnchors, stale);

		expect(result).not.toBeNull();
		expect(result!.newContent).toContain("    - Erste Sache");
		expect(result!.newContent).not.toContain("    - Zweite Sache");
	});
});

describe("a note without '# Fakten und Pointer' keeps its body out of the intake", () => {
	// A note tagged Vorgang but never run through ensureVorgangSkeleton.
	const bodyOnly = [
		"---",
		"tags: [Person]",
		"---",
		"",
		"Erika Beispiel arbeitet bei Acme.",
		"Erreichbar unter erika@example.com.",
		"",
	].join("\n");

	it("parses no bogus groups from the existing prose", () => {
		const group = buildIntakeGroup(["Rückruf vereinbaren"], "Besprechung Acme Kickoff", []);
		const withIntake = insertIntakeGroup(bodyOnly, group);

		const groups = parseIntakeGroups(withIntake);
		expect(groups).toHaveLength(1);
		expect(groups[0].source).toBe("Besprechung Acme Kickoff");
	});

	it("does not delete the user's prose when the group is discarded", () => {
		const group = buildIntakeGroup(["Rückruf vereinbaren"], "Besprechung Acme Kickoff", []);
		const withIntake = insertIntakeGroup(bodyOnly, group);

		const parsed = parseIntakeGroups(withIntake);
		const result = dropGroup(withIntake, parsed[0]);

		expect(result).not.toBeNull();
		expect(result!.newContent).toContain("Erika Beispiel arbeitet bei Acme.");
		expect(result!.newContent).toContain("Erreichbar unter erika@example.com.");
		expect(result!.newContent).not.toContain("Rückruf vereinbaren");
	});

	it("keeps the prose above the created section", () => {
		const group = buildIntakeGroup(["Rückruf vereinbaren"], "Besprechung Acme Kickoff", []);
		const lines = insertIntakeGroup(bodyOnly, group).split("\n");

		const proseAt = lines.indexOf("Erika Beispiel arbeitet bei Acme.");
		const headingAt = lines.findIndex((l) => l.trim().toLowerCase() === "# nächste schritte");

		expect(proseAt).toBeGreaterThanOrEqual(0);
		expect(headingAt).toBeGreaterThan(proseAt);
	});
});

describe("owner detection is off until own names are configured", () => {
	// Shipped default is ownNames: []. With detection active, every item holding
	// a colon — "Angebot: bis Freitag prüfen" — was classified foreign and filed
	// under "- Warte auf:", which is both useless and the opposite of what the
	// settings description promises. Without configured names there is no way to
	// know what is foreign, so detection stays off.
	it("treats a colon-bearing item as the user's own when ownNames is empty", () => {
		const group = buildIntakeGroup(
			["Angebot: bis Freitag prüfen", "Rückruf vereinbaren"],
			"Besprechung Acme Kickoff",
			[],
		);

		expect(group.ownItems.map((i) => i.text)).toEqual([
			"Angebot: bis Freitag prüfen",
			"Rückruf vereinbaren",
		]);
		expect(group.foreignItems).toHaveLength(0);
	});

	it("still separates a foreign assignee once a name is configured", () => {
		const group = buildIntakeGroup(
			["Max: Rückmeldung geben", "Rückruf vereinbaren"],
			"Besprechung Acme Kickoff",
			["Erika Beispiel"],
		);

		expect(group.ownItems.map((i) => i.text)).toEqual(["Rückruf vereinbaren"]);
		expect(group.foreignItems.map((i) => i.text)).toEqual(["Max: Rückmeldung geben"]);
	});
});

// A second correctness pass over the same code found four more defects, all
// reproduced before they were fixed. Their regressions follow.

describe("the intake section lands below a legacy '# Fakten' heading", () => {
	// vorgang-engine accepts both spellings of the facts heading; intake-engine
	// knew only the canonical one, so on a note Migration has not touched yet
	// the new section was created ABOVE "# Fakten" — the facts ended up inside
	// the intake region, where a discard would eventually eat them.
	const legacyNote = [
		"---",
		"tags: [Vorgang]",
		"---",
		"",
		"# Fakten",
		"- Ansprechpartnerin: Erika Beispiel",
		"",
		"# Inhalt",
		"",
	].join("\n");

	it("creates '# Nächste Schritte' after the legacy facts, not before them", () => {
		const group = buildIntakeGroup(["Angebot einholen"], "Besprechung Acme Kickoff", []);
		const lines = insertIntakeGroup(legacyNote, group).split("\n");

		const faktenAt = lines.indexOf("# Fakten");
		const faktAt = lines.indexOf("- Ansprechpartnerin: Erika Beispiel");
		const nextStepsAt = lines.findIndex((l) => l.trim() === "# Nächste Schritte");
		const inhaltAt = lines.indexOf("# Inhalt");

		expect(faktenAt).toBeGreaterThanOrEqual(0);
		expect(nextStepsAt).toBeGreaterThan(faktAt);
		expect(inhaltAt).toBeGreaterThan(nextStepsAt);
	});
});

describe("buildIntakeGroup keeps an indented first line", () => {
	// The email preview's next-steps box takes whatever the user types; a
	// leading tab or four spaces on the first line had no parent to nest under
	// and was dropped without trace. Losing typed input is the wrong failure.
	it("turns a leading indented line into an item instead of dropping it", () => {
		const group = buildIntakeGroup(
			["    - Angebot einholen", "Rückruf vereinbaren"],
			"Besprechung Acme Kickoff",
			[],
		);

		expect(group.ownItems.map((i) => i.text)).toEqual(["Angebot einholen", "Rückruf vereinbaren"]);
		expect(group.foreignItems).toHaveLength(0);
	});

	it("still nests an indented line under the item above it", () => {
		const group = buildIntakeGroup(
			["Angebot einholen", "    - bis Freitag"],
			"Besprechung Acme Kickoff",
			[],
		);

		expect(group.ownItems).toEqual([{ text: "Angebot einholen", children: ["    - bis Freitag"] }]);
	});
});

describe("a four-space item after '- Warte auf:' is the user's own", () => {
	// The waiting flag was never cleared, so every item below the separator
	// counted as foreign regardless of its indent. Indent decides: a four-space
	// item is a sibling of the separator (own), the eight-space ones below it
	// are the foreign ones.
	const note = [
		"---",
		"tags: [Vorgang]",
		"---",
		"",
		"# Nächste Schritte",
		"",
		"#### Unsortiert",
		"- Aus [[Besprechung Acme Kickoff]]",
		"    - Angebot einholen",
		"    - Warte auf:",
		"        - Max Mustermann: Rückmeldung geben",
		"    - Nachfassen",
		"",
		"# Inhalt",
		"",
	].join("\n");

	it("parses the hand-added item below the separator as own", () => {
		const groups = parseIntakeGroups(note);

		expect(groups).toHaveLength(1);
		expect(groups[0].ownItems.map((i) => i.text)).toEqual(["Angebot einholen", "Nachfassen"]);
		expect(groups[0].foreignItems.map((i) => i.text)).toEqual(["Max Mustermann: Rückmeldung geben"]);
	});
});

describe("the intake region's blank lines stay normalised", () => {
	it("puts exactly one blank line between the last curated bullet and a created boundary", () => {
		const curated = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Nächste Schritte",
			"- Kuratierter Punkt",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const group = buildIntakeGroup(["Angebot einholen"], "Besprechung Acme Kickoff", []);
		const lines = insertIntakeGroup(curated, group).split("\n");

		const bulletAt = lines.indexOf("- Kuratierter Punkt");
		const boundaryAt = lines.indexOf("#### Unsortiert");

		expect(lines[bulletAt + 1]).toBe("");
		expect(boundaryAt).toBe(bulletAt + 2);
	});

	it("does not stack blank lines under the boundary across repeated take-overs", () => {
		let content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Nächste Schritte",
			"- Kuratierter Punkt",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Angebot einholen",
			"",
			"- Aus [[Besprechung Acme Folgetermin]]",
			"    - Rückmeldung geben",
			"",
			"# Inhalt",
			"",
		].join("\n");

		for (let i = 0; i < 2; i++) {
			const result = takeOverGroup(content, parseIntakeGroups(content)[0]);
			expect(result).not.toBeNull();
			content = result!.newContent;
		}

		const lines = content.split("\n");
		const region = lines.slice(lines.indexOf("#### Unsortiert") + 1, lines.indexOf("# Inhalt"));
		const doubled = region.some((line, i) => i > 0 && line.trim() === "" && region[i - 1].trim() === "");

		expect(doubled).toBe(false);
		expect(lines).toContain("- Angebot einholen");
		expect(lines).toContain("- Rückmeldung geben");
	});
});
