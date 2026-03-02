import { App, Modal } from "obsidian";
import { formatDate, parseDateString } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";

const DATE_PLACEHOLDER: Record<DateLocale, string> = {
	de: "DD.MM.YYYY",
	en: "MM/DD/YYYY",
	iso: "YYYY-MM-DD",
};

export class AddSectionModal extends Modal {
	private onSubmit: (name: string, date: Date) => void;
	private locale: DateLocale;
	private nameInputEl!: HTMLInputElement;
	private dateInputEl!: HTMLInputElement;

	constructor(app: App, locale: DateLocale, onSubmit: (name: string, date: Date) => void) {
		super(app);
		this.locale = locale;
		this.onSubmit = onSubmit;
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
			placeholder: DATE_PLACEHOLDER[this.locale],
			cls: "lukit-text-input",
		});
		this.dateInputEl.value = formatDate(new Date(), this.locale);

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
		const name = this.nameInputEl.value.trim();
		if (name.length === 0) return;
		const date = parseDateString(this.dateInputEl.value.trim(), this.locale) ?? new Date();
		this.close();
		this.onSubmit(name, date);
	}
}
