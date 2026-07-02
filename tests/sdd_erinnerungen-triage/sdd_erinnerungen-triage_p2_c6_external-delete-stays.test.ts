import { describe, it, expect, vi, beforeEach } from "vitest";
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

// SDD Phase 2, Kriterium 6:
// GIVEN Tagebuch mit fälliger Erinnerung WHEN beginWalk, dann wird der
// Notiz-Inhalt extern geändert (Zahnarzt-Zeile entfernt, z.B. via erneutem
// register/files.set) und danach handleComplete aufgerufen, THEN erscheint
// eine Notice ("fehlgeschlagen"), counts.completed bleibt 0 und index bleibt
// auf dem aktuellen Stop stehen.
describe("SDD erinnerungen-triage P2 C6: external delete before handleComplete keeps walk on stop", () => {
	it("shows a failure notice and does not advance when the reminder line was removed externally", async () => {
		const bridge = fakeBridge();
		const { app, internals, diary } = setup(bridge);

		await internals.beginWalk();
		expect(internals.index).toBe(0);

		// Externe Änderung: Notiz-Inhalt ohne die Zahnarzt-Zeile überschreiben.
		const contentWithoutLine = DIARY.split("\n")
			.filter((line) => !line.includes("Zahnarzt anrufen"))
			.join("\n");
		app.vault.register(diary, contentWithoutLine);

		await internals.handleComplete();

		expect(lastNotice()).toBeTruthy();
		expect(lastNotice()).toContain("fehlgeschlagen");
		expect(internals.counts.completed).toBe(0);
		expect(internals.index).toBe(0);
	});
});
