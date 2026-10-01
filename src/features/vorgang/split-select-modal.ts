import { App, Modal } from "obsidian";
import type { SplitParts, SplitSelection } from "./vorgang-engine";

export interface SplitSelectModalOptions {
	sourceBasename: string;
	parts: SplitParts;
	onConfirm: (selection: SplitSelection) => void;
}

interface Choice {
	lineIndex: number;
	checkbox: HTMLInputElement;
}

// Picks the facts and h5 sections a split moves. Nothing is ticked to begin
// with and "Weiter" stays disabled until something is, so a confirm can never
// be an empty split. Dismissal writes nothing.
export class SplitSelectModal extends Modal {
	private readonly options: SplitSelectModalOptions;

	constructor(app: App, options: SplitSelectModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("lukit-split-select-modal");
		contentEl.empty();
		contentEl.createEl("h3", { text: `Teile aus „${this.options.sourceBasename}“ verschieben` });

		const list = contentEl.createEl("div", { cls: "lukit-split-select-list" });
		const facts = this.renderBlock(
			list,
			"Fakten",
			this.options.parts.facts.map((f) => ({ lineIndex: f.lineIndex, label: f.lines[0].replace(/^[-*+] /, "") })),
		);
		const sections = this.renderBlock(
			list,
			"Abschnitte",
			this.options.parts.sections.map((s) => ({ lineIndex: s.lineIndex, label: s.headingText })),
		);

		const ticked = (choices: Choice[]): number[] => choices.filter((c) => c.checkbox.checked).map((c) => c.lineIndex);
		const buttons = contentEl.createEl("div", { cls: "lukit-split-select-buttons" });
		const confirmBtn = buttons.createEl("button", { text: "Weiter", cls: "mod-cta" });
		confirmBtn.disabled = true;
		const submit = (): void => {
			const selection = { facts: ticked(facts), sections: ticked(sections) };
			if (selection.facts.length === 0 && selection.sections.length === 0) return;
			this.close();
			this.options.onConfirm(selection);
		};
		confirmBtn.addEventListener("click", submit);
		buttons.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => this.close());

		for (const choice of [...facts, ...sections]) {
			choice.checkbox.addEventListener("change", () => {
				confirmBtn.disabled = ticked(facts).length === 0 && ticked(sections).length === 0;
			});
		}
		this.scope.register([], "Enter", (evt) => {
			evt.preventDefault();
			submit();
			return false;
		});
	}

	private renderBlock(parent: HTMLElement, title: string, rows: { lineIndex: number; label: string }[]): Choice[] {
		if (rows.length === 0) return [];
		parent.createEl("h4", { text: title });
		return rows.map(({ lineIndex, label }) => {
			const row = parent.createEl("label", { cls: "lukit-split-select-item" });
			const checkbox = row.createEl("input");
			checkbox.type = "checkbox";
			checkbox.checked = false;
			row.createEl("span", { text: label });
			return { lineIndex, checkbox };
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
