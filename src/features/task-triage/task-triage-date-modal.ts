import { App, Modal } from "obsidian";
import { formatDate, dateFormatHint, parseDateString } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";

export class TaskTriageDateModal extends Modal {
	private locale: DateLocale;
	private onSubmit: (dateIso: string) => void;
	private onCancel: () => void;
	private submitted = false;
	private dateInputEl!: HTMLInputElement;
	private errorEl!: HTMLElement;
	private initialDate: Date;

	constructor(
		app: App,
		locale: DateLocale,
		onSubmit: (dateIso: string) => void,
		onCancel: () => void,
		defaultDate?: Date,
	) {
		super(app);
		this.locale = locale;
		this.onSubmit = onSubmit;
		this.onCancel = onCancel;
		this.initialDate = defaultDate ?? new Date();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("lukit-text-input-modal");

		contentEl.createEl("p", { text: "Verschieben auf…" });

		this.dateInputEl = contentEl.createEl("input", {
			type: "text",
			placeholder: dateFormatHint(this.locale),
			cls: "lukit-text-input",
		});
		this.dateInputEl.value = formatDate(this.initialDate, this.locale);

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
			this.dateInputEl.select();
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
		const parsed = parseDateString(this.dateInputEl.value.trim(), this.locale);
		if (parsed === null) {
			this.errorEl.textContent = `Ungültiges Datum (${dateFormatHint(this.locale)}).`;
			this.errorEl.style.display = "block";
			return;
		}
		const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
		this.submitted = true;
		this.close();
		this.onSubmit(iso);
	}
}
