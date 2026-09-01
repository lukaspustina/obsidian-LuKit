// Phase 4, criterion 5 (Test Scenarios #5):
// GIVEN two intake groups in the same Vorgang note, WHEN the first is taken
// over, THEN the second stop's preview and mutation operate on the freshly
// re-read note content, not the pre-walk snapshot (requirement 39a).
//
// Neither the "intake" TriageStop kind, TaskTriageFeature.loadPreview's
// intake branch, nor TaskTriageFeature.handleIntakeTakeOver exist yet — this
// fails today with "internals.handleIntakeTakeOver is not a function" (and,
// were that call removed, loadPreview would dereference the non-existent
// `stop.task`), the correct RED, not a syntax error.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockTFile, createMockPlugin, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

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

interface IntakeTriageStop {
	kind: "intake";
	group: IntakeGroup;
	notePath: string;
	noteBasename: string;
}

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	presentStop: () => Promise<void>;
	loadPreview: (stop: TriageStop) => Promise<string>;
	handleIntakeTakeOver: (selectedIndices?: number[]) => Promise<void>;
}

// Zwei sofort fällige (datumslose) Gruppen in derselben Vorgang-Notiz.
const VORGANG = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Fakten und Pointer",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung A]]",
	"    - Angebot einholen",
	"- Aus [[Besprechung B]]",
	"    - Rückmeldung geben",
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => resetNotices());

describe("intake stop — fresh read per stop (SDD vorgang-next-steps p4 c5)", () => {
	it("shows the second stop's preview reflecting the first stop's take-over, not the walk-start snapshot", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		app.vault.register(vorgang, VORGANG);

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;
		internals.bridge = fakeBridge();

		const [groupA, groupB] = parseIntakeGroups(VORGANG);
		const stopA: IntakeTriageStop = { kind: "intake", group: groupA, notePath: vorgang.path, noteBasename: vorgang.basename };
		const stopB: IntakeTriageStop = { kind: "intake", group: groupB, notePath: vorgang.path, noteBasename: vorgang.basename };

		internals.presentStop = vi.fn(async () => {}); // headless
		internals.walkActive = true;
		internals.stops = [stopA, stopB] as unknown as TriageStop[];
		internals.index = 0;
		internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };

		const before = await internals.loadPreview(internals.stops[0]);
		expect(before).toContain("- Aus [[Besprechung A]]");
		expect(before).toContain("- Aus [[Besprechung B]]");

		// Erste Gruppe übernehmen (⌘D) — mutiert die Notiz; Stop 2 zeigt bei
		// gecachtem/vor-Walk-Stand weiterhin die alte Gruppe A.
		await internals.handleIntakeTakeOver();

		const after = await internals.loadPreview(internals.stops[1]);
		expect(after).not.toContain("- Aus [[Besprechung A]]");
		expect(after).toContain("- Angebot einholen");
		expect(after).not.toContain("    - Angebot einholen");
		expect(after).toContain("- Aus [[Besprechung B]]");
	});
});
