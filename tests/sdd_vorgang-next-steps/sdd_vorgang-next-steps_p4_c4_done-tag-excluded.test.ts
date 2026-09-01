import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { createMockApp, createMockPlugin, createMockTFile, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

const TODAY = "2026-07-02";

// Eine Vorgang-Notiz mit genau einer Intake-Gruppe.
function vorgangWithIntake(tags: string[], groupBlock: string[]): string {
	return [
		"---",
		"tags:",
		...tags.map((t) => `  - ${t}`),
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

// Data Models (Phase 4): TriageStop grows a third "intake" kind that does not
// exist in production yet — declared locally against the SDD's pinned shape.
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

	// Offener Vorgang mit fälliger Intake-Gruppe — muss präsentiert werden.
	const open = createMockTFile("Vorgänge/Vorgang Offen.md");
	app.vault.register(open, vorgangWithIntake(["Vorgang"], ["- Aus [[Besprechung Offen]]", "    - Angebot einholen"]));
	app.metadataCache.setFrontmatter(open.path, { tags: ["Vorgang"] });

	// Abgeschlossener Vorgang (doneTag "Done") mit nicht-leerer Intake — darf
	// nicht präsentiert werden, obwohl die Gruppe selbst fällig wäre.
	const done = createMockTFile("Vorgänge/Vorgang Abgeschlossen - done.md");
	app.vault.register(done, vorgangWithIntake(["Vorgang", "Done"], ["- Aus [[Besprechung Done]]", "    - Rückmeldung geben"]));
	app.metadataCache.setFrontmatter(done.path, { tags: ["Vorgang", "Done"] });

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

describe("SDD vorgang-next-steps Phase 4 #4: done-tag excludes intake groups", () => {
	it("zeigt nur die Gruppe des offenen Vorgangs, nicht die des abgeschlossenen", async () => {
		const { internals } = setup(fakeBridge());

		await internals.beginWalk();

		expect(internals.stops).toHaveLength(1);
		expect(internals.stops[0].kind === "intake" && internals.stops[0].group.line).toBe("- Aus [[Besprechung Offen]]");
	});
});
