import { App, Modal } from "obsidian";
import { formatDate, parseDateString } from "../date-format";
import type { DateLocale } from "../date-format";

const DATE_PLACEHOLDER: Record<DateLocale, string> = {
	de: "DD.MM.YYYY",
	en: "MM/DD/YYYY",
	iso: "YYYY-MM-DD",
};

export class TextDateModal extends Modal {
	private onSubmit: (text: string, date: Date) => void;
	private textPlaceholder: string;
	private locale: DateLocale;
	private defaultDate: Date;
	private textInputEl!: HTMLInputElement;
	private dateInputEl!: HTMLInputElement;

	constructor(
		app: App,
		textPlaceholder: string,
		locale: DateLocale,
		onSubmit: (text: string, date: Date) => void,
		defaultDate?: Date,
	) {
		super(app);
		this.textPlaceholder = textPlaceholder;
		this.locale = locale;
		this.onSubmit = onSubmit;
		this.defaultDate = defaultDate ?? new Date();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("lukit-text-input-modal");

		this.textInputEl = contentEl.createEl("input", {
			type: "text",
			placeholder: this.textPlaceholder,
			cls: "lukit-text-input",
		});

		this.dateInputEl = contentEl.createEl("input", {
			type: "text",
			placeholder: DATE_PLACEHOLDER[this.locale],
			cls: "lukit-text-input",
		});
		this.dateInputEl.value = formatDate(this.defaultDate, this.locale);

		this.textInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
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

		setTimeout(() => this.textInputEl.focus(), 10);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const text = this.textInputEl.value.trim();
		if (text.length === 0) return;
		const date = parseDateString(this.dateInputEl.value.trim(), this.locale) ?? this.defaultDate;
		this.close();
		this.onSubmit(text, date);
	}
}
