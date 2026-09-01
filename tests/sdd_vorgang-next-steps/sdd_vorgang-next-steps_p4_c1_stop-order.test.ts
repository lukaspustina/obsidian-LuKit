import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { createMockApp, createMockPlugin, createMockTFile, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

const TODAY = "2026-07-02";

// Tagebuch mit genau einer fälligen Erinnerung:
const DIARY = [
	"---",
	"tags: []",
	"---",
	"",
	"# Erinnerungen",
	"",
	"- Zahnarzt anrufen, 01.07.2026",
	"",
	"---",
	"",
	"##### Mi, 01.07.2026",
	"- Eintrag",
].join("\n");

// Eine Vorgang-Notiz mit genau einer fälligen (datumslosen) Intake-Gruppe.
function vorgangWithIntake(groupBlock: string[]): string {
	return [
		"---",
		"tags:",
		"  - Vorgang",
		"---",
		"",
		"# Fakten und Pointer",
		"",
		"# Nächste Schritte",
		"",
		"#### Unsortiert",
		...groupBlock,
		"",
		"# Inhalt",
	].join("\n");
}

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

// Data Models (Phase 4): TriageStop grows a third "intake" kind that does not
// exist in production yet — declared locally against the SDD's pinned shape
// ({ kind: "intake"; group: IntakeGroup; notePath: string; noteBasename: string }).
type IntakeStop = { kind: "intake"; group: IntakeGroup; notePath: string; noteBasename: string };
type AnyStop = TriageStop | IntakeStop;

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: AnyStop[];
	index: number;
	todayIso: () => string;
	beginWalk: () => Promise<void>;
	presentStop: () => Promise<void>;
}

function setup(bridge: TaskNotesBridge) {
	const app = createMockApp();
	const diary = createMockTFile("Diary.md");
	app.vault.register(diary, DIARY);

	const vorgangA = createMockTFile("Vorgänge/Vorgang A.md");
	app.vault.register(vorgangA, vorgangWithIntake(["- Aus [[Besprechung A]]", "    - Angebot einholen"]));
	app.metadataCache.setFrontmatter(vorgangA.path, { tags: ["Vorgang"] });

	const vorgangB = createMockTFile("Vorgänge/Vorgang B.md");
	app.vault.register(vorgangB, vorgangWithIntake(["- Aus [[Besprechung B]]", "    - Rückmeldung geben"]));
	app.metadataCache.setFrontmatter(vorgangB.path, { tags: ["Vorgang"] });

	const plugin = createMockPlugin(makeTestSettings({ workDiary: { diaryNotePath: "Diary.md" } }), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	internals.todayIso = () => TODAY;
	internals.presentStop = vi.fn(async () => {}); // headless
	return { app, feature, internals };
}

beforeEach(() => resetNotices());

describe("SDD vorgang-next-steps Phase 4 #1: stop order", () => {
	it("baut stops = [Erinnerung, Intake, Intake, Task]", async () => {
		const bridge = fakeBridge({ listTasks: vi.fn(async () => [task()]) });
		const { internals } = setup(bridge);

		await internals.beginWalk();

		expect(internals.stops).toHaveLength(4);
		expect(internals.stops.map((s) => s.kind)).toEqual(["reminder", "intake", "intake", "task"]);
		expect(internals.walkActive).toBe(true);
	});
});
