import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageModal } from "../../src/features/task-triage/task-triage-modal";
import { __allTexts } from "../helpers/obsidian-stub";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, TriageStop, SnoozeKind } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockPlugin, createMockTFile, makeTestSettings, asLuKitPlugin, lastNotice, noticeMessages, resetNotices } from "../helpers/obsidian-mocks";

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

describe("SDD erinnerungen-triage Phase 2 #10: availableActions Gegensatz Erinnerung/recurring Task", () => {
	it("liefert für einen Erinnerungs-Stop { snooze: true, skipInstance: false }", () => {
		const { internals } = setup(fakeBridge());

		const reminderStop: TriageStop = {
			kind: "reminder",
			reminder: {
				text: "Zahnarzt anrufen",
				date: new Date(2026, 6, 1),
				line: "- Zahnarzt anrufen, 01.07.2026",
				lineIndex: 6,
			},
		};

		expect(internals.availableActions(reminderStop)).toEqual({ snooze: true, skipInstance: false });
	});

	it("liefert für einen recurring Task-Stop { snooze: false, skipInstance: true } (Gegensatz bleibt erhalten)", () => {
		const { internals } = setup(fakeBridge());

		const recurringTaskStop: TriageStop = {
			kind: "task",
			task: task({ isRecurring: true }),
		};

		expect(internals.availableActions(recurringTaskStop)).toEqual({ snooze: false, skipInstance: true });
	});

	it("rendert die Meta-Zeile n/total · Erinnerung · fällig <Datum> · <überfällig>", () => {
		const { app } = setup(fakeBridge());
		const modal = new TaskTriageModal(app as never, {
			stop: {
				kind: "reminder",
				reminder: { text: "Zahnarzt anrufen", date: new Date(2026, 6, 1), line: "- Zahnarzt anrufen, 01.07.2026", lineIndex: 6 },
			},
			actions: { snooze: true, skipInstance: false },
			locale: "de",
			today: TODAY,
			position: { index: 0, total: 2 },
			sourcePath: "Diary.md",
			onComplete: () => undefined,
			onSnooze: () => undefined,
			onSnoozeCustom: () => undefined,
			onSkipInstance: () => undefined,
			onOpenAndStop: () => undefined,
			onSkip: () => undefined,
			onStop: () => undefined,
		});

		(modal as unknown as { renderHeader: () => void }).renderHeader();

		const texts = __allTexts((modal as unknown as { contentEl: unknown }).contentEl).join("");
		expect(texts).toContain("Zahnarzt anrufen");
		expect(texts).toContain("1/2 · Erinnerung · fällig 01.07.2026");
		expect(texts).toContain("1d überfällig");
	});

	it("rendert datumslose Erinnerungen mit „ohne Datum“ und ohne Überfällig-Segment", () => {
		const { app } = setup(fakeBridge());
		const modal = new TaskTriageModal(app as never, {
			stop: {
				kind: "reminder",
				reminder: { text: "Angebot prüfen", date: null, line: "- Angebot prüfen", lineIndex: 7 },
			},
			actions: { snooze: true, skipInstance: false },
			locale: "de",
			today: TODAY,
			position: { index: 1, total: 2 },
			sourcePath: "Diary.md",
			onComplete: () => undefined,
			onSnooze: () => undefined,
			onSnoozeCustom: () => undefined,
			onSkipInstance: () => undefined,
			onOpenAndStop: () => undefined,
			onSkip: () => undefined,
			onStop: () => undefined,
		});

		(modal as unknown as { renderHeader: () => void }).renderHeader();

		const texts = __allTexts((modal as unknown as { contentEl: unknown }).contentEl).join("");
		expect(texts).toContain("2/2 · Erinnerung · fällig ohne Datum");
		expect(texts).not.toContain("überfällig");
	});
});
