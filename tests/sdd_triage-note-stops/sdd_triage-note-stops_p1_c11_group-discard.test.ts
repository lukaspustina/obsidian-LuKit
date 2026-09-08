// SDD: specs/sdd/triage-note-stops.md, Phase 1, Test Scenario #11 / Requirement
// 11 (+ 13, 14, 4): GIVEN a note stop with one group, WHEN its section is
// marked discard and confirmed, THEN all its lines (own + foreign) are
// removed, none are moved into the curated part, and the stop remains open
// with `groups.length === 0`, at which point ⌘S is withdrawn.
//
// Per the Data Models section, `IntakeGroupOutcome.discard` wins over
// `taken`/`keptOwn`/`keptForeign`/`due` — this test deliberately populates
// those fields too, so a naive implementation that only special-cased an
// empty selection (rather than checking `discard` first) would fail it.
//
// RED today because: `TriageStop` has no `"note"` kind yet (task-triage-
// engine.ts still distinguishes `"task"` and `"intake"`), `IntakeGroupOutcome`
// does not exist (intake-select-modal.ts still exports the single-group
// `IntakeTakeOver` confirm shape), and `TaskTriageFeature` has no
// `handleIntakeGroupOutcomes` — today's confirm handler is
// `handleIntakeTakeOver(selection?: IntakeTakeOver)`, which knows nothing
// about a per-group `discard` flag or a batch of outcomes. The `NoteStop`
// shape is constructed here and cast through `as unknown as TriageStop`, the
// same forward-reference convention sdd_triage-note-stops_p1_c3/c12 use.

import { describe, it, expect, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { TaskTriageModal } from "../../src/features/task-triage/task-triage-modal";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";
import { __allTexts } from "../helpers/obsidian-stub";

const NOTE_PATH = "Vorgänge/Vorgang - Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang - Acme Kickoff";

// One group with both an own item and a "- Warte auf:" foreign one, so
// "own + foreign" is really exercised.
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
	"    - Warte auf:",
	"        - Rechnung schicken",
	"",
	"# Inhalt",
	"",
].join("\n");

interface FeatureInternals {
	stops: TriageStop[];
	index: number;
	presentStop: () => Promise<void>;
	handleIntakeGroupOutcomes: (outcomes: IntakeGroupOutcome[]) => Promise<void>;
}

function setup() {
	const app = createMockApp({});
	const vorgang = createMockTFile(NOTE_PATH, { basename: NOTE_BASENAME });
	app.vault.register(vorgang, VORGANG);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	const group = parseIntakeGroups(VORGANG)[0];
	internals.presentStop = async () => {};
	internals.stops = [
		{
			kind: "note",
			notePath: vorgang.path,
			noteBasename: NOTE_BASENAME,
			groups: [group],
		} as unknown as TriageStop,
	];
	internals.index = 0;

	return { internals, app, vorgang, group };
}

function keyBarTexts(stop: TriageStop): string[] {
	const modal = new TaskTriageModal(createMockApp({}) as never, {
		stop,
		actions: { snooze: false, skipInstance: false },
		locale: "de",
		today: "2026-09-08",
		position: { index: 0, total: 1 },
		sourcePath: NOTE_PATH,
		onComplete: () => undefined,
		onSnooze: () => undefined,
		onSnoozeCustom: () => undefined,
		onSkipInstance: () => undefined,
		onIntakeDiscard: () => undefined,
		onIntakeSelect: () => undefined,
		onIntakeNoteDate: () => undefined,
		onOpenAndStop: () => undefined,
		onSkip: () => undefined,
		onStop: () => undefined,
	});
	(modal as unknown as { renderInstructions: () => void }).renderInstructions();
	return __allTexts((modal as unknown as { contentEl: unknown }).contentEl);
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 1 #11: a discarded group's lines are dropped, not moved", () => {
	it("removes own and foreign lines without moving any of them into the curated part, and stays on the stop", async () => {
		const { internals, app, vorgang, group } = setup();

		const outcome: IntakeGroupOutcome = {
			lineIndex: group.lineIndex,
			discard: true,
			due: null,
			// Populated on purpose — discard must override these, not just an
			// empty selection.
			taken: [{ text: "Angebot prüfen", children: [] }],
			keptOwn: [{ text: "Termin vereinbaren", children: [] }],
			keptForeign: [{ text: "Rechnung schicken", children: [] }],
		};

		await internals.handleIntakeGroupOutcomes([outcome]);

		const newContent = app.vault.files.get(vorgang.path) ?? "";
		const lines = newContent.split("\n");
		const headerIdx = lines.indexOf("# Nächste Schritte");
		const boundaryIdx = lines.indexOf("#### Unsortiert");

		// The curated part (between the header and the boundary) gained
		// nothing — nothing was moved up.
		expect(lines.slice(headerIdx + 1, boundaryIdx).every((l) => l.trim() === "")).toBe(true);

		// Every line of the group — own, foreign, and the separator — is gone.
		expect(newContent).not.toContain("Angebot prüfen");
		expect(newContent).not.toContain("Termin vereinbaren");
		expect(newContent).not.toContain("Rechnung schicken");
		expect(newContent).not.toContain("Warte auf");
		expect(parseIntakeGroups(newContent)).toHaveLength(0);

		// The stop stays open, at the same index, now with no groups.
		expect(internals.index).toBe(0);
		expect(internals.presentStop).toHaveBeenCalled?.();
		const stop = internals.stops[0] as unknown as { groups: unknown[] };
		expect(stop.groups).toHaveLength(0);
	});

	it("withdraws ⌘S from the key bar once the group is gone, keeping the note's own actions", async () => {
		const { internals } = setup();
		const group = (internals.stops[0] as unknown as { groups: { lineIndex: number }[] }).groups[0];

		await internals.handleIntakeGroupOutcomes([
			{ lineIndex: group.lineIndex, discard: true, due: null, taken: [], keptOwn: [], keptForeign: [] },
		]);

		const texts = keyBarTexts(internals.stops[0]);
		expect(texts).not.toContain("⌘S");
		expect(texts).toContain("↵");
		expect(texts).toContain("esc");
		expect(texts).toContain("⌘.");
	});
});
