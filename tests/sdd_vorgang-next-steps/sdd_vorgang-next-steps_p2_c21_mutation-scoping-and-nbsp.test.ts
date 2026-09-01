// Regression tests for two defects the Phase 2 reviewer reproduced. Neither was
// covered by criteria 1-20: both mutate the note silently and report success, so
// the walk shows no symptom. Added after the test commit — reason recorded in
// .adlc/cycle/vorgang-next-steps/test-changes.md.
import { describe, it, expect } from "vitest";
import {
	parseIntakeGroups,
	snoozeGroup,
	takeOverGroup,
	dropGroup,
} from "../../src/features/vorgang/intake-engine";

const NBSP = " ";

describe("snoozeGroup replaces a due segment written with a non-breaking space (SDD vorgang-next-steps p2 c21a)", () => {
	// extractDateFromTitle normalises invisible spaces before matching, so the
	// date parses; a strip that searches the un-normalised tail for ", " finds
	// nothing and slice(0, -1) then amputates the line's last character instead.
	// Such spaces arrive from PDF/mail pastes and macOS substitution — the same
	// reason date-format.ts normalises them at all.
	it("does not amputate the last character when the separator is a non-breaking space", () => {
		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			`- Aus [[Besprechung Acme Kickoff]],${NBSP}13.02.2026`,
			"    - Angebot einholen",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const group = parseIntakeGroups(content)[0];
		const result = snoozeGroup(content, group, new Date(2026, 1, 20), "de");

		expect(result).not.toBeNull();
		const parent = result!.newContent
			.split("\n")
			.find((l) => l.startsWith("- Aus [[Besprechung Acme Kickoff]]"));

		expect(parent).toBe("- Aus [[Besprechung Acme Kickoff]], 20.02.2026");
		// The old date must be gone, not merely followed by the new one.
		expect(parent).not.toContain("13.02.202");
	});
});

describe("mutations resolve the parent line inside the intake only (SDD vorgang-next-steps p2 c21b)", () => {
	// The curated part may legitimately hold a line byte-identical to a group's
	// parent — a user who took a group over by hand, for instance. An unscoped
	// lines.indexOf then resolves above the boundary while the splice arithmetic
	// assumes it is below, so the group survives and a sibling line is deleted.
	const withDuplicateAbove = [
		"---",
		"tags: [Vorgang]",
		"---",
		"",
		"# Nächste Schritte",
		"- Aus [[Besprechung Acme Kickoff]]",
		"",
		"#### Unsortiert",
		"- Aus [[Besprechung Acme Kickoff]]",
		"    - Angebot einholen",
		"    - Vertrag prüfen",
		"",
		"# Inhalt",
		"",
	].join("\n");

	it("takeOverGroup removes the group below the boundary, not the curated duplicate", () => {
		const group = parseIntakeGroups(withDuplicateAbove)[0];
		const result = takeOverGroup(withDuplicateAbove, group);

		expect(result).not.toBeNull();
		const lines = result!.newContent.split("\n");
		const boundary = lines.indexOf("#### Unsortiert");

		// Both items moved above the boundary, and the intake is empty.
		expect(lines.slice(0, boundary)).toContain("- Angebot einholen");
		expect(lines.slice(0, boundary)).toContain("- Vertrag prüfen");
		expect(lines.slice(boundary + 1).filter((l) => l.startsWith("- Aus [["))).toHaveLength(0);
		expect(result!.newContent).not.toContain("    - Angebot einholen");
	});

	it("dropGroup deletes the group below the boundary, leaving the curated duplicate intact", () => {
		const group = parseIntakeGroups(withDuplicateAbove)[0];
		const result = dropGroup(withDuplicateAbove, group);

		expect(result).not.toBeNull();
		const lines = result!.newContent.split("\n");
		const boundary = lines.indexOf("#### Unsortiert");

		expect(lines.slice(0, boundary)).toContain("- Aus [[Besprechung Acme Kickoff]]");
		expect(lines.slice(boundary + 1).join("\n")).not.toContain("- Aus [[");
		expect(result!.newContent).not.toContain("Angebot einholen");
	});

	it("takes over the second of two groups sharing a parent line without touching the first", () => {
		// Two threads with the same subject filed on the same day produce
		// byte-identical anchors; message-id dedup does not prevent it.
		const twoGroups = [
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

		const groups = parseIntakeGroups(twoGroups);
		expect(groups).toHaveLength(2);

		const result = takeOverGroup(twoGroups, groups[1]);
		expect(result).not.toBeNull();

		const lines = result!.newContent.split("\n");
		const boundary = lines.indexOf("#### Unsortiert");

		// The second group's item moved up; the first group is untouched below.
		expect(lines.slice(0, boundary)).toContain("- Zweite Sache");
		expect(lines.slice(boundary + 1)).toContain("    - Erste Sache");
		expect(lines.slice(boundary + 1).filter((l) => l.startsWith("- Aus [["))).toHaveLength(1);
	});
});
