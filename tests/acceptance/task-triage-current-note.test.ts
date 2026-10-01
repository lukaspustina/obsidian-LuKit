import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop, TriageTask } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
import type { TFile } from "obsidian";
import {
	createMockApp,
	createMockPlugin,
	createMockTFile,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
	lastNotice,
} from "../helpers/obsidian-mocks";

// "Vorgang: Aufgaben durchgehen" (task-triage-current): one stop for the
// active note, carrying its open task and every intake group, due or not.

const TODAY = "2026-07-02";
const PATH = "Vorgänge/Vorgang Muster.md";

function vorgang(groupBlock: string[]): string {
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

const TWO_GROUPS = [
	"- Aus [[Besprechung Zukunft]], 03.12.2026",
	"    - Rückmeldung geben",
	"- Aus [[Besprechung Heute]]",
	"    - Angebot einholen",
];

function makeTask(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: PATH,
		title: "Vorgang Muster",
		isCompleted: false,
		scheduled: "2026-12-24",
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
		getTask: vi.fn(async () => null),
		complete: vi.fn(async () => undefined),
		setScheduled: vi.fn(async () => undefined),
		setDue: vi.fn(async () => undefined),
		clearScheduled: vi.fn(async () => undefined),
		clearDue: vi.fn(async () => undefined),
		toggleCompleteInstance: vi.fn(async () => undefined),
		toggleSkippedInstance: vi.fn(async () => undefined),
		openInNewTab: vi.fn(async () => undefined),
		...overrides,
	};
}

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: TriageStop[];
	todayIso: () => string;
	beginNoteWalk: (file: TFile | null) => Promise<void>;
	handleIntakeGroupOutcomes: (outcomes: IntakeGroupOutcome[]) => Promise<void>;
	presentStop: () => Promise<void>;
}

function setup(bridge: TaskNotesBridge, content: string, tags: string[] = ["Vorgang"]) {
	const app = createMockApp();
	const file = createMockTFile(PATH);
	app.vault.register(file, content);
	app.metadataCache.setFrontmatter(PATH, { tags });
	const plugin = createMockPlugin(makeTestSettings({ workDiary: { diaryNotePath: "" } }), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	internals.todayIso = () => TODAY;
	internals.presentStop = vi.fn(async () => {}); // headless
	return { app, file: file as unknown as TFile, internals };
}

function onlyStop(internals: FeatureInternals): Extract<TriageStop, { kind: "note" }> {
	expect(internals.stops).toHaveLength(1);
	const stop = internals.stops[0];
	if (stop.kind !== "note") throw new Error("expected a note stop");
	return stop;
}

beforeEach(() => resetNotices());

describe("task-triage-current: triage the active note", () => {
	it("carries every intake group in file order, including a future one", async () => {
		const { file, internals } = setup(fakeBridge(), vorgang(TWO_GROUPS));

		await internals.beginNoteWalk(file);

		const stop = onlyStop(internals);
		expect(stop.groups.map((g) => g.line)).toEqual(["- Aus [[Besprechung Zukunft]], 03.12.2026", "- Aus [[Besprechung Heute]]"]);
		expect(stop.task).toBeUndefined();
		expect(internals.presentStop).toHaveBeenCalledTimes(1);
	});

	it("attaches the note's open task even when it is not due", async () => {
		const getTask = vi.fn(async () => makeTask());
		const { file, internals } = setup(fakeBridge({ getTask }), vorgang([]));

		await internals.beginNoteWalk(file);

		expect(getTask).toHaveBeenCalledWith(PATH);
		const stop = onlyStop(internals);
		expect(stop.task?.path).toBe(PATH);
		expect(stop.groups).toEqual([]);
	});

	it("drops a completed task and reports a note with nothing to triage", async () => {
		const { file, internals } = setup(fakeBridge({ getTask: vi.fn(async () => makeTask({ isCompleted: true })) }), vorgang([]));

		await internals.beginNoteWalk(file);

		expect(internals.stops).toEqual([]);
		expect(internals.walkActive).toBe(false);
		expect(lastNotice()).toBe("„Vorgang Muster“ hat weder eine offene Aufgabe noch Intake-Gruppen.");
	});

	it("rejects a note carrying the doneTag", async () => {
		const getTask = vi.fn(async () => makeTask());
		const { file, internals } = setup(fakeBridge({ getTask }), vorgang(TWO_GROUPS), ["Vorgang", "Done"]);

		await internals.beginNoteWalk(file);

		expect(getTask).not.toHaveBeenCalled();
		expect(internals.walkActive).toBe(false);
		expect(lastNotice()).toBe("„Vorgang Muster“ ist bereits abgeschlossen.");
	});

	it("rejects a missing active note", async () => {
		const { internals } = setup(fakeBridge(), vorgang(TWO_GROUPS));

		await internals.beginNoteWalk(null);

		expect(internals.walkActive).toBe(false);
		expect(lastNotice()).toBe("Keine aktive Notiz geöffnet.");
	});

	it("still triages the intake when TaskNotes is unavailable", async () => {
		const getTask = vi.fn(async () => makeTask());
		const { file, internals } = setup(
			fakeBridge({ availability: vi.fn(() => ({ ok: false, reason: "plugin-missing" }) as const), getTask }),
			vorgang(TWO_GROUPS),
		);

		await internals.beginNoteWalk(file);

		expect(getTask).not.toHaveBeenCalled();
		expect(onlyStop(internals).groups).toHaveLength(2);
	});

	it("keeps a group on the stop after ⌘S defers it past today", async () => {
		const { app, file, internals } = setup(fakeBridge(), vorgang(TWO_GROUPS));
		await internals.beginNoteWalk(file);
		const today = onlyStop(internals).groups[1];

		await internals.handleIntakeGroupOutcomes([
			{
				lineIndex: today.lineIndex,
				discard: false,
				due: "2026-11-15",
				taken: [],
				keptOwn: today.ownItems,
				keptForeign: today.foreignItems,
			},
		]);

		expect(await app.vault.read(file)).toContain("- Aus [[Besprechung Heute]], 15.11.2026");
		expect(onlyStop(internals).groups.map((g) => g.line)).toEqual([
			"- Aus [[Besprechung Zukunft]], 03.12.2026",
			"- Aus [[Besprechung Heute]], 15.11.2026",
		]);
	});
});
