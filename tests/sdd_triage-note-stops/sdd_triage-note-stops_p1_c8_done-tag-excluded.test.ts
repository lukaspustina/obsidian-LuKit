import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop, TriageTask } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockPlugin, createMockTFile, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

// SDD: specs/sdd/triage-note-stops.md, Phase 1, Test Scenario #8:
// "GIVEN a note carrying doneTag, WHEN selectNoteStops runs, THEN no stop is
// produced for it even if it has a due task or due intake groups."
//
// selectNoteStops itself (task-triage-engine.ts) does not exist yet and takes
// no doneTag information — the exclusion happens upstream, in the walk
// assembly that feeds it (as it does today for intake candidates via
// isDone()/mayHoldIntake in loadDueIntakeStops). This is exercised the same
// way the precedent doneTag test does (tests/sdd_vorgang-next-steps/
// sdd_vorgang-next-steps_p4_c4_done-tag-excluded.test.ts): drive
// TaskTriageFeature.beginWalk() headlessly and inspect the resulting stops.
//
// Today, the task half of this criterion is NOT implemented: taskStops in
// beginWalk() is built straight from selectTriageTasks(all, walkToday) with
// no doneTag filtering, so a due task belonging to a doneTag note still
// produces a "task" stop. The intake half already holds today (isDone() in
// loadDueIntakeStops), and stays covered here as a regression guard for the
// merge into one stop per note.

const TODAY = "2026-07-02";

const OPEN_TASK_PATH = "Vorgänge/Vorgang Offen Task.md";
const DONE_TASK_PATH = "Vorgänge/Vorgang Done Task - done.md";
const OPEN_INTAKE_PATH = "Vorgänge/Vorgang Offen Intake.md";
const DONE_INTAKE_PATH = "Vorgänge/Vorgang Done Intake - done.md";

function plainVorgang(): string {
	return ["---", "tags:", "  - Vorgang", "---", "", "# Fakten und Pointer", "", "# Inhalt"].join("\n");
}

// Eine Vorgang-Notiz mit genau einer fälligen Intake-Gruppe.
function vorgangWithIntake(): string {
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
		"- Aus [[Besprechung Kickoff]]",
		"    - Angebot einholen",
		"",
		"# Inhalt",
	].join("\n");
}

function makeTask(path: string, overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path,
		title: path,
		isCompleted: false,
		due: TODAY,
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

function fakeBridge(overrides: Partial<TaskNotesBridge> = {}): TaskNotesBridge {
	return {
		availability: vi.fn(() => ({ ok: true }) as const),
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

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	todayIso: () => string;
	beginWalk: () => Promise<void>;
	presentStop: () => Promise<void>;
}

function setup(bridge: TaskNotesBridge, files: Record<string, { content: string; tags: string[] }>) {
	const app = createMockApp();
	for (const [path, { content, tags }] of Object.entries(files)) {
		const file = createMockTFile(path);
		app.vault.register(file, content);
		app.metadataCache.setFrontmatter(path, { tags });
	}

	const plugin = createMockPlugin(makeTestSettings({ workDiary: { diaryNotePath: "" } }), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	internals.todayIso = () => TODAY;
	internals.presentStop = vi.fn(async () => {}); // headless
	return { app, feature, internals };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 1 #8: doneTag excludes a note from the walk", () => {
	it("produces no task stop for a doneTag note even though its task is due", async () => {
		const { internals } = setup(
			fakeBridge({
				listTasks: vi.fn(async () => [makeTask(OPEN_TASK_PATH), makeTask(DONE_TASK_PATH)]),
			}),
			{
				[OPEN_TASK_PATH]: { content: plainVorgang(), tags: ["Vorgang"] },
				[DONE_TASK_PATH]: { content: plainVorgang(), tags: ["Vorgang", "Done"] },
			},
		);

		await internals.beginWalk();

		expect(internals.stops.some((s) => s.kind === "task" && s.task.path === DONE_TASK_PATH)).toBe(false);
		expect(internals.stops.some((s) => s.kind === "task" && s.task.path === OPEN_TASK_PATH)).toBe(true);
	});

	it("produces no intake stop for a doneTag note even though it holds a due intake group", async () => {
		const { internals } = setup(fakeBridge(), {
			[OPEN_INTAKE_PATH]: { content: vorgangWithIntake(), tags: ["Vorgang"] },
			[DONE_INTAKE_PATH]: { content: vorgangWithIntake(), tags: ["Vorgang", "Done"] },
		});

		await internals.beginWalk();

		expect(internals.stops.some((s) => s.kind === "intake" && s.notePath === DONE_INTAKE_PATH)).toBe(false);
		expect(internals.stops.some((s) => s.kind === "intake" && s.notePath === OPEN_INTAKE_PATH)).toBe(true);
	});
});
