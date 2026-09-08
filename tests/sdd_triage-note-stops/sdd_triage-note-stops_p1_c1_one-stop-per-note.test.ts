import { describe, it, expect } from "vitest";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageTask, IntakeStopCandidate, NoteStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";

const today = "2026-09-08";
const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";

function makeTask(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: NOTE_PATH,
		title: NOTE_BASENAME,
		isCompleted: false,
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		due: today,
		...overrides,
	};
}

function makeGroup(overrides: Partial<IntakeGroup> = {}): IntakeGroup {
	return {
		line: "- Aus [[Besprechung Acme Kickoff]]",
		source: "Besprechung Acme Kickoff",
		due: null,
		ownItems: [{ text: "Angebot einholen", children: [] }],
		foreignItems: [],
		lineIndex: 10,
		...overrides,
	};
}

function makeCandidate(group: IntakeGroup): IntakeStopCandidate {
	return { group, notePath: NOTE_PATH, noteBasename: NOTE_BASENAME };
}

describe("SDD triage-note-stops Phase 1 #1: one stop per note", () => {
	it("merges a due task and its two due intake groups into exactly one NoteStop", () => {
		const task = makeTask();
		const groupA = makeGroup({ line: "- Aus [[Besprechung Acme Kickoff]]", lineIndex: 10 });
		const groupB = makeGroup({
			line: "- Aus [[E-Mail von Erika Beispiel]]",
			source: "E-Mail von Erika Beispiel",
			ownItems: [{ text: "Vertrag pruefen", children: [] }],
			lineIndex: 16,
		});
		// Candidates handed in out of file order, so a naive concat wouldn't
		// accidentally happen to satisfy the "file order" assertion below.
		const candidates: IntakeStopCandidate[] = [makeCandidate(groupB), makeCandidate(groupA)];

		const stops: NoteStop[] = selectNoteStops([task], candidates);

		expect(stops).toHaveLength(1);
		const [stop] = stops;
		expect(stop.notePath).toBe(NOTE_PATH);
		expect(stop.noteBasename).toBe(NOTE_BASENAME);
		expect(stop.task).toEqual(task);
		expect(stop.groups.map((g) => g.lineIndex)).toEqual([10, 16]);
		expect(stop.groups).toEqual([groupA, groupB]);
	});
});
