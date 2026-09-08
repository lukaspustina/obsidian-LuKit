// Supersedes the summary literals of tests/sdd_vorgang-next-steps/..._p4_c14_summary-counts.test.ts
// and tests/sdd_tasknotes-triage-walk/..._p2_c11_summary-sums.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageTask, TriageStop } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, lastNotice, resetNotices } from "../helpers/obsidian-mocks";

// specs/sdd/triage-note-stops.md, Requirement 15 / Phase 1 test scenario #17
// (of 17): "GIVEN a walk with zero stops in one or more buckets, WHEN it
// ends, THEN the summary Notice names all six buckets including the zero
// ones."
//
// This supersedes the conditional bucket shape pinned by
// specs/done/sdd/vorgang-next-steps-2026-09-02.md, under which the
// "übernommen"/"verworfen" buckets appeared only when the walk had at least
// one intake stop (see task-triage-feature.ts `finishWalk`, the
// `this.stops.some((s) => s.kind === "intake")` gate). Requirement 15 drops
// that gate and the "verworfen" bucket entirely: the summary always shows
// exactly six buckets — erledigt, verschoben, ausgelassen, übersprungen,
// übernommen, offen — in that order, zero counts included.

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
	stops: TriageStop[];
	index: number;
	todayIso: () => string;
	beginWalk: () => Promise<void>;
	presentStop: () => Promise<void>;
	handleComplete: () => Promise<void>;
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

const BUCKET_LABELS = ["erledigt", "verschoben", "ausgelassen", "übersprungen", "übernommen", "offen"];

describe("TaskTriageFeature — summary always names all six buckets (SDD triage-note-stops, Req 15, p1_c17)", () => {
	it("names all six buckets, zero counts included, on a walk with no intake groups at all", async () => {
		// No intake stops in this walk — exactly the case the superseded code
		// hid the "übernommen"/"verworfen" buckets for entirely.
		const tasks = [task({ path: "A.md", title: "A" }), task({ path: "B.md", title: "B" }), task({ path: "C.md", title: "C" })];
		const bridge = fakeBridge({ listTasks: vi.fn(async () => tasks) });
		const { internals } = setup(bridge);

		await internals.beginWalk();
		internals.stops = tasks.map((t) => ({ kind: "task" as const, task: t }));
		internals.index = 0;

		await internals.handleComplete(); // A: erledigt
		await internals.handleSkip(); // B: übersprungen
		// C: left unvisited → offen
		internals.handleStop();

		expect(internals.walkActive).toBe(false);
		const notice = lastNotice();
		expect(notice).not.toBeNull();
		for (const label of BUCKET_LABELS) {
			expect(notice).toContain(label);
		}
		expect(notice).toBe("Triage beendet: 1 erledigt, 0 verschoben, 0 ausgelassen, 1 übersprungen, 0 übernommen, 1 offen");
	});

	it("names all six buckets, zero counts included, with several buckets at zero on a mixed walk", async () => {
		const tasks = [task({ path: "A.md", title: "A" }), task({ path: "B.md", title: "B" })];
		const bridge = fakeBridge({ listTasks: vi.fn(async () => tasks) });
		const { internals } = setup(bridge);

		await internals.beginWalk();
		internals.stops = tasks.map((t) => ({ kind: "task" as const, task: t }));
		internals.index = 0;

		await internals.handleComplete(); // A: erledigt
		await internals.handleComplete(); // B: erledigt

		expect(internals.walkActive).toBe(false);
		const notice = lastNotice();
		expect(notice).not.toBeNull();
		for (const label of BUCKET_LABELS) {
			expect(notice).toContain(label);
		}
		expect(notice).toBe("Triage beendet: 2 erledigt, 0 verschoben, 0 ausgelassen, 0 übersprungen, 0 übernommen, 0 offen");
	});
});
