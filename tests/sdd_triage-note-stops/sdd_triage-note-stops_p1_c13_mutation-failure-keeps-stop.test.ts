import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageStop, TriageTask, IntakeStopCandidate, SnoozeKind } from "../../src/features/task-triage/task-triage-engine";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";

// SDD triage-note-stops, Phase 1, Test Scenario 13 (Requirement 17): a
// rejecting bridge mutation on a note stop (⌘D, ⌘1/⌘2/⌘3/⌘T, ⌘G) shows a
// German Notice and leaves the walk on the same stop — mirroring the
// existing reminder/intake mutation-failure contract (onMutationError).
//
// `selectNoteStops` does not exist yet, so building the note stop the way
// the real join point will (`beginWalk` after Phase 1) throws
// "selectNoteStops is not a function" today — the correct RED, not a
// hand-typed fake standing in for behaviour that isn't implemented yet.

const TODAY = "2026-09-08";
const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";

// The note carries both a task and a due intake group, so a failing bridge
// call on the note's task is proven not to touch the note's content either.
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

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	walkToday: string;
	presentStop: () => Promise<void>;
	handleComplete: () => Promise<void>;
	handleSnooze: (kind: SnoozeKind) => Promise<void>;
}

// Builds the single note stop through the real join point (not a hand-typed
// fake) so it carries exactly what selectNoteStops produces for this note.
function setup(bridge: TaskNotesBridge) {
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

	const candidates: IntakeStopCandidate[] = [
		{ group: parseIntakeGroups(VORGANG)[0], notePath: NOTE_PATH, noteBasename: NOTE_BASENAME },
	];
	const noteStops = selectNoteStops([task()], candidates);
	internals.stops = noteStops.map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = 0;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 1 #13: a rejecting bridge mutation keeps the note stop", () => {
	it("⌘D: a rejecting bridge.complete shows a Notice, keeps the index, and leaves the note byte-identical", async () => {
		const bridge = fakeBridge({
			complete: vi.fn(async () => {
				throw new Error("network down");
			}),
		});
		const { internals, app, vorgang } = setup(bridge);
		expect(internals.stops).toHaveLength(1);

		await internals.handleComplete();

		expect(bridge.complete).toHaveBeenCalledWith(NOTE_PATH);
		expect(lastNotice()).toBeTruthy();
		expect(internals.index).toBe(0);
		expect(internals.walkActive).toBe(true);
		expect(app.vault.files.get(vorgang.path)).toBe(VORGANG);
	});

	it("⌘1 (snooze): a rejecting bridge.setScheduled shows a Notice, keeps the index, and leaves the note byte-identical", async () => {
		const bridge = fakeBridge({
			setScheduled: vi.fn(async () => {
				throw new Error("disk full");
			}),
		});
		const { internals, app, vorgang } = setup(bridge);
		expect(internals.stops).toHaveLength(1);

		await internals.handleSnooze("tomorrow");

		expect(bridge.setScheduled).toHaveBeenCalledWith(NOTE_PATH, expect.any(String));
		expect(lastNotice()).toBeTruthy();
		expect(internals.index).toBe(0);
		expect(internals.walkActive).toBe(true);
		expect(app.vault.files.get(vorgang.path)).toBe(VORGANG);
	});
});
