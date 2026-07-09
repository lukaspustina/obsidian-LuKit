import { describe, expect, it } from "vitest";
import { __fireEvent } from "../helpers/obsidian-stub";
import { EmailPreviewModal, type PreviewMessage } from "../../src/features/email-filing/email-preview-modal";

function allEls(el: any): any[] {
	const out: any[] = [el];
	for (const child of el.children ?? []) out.push(...allEls(child));
	return out;
}

describe("SDD email-attachment-selection p1 c9", () => {
	it("disables attachment checkboxes when the message checkbox is unchecked, re-enables with checked state preserved when re-checked", () => {
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

		const modal = new EmailPreviewModal(
			{} as never,
			"Ziel",
			"sub",
			messages,
			() => undefined,
			() => undefined,
		);
		modal.onOpen();

		const els = allEls(modal.contentEl);

		const header = els.find((el) => el.cls === "lukit-email-preview-header");
		expect(header).toBeDefined();
		const messageCheckbox = allEls(header).find((el) => el.tag === "input" && el.type === "checkbox");
		expect(messageCheckbox).toBeDefined();

		const attsContainer = els.find((el) => el.cls === "lukit-email-preview-atts");
		expect(attsContainer).toBeDefined();
		const attachmentCheckboxes = allEls(attsContainer).filter(
			(el) => el.tag === "input" && el.type === "checkbox",
		);
		expect(attachmentCheckboxes.length).toBe(2);

		// Distinct checked states to verify they survive the disable/enable cycle.
		attachmentCheckboxes[0].checked = true;
		attachmentCheckboxes[1].checked = false;

		messageCheckbox.checked = false;
		__fireEvent(messageCheckbox, "change");

		for (const cb of attachmentCheckboxes) {
			expect(cb.disabled).toBe(true);
		}

		messageCheckbox.checked = true;
		__fireEvent(messageCheckbox, "change");

		expect(attachmentCheckboxes[0].disabled).toBe(false);
		expect(attachmentCheckboxes[1].disabled).toBe(false);
		expect(attachmentCheckboxes[0].checked).toBe(true);
		expect(attachmentCheckboxes[1].checked).toBe(false);
	});
});
