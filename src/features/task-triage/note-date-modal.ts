import { App, Modal } from "obsidian";

/** Both of a task note's dates, ISO or "" for absent/cleared. */
export interface NoteDates {
	due: string;
	scheduled: string;
}

// Fällig and Geplant in one dialog: at an intake stop both are usually set in
// the same breath, and two single-field prompts would mean two round trips.
// Distinct from TaskTriageDateModal, which snoozes one date of one stop.
export class NoteDateModal extends Modal {
	private readonly noteName: string;
	private readonly initial: NoteDates;
	private readonly onSubmit: (dates: NoteDates) => void;
	private readonly onCancel: () => void;
	private submitted = false;
	private dueEl!: HTMLInputElement;
	private scheduledEl!: HTMLInputElement;

	constructor(app: App, noteName: string, initial: NoteDates, onSubmit: (dates: NoteDates) => void, onCancel: () => void) {
		super(app);
		this.noteName = noteName;
		this.initial = initial;
		this.onSubmit = onSubmit;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("lukit-note-date-modal");
		contentEl.createEl("p", { text: `Datum von „${this.noteName}" setzen…` });

		this.dueEl = this.renderField("Fällig", this.initial.due);
		this.scheduledEl = this.renderField("Geplant", this.initial.scheduled);

		const buttonRow = contentEl.createEl("div", { cls: "lukit-text-input-buttons" });
		buttonRow.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => this.close());
		buttonRow.createEl("button", { text: "OK", cls: "mod-cta" }).addEventListener("click", () => this.submit());

		setTimeout(() => this.dueEl.focus(), 10);
	}

	// An empty field is not an error here: it clears the date.
	private renderField(label: string, value: string): HTMLInputElement {
		const row = this.contentEl.createEl("label", { cls: "lukit-note-date-row" });
		row.createEl("span", { text: label });
		const input = row.createEl("input", { type: "date", cls: "lukit-text-input" });
		input.value = value;
		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key !== "Enter") return;
			e.preventDefault();
			this.submit();
		});
		return input;
	}

	private submit(): void {
		this.submitted = true;
		this.close();
		this.onSubmit({ due: this.dueEl.value, scheduled: this.scheduledEl.value });
	}

	onClose(): void {
		this.contentEl.empty();
		// Obsidian calls onClose() before the submit handler resolves — same
		// deferred check TaskTriageDateModal uses.
		setTimeout(() => {
			if (!this.submitted) this.onCancel();
		}, 0);
	}
}
