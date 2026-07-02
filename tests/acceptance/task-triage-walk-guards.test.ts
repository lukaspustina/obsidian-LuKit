import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, SnoozeKind } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, noticeMessages, resetNotices } from "../helpers/obsidian-mocks";

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
	walkToday: string;
	beginWalk: () => Promise<void>;
	presentStop: () => Promise<void>;
	handleComplete: () => Promise<void>;
	handleSnooze: (kind: SnoozeKind) => Promise<void>;
	handleSkip: () => Promise<void>;
}

function setup(bridge: TaskNotesBridge, { stubPresentStop = true } = {}) {
	const app = createMockApp();
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	internals.todayIso = () => TODAY;
	if (stubPresentStop) {
		internals.presentStop = vi.fn(async () => {}); // keep headless
	}
	return { app, feature, internals };
}

beforeEach(() => resetNotices());

describe("TaskTriageFeature.beginWalk — listTasks failure", () => {
	it("shows an error Notice and leaves the walk inactive when listTasks rejects", async () => {
		const listTasks = vi.fn(async () => {
			throw new Error("api");
		});
		const { internals } = setup(fakeBridge({ listTasks }));

		await internals.beginWalk();

		expect(noticeMessages().some((m) => m.includes("Konnte Tasks nicht laden"))).toBe(true);
		expect(internals.walkActive).toBe(false);
		expect(internals.presentStop).not.toHaveBeenCalled();
	});
});

describe("TaskTriageFeature.beginWalk — re-entry during the listing await", () => {
	it("rejects a second invocation while listTasks is still pending", async () => {
		let resolveList!: (tasks: TriageTask[]) => void;
		const listTasks = vi.fn(
			() =>
				new Promise<TriageTask[]>((resolve) => {
					resolveList = resolve;
				}),
		);
		const { internals } = setup(fakeBridge({ listTasks }));

		const first = internals.beginWalk();
		const second = internals.beginWalk();
		resolveList([task()]);
		await first;
		await second;

		expect(listTasks).toHaveBeenCalledTimes(1);
		expect(noticeMessages().some((m) => m.includes("Triage läuft bereits"))).toBe(true);
		expect(internals.tasks).toHaveLength(1);
		expect(internals.walkActive).toBe(true);
	});
});

describe("TaskTriageFeature — walk date is pinned at walk start", () => {
	it("snoozes relative to the walk-start today even if the clock crosses midnight", async () => {
		const setScheduled = vi.fn(async () => undefined);
		const { internals } = setup(fakeBridge({ listTasks: vi.fn(async () => [task()]), setScheduled }));

		await internals.beginWalk();
		internals.todayIso = () => "2026-07-03"; // midnight passed mid-walk

		await internals.handleSnooze("tomorrow");

		expect(setScheduled).toHaveBeenCalledWith(task().path, "2026-07-03"); // TODAY + 1, not new-day + 1
	});

	it("completes the recurring instance the selection was based on, not the new day's", async () => {
		const toggleCompleteInstance = vi.fn(async () => undefined);
		const recurring = task({ path: "R.md", isRecurring: true, due: "2026-07-02" });
		const { internals } = setup(fakeBridge({ listTasks: vi.fn(async () => [recurring]), toggleCompleteInstance }));

		await internals.beginWalk();
		internals.todayIso = () => "2026-07-03"; // midnight passed mid-walk

		await internals.handleComplete();

		expect(toggleCompleteInstance).toHaveBeenCalledWith("R.md", TODAY);
	});
});

describe("TaskTriageFeature.onunload — aborts a running walk", () => {
	it("deactivates the walk and a later modal dismissal does not resurrect it", async () => {
		const tasks = [task({ path: "a.md", title: "A" }), task({ path: "b.md", title: "B" })];
		const { feature, internals } = setup(fakeBridge({ listTasks: vi.fn(async () => tasks) }), { stubPresentStop: false });

		await internals.beginWalk();
		expect(internals.walkActive).toBe(true);

		feature.onunload();
		expect(internals.walkActive).toBe(false);

		const noticesBefore = noticeMessages().length;
		await internals.handleSkip(); // what a surviving modal's dismiss would trigger

		expect(internals.index).toBe(0); // advance() refused — no new stop presented
		expect(noticeMessages().length).toBe(noticesBefore); // and no summary Notice fired
	});
});
