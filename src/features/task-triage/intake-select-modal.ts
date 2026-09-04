import { App, Modal } from "obsidian";
import type { IntakeGroup, IntakeItem, IntakeTakeOver } from "../vorgang/intake-engine";

export interface IntakeSelectModalOptions {
	// The group whose lines are offered for selection — all preselected.
	group: IntakeGroup;
	// What leaves the group and what stays behind, both with their (possibly
	// edited) text — exactly what takeOverGroup writes.
	onConfirm: (selection: IntakeTakeOver) => void;
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
// them — each with its own checkbox, all preselected. The text is editable, so
// wording can be fixed on the way out. A ticked line leaves the group, an
// unticked one stays behind — independently of its neighbours: a ticked child
// under an unticked parent moves on its own, an unticked child under a ticked
// parent stays as a line of its own. The walk returns to the stop as long as
// anything remains, so a group can be worked off in several passes.
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
		// Every line decides for itself. Coupling a child to its parent would
		// block the common case: taking the todos out from under a person header
		// and leaving the header behind.
		const items = [...group.ownItems, ...group.foreignItems].map((item) => ({
			itemRow: this.renderRow(list, "", item.text),
			childRows: item.children.map((child) => {
				const { prefix, text } = splitChildLine(child);
				return this.renderRow(list, prefix, text, true);
			}),
		}));

		const ownCount = group.ownItems.length;
		const submit = (): void => {
			this.confirmed = true;
			const taken: IntakeItem[] = [];
			const keptOwn: IntakeItem[] = [];
			const keptForeign: IntakeItem[] = [];
			items.forEach(({ itemRow, childRows }, i) => {
				const kept = i < ownCount ? keptOwn : keptForeign;
				const takenChildren = childRows.filter((r) => r.checkbox.checked);
				const keptChildren = childRows.filter((r) => !r.checkbox.checked);
				const lines = (rows: Row[]) => rows.map((r) => r.prefix + valueOf(r));
				if (itemRow.checkbox.checked) {
					taken.push({ text: valueOf(itemRow), children: lines(takenChildren) });
					// An unticked child of a ticked item loses its parent, so it
					// stays behind as a line of its own rather than vanishing.
					for (const row of keptChildren) kept.push({ text: valueOf(row), children: [] });
					return;
				}
				kept.push({ text: valueOf(itemRow), children: lines(keptChildren) });
				// A ticked child of an unticked item moves on its own — usually
				// exactly what is wanted: the todo, not the person header above it.
				for (const row of takenChildren) taken.push({ text: valueOf(row), children: [] });
			});
			this.close();
			this.options.onConfirm({ taken, keptOwn, keptForeign });
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
