import { App, Modal } from "obsidian";
import type { IntakeGroup, IntakeItem } from "../vorgang/intake-engine";

/** What the picker decided about one group of the stop. */
export interface IntakeGroupOutcome {
	// Identifies the group in the note — IntakeGroup's own identity field, the
	// one takeOverGroup/dropGroup/snoozeGroup resolve by. Not the rendered
	// line: two groups filed the same day from sources with the same generated
	// section name produce byte-identical `line`s.
	lineIndex: number;
	// Wins over everything else in the group: taken/keptOwn/keptForeign and due
	// are ignored when it is true.
	discard: boolean;
	// A due date for the group's parent line as an ISO string; null means no
	// change. Set-only: there is no affordance to clear a group's date, so a
	// blank field can only ever mean "leave it as it stands".
	due: string | null;
	taken: IntakeItem[];
	keptOwn: IntakeItem[];
	keptForeign: IntakeItem[];
}

export interface IntakeSelectModalOptions {
	// One section per group, in the stop's group order.
	groups: IntakeGroup[];
	onConfirm: (outcomes: IntakeGroupOutcome[]) => void;
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
}

interface GroupSection {
	group: IntakeGroup;
	items: { itemRow: Row; childRows: Row[] }[];
	ownCount: number;
	discardBox: HTMLInputElement;
	dueInput: HTMLInputElement;
}

// One editable row per line of every group the stop carries — items and the
// lines nested under them — each with its own checkbox. The
// text is editable, so wording can be fixed on the way out, and emptying a
// field deletes that line. Rows start UNTICKED — a confirm moves only what was
// ticked, so setting a date or a discard on one group leaves its siblings
// alone; the section header's "alle" box ticks a whole group at once. A ticked
// line leaves the group, an unticked one stays behind — independently of its neighbours: a ticked child under an
// unticked parent moves on its own, an unticked child under a ticked parent
// stays as a line of its own. Per group there is one control that discards it
// whole. The walk returns to the stop as long as anything remains, so a note's
// intake can be worked off in several passes.
export class IntakeSelectModal extends Modal {
	private readonly options: IntakeSelectModalOptions;
	private confirmed = false;

