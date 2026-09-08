// SDD: specs/sdd/triage-note-stops.md, Phase 2, Test Scenario #7 / Requirement 13:
// GIVEN a note stop with two groups, one marked discard and one given a future
// date, WHEN confirmed, THEN both mutations land in a single note write, in
// the stop's group order, and the resulting content matches applying
// dropGroup then snoozeGroup (or the reverse group order, per the stop's own
// groups order) sequentially by hand.
//
// This is the intended RED state: today's handleIntakeGroupOutcomes only ever
// calls dropGroup (outcome.discard) or takeOverGroup (everything else) — it
// never reads IntakeGroupOutcome.due and never calls snoozeGroup (Phase 2 of
// this SDD is not implemented yet). For the "future date, nothing ticked"
// outcome below, today's code instead calls takeOverGroup with an empty
// selection.taken and a non-empty keptOwn, which rewrites the group via
// renderGroup but leaves its due date untouched — so the resulting content
// diverges from applying dropGroup then snoozeGroup by hand, and this test
// fails against current source.

import { describe, it, expect, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups, dropGroup, snoozeGroup } from "../../src/features/vorgang/intake-engine";
import type { IntakeItem } from "../../src/features/vorgang/intake-engine";
import { selectNoteStops, parseIsoDate } from "../../src/features/task-triage/task-triage-engine";
import type { TriageStop, IntakeStopCandidate } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";
// Well past any "today" this suite could run under — the group must still be
// due right now for the note to have qualified for a stop in the first place;
// the future date is only what this confirm is about to write.
const FUTURE_DATE_ISO = "2099-01-15";

// Two groups on the same note, in file order: the first ("Kickoff") is
// discarded, the second ("Review") is deferred to a future date with nothing
// ticked or unticked in it.
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

// The SDD's Data Models section (intake-select-modal.ts) — defined locally
// here as the local test-only shape, mirroring the production type.
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
	app.vault.register(vorgang, TWO_GROUPS);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	// Built through the real join point, exactly as p1_c10 does — the note
	// stop carries both of the note's due groups, in file order.
	const candidates: IntakeStopCandidate[] = parseIntakeGroups(TWO_GROUPS).map((group) => ({
		group,
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
	}));
	const noteStops = selectNoteStops([], candidates);
	internals.stops = noteStops.map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = 0;
	internals.presentStop = async () => {};
	internals.walkActive = true;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 2 #7: ⌘S confirm — discard + future date batch as one write", () => {
	it("commits both mutations in a single vault.process call, matching sequential dropGroup then snoozeGroup", async () => {
		const { internals, app, vorgang } = setup();
		const [groupKickoff, groupReview] = parseIntakeGroups(TWO_GROUPS);

		const kickoffOutcome: IntakeGroupOutcome = {
			lineIndex: groupKickoff.lineIndex,
			discard: true,
			due: null,
			taken: [],
			keptOwn: [],
			keptForeign: [],
		};
		// Nothing ticked or unticked — this outcome is purely "defer this block".
		const reviewOutcome: IntakeGroupOutcome = {
			lineIndex: groupReview.lineIndex,
			discard: false,
			due: FUTURE_DATE_ISO,
			taken: [],
			keptOwn: [...groupReview.ownItems],
			keptForeign: [...groupReview.foreignItems],
		};

		const callsBefore = app.vault.processCallCount;
		await internals.handleIntakeGroupOutcomes([kickoffOutcome, reviewOutcome]);
		const callsAfter = app.vault.processCallCount;

		// A single note write for the whole confirm, not one per group.
		expect(callsAfter - callsBefore).toBe(1);
		expect(app.vault.lastProcessedPath).toBe(vorgang.path);

		// Expected content: apply the pure engine functions by hand, in the
		// stop's own group order (Kickoff, then Review — ascending lineIndex,
		// per selectNoteStops' file-order sort).
		const afterDrop = dropGroup(TWO_GROUPS, groupKickoff);
		expect(afterDrop).not.toBeNull();
		const afterSnooze = snoozeGroup(afterDrop!.newContent, groupReview, parseIsoDate(FUTURE_DATE_ISO), "de");
		expect(afterSnooze).not.toBeNull();
		const expectedContent = afterSnooze!.newContent;

		const actualContent = app.vault.files.get(vorgang.path) ?? "";
		expect(actualContent).toBe(expectedContent);

		// Sanity: the expectation itself actually rewrote Review's due date and
		// dropped Kickoff entirely — otherwise this test would pass vacuously.
		expect(expectedContent).not.toContain("Besprechung - Kickoff");
		expect(expectedContent).toContain("Besprechung - Review");
		expect(expectedContent).toContain("15.01.2099");
	});
});
