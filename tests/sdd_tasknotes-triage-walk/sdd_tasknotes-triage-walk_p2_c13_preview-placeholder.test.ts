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

describe("TaskTriageFeature.loadPreview — preview-unreadable placeholder", () => {
	it("resolves to a non-empty placeholder when readNote rejects, instead of throwing", async () => {
		const readNote = vi.fn(async () => {
			throw new Error("io");
		});
		const { internals } = setup(fakeBridge({ readNote }));

		const preview = await internals.loadPreview(task());

		expect(typeof preview).toBe("string");
		expect(preview.length).toBeGreaterThan(0);
		expect(preview).not.toBe("# Fakten und Pointer\nSome real body content");
	});

	it("returns the trimmed preview when readNote resolves with a Vorgang-style body", async () => {
		const body = [
			"---",
			"tags: [Vorgang]",
			"---",
			"# Fakten und Pointer",
			"- Wichtiger Fakt zur Sache",
			"",
			"##### Neuester Abschnitt, 02.07.2026",
			"- Eintrag",
		].join("\n");
		const readNote = vi.fn(async () => body);
		const { internals } = setup(fakeBridge({ readNote }));

		const preview = await internals.loadPreview(task());

		expect(preview).toContain("Wichtiger Fakt zur Sache");
	});
});
