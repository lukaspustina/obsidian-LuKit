import { describe, it, expect, vi, beforeEach } from "vitest";

const { dateModals } = vi.hoisted(() => ({ dateModals: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/features/task-triage/note-date-modal", () => ({
	NoteDateModal: class {
		constructor(
			_app: unknown,
			noteName: string,
			initial: { due: string; scheduled: string },
			onSubmit: (dates: { due: string; scheduled: string }) => void,
			onCancel: () => void,
		) {
			dateModals.push({ noteName, initial, onSubmit, onCancel });
		}
		open(): void {}
	},
}));

import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

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

const VORGANG = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung - Kickoff]]",
	"    - Angebot prüfen",
	"",
	"# Inhalt",
	"",
].join("\n");

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	bridge: TaskNotesBridge;
	presentStop: () => Promise<void>;
	handleIntakeTakeOver: () => Promise<void>;
	handleIntakeNoteDate: () => void;
}

function setup(stopExtras: Record<string, unknown>) {
	const app = createMockApp({});
	const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
	app.vault.register(vorgang, VORGANG);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	const bridge = fakeBridge();

	internals.bridge = bridge;
	internals.presentStop = vi.fn(async () => {});
	internals.walkActive = true;
	internals.stops = [
		{
			kind: "intake",
			group: parseIntakeGroups(VORGANG)[0],
			notePath: vorgang.path,
			noteBasename: vorgang.basename,
			...stopExtras,
		} as unknown as TriageStop,
	];
	internals.index = 0;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
	return { internals, bridge, app, vorgang };
}

beforeEach(() => {
	resetNotices();
	dateModals.length = 0;
});

describe("intake stop — the note's own dates (⌘G)", () => {
	it("offers Fällig and Geplant prefilled with the note's current values", () => {
		const { internals } = setup({ noteIsTask: true, noteScheduled: "2026-09-30", noteDue: "2026-09-15" });

		internals.handleIntakeNoteDate();

		expect(dateModals).toHaveLength(1);
		expect(dateModals[0].noteName).toBe("Vorgang - Acme");
		expect(dateModals[0].initial).toEqual({ due: "2026-09-15", scheduled: "2026-09-30" });
	});

	it("writes only what changed and returns to the same stop", async () => {
		const { internals, bridge, app, vorgang } = setup({
			noteIsTask: true,
			noteScheduled: "2026-09-30",
			noteDue: "2026-09-15",
		});

		internals.handleIntakeNoteDate();
		(dateModals[0].onSubmit as (d: { due: string; scheduled: string }) => void)({
			due: "2026-09-15",
			scheduled: "2026-10-15",
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(bridge.setScheduled).toHaveBeenCalledWith("Vorgänge/Vorgang - Acme.md", "2026-10-15");
		expect(bridge.setDue).not.toHaveBeenCalled();
		// The dates address the note, never the group — and the stop stays open.
		expect(parseIntakeGroups(app.vault.files.get(vorgang.path) ?? "")).toHaveLength(1);
		expect(internals.index).toBe(0);
		expect(internals.presentStop).toHaveBeenCalled();
	});

	it("clears a date whose field was emptied instead of writing an empty string", async () => {
		const { internals, bridge } = setup({ noteIsTask: true, noteScheduled: "2026-09-30", noteDue: "2026-09-15" });

		internals.handleIntakeNoteDate();
		(dateModals[0].onSubmit as (d: { due: string; scheduled: string }) => void)({ due: "", scheduled: "2026-09-30" });
		await Promise.resolve();
		await Promise.resolve();

		expect(bridge.clearDue).toHaveBeenCalledWith("Vorgänge/Vorgang - Acme.md");
		expect(bridge.setDue).not.toHaveBeenCalled();
		expect(bridge.clearScheduled).not.toHaveBeenCalled();
	});

	it("leaves the dates alone when the dialog is dismissed", async () => {
		const { internals, bridge } = setup({ noteIsTask: true });

		internals.handleIntakeNoteDate();
		(dateModals[0].onCancel as () => void)();
		await Promise.resolve();

		expect(bridge.setScheduled).not.toHaveBeenCalled();
		expect(bridge.setDue).not.toHaveBeenCalled();
		expect(internals.presentStop).toHaveBeenCalled();
	});

	it("does nothing for a note TaskNotes does not know (e.g. a Person note)", () => {
		const { internals } = setup({ noteIsTask: false });

		internals.handleIntakeNoteDate();

		expect(dateModals).toHaveLength(0);
	});

	it("is not chained onto a take-over — ⌘D advances without asking", async () => {
		const { internals } = setup({ noteIsTask: true, noteScheduled: "2026-09-30" });

		await internals.handleIntakeTakeOver();

		expect(dateModals).toHaveLength(0);
		expect(internals.counts.takenOver).toBe(1);
	});
});
