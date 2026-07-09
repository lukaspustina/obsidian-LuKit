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

describe("SDD email-attachment-selection p1 c11", () => {
	it("renders no attachment section and reports [] for a message without attachments", () => {
		const messages: PreviewMessage[] = [
			{
				header: "01.07.2026 · Max Mustermann · eingehend",
				body: "Hallo, keine Anhänge hier.",
				attachments: [],
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
		const attsSection = els.find((el) => el.cls === "lukit-email-preview-atts");
		expect(attsSection).toBeUndefined();

		const confirmBtn = els.find(
			(el) => el.tag === "button" && (el.texts ?? []).includes("Ablegen"),
		);
		expect(confirmBtn).toBeDefined();

		__fireEvent(confirmBtn, "click");

		expect(captured).toBeDefined();
		expect(captured?.[0].attachmentsIncluded).toEqual([]);
	});
});
