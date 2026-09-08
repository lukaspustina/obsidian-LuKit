// Supersedes tests/sdd_vorgang-next-steps/..._p4_c6_takeover-advances.test.ts and case 6 of
// tests/acceptance/intake-note-date.test.ts (⌘D as take-over).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageStop, TriageTask, IntakeStopCandidate } from "../../src/features/task-triage/task-triage-engine";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

const TODAY = "2026-09-08";
const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";
const OTHER_PATH = "Vorgänge/Vorgang Beispiel GmbH.md";
const OTHER_BASENAME = "Vorgang Beispiel GmbH";

// One group below the intake boundary — the note carries both a due task and
// a due intake group, the exact shape a merged note stop presents.
const VORGANG = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung Acme Kickoff]]",
	"    - Angebot prüfen",
	"    - Termin vereinbaren",
	"",
	"# Inhalt",
	"",
].join("\n");

function fakeBridge(overrides: Partial<TaskNotesBridge> = {}): TaskNotesBridge {
	return {
		availability: vi.fn(() => ({ ok: true }) as const),
		listTasks: vi.fn(async () => []),
		complete: vi.fn(async () => undefined),
		setScheduled: vi.fn(async () => undefined),
		setDue: vi.fn(async () => undefined),
		clearScheduled: vi.fn(async () => undefined),
		clearDue: vi.fn(async () => undefined),
		toggleCompleteInstance: vi.fn(async () => undefined),
		toggleSkippedInstance: vi.fn(async () => undefined),
		readNote: vi.fn(async () => ""),
		openInNewTab: vi.fn(async () => undefined),
		...overrides,
	};
}

function task(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: NOTE_PATH,
		title: NOTE_BASENAME,
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

// A second, unrelated due note — no intake group, just a task — so the walk
// has somewhere to advance to and the assertion on index isn't trivially 0/1
// by construction.
function otherTask(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: OTHER_PATH,
		title: OTHER_BASENAME,
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

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	walkToday: string;
	presentStop: () => Promise<void>;
	handleComplete: () => Promise<void>;
}

function setup(bridge: TaskNotesBridge, taskOverrides: Partial<TriageTask> = {}) {
	const app = createMockApp({});
	const vorgang = createMockTFile(NOTE_PATH, { basename: NOTE_BASENAME });
	app.vault.register(vorgang, VORGANG);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	internals.bridge = bridge;
	internals.walkToday = TODAY;
	internals.presentStop = vi.fn(async () => {});
	internals.walkActive = true;

	// Built through the real join point (not a hand-typed fake stop), so the
	// note stop carries exactly what selectNoteStops produces — a task plus
	// its due intake group.
	const candidates: IntakeStopCandidate[] = [
		{ group: parseIntakeGroups(VORGANG)[0], notePath: NOTE_PATH, noteBasename: NOTE_BASENAME },
	];
	const noteStops = selectNoteStops([task(taskOverrides), otherTask()], candidates);
	internals.stops = noteStops.map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = internals.stops.findIndex((s) => (s as unknown as { notePath: string }).notePath === NOTE_PATH);
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 1 #9: ⌘D completes the note's task and advances", () => {
	it("calls bridge.complete for a non-recurring task, advances, and leaves the note's groups unchanged", async () => {
		const bridge = fakeBridge();
		const { internals, app, vorgang } = setup(bridge, { isRecurring: false });
		expect(internals.stops).toHaveLength(2);
		const startIndex = internals.index;
		expect(startIndex).toBeGreaterThanOrEqual(0);

		await internals.handleComplete();

		expect(bridge.complete).toHaveBeenCalledWith(NOTE_PATH);
		expect(bridge.toggleCompleteInstance).not.toHaveBeenCalled();
		expect(internals.index).toBe(startIndex + 1);
		expect(app.vault.files.get(vorgang.path)).toBe(VORGANG);
	});

	it("calls bridge.toggleCompleteInstance(today) for a recurring task, advances, and leaves the note's groups unchanged", async () => {
		const bridge = fakeBridge();
		const { internals, app, vorgang } = setup(bridge, { isRecurring: true });
		expect(internals.stops).toHaveLength(2);
		const startIndex = internals.index;
		expect(startIndex).toBeGreaterThanOrEqual(0);

		await internals.handleComplete();

		expect(bridge.toggleCompleteInstance).toHaveBeenCalledWith(NOTE_PATH, TODAY);
		expect(bridge.complete).not.toHaveBeenCalled();
		expect(internals.index).toBe(startIndex + 1);
		expect(app.vault.files.get(vorgang.path)).toBe(VORGANG);
	});
});
