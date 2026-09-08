// SDD: specs/sdd/triage-note-stops.md, Phase 1, Test Scenario #16 / Requirement 15:
// GIVEN a note stop where ⌘S moves at least one line out of a group, WHEN the
// stop is later left via ⌘D (or a snooze, or ⌘X), THEN it is counted in that
// action's own bucket (erledigt/verschoben/ausgelassen), not übernommen.
//
// TriageStop has no "note" kind yet — task-triage-engine.ts still
// distinguishes "task" and "intake" stops, so a single stop can never carry
// both a task mutation and due intake groups at once. The NoteStop shape from
// the SDD's Data Models section (kind: "note", notePath, noteBasename, task?,
// groups) is constructed here and cast through `as unknown as TriageStop`,
// the same forward-reference convention
// tests/sdd_triage-note-stops_p1_c3_taskless-keybar.test.ts already uses.
//
// The "⌘S moved a line out of a group" precondition is set directly on the
// private `takenOverStops` Set rather than by driving the (not-yet-designed)
// multi-group selection confirm handler: the Decision Log names
// `takenOverStops` itself as "the existing takenOverStops mechanism,
// generalized to note stops" — seeding it is the stable, implementation-
// name-independent way to establish "a ⌘S pass already moved a line" without
// guessing at whatever the reshaped intake-select-modal confirm handler ends
// up being called.
//
// RED today: handleSkipInstance() hard-gates on `stop.kind !== "task"` and
// returns without doing anything for a "note" stop — ⌘X is a no-op, the
// stop never advances, and instancesSkipped never increments. handleComplete
// and handleSnoozeCustom happen to fall through their existing "not intake,
// not reminder → treat as a task" branches and already produce the right
// bucket for a "note" stop by coincidence of that fallback; those two
// sub-tests pin the desired behaviour (and guard against a future
// takenOverStops override creeping into mutateAndAdvance) without being the
// red driver — the ⌘X sub-test is what fails on the current code.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop, TriageTask, SnoozeKind } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang - Acme.md";
const NOTE_BASENAME = "Vorgang - Acme";

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
		path: NOTE_PATH,
		title: NOTE_BASENAME,
		isCompleted: false,
		due: "2026-09-08",
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

function group(overrides: Partial<IntakeGroup> = {}): IntakeGroup {
	return {
		line: "- Aus [[Besprechung - Kickoff]]",
		source: "Besprechung - Kickoff",
		due: null,
		ownItems: [{ text: "Angebot prüfen", children: [] }],
		foreignItems: [],
		lineIndex: 7,
		...overrides,
	};
}

// A note stop that carries both a task and a (now partially worked) intake
// group — the shape that cannot exist under today's separate "task"/"intake"
// kinds, which is exactly the gap this criterion covers.
function noteStop(taskOverrides: Partial<TriageTask> = {}): TriageStop {
	return {
		kind: "note",
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
		task: task(taskOverrides),
		groups: [group()],
	} as unknown as TriageStop;
}

// A second, unrelated stop so advance() lands on the next stop instead of
// ending the walk — finishWalk's summary shape is a different criterion's
// (#17) concern, not this one's.
function fillerStop(): TriageStop {
	return { kind: "note", notePath: "other.md", noteBasename: "other", groups: [] } as unknown as TriageStop;
}

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: { completed: number; snoozed: number; instancesSkipped: number; skipped: number; takenOver: number; discarded: number };
	takenOverStops: Set<number>;
	presentStop: () => Promise<void>;
	handleComplete: () => Promise<void>;
	handleSnoozeCustom: (date: string) => Promise<void>;
	handleSnooze: (kind: SnoozeKind) => Promise<void>;
	handleSkipInstance: () => Promise<void>;
}

function setup(bridge: TaskNotesBridge, stop: TriageStop) {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	internals.presentStop = vi.fn(async () => {});
	internals.walkActive = true;
	internals.stops = [stop, fillerStop()];
	internals.index = 0;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
	// The precondition: an earlier ⌘S pass on this stop already moved at
	// least one line out of a group.
	internals.takenOverStops = new Set([0]);
	return { app, internals };
}

beforeEach(() => resetNotices());

describe("note stop counting — an explicit closing action wins its own bucket over a prior ⌘S move", () => {
	it("⌘D lands in erledigt (completed), not übernommen", async () => {
		const complete = vi.fn(async () => undefined);
		const { internals } = setup(fakeBridge({ complete }), noteStop({ isRecurring: false }));

		await internals.handleComplete();

		expect(complete).toHaveBeenCalledWith(NOTE_PATH);
		expect(internals.counts.completed).toBe(1);
		expect(internals.counts.takenOver).toBe(0);
		expect(internals.index).toBe(1);
	});

	it("a snooze lands in verschoben (snoozed), not übernommen", async () => {
		const setScheduled = vi.fn(async () => undefined);
		const { internals } = setup(fakeBridge({ setScheduled }), noteStop());

		await internals.handleSnoozeCustom("2026-09-15");

		expect(setScheduled).toHaveBeenCalledWith(NOTE_PATH, "2026-09-15");
		expect(internals.counts.snoozed).toBe(1);
		expect(internals.counts.takenOver).toBe(0);
		expect(internals.index).toBe(1);
	});

	it("⌘X on a recurring task lands in ausgelassen (instancesSkipped), not übernommen", async () => {
		const toggleSkippedInstance = vi.fn(async () => undefined);
		const { internals } = setup(fakeBridge({ toggleSkippedInstance }), noteStop({ isRecurring: true }));

		await internals.handleSkipInstance();

		expect(toggleSkippedInstance).toHaveBeenCalledWith(NOTE_PATH, expect.any(String));
		expect(internals.counts.instancesSkipped).toBe(1);
		expect(internals.counts.takenOver).toBe(0);
		expect(internals.index).toBe(1);
	});
});
