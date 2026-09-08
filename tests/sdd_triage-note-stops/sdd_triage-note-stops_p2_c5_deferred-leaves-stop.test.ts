// SDD: specs/sdd/triage-note-stops.md, Phase 2, Test Scenario #5 / Requirement 14:
// GIVEN a group deferred to a future date via ⌘S, WHEN the stop refreshes
// immediately after (Requirement 14), THEN that group is absent from the
// current stop's `groups`, and the stop does not end.
//
// This is the intended RED state: today's handleIntakeGroupOutcomes
// (src/features/task-triage/task-triage-feature.ts) builds only
// { taken, keptOwn, keptForeign } for takeOverGroup and never calls
// snoozeGroup — IntakeGroupOutcome.due is accepted by the type but ignored at
// runtime (per intake-select-modal.ts's own comment: "The date field itself
// ships in Phase 2, so this is always null today"). So the deferred group's
// parent line keeps its original (due-now) date, refreshIntakeStop still
// finds it due, and it stays on the stop instead of disappearing.

import { describe, it, expect, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageStop, IntakeStopCandidate } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
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
const TODAY_ISO = "2026-09-08";
// Well past TODAY_ISO — the point under test is that the deferred group drops
// off the stop, not the exact filtering boundary.
const FUTURE_ISO = "2026-09-20";

// Two groups, both due now (no trailing date on either parent line): one gets
// deferred via the date field, the other is left untouched so "groups is
// empty" cannot pass for the wrong reason.
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
	"",
	"- Aus [[Besprechung - Onboarding]]",
	"    - Vertrag unterschreiben",
	"",
	"# Inhalt",
	"",
].join("\n");

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	walkToday: string;
	counts: Record<string, number>;
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

	// Built through the real join point, as the p1_c10/p2_c2 convention
	// establishes, so the note stop carries exactly what selectNoteStops
	// produces.
	const candidates: IntakeStopCandidate[] = parseIntakeGroups(TWO_GROUPS).map((group) => ({
		group,
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
	}));
	const noteStops = selectNoteStops([], candidates);
	internals.stops = noteStops.map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = 0;
	internals.walkActive = true;
	internals.walkToday = TODAY_ISO;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 2 #5: a deferred group drops off the stop it refreshes onto", () => {
	it("removes only the deferred group from groups, keeps it in the note, keeps the sibling group, and does not advance", async () => {
		const { internals, app, vorgang } = setup();
		const [kickoff, onboarding] = parseIntakeGroups(TWO_GROUPS) as [IntakeGroup, IntakeGroup];

		// Defer "Aus [[Besprechung - Kickoff]]" to next week; leave the
		// onboarding group untouched (no date, nothing ticked, not discarded).
		const outcomes: IntakeGroupOutcome[] = [
			{
				lineIndex: kickoff.lineIndex,
				discard: false,
				due: FUTURE_ISO,
				taken: [],
				keptOwn: kickoff.ownItems,
				keptForeign: kickoff.foreignItems,
			},
			{
				lineIndex: onboarding.lineIndex,
				discard: false,
				due: null,
				taken: [],
				keptOwn: onboarding.ownItems,
				keptForeign: onboarding.foreignItems,
			},
		];

		await internals.handleIntakeGroupOutcomes(outcomes);

		// The walk stayed on the same stop, and the stop was not dropped.
		expect(internals.index).toBe(0);
		expect(internals.walkActive).toBe(true);
		expect(internals.stops).toHaveLength(1);

		const refreshed = internals.stops[0] as unknown as { groups: IntakeGroup[] };
		const refreshedSources = refreshed.groups.map((g) => g.source);

		// The deferred group is gone from the stop...
		expect(refreshedSources).not.toContain("Besprechung - Kickoff");
		// ...but the untouched sibling group is still there — so an
		// accidentally-emptied groups array cannot pass this assertion for the
		// wrong reason.
		expect(refreshedSources).toEqual(["Besprechung - Onboarding"]);

		// The deferred group is still IN the note — deferred, not removed.
		const finalContent = app.vault.files.get(vorgang.path) ?? "";
		const onDisk = parseIntakeGroups(finalContent);
		expect(onDisk.map((g) => g.source)).toEqual(["Besprechung - Kickoff", "Besprechung - Onboarding"]);
		const deferredOnDisk = onDisk.find((g) => g.source === "Besprechung - Kickoff");
		expect(deferredOnDisk).toBeDefined();
		expect(deferredOnDisk?.ownItems).toEqual(kickoff.ownItems);
	});
});
