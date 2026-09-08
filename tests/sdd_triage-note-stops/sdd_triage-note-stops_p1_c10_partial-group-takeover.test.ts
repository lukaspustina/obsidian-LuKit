// SDD: specs/sdd/triage-note-stops.md, Phase 1, Test Scenario #10 / Requirements 9, 10, 13, 14:
// GIVEN a note stop with two groups, WHEN ⌘S confirms with only one group's
// lines fully ticked, THEN that group's lines move into the curated part and
// the group is removed from the note; the other group's lines and parent line
// are byte-identical; the walk returns to the same stop with
// `groups.length === 1`.
//
// TriageStop has no "note" kind yet, and handleIntakeGroupOutcomes still takes a
// single optional IntakeTakeOver rather than the batched IntakeGroupOutcome[]
// the SDD's Data Models section describes for the multi-group ⌘S confirm. The
// NoteStop shape is built through the real join point (selectNoteStops, per
// the p1_c9 convention) and cast through `as unknown as TriageStop`; the
// IntakeGroupOutcome type is defined locally here since intake-select-modal.ts
// does not export it yet. This is the intended RED state: today's
// handleIntakeGroupOutcomes has no "note"-kind branch and no multi-group batching,
// so calling it with an outcomes array is a type error at build time and,
// against the real (uncast) internals, a no-op at runtime.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeItem } from "../../src/features/vorgang/intake-engine";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageStop, IntakeStopCandidate } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

const TODAY = "2026-09-08";
const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";
const OTHER_PATH = "Vorgänge/Vorgang Beispiel GmbH.md";
const OTHER_BASENAME = "Vorgang Beispiel GmbH";

// Two groups on the same note — the shape a merged note stop presents once a
// Vorgang carries more than one due filing.
const TWO_GROUPS = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung - Kickoff]]",
	"    - Angebot prüfen",
	"    - Termin vereinbaren",
	"",
	"- Aus [[Besprechung - Review]]",
	"    - Rechnung schicken",
	"",
	"# Inhalt",
	"",
].join("\n");

// A second, unrelated due note — so the walk's stop array has more than one
// entry and the "index unchanged" assertion below isn't trivially true by
// construction (there being nowhere else the index could point).
const OTHER = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung - Sonstiges]]",
	"    - Sonstiges klären",
	"",
	"# Inhalt",
	"",
].join("\n");

// The SDD's Data Models section (intake-select-modal.ts, not yet written) —
// defined locally until the real export exists.
interface IntakeGroupOutcome {
	lineIndex: number;
	discard: boolean;
	due: string | null;
	taken: IntakeItem[];
	keptOwn: IntakeItem[];
	keptForeign: IntakeItem[];
}

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	presentStop: () => Promise<void>;
	handleIntakeGroupOutcomes: (outcomes: IntakeGroupOutcome[]) => Promise<void>;
}

function setup() {
	const app = createMockApp({});
	const vorgang = createMockTFile(NOTE_PATH, { basename: NOTE_BASENAME });
	const other = createMockTFile(OTHER_PATH, { basename: OTHER_BASENAME });
	app.vault.register(vorgang, TWO_GROUPS);
	app.vault.register(other, OTHER);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	// Built through the real join point (not a hand-typed fake stop), so the
	// note stop carries exactly what selectNoteStops produces — both of the
	// note's due groups, in file order (pinned separately by p1_c2).
	const candidates: IntakeStopCandidate[] = [
		...parseIntakeGroups(TWO_GROUPS).map((group) => ({ group, notePath: NOTE_PATH, noteBasename: NOTE_BASENAME })),
		...parseIntakeGroups(OTHER).map((group) => ({ group, notePath: OTHER_PATH, noteBasename: OTHER_BASENAME })),
	];
	const noteStops = selectNoteStops([], candidates);
	internals.stops = noteStops.map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = internals.stops.findIndex((s) => (s as unknown as { notePath: string }).notePath === NOTE_PATH);
	internals.presentStop = vi.fn(async () => {});
	internals.walkActive = true;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 1 #10: ⌘S confirm on a note stop with two groups — partial take-over", () => {
	it("moves the fully-ticked group's lines into the curated part, removes that group, and leaves the other group byte-identical", async () => {
		const { internals, app, vorgang } = setup();
		const startIndex = internals.index;
		const [groupKickoff, groupReview] = parseIntakeGroups(TWO_GROUPS);

		// Kickoff: every line ticked (full take-over, nothing kept).
		const kickoffOutcome: IntakeGroupOutcome = {
			lineIndex: groupKickoff.lineIndex,
			discard: false,
			due: null,
			taken: [...groupKickoff.ownItems],
			keptOwn: [],
			keptForeign: [],
		};
		// Review: nothing ticked — the checkbox convention keeps its (unedited)
		// text in the group, per the existing selection dialog's rule.
		const reviewOutcome: IntakeGroupOutcome = {
			lineIndex: groupReview.lineIndex,
			discard: false,
			due: null,
			taken: [],
			keptOwn: [...groupReview.ownItems],
			keptForeign: [],
		};

		await internals.handleIntakeGroupOutcomes([kickoffOutcome, reviewOutcome]);

		const finalContent = app.vault.files.get(vorgang.path) ?? "";
		const lines = finalContent.split("\n");
		const boundaryIndex = lines.findIndex((l) => l.trim() === "#### Unsortiert");

		// The Kickoff group's lines moved into the curated part, above the
		// boundary.
		const angebotIndex = lines.indexOf("- Angebot prüfen");
		const terminIndex = lines.indexOf("- Termin vereinbaren");
		expect(angebotIndex).toBeGreaterThan(-1);
		expect(terminIndex).toBeGreaterThan(-1);
		expect(angebotIndex).toBeLessThan(boundaryIndex);
		expect(terminIndex).toBeLessThan(boundaryIndex);

		// The Kickoff group is gone; only Review remains, byte-identical.
		const remaining = parseIntakeGroups(finalContent);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].line).toBe(groupReview.line);
		expect(remaining[0].source).toBe("Besprechung - Review");
		expect(remaining[0].ownItems).toEqual(groupReview.ownItems);
		expect(remaining[0].foreignItems).toEqual(groupReview.foreignItems);

		// The walk returned to the same stop, not advancing to the next one.
		expect(internals.index).toBe(startIndex);
		expect(internals.presentStop).toHaveBeenCalled();
		const refreshed = internals.stops[startIndex] as unknown as { notePath: string; groups: { source: string }[] };
		expect(refreshed.notePath).toBe(NOTE_PATH);
		expect(refreshed.groups).toHaveLength(1);
		expect(refreshed.groups[0].source).toBe("Besprechung - Review");
	});
});
