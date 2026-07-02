import { App, Modal } from "obsidian";
import { formatDate } from "../../shared/date-format";

export class TaskTriageDateModal extends Modal {
	private onSubmit: (dateIso: string) => void;
	private onCancel: () => void;
	private submitted = false;
	private dateInputEl!: HTMLInputElement;
	private errorEl!: HTMLElement;
	private initialDate: Date;

	constructor(app: App, onSubmit: (dateIso: string) => void, onCancel: () => void, defaultDate?: Date) {
		super(app);
		this.onSubmit = onSubmit;
		this.onCancel = onCancel;
		this.initialDate = defaultDate ?? new Date();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("lukit-text-input-modal");

		contentEl.createEl("p", { text: "Verschieben auf…" });

		// Native date input — the same control TaskNotes' own DateTimePickerModal
		// uses; Electron renders it with a calendar popup. Value is always ISO.
		this.dateInputEl = contentEl.createEl("input", {
			type: "date",
			cls: "lukit-text-input",
		});
		this.dateInputEl.value = formatDate(this.initialDate, "iso");

		this.errorEl = contentEl.createEl("p", { cls: "lukit-modal-error" });
		this.errorEl.style.display = "none";

		this.dateInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.submit();
			}
		});

		const buttonRow = contentEl.createEl("div", { cls: "lukit-text-input-buttons" });
		buttonRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		const submitBtn = buttonRow.createEl("button", { text: "Submit", cls: "mod-cta" });
		submitBtn.addEventListener("click", () => this.submit());

		setTimeout(() => {
			this.dateInputEl.focus();
			if (typeof this.dateInputEl.showPicker === "function") {
				try {
					this.dateInputEl.showPicker();
				} catch {
					// showPicker may throw without a user gesture — the input still works.
				}
			}
		}, 10);
	}

	onClose(): void {
		this.contentEl.empty();
		// Obsidian calls onClose() before the submit handler resolves; defer the
		// check so Cancel/Esc/click-outside routes to onCancel, but submit does not.
		setTimeout(() => {
			if (!this.submitted) {
				this.onCancel();
			}
		}, 0);
	}

	private submit(): void {
		const iso = this.dateInputEl.value;
		if (iso === "") {
			this.errorEl.textContent = "Bitte ein Datum wählen.";
			this.errorEl.style.display = "block";
			return;
		}
		this.submitted = true;
		this.close();
		this.onSubmit(iso);
	}
}
