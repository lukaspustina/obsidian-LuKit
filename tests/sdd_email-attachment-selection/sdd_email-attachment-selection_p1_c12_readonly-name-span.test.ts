import { describe, it, expect } from "vitest";
import { EmailPreviewModal, type PreviewMessage } from "../../src/features/email-filing/email-preview-modal";

// Recursively collects all stub elements (from tests/helpers/obsidian-stub.ts's
// __stubEl tree) matching `predicate`, depth-first.
function collectAll(el: any, predicate: (el: any) => boolean, out: any[] = []): any[] {
	if (predicate(el)) out.push(el);
	for (const child of el.children ?? []) collectAll(child, predicate, out);
	return out;
}

describe("SDD email-attachment-selection p1 c12", () => {
	it("renders an attachment row with a checkbox and a read-only name span, no editable input", () => {
		const messages = [
			{
				header: "Mo, 01.01.2026 · Max Mustermann · eingehend",
				body: "Testinhalt",
				attachments: [{ name: "rechnung.pdf", preselected: true }],
			} as unknown as PreviewMessage,
		];

		const modal = new EmailPreviewModal(
			{} as never,
			"Zieltitel",
			"Untertitel",
			"E-Mail-Thread: Test",
			messages,
			() => undefined,
			() => undefined,
		);
		modal.onOpen();

		const attsContainers = collectAll(modal.contentEl, (el) => el.cls === "lukit-email-preview-atts");
		expect(attsContainers.length).toBeGreaterThan(0);

		const attRows = attsContainers.flatMap((c) =>
			collectAll(c, (el) => el.cls === "lukit-email-preview-attachment"),
		);
		expect(attRows.length).toBeGreaterThan(0);

		const row = attRows[0];

		const checkboxEls = collectAll(row, (el) => el.type === "checkbox");
		expect(checkboxEls.length).toBe(1);

		const spanEls = collectAll(row, (el) => el.tag === "span");
		const spanTexts = spanEls.flatMap((s) => s.texts as string[]);
		expect(spanTexts.some((t) => t.includes("rechnung.pdf"))).toBe(true);

		const inputEls = collectAll(row, (el) => el.tag === "input");
		expect(inputEls.length).toBe(1);
		expect(inputEls[0].type).toBe("checkbox");

		const textareaEls = collectAll(row, (el) => el.tag === "textarea");
		expect(textareaEls.length).toBe(0);
	});
});
