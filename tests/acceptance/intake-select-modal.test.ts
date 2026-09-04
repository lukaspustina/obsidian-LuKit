import { describe, it, expect } from "vitest";
import { IntakeSelectModal } from "../../src/features/task-triage/intake-select-modal";
import type { IntakeGroup, IntakeTakeOverItem } from "../../src/features/vorgang/intake-engine";
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
	let confirmed: IntakeTakeOverItem[] | null = null;
	const modal = new IntakeSelectModal(createMockApp({}) as never, {
		group: GROUP,
		onConfirm: (selection) => {
			confirmed = selection;
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
			return confirmed;
		},
		rows: els.filter((e) => e.cls.startsWith("lukit-intake-select-item")),
		texts: els.filter((e) => e.cls === "lukit-intake-select-text"),
		checkboxes: els.filter((e) => e.type === "checkbox"),
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

		expect(modal.confirm()).toEqual([
			{ text: "Max:", children: ["    - Angebot prüfen, 15.09.2026", "    - Termin vereinbaren"] },
			{ text: "Petra Schneider:", children: ["    - Zahlen liefern"] },
		]);
	});

	it("drops an unticked child but keeps its siblings", () => {
		const modal = open();
		modal.checkboxes[2].checked = false;

		expect(modal.confirm()?.[0]).toEqual({ text: "Max:", children: ["    - Angebot prüfen"] });
	});

	it("drops an unticked item together with its children", () => {
		const modal = open();
		modal.checkboxes[0].checked = false;
		__fireEvent(modal.checkboxes[0] as never, "change");

		expect(modal.confirm()).toEqual([
			{ text: "Petra Schneider:", children: ["    - Zahlen liefern"] },
		]);
	});

	it("falls back to the original text when a field was emptied", () => {
		const modal = open();
		modal.texts[0].value = "   ";

		expect(modal.confirm()?.[0].text).toBe("Max:");
	});
});
