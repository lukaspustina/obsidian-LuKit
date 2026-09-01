import { App, Modal } from "obsidian";
import type { IntakeGroup, IntakeItem } from "../vorgang/intake-engine";

export interface IntakeSelectModalOptions {
	// The group whose items are offered for selection — all preselected.
	group: IntakeGroup;
	// The 0-based indices of the ticked items, own items first, then foreign —
	// exactly the order takeOverGroup expects.
	onConfirm: (selectedIndices: number[]) => void;
	// Dismissed (Esc or click-outside): nothing is written, the triage stop is
	// presented again unchanged.
	onCancel: () => void;
}

// One checkbox per item, all preselected. Confirming takes over the ticked
// items only; the group itself disappears either way — takeOverGroup decides
// that, not this dialog.
export class IntakeSelectModal extends Modal {
	private readonly options: IntakeSelectModalOptions;
	private confirmed = false;

	constructor(app: App, options: IntakeSelectModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		const { group } = this.options;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Punkte übernehmen" });
		contentEl.createEl("p", { text: group.line, cls: "lukit-intake-select-source" });

		const items: IntakeItem[] = [...group.ownItems, ...group.foreignItems];
		const checkboxes: HTMLInputElement[] = [];
		const list = contentEl.createEl("div", { cls: "lukit-intake-select" });
		for (const item of items) {
			const row = list.createEl("label", { cls: "lukit-intake-select-item" });
			const checkbox = row.createEl("input");
			checkbox.type = "checkbox";
			checkbox.checked = true;
			row.createEl("span", { text: ` ${item.text}` });
			checkboxes.push(checkbox);
		}

		const submit = (): void => {
			this.confirmed = true;
			const selected = checkboxes.flatMap((cb, i) => (cb.checked ? [i] : []));
			this.close();
			this.options.onConfirm(selected);
		};

		const buttons = contentEl.createEl("div", { cls: "lukit-intake-select-buttons" });
		const confirmBtn = buttons.createEl("button", { text: "Übernehmen", cls: "mod-cta" });
		confirmBtn.addEventListener("click", submit);
		const cancelBtn = buttons.createEl("button", { text: "Abbrechen" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		this.scope.register([], "Enter", (evt) => {
			evt.preventDefault();
			submit();
			return false;
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.confirmed) {
			this.options.onCancel();
		}
	}
}
