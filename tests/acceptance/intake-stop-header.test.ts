import { describe, it, expect } from "vitest";
import { TaskTriageModal } from "../../src/features/task-triage/task-triage-modal";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { __allTexts } from "../helpers/obsidian-stub";
import { createMockApp } from "../helpers/obsidian-mocks";

const TODAY = "2026-09-07";

function group(overrides: Partial<IntakeGroup> = {}): IntakeGroup {
	return {
		line: "- Aus [[Besprechung - Kickoff]], 05.09.2026",
		source: "Besprechung - Kickoff",
		due: new Date(2026, 8, 5),
		ownItems: [{ text: "Angebot prüfen", children: [] }],
		foreignItems: [{ text: "Erika Beispiel: Zahlen liefern", children: [] }],
		lineIndex: 12,
		...overrides,
	};
}

function header(stop: TriageStop, position = { index: 0, total: 24 }): string {
	const modal = new TaskTriageModal(createMockApp({}) as never, {
		stop,
		actions: { snooze: true, skipInstance: false },
		locale: "de",
		today: TODAY,
		position,
		sourcePath: "Vorgänge/Angebot Acme.md",
		onComplete: () => undefined,
		onSnooze: () => undefined,
		onSnoozeCustom: () => undefined,
		onSkipInstance: () => undefined,
		onIntakeDiscard: () => undefined,
		onIntakeSelect: () => undefined,
		onIntakeNoteDate: () => undefined,
		onOpenAndStop: () => undefined,
		onSkip: () => undefined,
		onStop: () => undefined,
	});
	(modal as unknown as { renderHeader: () => void }).renderHeader();
	return __allTexts((modal as unknown as { contentEl: unknown }).contentEl).join("|");
}

type IntakeStop = Extract<TriageStop, { kind: "intake" }>;

function intakeStop(overrides: Partial<IntakeStop> = {}): IntakeStop {
	return {
		kind: "intake",
		notePath: "Vorgänge/Angebot Acme.md",
		noteBasename: "Angebot Acme",
		group: group(),
		...overrides,
	};
}

describe("Intake-Stop-Kopfzeile", () => {
	it("titelt mit dem Vorgang, nicht mit der Quelle der Gruppe", () => {
		const texts = header(intakeStop());

		// Die Quelle stand hier bis 2026-09-07 als Überschrift — jeder
		// Intake-Stop las sich dadurch wie eine fällige Besprechung.
		expect(texts.split("|")[0]).toBe("Angebot Acme");
	});

	it("nennt die Quelle in der Meta-Zeile", () => {
		const texts = header(intakeStop());

		expect(texts).toContain("1/24 · Intake · Aus: Besprechung - Kickoff · fällig 05.09.2026 · 2 Punkt(e)");
	});

	it("lässt das Aus-Segment weg, wenn die Gruppe keine Quelle nennt", () => {
		const texts = header(intakeStop({ group: group({ source: "", line: "- Aus", due: null }) }));

		expect(texts).toContain("1/24 · Intake · fällig ohne Datum · 2 Punkt(e)");
		expect(texts).not.toContain("Aus:");
	});

	it("meldet eine übernommene Gruppe weiterhin als übernommen", () => {
		const texts = header(intakeStop({ groupDone: true }));

		expect(texts).toContain("1/24 · Intake · Aus: Besprechung - Kickoff · übernommen");
	});
});
