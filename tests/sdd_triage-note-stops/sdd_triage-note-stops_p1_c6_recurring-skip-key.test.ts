// SDD triage-note-stops, Phase 1, criterion 6 (Test Scenarios #6):
// GIVEN a note stop whose task is recurring vs one whose task is not, WHEN
// the key bar renders, THEN ⌘X appears only for the recurring case
// (Requirement 4: "⌘X only while the stop carries a task and that task is
// recurring"; Requirement 7).
//
// `TriageStop` does not have a `kind: "note"` member yet — today's union is
// `"task" | "reminder" | "intake"` (task-triage-engine.ts). This is the
// intended RED state: the note stops land in Phase 1. `availableActions`
// gates ⌘X via its `skipInstance` field (task-triage-modal.ts's
// `registerActionKeys`/`renderInstructions`: `if (actions.skipInstance) …
// "X" … "⌘X"`), and is the pinned internals contract this suite already
// uses in place of driving real keypresses (see
// sdd_tasknotes-triage-walk_p2_c6_available-actions.test.ts and
// sdd_erinnerungen-triage_p2_c10_reminder-actions.test.ts).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, TriageStop } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

function fakeBridge(overrides: Partial<TaskNotesBridge> = {}): TaskNotesBridge {
	return {
		availability: vi.fn(() => ({ ok: true }) as const),
		listTasks: vi.fn(async () => []),
		complete: vi.fn(async () => undefined),
		setScheduled: vi.fn(async () => undefined),
		toggleCompleteInstance: vi.fn(async () => undefined),
		toggleSkippedInstance: vi.fn(async () => undefined),
		readNote: vi.fn(async () => ""),
		openInNewTab: vi.fn(async () => undefined),
		...overrides,
	};
}

function task(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: "Vorgänge/Angebot Acme.md",
		title: "Angebot Acme",
		isCompleted: false,
		due: "2026-09-01",
		priority: "normal",
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

// The not-yet-existing note-stop shape (Requirements 1/2/18): a stop keyed
// on the note, carrying its task (if TaskNotes knows one) and its due
// intake groups. Cast through `unknown` since `kind: "note"` is not yet a
// member of `TriageStop`.
function noteStop(taskOverrides: Partial<TriageTask> | undefined): TriageStop {
	return {
		kind: "note",
		notePath: "Vorgänge/Angebot Acme.md",
		noteBasename: "Angebot Acme",
		task: taskOverrides === undefined ? undefined : task(taskOverrides),
		groups: [],
	} as unknown as TriageStop;
}

interface FeatureInternals {
	bridge: TaskNotesBridge;
	availableActions: (stop: TriageStop) => { snooze: boolean; skipInstance: boolean };
}

function setup() {
	const app = createMockApp();
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = fakeBridge();
	return { internals };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 1 #6: ⌘X nur für wiederkehrenden Task-Stop", () => {
	it("bietet ⌘X für einen Note-Stop mit wiederkehrendem Task", () => {
		const { internals } = setup();

		const actions = internals.availableActions(noteStop({ isRecurring: true }));

		expect(actions.skipInstance).toBe(true);
	});

	it("bietet kein ⌘X für einen Note-Stop mit nicht wiederkehrendem Task", () => {
		const { internals } = setup();

		const actions = internals.availableActions(noteStop({ isRecurring: false }));

		expect(actions.skipInstance).toBe(false);
	});

	// Requirement 7's other gate ("It shall not be offered for a note without
	// a task") — today's fallback branch (`return { snooze: !stop.task
	// .isRecurring, skipInstance: stop.task.isRecurring }`) assumes `task` is
	// always present and throws on a taskless note stop instead of returning
	// `skipInstance: false`. This is what makes the criterion genuinely RED
	// today: a task-carrying note stop's ⌘X gate already matches the target
	// behaviour by coincidence (the fallback was written for `kind: "task"`,
	// which always has a task), so only the taskless case exercises the gap.
	it("bietet kein ⌘X für einen Note-Stop ohne Task, ohne zu werfen", () => {
		const { internals } = setup();

		expect(() => internals.availableActions(noteStop(undefined))).not.toThrow();
		expect(internals.availableActions(noteStop(undefined)).skipInstance).toBe(false);
	});
});
