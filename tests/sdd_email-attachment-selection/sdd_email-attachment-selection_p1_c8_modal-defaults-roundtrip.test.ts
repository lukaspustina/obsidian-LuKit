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

describe("SDD email-attachment-selection p1 c8", () => {
	it("keeps preselected attachment values in order when confirmed unchanged", () => {
		const messages: PreviewMessage[] = [
			{
				header: "01.07.2026 · Max Mustermann · eingehend",
				body: "Hallo, bitte Vertrag prüfen.",
				attachments: [
					{ name: "logo.png", preselected: false },
					{ name: "vertrag.pdf", preselected: true },
				],
			},
			{
				header: "02.07.2026 · Erika Beispiel · ausgehend",
				body: "Danke, hier die Antwort.",
				attachments: [
					{ name: "signatur.jpg", preselected: false },
					{ name: "angebot.pdf", preselected: true },
					{ name: "foto.jpg", preselected: true },
				],
			},
		];

		let captured: PreviewMessageResult[] | undefined;
		const modal = new EmailPreviewModal(
			{} as never,
			"Ziel",
			"sub",
			"E-Mail-Thread: Test",
			messages,
			(results) => {
				captured = results;
			},
			() => undefined,
		);
		modal.onOpen();

		const els = allEls(modal.contentEl);
		const confirmBtn = els.find(
			(el) => el.tag === "button" && (el.texts ?? []).includes("Ablegen"),
		);
		expect(confirmBtn).toBeDefined();

		__fireEvent(confirmBtn, "click");

		expect(captured).toBeDefined();
		expect(captured?.[0].attachmentsIncluded).toEqual([false, true]);
		expect(captured?.[1].attachmentsIncluded).toEqual([false, true, true]);
	});
});
