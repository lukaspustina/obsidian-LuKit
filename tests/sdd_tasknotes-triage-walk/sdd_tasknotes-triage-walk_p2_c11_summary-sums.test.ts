import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, SnoozeKind } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, lastNotice, noticeMessages, resetNotices } from "../helpers/obsidian-mocks";

const TODAY = "2026-07-02";

function fakeBridge(overrides: Partial<TaskNotesBridge> = {}): TaskNotesBridge {
	return {
		availability: vi.fn(() => ({ ok: true } as const)),
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
		path: "TaskNotes/Tasks/Kosten pruefen.md",
		title: "Kosten prüfen",
		isCompleted: false,
		due: "2026-07-01",
		priority: "normal",
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	tasks: TriageTask[];
	index: number;
	counts: { completed: number; snoozed: number; instancesSkipped: number; skipped: number };
	todayIso: () => string;
	beginWalk: () => Promise<void>;
	presentStop: () => Promise<void>;
	loadPreview: (task: TriageTask) => Promise<string>;
	availableActions: (task: TriageTask) => { snooze: boolean; skipInstance: boolean };
	handleComplete: () => Promise<void>;
	handleSnooze: (kind: SnoozeKind) => Promise<void>;
	handleSnoozeCustom: (date: string) => Promise<void>;
	handleSkipInstance: () => Promise<void>;
	handleOpenAndStop: () => Promise<void>;
	handleSkip: () => Promise<void>;
	handleStop: () => void;
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

function fiveTasks(): TriageTask[] {
	return [
		task({ path: "A.md", title: "A" }),
		task({ path: "B.md", title: "B" }),
		task({ path: "C.md", title: "C" }),
		task({ path: "D.md", title: "D", isRecurring: true, scheduled: "2026-07-02", due: undefined }),
		task({ path: "E.md", title: "E" }),
	];
}

describe("TaskTriageFeature — summary bucket sums (Req 9)", () => {
	it("sums to the total task count on natural completion", async () => {
		const tasks = fiveTasks();
		const bridge = fakeBridge({ listTasks: vi.fn(async () => tasks) });
		const { internals } = setup(bridge);

		await internals.beginWalk();
		internals.tasks = tasks;
		internals.index = 0;

		await internals.handleComplete(); // A: erledigt
		await internals.handleComplete(); // B: erledigt
		await internals.handleSnooze("tomorrow"); // C: verschoben
		await internals.handleSkipInstance(); // D: ausgelassen (recurring instance skip)
		await internals.handleSkip(); // E: uebersprungen

		expect(internals.walkActive).toBe(false);
		expect(lastNotice()).toBe(
			"Triage beendet: 2 erledigt, 1 verschoben, 1 ausgelassen, 1 übersprungen, 0 offen"
		);
	});

	it("reports all tasks as remaining when stopped with no actions taken", async () => {
		const tasks = fiveTasks();
		const bridge = fakeBridge({ listTasks: vi.fn(async () => tasks) });
		const { internals } = setup(bridge);

		await internals.beginWalk();
		internals.tasks = tasks;
		internals.index = 0;

		internals.handleStop();

		expect(internals.walkActive).toBe(false);
		expect(lastNotice()).toBe(
			"Triage beendet: 0 erledigt, 0 verschoben, 0 ausgelassen, 0 übersprungen, 5 offen"
		);
	});
});
