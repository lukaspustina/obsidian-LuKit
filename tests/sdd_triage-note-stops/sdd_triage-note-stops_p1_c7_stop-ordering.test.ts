// SDD: specs/sdd/triage-note-stops.md, Phase 1, Test Scenario #7 / Requirement 3:
// GIVEN two due notes, one with task scheduled/due and one with only group
// dates, WHEN stops are ordered, THEN the earlier-dated note precedes the
// later, and a fully dateless note sorts last; ties break by note path.

import { describe, it, expect } from "vitest";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageTask, IntakeStopCandidate, NoteStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";

const today = "2026-09-08";

function makeTask(path: string, overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path,
		title: path,
		isCompleted: false,
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
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

function makeCandidate(notePath: string, noteBasename: string, group: IntakeGroup): IntakeStopCandidate {
	return { group, notePath, noteBasename };
}

function pathsOf(stops: NoteStop[]): string[] {
	return stops.map((s) => s.notePath);
}

describe("SDD triage-note-stops Phase 1 #7: note-stop ordering", () => {
	it("orders task notes by scheduled before due", () => {
		// A: later scheduled, but the earlier due — a due-first sort would put
		// A ahead of B.
		const taskA = makeTask("Vorgänge/Vorgang A.md", { scheduled: "2026-09-15", due: "2026-09-08" });
		// B: earlier scheduled, later due.
		const taskB = makeTask("Vorgänge/Vorgang B.md", { scheduled: "2026-09-10", due: "2026-09-20" });

		const stops = selectNoteStops([taskA, taskB], [], today);

		expect(pathsOf(stops)).toEqual(["Vorgänge/Vorgang B.md", "Vorgänge/Vorgang A.md"]);
	});

	it("falls back to due when scheduled is absent on both notes", () => {
		const taskA = makeTask("Vorgänge/Vorgang A.md", { due: "2026-09-20" });
		const taskB = makeTask("Vorgänge/Vorgang B.md", { due: "2026-09-08" });

		const stops = selectNoteStops([taskA, taskB], [], today);

		expect(pathsOf(stops)).toEqual(["Vorgänge/Vorgang B.md", "Vorgänge/Vorgang A.md"]);
	});

	it("falls back to the earliest group due date for a note with no task dates, ordered against a task-dated note", () => {
		// Task-dated note, later.
		const taskNote = makeTask("Vorgänge/Vorgang Task.md", { scheduled: "2026-09-15" });
		// Group-dated note, earlier — no task at all. Two groups, the earliest
		// of which decides the note's ordering position.
		const groupNoteEarlyGroup = makeGroup({
			line: "- Aus [[Besprechung Früh]]",
			source: "Besprechung Früh",
			due: new Date(2026, 8, 8),
			lineIndex: 5,
		});
		const groupNoteLateGroup = makeGroup({
			line: "- Aus [[Besprechung Spät]]",
			source: "Besprechung Spät",
			due: new Date(2026, 8, 12),
			lineIndex: 12,
		});
		const candidates: IntakeStopCandidate[] = [
			makeCandidate("Vorgänge/Vorgang Gruppe.md", "Vorgang Gruppe", groupNoteLateGroup),
			makeCandidate("Vorgänge/Vorgang Gruppe.md", "Vorgang Gruppe", groupNoteEarlyGroup),
		];

		const stops = selectNoteStops([taskNote], candidates, today);

		expect(pathsOf(stops)).toEqual(["Vorgänge/Vorgang Gruppe.md", "Vorgänge/Vorgang Task.md"]);
	});

	it("falls back to the group date for a note whose task carries neither scheduled nor due", () => {
		// The task exists (TaskNotes knows this note) but is itself fully
		// dateless — the fallback still applies per Requirement 3.
		const dateyTask = makeTask("Vorgänge/Vorgang Datiert.md", { due: "2026-09-20" });
		const dateyGroup = makeGroup({ line: "- Aus [[Besprechung Datiert]]", lineIndex: 3, due: null });

		// Dateless task-attached note: has a task, but neither scheduled nor
		// due, and its single group is dated earlier than dateyTask's due.
		const dateglessTask = makeTask("Vorgänge/Vorgang Fallback.md");
		const dateglessGroup = makeGroup({
			line: "- Aus [[Besprechung Fallback]]",
			source: "Besprechung Fallback",
			due: new Date(2026, 8, 9),
			lineIndex: 7,
		});

		const candidates: IntakeStopCandidate[] = [
			makeCandidate("Vorgänge/Vorgang Datiert.md", "Vorgang Datiert", dateyGroup),
			makeCandidate("Vorgänge/Vorgang Fallback.md", "Vorgang Fallback", dateglessGroup),
		];

		const stops = selectNoteStops([dateyTask, dateglessTask], candidates, today);

		expect(pathsOf(stops)).toEqual(["Vorgänge/Vorgang Fallback.md", "Vorgänge/Vorgang Datiert.md"]);
	});

	it("sorts a fully dateless note last, after every dated note", () => {
		const datedTask = makeTask("Vorgänge/Vorgang Datiert.md", { due: "2026-09-30" });
		const datelessGroup = makeGroup({ line: "- Aus [[Besprechung Ohne Datum]]", lineIndex: 4, due: null });
		const candidates: IntakeStopCandidate[] = [makeCandidate("Vorgänge/Vorgang Ohne Datum.md", "Vorgang Ohne Datum", datelessGroup)];

		const stops = selectNoteStops([datedTask], candidates, today);

		expect(pathsOf(stops)).toEqual(["Vorgänge/Vorgang Datiert.md", "Vorgänge/Vorgang Ohne Datum.md"]);
	});

	it("breaks ties between two fully dateless notes by note path", () => {
		const groupZ = makeGroup({ line: "- Aus [[Besprechung Z]]", lineIndex: 1, due: null });
		const groupA = makeGroup({ line: "- Aus [[Besprechung A]]", lineIndex: 1, due: null });
		const candidates: IntakeStopCandidate[] = [
			makeCandidate("Vorgänge/Vorgang Z.md", "Vorgang Z", groupZ),
			makeCandidate("Vorgänge/Vorgang A.md", "Vorgang A", groupA),
		];

		const stops = selectNoteStops([], candidates, today);

		expect(pathsOf(stops)).toEqual(["Vorgänge/Vorgang A.md", "Vorgänge/Vorgang Z.md"]);
	});
});
