import { describe, it, expect } from "vitest";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeStopCandidate, NoteStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";

const today = "2026-09-08";
const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";

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

describe("SDD triage-note-stops Phase 1 #2: groups ordered by file position", () => {
	it("orders groups by ascending lineIndex, not by due date or discovery order", () => {
		// Later in the file, but the earlier due date — a due-date sort would
		// put this one first.
		const groupLate = makeGroup({
			line: "- Aus [[Besprechung Acme Kickoff]]",
			lineIndex: 20,
			due: new Date(2026, 8, 1),
		});
		// Earlier in the file, but the later due date.
		const groupEarly = makeGroup({
			line: "- Aus [[E-Mail von Erika Beispiel]]",
			source: "E-Mail von Erika Beispiel",
			ownItems: [{ text: "Vertrag pruefen", children: [] }],
			lineIndex: 5,
			due: new Date(2026, 8, 6),
		});
		// Candidates handed in "due date" order (groupLate before groupEarly),
		// which is also array/discovery order — the opposite of file order —
		// so neither a due-date sort nor a pass-through of discovery order
		// could accidentally satisfy the assertion below.
		const candidates: IntakeStopCandidate[] = [makeCandidate(groupLate), makeCandidate(groupEarly)];

		const stops: NoteStop[] = selectNoteStops([], candidates);

		expect(stops).toHaveLength(1);
		const [stop] = stops;
		expect(stop.groups.map((g) => g.lineIndex)).toEqual([5, 20]);
		expect(stop.groups).toEqual([groupEarly, groupLate]);
	});
});
