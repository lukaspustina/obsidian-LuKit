import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageStop, TriageTask } from "../../src/features/task-triage/task-triage-engine";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, lastNotice, resetNotices } from "../helpers/obsidian-mocks";

// specs/sdd/triage-note-stops.md, Requirement 15 / Phase 1 test scenario #14
// (of 17): "GIVEN a walk with five stops left via five different actions
// (including one left unvisited by ⌘.), WHEN the walk ends, THEN the buckets
// sum to five, with the unvisited stop counted as 'offen'."
//
// Requirement 15's six-bucket scheme (erledigt, verschoben, ausgelassen,
// übersprungen, übernommen, offen) supersedes the seven-bucket literal pinned
// by tests/sdd_vorgang-next-steps/sdd_vorgang-next-steps_p4_c14_summary-counts.test.ts
// (specs/done/sdd/vorgang-next-steps-2026-09-02.md, p4_c14) — the separate
// "verworfen" (discarded) bucket disappears because discard becomes a
// per-group action inside the ⌘S dialog (Requirement 11) rather than a
// stop-level outcome.
//
// `selectNoteStops` doesn't exist in task-triage-engine.ts yet (kind: "note"
// stops are the whole point of this SDD), and handleSkipInstance still
// requires `stop.kind === "task"` rather than "the stop carries a recurring
// task" — so this is the intended RED state. The assertions parse the
// numbers back out of the closing Notice instead of pinning the whole
// sentence, so a wording change alone can't break the invariant.

const TODAY = "2026-07-02";

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

function task(path: string, due: string, isRecurring: boolean): TriageTask {
	return {
		path,
		title: path,
		isCompleted: false,
		due,
		contexts: [],
		projects: [],
		isRecurring,
		completeInstances: [],
		skippedInstances: [],
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
	handleSnoozeCustom: (date: string) => Promise<void>;
	handleSkipInstance: () => Promise<void>;
	handleSkip: () => Promise<void>;
	handleStop: () => void;
}

function setup(bridge: TaskNotesBridge) {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	internals.walkToday = TODAY;
	internals.presentStop = vi.fn(async () => {}); // keep headless
	internals.walkActive = true;
	return { internals };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 1 #14: bucket sum incl. one unvisited stop", () => {
	it("counts five stops across five outcomes, the unvisited one landing in offen", async () => {
		const bridge = fakeBridge();
		const { internals } = setup(bridge);

		// Five notes, no intake groups — only the note's own task matters here.
		// Ascending due dates give a deterministic A..E order out of selectNoteStops.
		const tasks = [
			task("A.md", "2026-06-25", false), // ⌘D → erledigt
			task("B.md", "2026-06-26", false), // ⌘1 → verschoben
			task("C.md", "2026-06-27", true), // ⌘X → ausgelassen
			task("D.md", "2026-06-28", false), // Esc → übersprungen
			task("E.md", "2026-06-29", false), // unvisited when ⌘. ends the walk → offen
		];
		internals.stops = selectNoteStops(tasks, []).map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
		internals.index = 0;
		internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
		expect(internals.stops).toHaveLength(5);

		await internals.handleComplete(); // A: erledigt
		await internals.handleSnoozeCustom("2026-07-03"); // B: verschoben
		await internals.handleSkipInstance(); // C: ausgelassen
		await internals.handleSkip(); // D: übersprungen
		internals.handleStop(); // ⌘. — E is left unvisited

		expect(internals.walkActive).toBe(false);

		const notice = lastNotice();
		expect(notice).toBeDefined();
		const text = notice ?? "";

		// Sum every "<n> <bucket-label>" pair rather than pinning the sentence.
		const pairs = [...text.matchAll(/(\d+)\s+([A-Za-zÄÖÜäöüß]+)/g)];
		const sum = pairs.reduce((total, m) => total + Number(m[1]), 0);
		expect(sum).toBe(5);

		const offenPair = pairs.find((m) => m[2] === "offen");
		expect(offenPair).toBeDefined();
		expect(Number(offenPair?.[1])).toBe(1);
	});
});
