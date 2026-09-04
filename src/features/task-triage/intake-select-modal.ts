import { App, Modal } from "obsidian";
import type { IntakeGroup, IntakeTakeOverItem } from "../vorgang/intake-engine";

export interface IntakeSelectModalOptions {
	// The group whose lines are offered for selection — all preselected.
	group: IntakeGroup;
	// The ticked lines with their (possibly edited) text, own items first, then
	// foreign — exactly what takeOverGroup writes.
	onConfirm: (selection: IntakeTakeOverItem[]) => void;
	// Dismissed (Esc or click-outside): nothing is written, the triage stop is
	// presented again unchanged.
	onCancel: () => void;
}

// A child line keeps its relative indent and its bullet marker; only the text is
// editable, so the line is re-emitted as prefix + edited text.
function splitChildLine(line: string): { prefix: string; text: string } {
	const match = /^(\s*(?:[-*+] )?)(.*)$/.exec(line);
	return { prefix: match?.[1] ?? "", text: match?.[2] ?? line };
}

interface Row {
	checkbox: HTMLInputElement;
	input: HTMLInputElement;
	prefix: string;
	original: string;
}

// One editable row per line of the group — items and the lines nested under
// them — each with its own checkbox, all preselected. The text is editable so a
// due date can be appended before the item leaves the intake; an unticked item
// takes its children with it. The group itself disappears either way —
// takeOverGroup decides that, not this dialog.
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
		this.modalEl.addClass("lukit-intake-select-modal");
		contentEl.empty();
		contentEl.createEl("h3", { text: "Punkte übernehmen" });
		contentEl.createEl("p", { text: group.line, cls: "lukit-intake-select-source" });

		const list = contentEl.createEl("div", { cls: "lukit-intake-select" });
		const items = [...group.ownItems, ...group.foreignItems].map((item) => {
			const itemRow = this.renderRow(list, "", item.text);
			const childRows = item.children.map((child) => {
				const { prefix, text } = splitChildLine(child);
				return this.renderRow(list, prefix, text, true);
			});
			// Excluding an item dims its children with it: they cannot outlive
			// the line they hang under.
			itemRow.checkbox.addEventListener("change", () => {
				itemRow.input.disabled = !itemRow.checkbox.checked;
				for (const row of childRows) {
					row.checkbox.disabled = !itemRow.checkbox.checked;
					row.input.disabled = !itemRow.checkbox.checked;
				}
			});
			return { itemRow, childRows };
		});

		const submit = (): void => {
			this.confirmed = true;
			const selection = items.flatMap(({ itemRow, childRows }) => {
				if (!itemRow.checkbox.checked) return [];
				return [
					{
						text: valueOf(itemRow),
						children: childRows.filter((r) => r.checkbox.checked).map((r) => r.prefix + valueOf(r)),
					},
				];
			});
			this.close();
			this.options.onConfirm(selection);
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

	private renderRow(list: HTMLElement, prefix: string, text: string, isChild = false): Row {
		const row = list.createEl("div", {
			cls: isChild ? "lukit-intake-select-item lukit-intake-select-child" : "lukit-intake-select-item",
		});
		const checkbox = row.createEl("input");
		checkbox.type = "checkbox";
		checkbox.checked = true;
		const input = row.createEl("input", { cls: "lukit-intake-select-text" });
		input.type = "text";
		input.value = text;
		return { checkbox, input, prefix, original: text };
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.confirmed) {
			this.options.onCancel();
		}
	}
}

// An emptied field falls back to the original text — deleting the line is what
// the checkbox is for, and silently writing an empty bullet helps nobody.
function valueOf(row: Row): string {
	const typed = row.input.value.trim();
	return typed === "" ? row.original : typed;
}
