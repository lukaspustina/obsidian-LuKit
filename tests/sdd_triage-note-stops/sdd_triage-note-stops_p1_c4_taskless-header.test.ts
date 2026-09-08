import { describe, it, expect } from "vitest";
import { TaskTriageModal } from "../../src/features/task-triage/task-triage-modal";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { __allTexts } from "../helpers/obsidian-stub";
import { createMockApp } from "../helpers/obsidian-mocks";

const TODAY = "2026-09-08";
const NOTE_PATH = "Personen/Person Erika Beispiel.md";
const NOTE_BASENAME = "Person Erika Beispiel";

function group(overrides: Partial<IntakeGroup> = {}): IntakeGroup {
	return {
		line: "- Aus [[Besprechung Acme Kickoff]]",
		source: "Besprechung Acme Kickoff",
		due: new Date(2026, 8, 5),
		ownItems: [{ text: "Angebot pruefen", children: [] }],
		foreignItems: [],
		lineIndex: 12,
		...overrides,
	};
}

// A note stop without a task — e.g. a Person note carrying a due intake
// group but unknown to TaskNotes (SDD triage-note-stops, `NoteStop.task`
// is optional). `kind: "note"` isn't part of `TriageStop` yet (that's
// Requirement 1/18 of the SDD), so this literal is deliberately typed past
// today's union — that gap is exactly what this test pins as failing.
function noteStop(groups: IntakeGroup[]): TriageStop {
	return {
		kind: "note",
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
		groups,
	} as unknown as TriageStop;
}

function header(stop: TriageStop, position = { index: 0, total: 24 }): string {
	const modal = new TaskTriageModal(createMockApp({}) as never, {
		stop,
		actions: { snooze: true, skipInstance: false },
		locale: "de",
		today: TODAY,
		position,
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
	(modal as unknown as { renderHeader: () => void }).renderHeader();
	return __allTexts((modal as unknown as { contentEl: unknown }).contentEl).join("|");
}

describe("SDD triage-note-stops Phase 1 #4: taskless note-stop header", () => {
	it("shows the basename with the singular group count and the walk position for one due group", () => {
		const texts = header(noteStop([group()]), { index: 0, total: 24 });

		expect(texts).toContain(`${NOTE_BASENAME} · 1 Gruppe`);
		expect(texts).toContain("1/24");
	});

	it("shows the plural group count for two due groups", () => {
		const groups = [group({ lineIndex: 12 }), group({ lineIndex: 20, source: "E-Mail von Hans" })];

		const texts = header(noteStop(groups), { index: 3, total: 24 });

		expect(texts).toContain(`${NOTE_BASENAME} · 2 Gruppen`);
		expect(texts).toContain("4/24");
	});

	it("omits every task-derived header segment", () => {
		const texts = header(noteStop([group()]));

		// Anchor: without this the assertions below all hold on an empty
		// render, and the test would pass before the criterion is built.
		expect(texts).toContain(NOTE_BASENAME);
		expect(texts).not.toContain("Fällig:");
		expect(texts).not.toContain("Geplant:");
		expect(texts).not.toContain("Priorität:");
		expect(texts).not.toContain("↻");
		expect(texts).not.toContain("überfällig");
	});
});
