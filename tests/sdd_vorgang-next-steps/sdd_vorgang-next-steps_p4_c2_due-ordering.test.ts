import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { createMockApp, createMockPlugin, createMockTFile, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

const TODAY = "2026-07-02";

// Eine Vorgang-Notiz mit genau einer Intake-Gruppe.
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

	// Kein Tagebuch-Pfad konfiguriert: die Erinnerungs-Ebene bleibt aus dem Weg.
	const dateless = createMockTFile("Vorgänge/Vorgang Datumslos.md");
	app.vault.register(dateless, vorgangWithIntake(["- Aus [[Besprechung Dateless]]", "    - Angebot einholen"]));
	app.metadataCache.setFrontmatter(dateless.path, { tags: ["Vorgang"] });

	// Auf gestern (01.07.2026) verschoben — vor dem datumslosen Fall fällig.
	const snoozed = createMockTFile("Vorgänge/Vorgang Verschoben.md");
	app.vault.register(snoozed, vorgangWithIntake(["- Aus [[Besprechung Snoozed]], 01.07.2026", "    - Rückmeldung geben"]));
	app.metadataCache.setFrontmatter(snoozed.path, { tags: ["Vorgang"] });

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

describe("SDD vorgang-next-steps Phase 4 #2: due ordering among intake stops", () => {
	it("stellt die auf gestern verschobene Gruppe vor die datumslose", async () => {
		const { internals } = setup(fakeBridge());

		await internals.beginWalk();

		expect(internals.stops).toHaveLength(2);
		const [first, second] = internals.stops;
		expect(first.kind === "intake" && first.group.line).toBe("- Aus [[Besprechung Snoozed]], 01.07.2026");
		expect(second.kind === "intake" && second.group.line).toBe("- Aus [[Besprechung Dateless]]");
	});
});
