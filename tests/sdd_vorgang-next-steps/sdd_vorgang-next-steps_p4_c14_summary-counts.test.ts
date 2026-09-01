// Phase 4, criterion 14 (Test Scenarios #14):
// GIVEN a completed walk with one take-over, one discard and one snooze, WHEN
// it ends, THEN the summary notice reports each (requirement 39).
//
// Handler names follow the `handleIntake<Verb>` convention already pinned by
// the sibling Phase 4 tests (c6/c9/c10/c11: handleIntakeTakeOver,
// handleIntakeDiscard). Neither those methods, a snooze counterpart, nor
// their counts in the closing summary exist yet. This test pins the
// least-invented extension of the existing summary shape: take-over and
// discard get their own counters and their own clauses in the closing
// Notice, following the existing "X erledigt, Y verschoben, …" sentence
// pattern (task-triage-feature.ts finishWalk). Referencing
// handleIntakeTakeOver/handleIntakeDiscard/handleIntakeSnoozeCustom and the
// new counter fields is the intended RED state.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import { buildIntakeGroup, type IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, lastNotice, resetNotices } from "../helpers/obsidian-mocks";

const TODAY = "2026-07-02";

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

function group(source: string): IntakeGroup {
	return buildIntakeGroup(["Ein Punkt"], source, []);
}

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: {
		completed: number;
		snoozed: number;
		instancesSkipped: number;
		skipped: number;
		takenOver: number;
		discarded: number;
	};
	todayIso: () => string;
	beginWalk: () => Promise<void>;
	presentStop: () => Promise<void>;
	handleIntakeTakeOver: (selectedIndices?: number[]) => Promise<void>;
	handleIntakeDiscard: () => Promise<void>;
	handleIntakeSnoozeCustom: (date: string) => Promise<void>;
}

function setup(bridge: TaskNotesBridge, files: Record<string, string>) {
	const app = createMockApp(files);
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

describe("TaskTriageFeature — intake actions counted in the closing summary (Req 39, P4 C14)", () => {
	it("reports one take-over, one discard and one snooze", async () => {
		const notes: Record<string, string> = {
			"Vorgänge/A.md": ["# Nächste Schritte", "", "#### Unsortiert", "- Aus [[Besprechung A]]", "    - Ein Punkt"].join("\n"),
			"Vorgänge/B.md": ["# Nächste Schritte", "", "#### Unsortiert", "- Aus [[Besprechung B]]", "    - Ein Punkt"].join("\n"),
			"Vorgänge/C.md": ["# Nächste Schritte", "", "#### Unsortiert", "- Aus [[Besprechung C]]", "    - Ein Punkt"].join("\n"),
		};
		const { internals } = setup(fakeBridge(), notes);

		await internals.beginWalk();
		internals.stops = [
			{ kind: "intake", group: group("Besprechung A"), notePath: "Vorgänge/A.md", noteBasename: "A" },
			{ kind: "intake", group: group("Besprechung B"), notePath: "Vorgänge/B.md", noteBasename: "B" },
			{ kind: "intake", group: group("Besprechung C"), notePath: "Vorgänge/C.md", noteBasename: "C" },
		] as unknown as TriageStop[];
		internals.index = 0;
		internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };

		await internals.handleIntakeTakeOver(); // A: übernommen
		await internals.handleIntakeDiscard(); // B: verworfen
		await internals.handleIntakeSnoozeCustom("2026-07-03"); // C: verschoben

		expect(internals.walkActive).toBe(false);
		expect(lastNotice()).toBe(
			"Triage beendet: 0 erledigt, 1 verschoben, 0 ausgelassen, 0 übersprungen, 1 übernommen, 1 verworfen, 0 offen",
		);
	});
});
