import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, TriageStop, SnoozeKind } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockPlugin, createMockTFile, createMockEditor, makeTestSettings, asLuKitPlugin, lastNotice, noticeMessages, resetNotices } from "../helpers/obsidian-mocks";

const TODAY = "2026-07-02";
// Tagebuch mit zwei fälligen Erinnerungen (01.07. überfällig, eine datumslos):
const DIARY = [
	"---",
	"tags: []",
	"---",
	"",
	"# Erinnerungen",
	"",
	"- Zahnarzt anrufen, 01.07.2026",
	"- Angebot prüfen",
	"",
	"---",
	"",
	"##### Mi, 01.07.2026",
	"- Eintrag",
].join("\n");

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
	walkToday: string;
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

// diaryContent === null → kein Tagebuch-Pfad konfiguriert
function setup(bridge: TaskNotesBridge, diaryContent: string | null = DIARY) {
	const app = createMockApp();
	const diary = createMockTFile("Diary.md");
	if (diaryContent !== null) app.vault.register(diary, diaryContent);
	const plugin = createMockPlugin(
		makeTestSettings({ workDiary: { diaryNotePath: diaryContent !== null ? "Diary.md" : "" } }),
		app,
	);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	internals.todayIso = () => TODAY;
	internals.presentStop = vi.fn(async () => {}); // headless
	return { app, feature, internals, diary };
}

beforeEach(() => resetNotices());

describe("TaskTriageFeature.handleOpenAndStop (Erinnerungen)", () => {
	it("öffnet die Tagebuch-Notiz, stoppt den Walk ohne Count, ruft openInNewTab nicht auf", async () => {
		const openInNewTab = vi.fn(async () => undefined);
		const listTasks = vi.fn(async () => []);
		const { app, internals, diary } = setup(fakeBridge({ openInNewTab, listTasks }));

		const editor = createMockEditor(DIARY);
		app.workspace.activeEditor = { editor };

		await internals.beginWalk();
		await internals.handleOpenAndStop();

		expect(app.workspace.openedFiles).toContain(diary);
		// Cursor steht auf der Erinnerungszeile (lineIndex 6 = "- Zahnarzt anrufen, 01.07.2026").
		expect(editor.cursorPos).toEqual({ line: 6, ch: 0 });
		expect(internals.walkActive).toBe(false);
		expect(internals.counts.completed).toBe(0);
		expect(internals.counts.skipped).toBe(0);
		expect(openInNewTab).not.toHaveBeenCalled();
	});
});
