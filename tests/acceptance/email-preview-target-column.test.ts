import { describe, it, expect } from "vitest";
import { EmailPreviewModal, type PreviewMessage } from "../../src/features/email-filing/email-preview-modal";
import { createMockApp } from "../helpers/obsidian-mocks";

const MESSAGES: PreviewMessage[] = [
	{ header: "01.09.2026 — Max Mustermann (eingegangen)", body: "Hallo,", attachments: [] },
];

function openModal(target?: { preview: string; path: string }) {
	const modal = new EmailPreviewModal(
		createMockApp({}) as never,
		"Vorgang - A",
		"Untertitel",
		"E-Mail-Thread: Test",
		MESSAGES,
		() => undefined,
		() => undefined,
		target,
	);
	modal.onOpen();
	return modal;
}

function allEls(el: { children?: unknown[] }): { cls: string; children: unknown[] }[] {
	const self = el as { cls: string; children: unknown[] };
	const out = [self];
	for (const child of (el.children ?? []) as { children?: unknown[] }[]) out.push(...allEls(child));
	return out;
}

describe("EmailPreviewModal target column", () => {
	it("renders the target note into a .markdown-rendered container", () => {
		const modal = openModal({ preview: "# Fakten und Pointer\n- Etwas", path: "Vorgänge/Vorgang - A.md" });
		const els = allEls((modal as unknown as { contentEl: { children: unknown[] } }).contentEl);

		const column = els.find((e) => e.cls === "lukit-email-preview-target");
		expect(column).toBeDefined();
		// Obsidian scopes markdown typography to this class; without it the
		// rendered note reads like raw markup.
		expect(allEls(column as never).some((e) => e.cls === "markdown-rendered")).toBe(true);
	});

	it("omits the column and marks the body single-column when no target was read", () => {
		const modal = openModal(undefined);
		const els = allEls((modal as unknown as { contentEl: { children: unknown[] } }).contentEl);
		expect(els.some((e) => e.cls === "lukit-email-preview-target")).toBe(false);
	});
});
