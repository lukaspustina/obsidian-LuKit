import { describe, it, expect, vi } from "vitest";
import { TextDateModal } from "../../src/shared/modals/text-date-modal";
import { TextInputModal } from "../../src/shared/modals/text-input-modal";
import { AddSectionModal } from "../../src/features/vorgang/add-section-modal";

// Builds an HTMLElement-like contentEl that records what's appended so tests
// can introspect modal state without a real DOM.
type FakeEl = {
	tag: string;
	cls?: string;
	type?: string;
	placeholder?: string;
	value: string;
	textContent: string;
	style: { display: string };
	children: FakeEl[];
	addEventListener: (..._args: unknown[]) => void;
	addClass: (..._args: unknown[]) => void;
	appendText: (..._args: unknown[]) => void;
	createEl: (tag: string, attrs?: { type?: string; placeholder?: string; cls?: string; text?: string }) => FakeEl;
	empty: () => void;
};

function makeEl(tag: string, attrs?: { type?: string; placeholder?: string; cls?: string; text?: string }): FakeEl {
	const el: FakeEl = {
		tag,
		cls: attrs?.cls,
		type: attrs?.type,
		placeholder: attrs?.placeholder,
		value: "",
		textContent: attrs?.text ?? "",
		style: { display: "" },
		children: [],
		addEventListener: vi.fn(),
		addClass: vi.fn(),
		appendText: vi.fn((_text: string) => undefined),
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

describe("TextDateModal validation", () => {
	it("stays open on empty text and shows 'Text required.'", () => {
		const onSubmit = vi.fn();
		const modal = new TextDateModal({} as unknown as Parameters<typeof TextDateModal["constructor"]>[0], "Note text", "de", onSubmit);
		(modal as unknown as { contentEl: FakeEl }).contentEl = makeEl("div");
		modal.onOpen();
		(modal as unknown as { close: () => void }).close = vi.fn();
		(modal as unknown as { textInputEl: { value: string } }).textInputEl.value = "";
		(modal as unknown as { dateInputEl: { value: string } }).dateInputEl.value = "06.02.2026";

		// Trigger submit via the private method.
		(modal as unknown as { submit: () => void })["submit"]?.();
		// If submit is private, we test the side-effect path: simulate by calling submit explicitly.

		const errorEl = findError((modal as unknown as { contentEl: FakeEl }).contentEl);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(errorEl?.textContent).toBe("Text required.");
		expect(errorEl?.style.display).toBe("block");
		expect((modal as unknown as { close: () => void }).close).not.toHaveBeenCalled();
	});

	it("stays open on unparseable date and shows locale-specific hint", () => {
		const onSubmit = vi.fn();
		const modal = new TextDateModal({} as unknown as Parameters<typeof TextDateModal["constructor"]>[0], "Note text", "de", onSubmit);
		(modal as unknown as { contentEl: FakeEl }).contentEl = makeEl("div");
		modal.onOpen();
		(modal as unknown as { close: () => void }).close = vi.fn();
		(modal as unknown as { textInputEl: { value: string } }).textInputEl.value = "Some text";
		(modal as unknown as { dateInputEl: { value: string } }).dateInputEl.value = "31/02/2026";

		(modal as unknown as { submit: () => void })["submit"]?.();

		const errorEl = findError((modal as unknown as { contentEl: FakeEl }).contentEl);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(errorEl?.textContent).toContain("Invalid date");
		expect(errorEl?.textContent).toContain("DD.MM.YYYY");
		expect(errorEl?.style.display).toBe("block");
	});

	it("calls resolver and closes on valid input", () => {
		const onSubmit = vi.fn();
		const modal = new TextDateModal({} as unknown as Parameters<typeof TextDateModal["constructor"]>[0], "Note text", "de", onSubmit);
		(modal as unknown as { contentEl: FakeEl }).contentEl = makeEl("div");
		modal.onOpen();
		(modal as unknown as { close: () => void }).close = vi.fn();
		(modal as unknown as { textInputEl: { value: string } }).textInputEl.value = "Buy milk";
		(modal as unknown as { dateInputEl: { value: string } }).dateInputEl.value = "06.02.2026";

		(modal as unknown as { submit: () => void })["submit"]?.();

		expect(onSubmit).toHaveBeenCalledOnce();
		expect((modal as unknown as { close: () => void }).close).toHaveBeenCalledOnce();
	});
});

describe("TextInputModal validation", () => {
	it("stays open on empty text and shows 'Text required.'", () => {
		const onSubmit = vi.fn();
		const modal = new TextInputModal({} as unknown as Parameters<typeof TextInputModal["constructor"]>[0], "Note name", onSubmit);
		(modal as unknown as { contentEl: FakeEl }).contentEl = makeEl("div");
		modal.onOpen();
		(modal as unknown as { close: () => void }).close = vi.fn();
		(modal as unknown as { inputEl: { value: string } }).inputEl.value = "";

		(modal as unknown as { submit: () => void })["submit"]?.();

		const errorEl = findError((modal as unknown as { contentEl: FakeEl }).contentEl);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(errorEl?.textContent).toBe("Text required.");
		expect(errorEl?.style.display).toBe("block");
		expect((modal as unknown as { close: () => void }).close).not.toHaveBeenCalled();
	});
});

describe("AddSectionModal validation", () => {
	it("stays open on unparseable date with locale-specific hint", () => {
		const onSubmit = vi.fn();
		const modal = new AddSectionModal({} as unknown as Parameters<typeof AddSectionModal["constructor"]>[0], "iso", onSubmit);
		(modal as unknown as { contentEl: FakeEl }).contentEl = makeEl("div");
		modal.onOpen();
		(modal as unknown as { close: () => void }).close = vi.fn();
		(modal as unknown as { nameInputEl: { value: string } }).nameInputEl.value = "Section name";
		(modal as unknown as { dateInputEl: { value: string } }).dateInputEl.value = "13.02.2026"; // wrong format for iso

		(modal as unknown as { submit: () => void })["submit"]?.();

		const errorEl = findError((modal as unknown as { contentEl: FakeEl }).contentEl);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(errorEl?.textContent).toContain("Invalid date");
		expect(errorEl?.textContent).toContain("YYYY-MM-DD");
	});

	it("does NOT fall back to new Date() when date is invalid", () => {
		const onSubmit = vi.fn();
		const modal = new AddSectionModal({} as unknown as Parameters<typeof AddSectionModal["constructor"]>[0], "de", onSubmit);
		(modal as unknown as { contentEl: FakeEl }).contentEl = makeEl("div");
		modal.onOpen();
		(modal as unknown as { close: () => void }).close = vi.fn();
		(modal as unknown as { nameInputEl: { value: string } }).nameInputEl.value = "Section";
		(modal as unknown as { dateInputEl: { value: string } }).dateInputEl.value = "garbage";

		(modal as unknown as { submit: () => void })["submit"]?.();

		expect(onSubmit).not.toHaveBeenCalled();
	});
});
