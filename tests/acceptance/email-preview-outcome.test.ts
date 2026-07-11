import { describe, it, expect, vi } from "vitest";
import { EmailPreviewModal } from "../../src/features/email-filing/email-preview-modal";
import type { PreviewMessage, PreviewMessageResult, PreviewOutcome } from "../../src/features/email-filing/email-preview-modal";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import { __fireEvent } from "../helpers/obsidian-stub";
import {
	createMockApp,
	createMockPlugin,
	createMockTFile,
	makeTestSettings,
	asLuKitPlugin,
} from "../helpers/obsidian-mocks";

const MESSAGES: PreviewMessage[] = [
	{ header: "01.07.2026 · Alice · eingehend", body: "Body", attachments: [] },
];

// Recursively collects all stub elements of the contentEl tree.
function allEls(el: unknown): Record<string, unknown>[] {
	const node = el as { children?: unknown[] };
	const out: Record<string, unknown>[] = [el as Record<string, unknown>];
	for (const child of node.children ?? []) out.push(...allEls(child));
	return out;
}

function openModal(
	sectionName: string,
	onConfirm: (results: PreviewMessageResult[], outcome: PreviewOutcome) => void,
) {
	const modal = new EmailPreviewModal({} as never, "Vorgang - X", "Betreff: Angebot", sectionName, MESSAGES, onConfirm, () => undefined);
	modal.onOpen();
	const els = allEls((modal as unknown as { contentEl: unknown }).contentEl);
	const buttons = els.filter((e) => e.tag === "button");
	const buttonByText = (text: string) =>
		buttons.find((b) => (b.texts as string[]).some((t) => t === text));
	const sectionInput = els.find((e) => e.tag === "input" && e.type !== "checkbox");
	return { modal, els, buttonByText, sectionInput };
}

describe("EmailPreviewModal section title + Ablegen und Öffnen (outcome contract)", () => {
	it("renders a text input prefilled with the section name and three buttons", () => {
		const { buttonByText, sectionInput } = openModal("E-Mail-Thread: Angebot", () => undefined);

		expect(sectionInput).toBeDefined();
		expect(sectionInput?.value).toBe("E-Mail-Thread: Angebot");
		expect(buttonByText("Ablegen")).toBeDefined();
		expect(buttonByText("Ablegen und Öffnen")).toBeDefined();
		expect(buttonByText("Abbrechen")).toBeDefined();
	});

	it("'Ablegen' confirms with openAfterFiling false and the unchanged section name", () => {
		const onConfirm = vi.fn();
		const { buttonByText } = openModal("E-Mail-Thread: Angebot", onConfirm);

		__fireEvent(buttonByText("Ablegen"), "click");

		expect(onConfirm).toHaveBeenCalledTimes(1);
		const outcome = onConfirm.mock.calls[0][1] as PreviewOutcome;
		expect(outcome.openAfterFiling).toBe(false);
		expect(outcome.sectionName).toBe("E-Mail-Thread: Angebot");
	});

	it("'Ablegen und Öffnen' confirms with openAfterFiling true and the edited section name", () => {
		const onConfirm = vi.fn();
		const { buttonByText, sectionInput } = openModal("E-Mail-Thread: Angebot", onConfirm);

		if (sectionInput) sectionInput.value = "Angebot Acme Q3";
		__fireEvent(buttonByText("Ablegen und Öffnen"), "click");

		expect(onConfirm).toHaveBeenCalledTimes(1);
		const outcome = onConfirm.mock.calls[0][1] as PreviewOutcome;
		expect(outcome.openAfterFiling).toBe(true);
		expect(outcome.sectionName).toBe("Angebot Acme Q3");
	});

	it("falls back to the original section name when the input is blank", () => {
		const onConfirm = vi.fn();
		const { buttonByText, sectionInput } = openModal("E-Mail-Thread: Angebot", onConfirm);

		if (sectionInput) sectionInput.value = "   ";
		__fireEvent(buttonByText("Ablegen"), "click");

		const outcome = onConfirm.mock.calls[0][1] as PreviewOutcome;
		expect(outcome.sectionName).toBe("E-Mail-Thread: Angebot");
	});
});

describe("EmailFilingFeature.openFiledNote", () => {
	it("opens the target note in the current window (getLeaf(false))", () => {
		const app = createMockApp();
		const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
		app.vault.register(vorgang, "# Inhalt\n");
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new EmailFilingFeature();
		feature.onload(asLuKitPlugin(plugin));

		(feature as unknown as { openFiledNote: (f: typeof vorgang) => void }).openFiledNote(vorgang);

		expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
		expect(app.workspace.openedFiles).toContain(vorgang);
	});
});
