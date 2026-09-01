// Phase 4, criterion 13 (Test Scenarios #13):
// GIVEN an intake stop, WHEN it is presented, THEN the preview shows the
// note's curated part alongside the group being decided — satisfied by the
// same buildTriagePreview function used for every other stop type
// (requirement 41), read fresh from disk (requirement 39a).
//
// TriageStop has no "intake" kind yet, and TaskTriageFeature.loadPreview has
// no branch for it — it currently falls through to the task branch and
// dereferences a non-existent `stop.task`. Referencing the intake stop shape
// here is the intended RED state.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import { buildIntakeGroup, type IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

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
	loadPreview: (stop: TriageStop) => Promise<string>;
}

beforeEach(() => resetNotices());

describe("TaskTriageFeature.loadPreview — intake stop preview (Req 41, P4 C13)", () => {
	it("shows the note's curated part alongside the group being decided", async () => {
		const notePath = "Vorgänge/Acme Kickoff.md";
		const noteContent = [
			"# Fakten und Pointer",
			"- Kunde: Acme",
			"",
			"# Nächste Schritte",
			"- Eigener kuratierter Punkt",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Angebot einholen",
			"",
			"# Inhalt",
		].join("\n");

		const app = createMockApp({ [notePath]: noteContent });
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;
		internals.bridge = fakeBridge();

		const group: IntakeGroup = buildIntakeGroup(["Angebot einholen"], "Besprechung Acme Kickoff", []);
		const stop = {
			kind: "intake",
			group,
			notePath,
			noteBasename: "Acme Kickoff",
		} as unknown as TriageStop;

		const preview = await internals.loadPreview(stop);

		expect(preview).toContain("Eigener kuratierter Punkt");
		expect(preview).toContain(group.line);
		expect(preview).toContain("Angebot einholen");
	});
});
