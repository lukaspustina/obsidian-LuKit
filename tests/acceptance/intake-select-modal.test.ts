import { describe, it, expect } from "vitest";
import { IntakeSelectModal } from "../../src/features/task-triage/intake-select-modal";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { createMockApp } from "../helpers/obsidian-mocks";
import { __fireEvent } from "../helpers/obsidian-stub";

const GROUP: IntakeGroup = {
	line: "- Aus [[Besprechung - Kickoff]]",
	source: "Besprechung - Kickoff",
	due: null,
	ownItems: [{ text: "Max:", children: ["    - Angebot prüfen", "    - Termin vereinbaren"] }],
	foreignItems: [{ text: "Petra Schneider:", children: ["    - Zahlen liefern"] }],
	lineIndex: 3,
};

function allEls(el: { children?: unknown[] }): Record<string, never>[] {
	const out = [el as never];
	for (const child of (el.children ?? []) as { children?: unknown[] }[]) out.push(...allEls(child));
	return out;
}

function open() {
	let confirmed: IntakeGroupOutcome[] | null = null;
	const modal = new IntakeSelectModal(createMockApp({}) as never, {
		groups: [GROUP],
		onConfirm: (outcomes) => {
			confirmed = outcomes;
		},
		onCancel: () => undefined,
	});
	modal.onOpen();
	const els = allEls((modal as unknown as { contentEl: { children: unknown[] } }).contentEl) as unknown as {
		tag: string;
		cls: string;
		type?: string;
		value?: string;
		checked?: boolean;
		texts: string[];
	}[];
	return {
		confirm: () => {
			const btn = els.find((e) => e.tag === "button" && e.texts.includes("Übernehmen"));
			__fireEvent(btn as never, "click");
			return confirmed?.[0] ?? null;
		},
		rows: els.filter((e) => e.cls.startsWith("lukit-intake-select-item")),
		texts: els.filter((e) => e.cls === "lukit-intake-select-text"),
		checkboxes: els.filter((e) => e.type === "checkbox"),
		source: els.find((e) => e.cls === "lukit-intake-select-source"),
	};
}

describe("IntakeSelectModal", () => {
	it("offers every line of the group — items and their children — as an editable field", () => {
		const { rows, texts } = open();

		expect(rows).toHaveLength(5);
		expect(texts.map((t) => t.value)).toEqual([
			"Max:",
			"Angebot prüfen",
			"Termin vereinbaren",
			"Petra Schneider:",
			"Zahlen liefern",
		]);
	});

	it("confirms the edited text and re-emits a child with its original indent", () => {
		const modal = open();
		modal.texts[1].value = "Angebot prüfen, 15.09.2026";

		expect(modal.confirm()?.taken).toEqual([
			{ text: "Max:", children: ["    - Angebot prüfen, 15.09.2026", "    - Termin vereinbaren"] },
			{ text: "Petra Schneider:", children: ["    - Zahlen liefern"] },
		]);
	});

	it("keeps an unticked child behind — with its parent, when the parent leaves", () => {
		const modal = open();
		modal.checkboxes[2].checked = false;

		const result = modal.confirm();
		expect(result?.taken[0]).toEqual({ text: "Max:", children: ["    - Angebot prüfen"] });
		// "Termin vereinbaren" lost its parent, so it stays as a line of its own.
		expect(result?.keptOwn).toEqual([{ text: "Termin vereinbaren", children: [] }]);
	});

	it("keeps a whole block behind when the item and its children are unticked", () => {
		const modal = open();
		for (const i of [0, 1, 2]) modal.checkboxes[i].checked = false;

		const result = modal.confirm();
		expect(result?.keptOwn).toEqual([
			{ text: "Max:", children: ["    - Angebot prüfen", "    - Termin vereinbaren"] },
		]);
		expect(result?.taken).toEqual([{ text: "Petra Schneider:", children: ["    - Zahlen liefern"] }]);
	});

	it("keeps a foreign item in the foreign block, so Warte auf survives a partial pass", () => {
		const modal = open();
		modal.checkboxes[3].checked = false;
		modal.checkboxes[4].checked = false;

		const result = modal.confirm();
		expect(result?.keptOwn).toEqual([]);
		expect(result?.keptForeign).toEqual([
			{ text: "Petra Schneider:", children: ["    - Zahlen liefern"] },
		]);
	});

	it("moves a ticked child on its own when its parent stays behind", () => {
		const modal = open();
		modal.checkboxes[0].checked = false;

		const result = modal.confirm();
		expect(result?.taken).toContainEqual({ text: "Angebot prüfen", children: [] });
		expect(result?.keptOwn[0]).toEqual({ text: "Max:", children: [] });
	});

	it("deletes the line whose field was emptied — it goes neither up nor back", () => {
		const modal = open();
		modal.texts[1].value = "   ";

		const result = modal.confirm();
		expect(result?.taken).toEqual([
			{ text: "Max:", children: ["    - Termin vereinbaren"] },
			{ text: "Petra Schneider:", children: ["    - Zahlen liefern"] },
		]);
		expect(result?.keptOwn).toEqual([]);
	});

	it("deletes an emptied line even when it is ticked", () => {
		const modal = open();
		modal.texts[1].value = "";
		modal.checkboxes[1].checked = true;

		const result = modal.confirm();
		expect(result?.taken[0]).toEqual({ text: "Max:", children: ["    - Termin vereinbaren"] });
	});

	it("keeps the children of an emptied parent — each deciding for itself", () => {
		const modal = open();
		modal.texts[0].value = "";
		modal.checkboxes[2].checked = false;

		const result = modal.confirm();
		// The header is gone; its ticked child moved up on its own, the unticked
		// one stayed behind as a line of its own.
		expect(result?.taken).toEqual([
			{ text: "Angebot prüfen", children: [] },
			{ text: "Petra Schneider:", children: ["    - Zahlen liefern"] },
		]);
		expect(result?.keptOwn).toEqual([{ text: "Termin vereinbaren", children: [] }]);
	});

	it("empties the group when every field was emptied", () => {
		const modal = open();
		for (const field of modal.texts) field.value = "";

		const result = modal.confirm();
		expect(result?.taken).toEqual([]);
		expect(result?.keptOwn).toEqual([]);
		expect(result?.keptForeign).toEqual([]);
	});

	it("ticking the discard box yields discard: true", () => {
		const modal = open();
		// The discard box is the group's last control, after its five item rows.
		modal.checkboxes[5].checked = true;

		const result = modal.confirm();
		expect(result?.discard).toBe(true);
	});

	it("renders the group's line as its section header", () => {
		const { source } = open();

		expect(source?.texts).toContain(GROUP.line);
	});
});
