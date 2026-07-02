import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, TriageStop, SnoozeKind } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, lastNotice, noticeMessages, resetNotices } from "../helpers/obsidian-mocks";

const TODAY = "2026-07-02";
function fakeBridge(overrides: Partial<TaskNotesBridge> = {}): TaskNotesBridge {
	return { availability: vi.fn(() => ({ ok: true } as const)), listTasks: vi.fn(async () => []), complete: vi.fn(async () => undefined), setScheduled: vi.fn(async () => undefined), toggleCompleteInstance: vi.fn(async () => undefined), toggleSkippedInstance: vi.fn(async () => undefined), readNote: vi.fn(async () => ""), openInNewTab: vi.fn(async () => undefined), ...overrides };
}
function task(overrides: Partial<TriageTask> = {}): TriageTask {
	return { path: "TaskNotes/Tasks/Kosten pruefen.md", title: "Kosten prüfen", isCompleted: false, due: "2026-07-01", priority: "normal", contexts: [], projects: [], isRecurring: false, completeInstances: [], skippedInstances: [], ...overrides };
}
interface FeatureInternals {
	bridge: TaskNotesBridge; walkActive: boolean; stops: TriageStop[]; index: number;
	counts: { completed: number; snoozed: number; instancesSkipped: number; skipped: number };
	todayIso: () => string; beginWalk: () => Promise<void>; presentStop: () => Promise<void>;
	loadPreview: (stop: TriageStop) => Promise<string>;
	availableActions: (stop: TriageStop) => { snooze: boolean; skipInstance: boolean };
	handleComplete: () => Promise<void>; handleSnooze: (kind: SnoozeKind) => Promise<void>;
	handleSnoozeCustom: (date: string) => Promise<void>; handleSkipInstance: () => Promise<void>;
	handleOpenAndStop: () => Promise<void>; handleSkip: () => Promise<void>; handleStop: () => void;
}
function setup(bridge: TaskNotesBridge) {
	const app = createMockApp();
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	internals.todayIso = () => TODAY;
	internals.presentStop = vi.fn(async () => {}); // keep headless
	return { app, feature, internals };
}
beforeEach(() => resetNotices());

describe("TaskTriageFeature.availableActions", () => {
	it("hides snooze and shows skip-instance for a recurring task", () => {
		const { internals } = setup(fakeBridge());

		const actions = internals.availableActions({ kind: "task", task: task({ isRecurring: true }) });

		expect(actions).toEqual({ snooze: false, skipInstance: true });
	});

	it("shows snooze and hides skip-instance for a non-recurring task", () => {
		const { internals } = setup(fakeBridge());

		const actions = internals.availableActions({ kind: "task", task: task({ isRecurring: false }) });

		expect(actions).toEqual({ snooze: true, skipInstance: false });
	});
});
