// SDD: specs/sdd/triage-note-stops.md, Phase 1, Test Scenario #3 / Requirement 4:
// GIVEN a Person note with a due intake group and no task, WHEN its stop is
// presented, THEN the key bar offers ⌘S/Enter/Esc/⌘. and omits
// ⌘D/⌘1/⌘2/⌘3/⌘T/⌘G/⌘X.
//
// TriageStop has no "note" kind yet — task-triage-engine.ts still
// distinguishes "task" and "intake" stops, each with their own key gating in
// task-triage-modal.ts's renderInstructions(). The NoteStop shape from the
// SDD's Data Models section (kind: "note", notePath, noteBasename, groups,
// task? absent for a note TaskNotes does not know) is constructed here and
// cast through `as unknown as TriageStop`, the same forward-reference
// convention the archived tests/sdd_vorgang-next-steps suite used for a stop
// shape that did not exist yet. This is the intended RED state: today's
// renderInstructions() does not recognize "note" as an intake stop, so it
// falls into the task-stop branch and renders ⌘D unconditionally while never
// rendering ⌘S for a non-"intake" kind.

import { describe, it, expect } from "vitest";
import { TaskTriageModal } from "../../src/features/task-triage/task-triage-modal";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { __allTexts } from "../helpers/obsidian-stub";
import { createMockApp } from "../helpers/obsidian-mocks";

const TODAY = "2026-09-08";

function group(overrides: Partial<IntakeGroup> = {}): IntakeGroup {
	return {
		line: "- Aus [[Besprechung - Kickoff]], 05.09.2026",
		source: "Besprechung - Kickoff",
		due: new Date(2026, 8, 5),
		ownItems: [{ text: "Angebot prüfen", children: [] }],
		foreignItems: [],
		lineIndex: 12,
		...overrides,
	};
}

// Person note: TaskNotes does not know it, so NoteStop.task is absent —
// only groups carry the due content.
function taskliessNoteStop(): TriageStop {
	return {
		kind: "note",
		notePath: "Personen/Erika Beispiel.md",
		noteBasename: "Erika Beispiel",
		groups: [group()],
	} as unknown as TriageStop;
}

function hintBar(stop: TriageStop, position = { index: 0, total: 24 }): string {
	const modal = new TaskTriageModal(createMockApp({}) as never, {
		stop,
		actions: { snooze: false, skipInstance: false },
		locale: "de",
		today: TODAY,
		position,
		sourcePath: "Personen/Erika Beispiel.md",
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
	return __allTexts((modal as unknown as { contentEl: unknown }).contentEl).join("|");
}

describe("Schlüsselleiste eines aufgabenlosen Notiz-Stops", () => {
	it("bietet ⌘S, Enter, Esc und ⌘. für eine Person-Notiz mit fälliger Gruppe und ohne Task", () => {
		const texts = hintBar(taskliessNoteStop());

		expect(texts).toContain("↵");
		expect(texts).toContain("⌘S");
		expect(texts).toContain("esc");
		expect(texts).toContain("⌘.");
	});

	it("lässt ⌘D, ⌘1, ⌘2, ⌘3, ⌘T, ⌘G und ⌘X weg, wenn der Stop keine Task trägt", () => {
		const texts = hintBar(taskliessNoteStop());

		expect(texts).not.toContain("⌘D");
		expect(texts).not.toContain("⌘1");
		expect(texts).not.toContain("⌘2");
		expect(texts).not.toContain("⌘3");
		expect(texts).not.toContain("⌘T");
		expect(texts).not.toContain("⌘G");
		expect(texts).not.toContain("⌘X");
	});
});