	constructor(app: App, options: IntakeSelectModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("lukit-intake-select-modal");
		contentEl.empty();
		contentEl.createEl("h3", { text: "Punkte übernehmen" });
		contentEl.createEl("p", {
			text: "Angehakt wandert hoch, alles andere bleibt in Unsortiert — „alle“ hakt eine ganze Gruppe an. Ein leeres Feld löscht die Zeile, ein Datum verschiebt die Gruppe, „Gruppe verwerfen“ löscht sie.",
			cls: "lukit-intake-select-hint",
		});

		// One scroll container around all the sections, not one per group: the
		// lists stack, so capping each of them separately pushed the buttons off
		// screen on a note with several groups.
		const groupsEl = contentEl.createEl("div", { cls: "lukit-intake-select-groups" });
		const sections = this.options.groups.map((group) => this.renderGroupSection(groupsEl, group));

		const submit = (): void => {
			this.confirmed = true;
			const outcomes = sections.map((section) => this.outcomeOf(section));
			this.close();
			this.options.onConfirm(outcomes);
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

	private renderGroupSection(contentEl: HTMLElement, group: IntakeGroup): GroupSection {
		// The parent line heads its section — with several groups on one note,
		// it is the only thing telling their items apart. Its "alle" box keeps
		// "take this whole group over" at one gesture now that rows start empty.
		const header = contentEl.createEl("div", { cls: "lukit-intake-select-header" });
		const allBox = header.createEl("input");
		allBox.type = "checkbox";
		allBox.checked = false;
		header.createEl("label", { text: "alle" });
		header.createEl("span", { text: group.line, cls: "lukit-intake-select-source" });

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

		// After the rows, so the checkbox order stays "one per line" — the
		// group's own controls come last, not first.
		//
		// Blank by default, and blank means "leave the group's date alone": the
		// same native control NoteDateModal uses, so its value is an ISO date or
		// "". A group is deferred by typing one, never cleared by emptying the
		// field — clearing a group's date back to due-now is out of scope.
		const dueRow = contentEl.createEl("div", { cls: "lukit-intake-select-due" });
		dueRow.createEl("label", { text: "Verschieben auf" });
		const dueInput = dueRow.createEl("input", { cls: "lukit-intake-select-date" });
		dueInput.type = "date";
		dueInput.value = "";

		const discardRow = contentEl.createEl("div", { cls: "lukit-intake-select-discard" });
		const discardBox = discardRow.createEl("input");
		discardBox.type = "checkbox";
		discardBox.checked = false;
		discardRow.createEl("label", { text: "Gruppe verwerfen" });

		allBox.addEventListener("change", () => {
			for (const { itemRow, childRows } of items) {
				itemRow.checkbox.checked = allBox.checked;
				for (const child of childRows) child.checkbox.checked = allBox.checked;
			}
		});

		return { group, items, ownCount: group.ownItems.length, discardBox, dueInput };
	}

	private outcomeOf(section: GroupSection): IntakeGroupOutcome {
		const taken: IntakeItem[] = [];
		const keptOwn: IntakeItem[] = [];
		const keptForeign: IntakeItem[] = [];
		section.items.forEach(({ itemRow, childRows }, i) => {
			const kept = i < section.ownCount ? keptOwn : keptForeign;
			// An emptied field deletes its line, ticked or not — it goes
			// neither up nor back into the group.
			const live = childRows.filter((r) => valueOf(r) !== "");
			const takenChildren = live.filter((r) => r.checkbox.checked);
			const keptChildren = live.filter((r) => !r.checkbox.checked);
			const lines = (rows: Row[]) => rows.map((r) => r.prefix + valueOf(r));
			const text = valueOf(itemRow);
			if (text === "") {
				// The deleted line takes nothing with it: its children decide
				// for themselves, as they do whenever they lose their parent.
				for (const row of takenChildren) taken.push({ text: valueOf(row), children: [] });
				for (const row of keptChildren) kept.push({ text: valueOf(row), children: [] });
				return;
			}
			if (itemRow.checkbox.checked) {
				taken.push({ text, children: lines(takenChildren) });
				// An unticked child of a ticked item loses its parent, so it
				// stays behind as a line of its own rather than vanishing.
				for (const row of keptChildren) kept.push({ text: valueOf(row), children: [] });
				return;
			}
			kept.push({ text, children: lines(keptChildren) });
			// A ticked child of an unticked item moves on its own — usually
			// exactly what is wanted: the todo, not the person header above it.
			for (const row of takenChildren) taken.push({ text: valueOf(row), children: [] });
		});
		return {
			lineIndex: section.group.lineIndex,
			discard: section.discardBox.checked,
			due: section.dueInput.value === "" ? null : section.dueInput.value,
			taken,
			keptOwn,
			keptForeign,
		};
	}

	private renderRow(list: HTMLElement, prefix: string, text: string, isChild = false): Row {
		const row = list.createEl("div", {
			cls: isChild ? "lukit-intake-select-item lukit-intake-select-child" : "lukit-intake-select-item",
		});
		const checkbox = row.createEl("input");
		checkbox.type = "checkbox";
		// Unticked by default. Preselecting was right while ⌘S showed one group
		// and confirming meant "take it over"; over several groups it made every
		// confirm take the whole note's intake — a typed date then reached a
		// group that had already been removed and was dropped.
		checkbox.checked = false;
		const input = row.createEl("input", { cls: "lukit-intake-select-text" });
		input.type = "text";
		input.value = text;
		return { checkbox, input, prefix };
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.confirmed) {
			this.options.onCancel();
		}
	}
}

// Emptying a field is how a single line is deleted: the caller drops every row
// whose text is blank, so nothing is written for it and nothing stays behind.
// The group's own discard box is the way to drop all of them at once.
function valueOf(row: Row): string {
	return row.input.value.trim();
}
