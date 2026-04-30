import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { TextDateModal } from "../../src/shared/modals/text-date-modal";
import { TextInputModal } from "../../src/shared/modals/text-input-modal";
import { AddSectionModal } from "../../src/features/vorgang/add-section-modal";

// FakeEl records what the modal under test appends to its contentEl, so tests
// can locate the inline error <p class="lukit-modal-error"> without a real DOM.
type FakeEl = {
	cls?: string;
	value: string;
	textContent: string;
	style: { display: string };
	children: FakeEl[];
	addEventListener: (...args: unknown[]) => void;
	addClass: (...args: unknown[]) => void;
	createEl: (tag: string, attrs?: { type?: string; placeholder?: string; cls?: string; text?: string }) => FakeEl;
	empty: () => void;
};

function makeEl(_tag: string, attrs?: { type?: string; placeholder?: string; cls?: string; text?: string }): FakeEl {
	const el: FakeEl = {
		cls: attrs?.cls,
		value: "",
		textContent: attrs?.text ?? "",
		style: { display: "" },
		children: [],
		addEventListener: vi.fn(),
		addClass: vi.fn(),
		createEl: (childTag, childAttrs) => {
			const child = makeEl(childTag, childAttrs);
			el.children.push(child);
			return child;
		},
		empty: () => { el.children = []; },
	};
	return el;
}

function findError(contentEl: FakeEl): FakeEl | undefined {
	return contentEl.children.find((c) => c.cls === "lukit-modal-error");
}

const app = {} as App;

interface TextDateModalInternals {
	contentEl: FakeEl;
	close: () => void;
	textInputEl: { value: string };
	dateInputEl: { value: string };
	submit: () => void;
}

interface TextInputModalInternals {
	contentEl: FakeEl;
	close: () => void;
	inputEl: { value: string };
	submit: () => void;
}

interface AddSectionModalInternals {
	contentEl: FakeEl;
	close: () => void;
	nameInputEl: { value: string };
	dateInputEl: { value: string };
	submit: () => void;
}

describe("TextDateModal validation", () => {
	it("stays open on empty text and shows 'Text required.'", () => {
		const onSubmit = vi.fn();
		const modal = new TextDateModal(app, "Note text", "de", onSubmit);
		const m = modal as unknown as TextDateModalInternals;
		m.contentEl = makeEl("div");
		modal.onOpen();
		m.close = vi.fn();
		m.textInputEl.value = "";
		m.dateInputEl.value = "06.02.2026";

		m.submit();

		expect(onSubmit).not.toHaveBeenCalled();
		expect(findError(m.contentEl)?.textContent).toBe("Text required.");
		expect(findError(m.contentEl)?.style.display).toBe("block");
		expect(m.close).not.toHaveBeenCalled();
	});

	it("stays open on unparseable date and shows locale-specific hint", () => {
		const onSubmit = vi.fn();
		const modal = new TextDateModal(app, "Note text", "de", onSubmit);
		const m = modal as unknown as TextDateModalInternals;
		m.contentEl = makeEl("div");
		modal.onOpen();
		m.close = vi.fn();
		m.textInputEl.value = "Some text";
		m.dateInputEl.value = "31/02/2026";

		m.submit();

		expect(onSubmit).not.toHaveBeenCalled();
		const err = findError(m.contentEl);
		expect(err?.textContent).toContain("Invalid date");
		expect(err?.textContent).toContain("DD.MM.YYYY");
		expect(err?.style.display).toBe("block");
	});

	it("calls resolver and closes on valid input", () => {
		const onSubmit = vi.fn();
		const modal = new TextDateModal(app, "Note text", "de", onSubmit);
		const m = modal as unknown as TextDateModalInternals;
		m.contentEl = makeEl("div");
		modal.onOpen();
		m.close = vi.fn();
		m.textInputEl.value = "Buy milk";
		m.dateInputEl.value = "06.02.2026";

		m.submit();

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(m.close).toHaveBeenCalledOnce();
	});
});

describe("TextInputModal validation", () => {
	it("stays open on empty text and shows 'Text required.'", () => {
		const onSubmit = vi.fn();
		const modal = new TextInputModal(app, "Note name", onSubmit);
		const m = modal as unknown as TextInputModalInternals;
		m.contentEl = makeEl("div");
		modal.onOpen();
		m.close = vi.fn();
		m.inputEl.value = "";

		m.submit();

		expect(onSubmit).not.toHaveBeenCalled();
		expect(findError(m.contentEl)?.textContent).toBe("Text required.");
		expect(findError(m.contentEl)?.style.display).toBe("block");
		expect(m.close).not.toHaveBeenCalled();
	});
});

describe("AddSectionModal validation", () => {
	it("stays open on unparseable date with locale-specific hint", () => {
		const onSubmit = vi.fn();
		const modal = new AddSectionModal(app, "iso", onSubmit);
		const m = modal as unknown as AddSectionModalInternals;
		m.contentEl = makeEl("div");
		modal.onOpen();
		m.close = vi.fn();
		m.nameInputEl.value = "Section name";
		m.dateInputEl.value = "13.02.2026"; // wrong format for iso

		m.submit();

		expect(onSubmit).not.toHaveBeenCalled();
		const err = findError(m.contentEl);
		expect(err?.textContent).toContain("Invalid date");
		expect(err?.textContent).toContain("YYYY-MM-DD");
	});

	it("does NOT fall back to new Date() when date is invalid", () => {
		const onSubmit = vi.fn();
		const modal = new AddSectionModal(app, "de", onSubmit);
		const m = modal as unknown as AddSectionModalInternals;
		m.contentEl = makeEl("div");
		modal.onOpen();
		m.close = vi.fn();
		m.nameInputEl.value = "Section";
		m.dateInputEl.value = "garbage";

		m.submit();

		expect(onSubmit).not.toHaveBeenCalled();
	});
});
