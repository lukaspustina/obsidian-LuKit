import { describe, it, expect } from "vitest";
import { TaskTriageModal } from "../../src/features/task-triage/task-triage-modal";
import type { TriageStop, TriageTask, NoteStop } from "../../src/features/task-triage/task-triage-engine";
import { __allTexts } from "../helpers/obsidian-stub";
import { createMockApp } from "../helpers/obsidian-mocks";

// SDD specs/sdd/triage-note-stops.md, Requirement 4/5/6/8, Phase 1 test scenario #5:
// a due TaskNote with no intake group offers the full task key set and Enter/Esc/⌘.,
// but withholds ⌘S (no groups) and ⌘X (task not recurring — see #6 for that case).

const TODAY = "2026-09-08";
const NOTE_PATH = "Vorgänge/Angebot Acme.md";
const NOTE_BASENAME = "Angebot Acme";

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
		due: TODAY,
		...overrides,
	};
}

function makeNoteStop(overrides: Partial<NoteStop> = {}): NoteStop {
	return {
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
		task: makeTask(),
		groups: [],
		...overrides,
	};
}

function instructions(
	stop: TriageStop,
	actions: { snooze: boolean; skipInstance: boolean },
	position = { index: 0, total: 24 },
): string[] {
	const modal = new TaskTriageModal(createMockApp({}) as never, {
		stop,
		actions,
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
	(modal as unknown as { renderInstructions: () => void }).renderInstructions();
	return __allTexts((modal as unknown as { contentEl: unknown }).contentEl);
}

describe("SDD triage-note-stops Phase 1 #5: task-only note stop key bar", () => {
	it("offers ⌘D/⌘1/⌘2/⌘3/⌘T/⌘G/Enter/Esc/⌘. and withholds ⌘S and ⌘X", () => {
		const stop = { kind: "note", ...makeNoteStop() } as unknown as TriageStop;

		const texts = instructions(stop, { snooze: true, skipInstance: false });

		for (const command of ["↵", "⌘D", "⌘1", "⌘2", "⌘3", "⌘T", "⌘G", "esc", "⌘."]) {
			expect(texts).toContain(command);
		}
		expect(texts).not.toContain("⌘S");
		expect(texts).not.toContain("⌘X");
	});
});
