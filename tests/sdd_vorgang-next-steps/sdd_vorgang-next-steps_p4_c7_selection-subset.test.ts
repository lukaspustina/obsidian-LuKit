import { describe, it, expect, vi, beforeEach } from "vitest";

const { constructed } = vi.hoisted(() => ({ constructed: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/features/task-triage/intake-select-modal", () => ({
	IntakeSelectModal: class {
		constructor(_app: unknown, options: Record<string, unknown>) {
			constructed.push(options);
		}
		open(): void {}
	},
}));

import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 4, Test Scenario 7 / Requirement 33: ⌘S opens
// the item-selection modal (IntakeSelectModal, one checkbox per item, all
// preselected). Unticking one of three items and confirming moves only the two
// ticked items above the boundary.
//
// SUPERSEDED IN PART (2026-09-04): the criterion's second half — "removes the
// whole group regardless" — no longer holds. An unticked item now STAYS in the
// group and the walk returns to the same stop, so a group can be worked off in
// several passes; discarding is what ⌘X is for. The first half (only ticked
// items move, and they move above the boundary) is unchanged and still pinned
// below. The modal also confirms the lines themselves rather than their
// indices, their text being editable.
//
// `TaskTriageFeature.handleIntakeSelect` and
// `src/features/task-triage/intake-select-modal.ts` do not exist yet, so this
// fails today with "internals.handleIntakeSelect is not a function" — the
// correct RED, not a syntax error.

interface IntakeTriageStop {
	kind: "intake";
	group: IntakeGroup;
	notePath: string;
	noteBasename: string;
}

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	presentStop: () => Promise<void>;
	handleIntakeSelect: () => void;
}

const VORGANG = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Fakten und Pointer",
	"",
	"# Nächste Schritte",
	"- Bestehender Punkt",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung Acme Kickoff]]",
	"    - Angebot einholen",
	"    - Vertrag prüfen",
	"    - Rückmeldung abwarten",
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => {
	resetNotices();
	constructed.length = 0;
});

describe("intake stop — ⌘S item selection moves only the ticked items (SDD vorgang-next-steps p4 c7)", () => {
	it("moves two of three items above the boundary and removes the whole group when the middle item is unticked", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		app.vault.register(vorgang, VORGANG);

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;

		const group = parseIntakeGroups(VORGANG)[0];
		expect(group.ownItems).toHaveLength(3);
		const intakeStop: IntakeTriageStop = { kind: "intake", group, notePath: vorgang.path, noteBasename: vorgang.basename };

		internals.presentStop = vi.fn(async () => {});
		internals.walkActive = true;
		internals.stops = [intakeStop as unknown as TriageStop];
		internals.index = 0;

		internals.handleIntakeSelect();

		expect(constructed).toHaveLength(1);
		const onConfirm = constructed[0].onConfirm as (selection: {
			taken: { text: string; children: string[] }[];
			keptOwn: { text: string; children: string[] }[];
			keptForeign: { text: string; children: string[] }[];
		}) => void;
		// "Vertrag prüfen" is unticked — the modal confirms the other two as
		// taken, each with the text as its (editable) field holds it, and the
		// unticked one as kept.
		onConfirm({
			taken: [
				{ text: "Angebot einholen", children: [] },
				{ text: "Rückmeldung abwarten", children: [] },
			],
			keptOwn: [{ text: "Vertrag prüfen", children: [] }],
			keptForeign: [],
		});
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		const newContent = app.vault.files.get(vorgang.path) ?? "";
		// The group survives with the unticked item, and the walk stays on it.
		const groups = parseIntakeGroups(newContent);
		expect(groups).toHaveLength(1);
		expect(groups[0].ownItems.map((i) => i.text)).toEqual(["Vertrag prüfen"]);

		const boundaryIndex = newContent.indexOf("#### Unsortiert");
		const idxAngebot = newContent.indexOf("- Angebot einholen");
		const idxVertrag = newContent.indexOf("- Vertrag prüfen");
		const idxRueckmeldung = newContent.indexOf("- Rückmeldung abwarten");

		expect(idxAngebot).toBeGreaterThan(0);
		expect(idxAngebot).toBeLessThan(boundaryIndex);
		expect(idxRueckmeldung).toBeGreaterThan(0);
		expect(idxRueckmeldung).toBeLessThan(boundaryIndex);
		// The unticked one did not move: it is still below the boundary.
		expect(idxVertrag).toBeGreaterThan(boundaryIndex);
	});
});
