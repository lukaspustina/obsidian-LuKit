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
