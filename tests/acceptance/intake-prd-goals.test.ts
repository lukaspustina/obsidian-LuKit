import { describe, it, expect, vi, beforeEach } from "vitest";
import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import {
	buildIntakeGroup,
	insertIntakeGroup,
	parseIntakeGroups,
} from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { NEXT_STEP_HEADERS } from "../../src/features/vorgang/vorgang-engine";
import type { TriageStop, TriageTask } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// specs/prd/vorgang-next-steps.md — Goals G2/G3, Acceptance Criterion 13.
//
// Lives here, without a "c<N>" number, rather than in
// tests/sdd_vorgang-next-steps/: the 57 tests there are one-per-SDD-criterion
// and each pins a narrow engine- or wiring-level contract. Verifying PRD
// coverage against that suite found three genuine gaps — real, shipped
// behaviour that no existing test would catch a regression in — because the
// per-criterion tests exercise adjacent but distinct paths:
//
//   1. G2 (filing-time dedup) at the intake layer, lowercase heading:
//      SDD requirement 4 / Phase 1 tests header-tolerance only for
//      mergeH1Section's merge path. Nothing tests insertIntakeGroup against a
//      lowercase-spelled "# nächste Schritte" note — a regression here would
//      create a second, canonically-spelled section beside the existing one.
//
//   2. G3 (removed items never return): the existing dedup tests
//      (e.g. sdd_vorgang-next-steps_p3_c3) pre-seed the group as still
//      present, which proves filing-time dedup (G2a) reads the "# Inhalt" TOC
//      link, not that dedup is independent of the intake's own contents
//      (requirement 12). Nothing constructs the genuine G3 state: TOC already
//      links the source, but the intake is empty (post take-over/discard).
//
//   3. AC13 (snooze) at the walk layer: p2_c14 covers snoozeGroup at the
//      engine level; p4_c6/p4_c7 cover take-over/selection at the walk level
//      (the pinned TaskTriageFeature internals contract). Nothing drives
//      snooze through that same contract, so a wiring bug that drops the due
//      date before calling snoozeGroup would go undetected.
//
// All three tests below assert PASS against the current, already-shipped
// implementation — they are regression guards for existing behaviour, not
// RED-state tests for unimplemented work. A failure here means a real defect
// in intake-engine.ts or task-triage-feature.ts, not a missing feature.

describe("insertIntakeGroup — lowercase heading is the same section (PRD G2, SDD requirement 4)", () => {
	it("adds the group inside the existing lowercase-spelled section, not a second canonical one", () => {
		const note = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Bestandsfakt",
			"",
			"# nächste Schritte",
			"- Bestehender Punkt",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const group = buildIntakeGroup(["Angebot einholen"], "Besprechung Acme Kickoff", []);
		const result = insertIntakeGroup(note, group);
		const lines = result.split("\n");

		// Exactly one next-steps heading survives, in either spelling.
		const headingLines = lines.filter((l) => NEXT_STEP_HEADERS.includes(l.trim()));
		expect(headingLines).toHaveLength(1);
		expect(headingLines[0]).toBe("# nächste Schritte");

		// No second, canonically-spelled section was created.
		expect(lines.filter((l) => l.trim() === "# Nächste Schritte")).toHaveLength(0);

		const lowercaseHeadingIndex = lines.findIndex((l) => l.trim() === "# nächste Schritte");
		const boundaryIndex = lines.findIndex((l) => l.trim() === "#### Unsortiert");
		const inhaltIndex = lines.findIndex((l) => l.trim() === "# Inhalt");
		const curatedIndex = lines.findIndex((l) => l.trim() === "- Bestehender Punkt");
		const groupParentIndex = lines.findIndex((l) => l === "- Aus [[Besprechung Acme Kickoff]]");

		// The group sits below the boundary, which sits below the existing
		// lowercase heading, all still inside the same section (before "# Inhalt").
		expect(curatedIndex).toBeGreaterThan(lowercaseHeadingIndex);
		expect(boundaryIndex).toBeGreaterThan(curatedIndex);
		expect(groupParentIndex).toBeGreaterThan(boundaryIndex);
		expect(groupParentIndex).toBeLessThan(inhaltIndex);

		const parsed = parseIntakeGroups(result);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].ownItems.map((i) => i.text)).toEqual(["Angebot einholen"]);
	});
});

