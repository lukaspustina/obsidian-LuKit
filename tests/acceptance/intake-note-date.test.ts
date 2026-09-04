import { describe, it, expect, vi, beforeEach } from "vitest";

const { dateModals } = vi.hoisted(() => ({ dateModals: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/features/task-triage/task-triage-date-modal", () => ({
	TaskTriageDateModal: class {
		constructor(
			_app: unknown,
			onSubmit: (iso: string) => void,
			onCancel: () => void,
			defaultDate?: Date,
			prompt?: string,
		) {
			dateModals.push({ onSubmit, onCancel, defaultDate, prompt });
		}
		open(): void {}
	},
}));

import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { formatDate } from "../../src/shared/date-format";
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

describe("intake take-over — the note's own date", () => {
	it("asks for the Vorgang's date after the take-over, prefilled with its current one", async () => {
		const { internals } = setup({ noteIsTask: true, noteScheduled: "2026-09-30" });

		await internals.handleIntakeTakeOver();

		expect(dateModals).toHaveLength(1);
		expect(dateModals[0].prompt).toBe('Datum von „Vorgang - Acme" setzen…');
		expect(formatDate(dateModals[0].defaultDate as Date, "iso")).toBe("2026-09-30");
	});

	it("writes the chosen date to the note, not to the group, and then advances", async () => {
		const { internals, bridge, app, vorgang } = setup({ noteIsTask: true, noteScheduled: "2026-09-30" });

		await internals.handleIntakeTakeOver();
		(dateModals[0].onSubmit as (iso: string) => void)("2026-10-15");
		await Promise.resolve();
		await Promise.resolve();

		expect(bridge.setScheduled).toHaveBeenCalledWith("Vorgänge/Vorgang - Acme.md", "2026-10-15");
		// The group is gone either way — the date step is about the note.
		expect(parseIntakeGroups(app.vault.files.get(vorgang.path) ?? "")).toHaveLength(0);
		expect(internals.counts.takenOver).toBe(1);
	});

	it("leaves the date alone when the step is dismissed", async () => {
		const { internals, bridge } = setup({ noteIsTask: true });

		await internals.handleIntakeTakeOver();
		(dateModals[0].onCancel as () => void)();
		await Promise.resolve();

		expect(bridge.setScheduled).not.toHaveBeenCalled();
	});

	it("skips the step for a note TaskNotes does not know (e.g. a Person note)", async () => {
		const { internals } = setup({ noteIsTask: false });

		await internals.handleIntakeTakeOver();

		expect(dateModals).toHaveLength(0);
		expect(internals.counts.takenOver).toBe(1);
	});
});
