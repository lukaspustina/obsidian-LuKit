// SDD: specs/sdd/triage-note-stops.md, Phase 2, Test Scenario #6:
// GIVEN a group deferred to a future date via ⌘S, WHEN a fresh walk is
// started afterward (a new `selectNoteStops`/`selectDueIntakeGroups` pass
// over the mutated note), THEN that group is absent from every stop; a note
// whose only group was deferred yields a stop only if its task is
// independently due.
//
// RED today because: `handleIntakeGroupOutcomes` (task-triage-feature.ts)
// never reads `IntakeGroupOutcome.due` and never calls `snoozeGroup` — Phase
// 1 leaves `due` always null and the field unwired (see the comment on
// `IntakeGroupOutcome.due` in intake-select-modal.ts). So confirming a
// defer-only outcome (nothing ticked, `due` set to a future ISO date) leaves
// the group's parent line byte-identical — still dateless, still due "now" —
// and a fresh `selectDueIntakeGroups` pass over the mutated note keeps
// finding it due. Once Phase 2 wires `outcome.due` through `snoozeGroup`,
// the parent line carries the future date and both halves below hold.

import { describe, it, expect, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import {
	parseIntakeGroups,
} from "../../src/features/vorgang/intake-engine";
import { selectDueIntakeGroups, selectNoteStops, selectTriageTasks } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeStopCandidate, NoteStop, TriageStop, TriageTask } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

const TODAY = "2026-09-08";
const FUTURE = "2026-12-01";

interface FeatureInternals {
	stops: TriageStop[];
	index: number;
	presentStop: () => Promise<void>;
	handleIntakeGroupOutcomes: (outcomes: IntakeGroupOutcome[]) => Promise<void>;
}

function noteWithOneGroup(): string {
	return [
		"---",
		"tags: [Vorgang]",
		"---",
		"",
		"# Nächste Schritte",
		"",
		"#### Unsortiert",
		"- Aus [[Besprechung - Kickoff]]",
		"    - Angebot einholen",
		"",
		"# Inhalt",
		"",
	].join("\n");
}

// Defers a note's only group to FUTURE via a defer-only ⌘S confirm (nothing
// ticked, nothing discarded — mirrors Phase 2's Test Scenario #1 antecedent),
// then re-reads the mutated note and computes today's due candidates for it,
// the way a fresh walk's `selectDueIntakeGroups` pass would.
async function deferOnlyGroupAndRecomputeDue(
	notePath: string,
	noteBasename: string,
	content: string,
): Promise<{ dueCandidates: IntakeStopCandidate[]; mutatedContent: string }> {
	const app = createMockApp({});
	const file = createMockTFile(notePath, { basename: noteBasename });
	app.vault.register(file, content);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	const group = parseIntakeGroups(content)[0];
	internals.presentStop = async () => {};
	internals.stops = [
		{ kind: "note", notePath, noteBasename, groups: [group] } as unknown as TriageStop,
	];
	internals.index = 0;

	const outcome: IntakeGroupOutcome = {
		lineIndex: group.lineIndex,
		discard: false,
		due: FUTURE,
		taken: [],
		keptOwn: group.ownItems,
		keptForeign: group.foreignItems,
	};
	await internals.handleIntakeGroupOutcomes([outcome]);

	const mutatedContent = app.vault.files.get(notePath) ?? "";
	const freshGroups = parseIntakeGroups(mutatedContent);
	const candidates: IntakeStopCandidate[] = freshGroups.map((g) => ({ group: g, notePath, noteBasename }));
	const dueCandidates = selectDueIntakeGroups(candidates, TODAY);
	return { dueCandidates, mutatedContent };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 2 #6: a deferred group stays gone across a fresh walk", () => {
	it("drops out of every stop for a taskless note whose only group was deferred", async () => {
		const notePath = "Personen/Erika Beispiel.md";
		const noteBasename = "Erika Beispiel";

		const { dueCandidates, mutatedContent } = await deferOnlyGroupAndRecomputeDue(notePath, noteBasename, noteWithOneGroup());

		// The parent line now carries the future date and nothing moved.
		expect(mutatedContent).toContain(`, ${FUTURE.split("-").reverse().join(".")}`);
		expect(mutatedContent).toContain("Angebot einholen");

		expect(dueCandidates).toHaveLength(0);

		// TaskNotes knows nothing about this note, and its only due content was
		// the group — now deferred — so a fresh walk yields no stop for it.
		const stops: NoteStop[] = selectNoteStops([], dueCandidates, []);
		expect(stops).toHaveLength(0);
	});

	it("still yields a stop for a note with a due task, but with no groups", async () => {
		const notePath = "Vorgänge/Vorgang - Acme Review.md";
		const noteBasename = "Vorgang - Acme Review";

		const { dueCandidates } = await deferOnlyGroupAndRecomputeDue(notePath, noteBasename, noteWithOneGroup());

		expect(dueCandidates).toHaveLength(0);

		const task: TriageTask = {
			path: notePath,
			title: noteBasename,
			isCompleted: false,
			contexts: [],
			projects: [],
			isRecurring: false,
			completeInstances: [],
			skippedInstances: [],
			due: TODAY,
		};
		const dueTasks = selectTriageTasks([task], TODAY);
		expect(dueTasks).toHaveLength(1);

		const stops: NoteStop[] = selectNoteStops(dueTasks, dueCandidates, []);
		expect(stops).toHaveLength(1);
		expect(stops[0].task).toEqual(task);
		expect(stops[0].groups).toHaveLength(0);
	});
});
