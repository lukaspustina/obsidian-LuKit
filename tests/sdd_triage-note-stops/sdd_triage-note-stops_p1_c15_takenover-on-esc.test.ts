// Supersedes the counting cases of tests/acceptance/intake-partial-takeover.test.ts.
// SDD: specs/sdd/triage-note-stops.md, Phase 1, Test Scenario / Requirement 15:
// GIVEN a note stop where ⌘S moves at least one line out of a group, WHEN the
// stop is later left via Esc, THEN it is counted as übernommen, not
// übersprungen — mirroring the existing `takenOverStops` mechanism
// (previously scoped to `kind: "intake"` stops, generalized here to
// `kind: "note"` stops per the SDD's File & Module Structure section).
//
// `kind: "note"` does not exist on TriageStop yet — task-triage-engine.ts
// still has "task"/"intake"/"reminder", and TaskTriageFeature's `counts`
// object still carries a separate "discarded" bucket instead of the flat
// six-bucket scheme (erledigt/verschoben/ausgelassen/übersprungen/
// übernommen/offen) Requirement 15 specifies. The negative half of this file
// additionally pins a real behaviour change: today, `handleIntakeGroupOutcomes`
// marks `takenOverStops` whenever a selection was confirmed at all — even one
// that moves nothing (all lines kept). Requirement 15 narrows this to "moved
// at least one line", so a confirmed-but-empty ⌘S pass must NOT be counted as
// übernommen. `IntakeSelectModal`'s `onConfirm` also does not yet return
// `IntakeGroupOutcome[]` (the SDD's Data Models section) — it still returns a
// single `IntakeTakeOver`. This file follows the mocking convention pinned in
// tests/sdd_vorgang-next-steps/sdd_vorgang-next-steps_p4_c7_selection-subset.test.ts
// (mock IntakeSelectModal, capture the constructed onConfirm, invoke it, flush
// microtasks) and the counting convention pinned in
// tests/acceptance/intake-partial-takeover.test.ts.
//
// Expected failure today: "internals.handleIntakeSelect is not a function" —
// TaskTriageFeature has no such internals shaped for a "note" stop yet (or,
// once handleIntakeSelect exists for "intake" stops but not "note" stops, a
// TypeError from the stop-kind guard bailing out) — the correct RED, not a
// syntax error.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { constructed } = vi.hoisted(() => ({ constructed: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/features/task-triage/intake-select-modal", () => ({
	IntakeSelectModal: class {
		constructor(_app: unknown, options: Record<string, unknown>) {
			constructed.push(options);
		}
		open(): void {}
	},
}));

import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// IntakeGroupOutcome from the SDD's Data Models section — not yet exported by
// production code, so the shape is declared here for the test's own use.
interface IntakeGroupOutcome {
	lineIndex: number;
	discard: boolean;
	due: string | null;
	taken: { text: string; children: string[] }[];
	keptOwn: { text: string; children: string[] }[];
	keptForeign: { text: string; children: string[] }[];
}

interface NoteTriageStop {
	kind: "note";
	notePath: string;
	noteBasename: string;
	groups: IntakeGroup[];
}

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	presentStop: () => Promise<void>;
	handleIntakeSelect: () => void;
	handleSkip: () => Promise<void>;
}

const VORGANG = [
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
	"# Inhalt",
	"",
].join("\n");

function setup(): { internals: FeatureInternals; app: ReturnType<typeof createMockApp>; vorgang: ReturnType<typeof createMockTFile> } {
	const app = createMockApp({});
	const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
	app.vault.register(vorgang, VORGANG);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	const group = parseIntakeGroups(VORGANG)[0];
	const noteStop: NoteTriageStop = { kind: "note", notePath: vorgang.path, noteBasename: vorgang.basename, groups: [group] };

	internals.presentStop = vi.fn(async () => {});
	internals.walkActive = true;
	internals.stops = [
		noteStop as unknown as TriageStop,
		{ kind: "note", notePath: "other.md", noteBasename: "other", groups: [] } as unknown as TriageStop,
	];
	internals.index = 0;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => {
	resetNotices();
	constructed.length = 0;
});

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("note stop — Esc after a line-moving ⌘S counts as übernommen (SDD triage-note-stops p1 c15)", () => {
	it("counts the stop as übernommen, not übersprungen, when ⌘S moved at least one line before Esc", async () => {
		const { internals } = setup();

		internals.handleIntakeSelect();
		expect(constructed).toHaveLength(1);
		const onConfirm = constructed[0].onConfirm as (outcomes: IntakeGroupOutcome[]) => void;
		const group = internals.stops[0].kind === "note" ? (internals.stops[0] as unknown as NoteTriageStop).groups[0] : undefined;
		expect(group).toBeDefined();

		// One line ("Angebot prüfen") leaves the group — the other stays.
		onConfirm([
			{
				lineIndex: group!.lineIndex,
				discard: false,
				due: null,
				taken: [{ text: "Angebot prüfen", children: [] }],
				keptOwn: [{ text: "Termin vereinbaren", children: [] }],
				keptForeign: [],
			},
		]);
		await flush();

		// ⌘S returns to the stop — it does not end it by itself.
		expect(internals.index).toBe(0);

		await internals.handleSkip();

		expect(internals.counts.takenOver).toBe(1);
		expect(internals.counts.skipped).toBe(0);
		expect(internals.index).toBe(1);
	});

	it("counts the stop as übersprungen when ⌘S was never opened before Esc", async () => {
		const { internals } = setup();

		await internals.handleSkip();

		expect(internals.counts.skipped).toBe(1);
		expect(internals.counts.takenOver).toBe(0);
	});

	it("counts the stop as übersprungen when a confirmed ⌘S pass moved nothing before Esc", async () => {
		const { internals } = setup();

		internals.handleIntakeSelect();
		expect(constructed).toHaveLength(1);
		const onConfirm = constructed[0].onConfirm as (outcomes: IntakeGroupOutcome[]) => void;
		const group = internals.stops[0].kind === "note" ? (internals.stops[0] as unknown as NoteTriageStop).groups[0] : undefined;
		expect(group).toBeDefined();

		// Every line kept, nothing taken — a no-op confirm.
		onConfirm([
			{
				lineIndex: group!.lineIndex,
				discard: false,
				due: null,
				taken: [],
				keptOwn: [
					{ text: "Angebot prüfen", children: [] },
					{ text: "Termin vereinbaren", children: [] },
				],
				keptForeign: [],
			},
		]);
		await flush();

		await internals.handleSkip();

		expect(internals.counts.skipped).toBe(1);
		expect(internals.counts.takenOver).toBe(0);
	});
});