describe("BesprechungFeature — removed intake item does not return on re-filing (PRD G3, SDD requirement 12)", () => {
	it("writes no group when the source is already linked in # Inhalt, even though the intake itself is empty", async () => {
		const besprechung = createMockTFile("Besprechungen/Besprechung Acme Kickoff.md", {
			basename: "Besprechung Acme Kickoff",
		});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });

		const besprechungContent = [
			"---",
			"created: 2026-07-29T09:00:00.000Z",
			"---",
			"",
			"# Nächste Schritte",
			"- Angebot einholen",
			"- Vertrag prüfen",
		].join("\n");

		// The genuine G3 state: the TOC already links the source (duplicate-
		// protection anchor, requirement 11) but the intake holds no group at
		// all — the note as it looks after the user took the earlier group
		// over or discarded it. Unlike a pre-seeded group, this state would
		// wrongly re-admit the source if duplicate protection ever started
		// reading the intake's own contents instead of the "# Inhalt" TOC.
		const vorgangContent = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			"- Bestandsfakt",
			"",
			"# Nächste Schritte",
			"- Vom Nutzer übernommener Punkt",
			"",
			"#### Unsortiert",
			"",
			"# Inhalt",
			"- [[Besprechung Acme Kickoff]]",
			"",
		].join("\n");
		expect(parseIntakeGroups(vorgangContent)).toHaveLength(0); // fixture sanity check

		const app = createMockApp({});
		app.vault.register(besprechung, besprechungContent);
		app.vault.register(vorgang, vorgangContent);
		app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });
		app.fileManager.frontmatter.set(besprechung.path, { tags: ["Besprechung", "todo"] });

		const settings = makeTestSettings({
			besprechung: {
				...makeTestSettings().besprechung,
				sectionHeadings: ["Zusammenfassung"],
				decisionHeadings: [],
				nextStepHeadings: ["Nächste Schritte"],
			},
		});
		const plugin = createMockPlugin(settings, app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (
			feature as unknown as {
				fileBesprechungIntoVorgang: (b: typeof besprechung, v: typeof vorgang) => Promise<void>;
			}
		).fileBesprechungIntoVorgang(besprechung, vorgang);

		const result = app.vault.files.get(vorgang.path) ?? "";
		expect(parseIntakeGroups(result)).toHaveLength(0);
		// The already-linked guard skips writing the Vorgang entirely.
		expect(result).toBe(vorgangContent);
	});
});

// --- Walk-level snooze wiring (PRD AC13) ---------------------------------

interface IntakeTriageStop {
	kind: "intake";
	group: IntakeGroup;
	notePath: string;
	noteBasename: string;
}

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	presentStop: () => Promise<void>;
	handleIntakeSnoozeCustom: (date: string) => Promise<void>;
}

function task(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: "TaskNotes/Tasks/Kosten pruefen.md",
		title: "Kosten prüfen",
		isCompleted: false,
		due: "2026-07-01",
		priority: "normal",
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

const VORGANG = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Fakten und Pointer",
	"",
	"# Nächste Schritte",
	"- Bestehender Punkt",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung Acme Kickoff]]",
	"    - Angebot einholen",
	"    - Vertrag prüfen",
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => resetNotices());

describe("intake stop — snooze wiring through the pinned walk internals (PRD AC13, SDD requirement 35)", () => {
	it("writes the new due date onto the parent line and leaves the sub-bullets unchanged", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		app.vault.register(vorgang, VORGANG);

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;

		const group = parseIntakeGroups(VORGANG)[0];
		const intakeStop: IntakeTriageStop = { kind: "intake", group, notePath: vorgang.path, noteBasename: vorgang.basename };

		internals.presentStop = vi.fn(async () => {});
		internals.walkActive = true;
		internals.stops = [intakeStop as unknown as TriageStop, { kind: "task", task: task() }];
		internals.index = 0;
		internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0 };

		await internals.handleIntakeSnoozeCustom("2026-09-08");

		const newContent = app.vault.files.get(vorgang.path) ?? "";
		const lines = newContent.split("\n");

		const parentLine = lines.find((l) => l.startsWith("- Aus [[Besprechung Acme Kickoff]]"));
		expect(parentLine).toBe("- Aus [[Besprechung Acme Kickoff]], 08.09.2026");

		expect(lines).toContain("    - Angebot einholen");
		expect(lines).toContain("    - Vertrag prüfen");

		expect(internals.index).toBe(1);
		expect(internals.walkActive).toBe(true);
	});
});
