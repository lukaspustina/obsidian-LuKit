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

describe("TaskTriageFeature.handleSkip — Esc-as-skip, no mutation", () => {
	it("advances to the next task without calling any bridge mutation method", async () => {
		const complete = vi.fn(async () => undefined);
		const setScheduled = vi.fn(async () => undefined);
		const toggleCompleteInstance = vi.fn(async () => undefined);
		const toggleSkippedInstance = vi.fn(async () => undefined);
		const bridge = fakeBridge({
			listTasks: vi.fn(async () => [
				task({ path: "TaskNotes/Tasks/Kosten pruefen.md", title: "Kosten prüfen", due: "2026-07-01" }),
				task({ path: "TaskNotes/Tasks/Angebot pruefen.md", title: "Angebot prüfen", due: "2026-06-30" }),
			]),
			complete,
			setScheduled,
			toggleCompleteInstance,
			toggleSkippedInstance,
		});
		const { internals } = setup(bridge);

		await internals.beginWalk();
		expect(internals.walkActive).toBe(true);
		expect(internals.index).toBe(0);

		await internals.handleSkip();

		expect(complete).not.toHaveBeenCalled();
		expect(setScheduled).not.toHaveBeenCalled();
		expect(toggleCompleteInstance).not.toHaveBeenCalled();
		expect(toggleSkippedInstance).not.toHaveBeenCalled();
		expect(internals.index).toBe(1);
		expect(internals.walkActive).toBe(true);
	});
});
