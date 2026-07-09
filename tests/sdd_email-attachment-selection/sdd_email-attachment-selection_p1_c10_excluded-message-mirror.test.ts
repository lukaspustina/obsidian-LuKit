import { describe, expect, it } from "vitest";
import { __fireEvent } from "../helpers/obsidian-stub";
import {
	EmailPreviewModal,
	type PreviewMessage,
	type PreviewMessageResult,
} from "../../src/features/email-filing/email-preview-modal";

function allEls(el: any): any[] {
	const out: any[] = [el];
	for (const child of el.children ?? []) out.push(...allEls(child));
	return out;
}

describe("SDD email-attachment-selection p1 c10", () => {
	it("keeps attachmentsIncluded mirroring checkbox states when the message itself is excluded", () => {
		const messages: PreviewMessage[] = [
			{
				header: "01.07.2026 · Max Mustermann · eingehend",
				body: "Hallo, bitte Vertrag prüfen.",
				attachments: [
					{ name: "vertrag.pdf", preselected: true },
					{ name: "logo.png", preselected: false },
				],
			},
		];

		let captured: PreviewMessageResult[] | undefined;
		const modal = new EmailPreviewModal(
			{} as never,
			"Ziel",
			"sub",
			messages,
			(results) => {
				captured = results;
			},
			() => undefined,
		);
		modal.onOpen();

		const els = allEls(modal.contentEl);
		const checkboxes = els.filter((el) => el.tag === "input" && el.type === "checkbox");
		expect(checkboxes.length).toBe(3);

		// First checkbox per message is the include checkbox; deselect it.
		const [includeCheckbox] = checkboxes;
		includeCheckbox.checked = false;
		__fireEvent(includeCheckbox, "change");

		const confirmBtn = els.find(
			(el) => el.tag === "button" && (el.texts ?? []).includes("Ablegen"),
		);
		expect(confirmBtn).toBeDefined();

		__fireEvent(confirmBtn, "click");

		expect(captured).toBeDefined();
		expect(captured?.[0].included).toBe(false);
		// The modal itself never filters attachments by message inclusion —
		// attachmentsIncluded must still mirror the raw checkbox states [true, false].
		expect(captured?.[0].attachmentsIncluded).toEqual([true, false]);
	});
});
