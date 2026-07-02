import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, TriageStop, SnoozeKind } from "../../src/features/task-triage/task-triage-engine";
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
	stops: TriageStop[];
	index: number;
	counts: { completed: number; snoozed: number; instancesSkipped: number; skipped: number };
	todayIso: () => string;
	beginWalk: () => Promise<void>;
	presentStop: () => Promise<void>;
	loadPreview: (stop: TriageStop) => Promise<string>;
	availableActions: (stop: TriageStop) => { snooze: boolean; skipInstance: boolean };
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

describe("TaskTriageFeature — mutation failure keeps the walk on the current task", () => {
	it("shows a Notice, does not advance, keeps the same task current, and does not increment counts when bridge.complete rejects", async () => {
		const first = task({ path: "TaskNotes/Tasks/Kosten pruefen.md", title: "Kosten prüfen", due: "2026-06-30" });
		const second = task({ path: "TaskNotes/Tasks/Rechnung senden.md", title: "Rechnung senden", due: "2026-07-01" });
		const bridge = fakeBridge({
			listTasks: vi.fn(async () => [first, second]),
			complete: vi.fn(async () => {
				throw new Error("api");
			}),
		});
		const { internals } = setup(bridge);

		await internals.beginWalk();

		expect(internals.index).toBe(0);
		expect(internals.stops[internals.index]).toEqual({ kind: "task", task: first });

		await internals.handleComplete();

		expect(lastNotice()).toBeTruthy();
		expect(internals.index).toBe(0);
		expect(internals.stops[internals.index]).toEqual({ kind: "task", task: first });
		expect(internals.walkActive).toBe(true);
		expect(internals.counts.completed).toBe(0);
	});
});
