import { App, Modal } from "obsidian";
import { formatDate, dateFormatHint } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";
import { validateTextAndDate } from "../../shared/modal-validation";

export class AddSectionModal extends Modal {
	private onSubmit: (name: string, date: Date) => void;
	private locale: DateLocale;
	private nameInputEl!: HTMLInputElement;
	private dateInputEl!: HTMLInputElement;
	private errorEl!: HTMLElement;
	private initialDate: Date;

	constructor(app: App, locale: DateLocale, onSubmit: (name: string, date: Date) => void, defaultDate?: Date) {
		super(app);
		this.locale = locale;
		this.onSubmit = onSubmit;
		this.initialDate = defaultDate ?? new Date();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("lukit-text-input-modal");

		this.nameInputEl = contentEl.createEl("input", {
			type: "text",
			placeholder: "Section name…",
			cls: "lukit-text-input",
		});

		this.dateInputEl = contentEl.createEl("input", {
			type: "text",
			placeholder: dateFormatHint(this.locale),
			cls: "lukit-text-input",
		});
		this.dateInputEl.value = formatDate(this.initialDate, this.locale);

		this.errorEl = contentEl.createEl("p", { cls: "lukit-modal-error" });
		this.errorEl.style.display = "none";

		this.nameInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.dateInputEl.focus();
				this.dateInputEl.select();
			}
		});
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

		setTimeout(() => this.nameInputEl.focus(), 10);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const result = validateTextAndDate(this.nameInputEl.value, this.dateInputEl.value, this.locale);
		if (!result.ok) {
			this.errorEl.textContent = result.error;
			this.errorEl.style.display = "block";
			return;
		}
		this.close();
		this.onSubmit(result.text, result.date);
	}
}
