import { App, Modal } from "obsidian";

export class AddSectionModal extends Modal {
	private onSubmit: (name: string, date: Date) => void;
	private nameInputEl!: HTMLInputElement;
	private dateInputEl!: HTMLInputElement;

	constructor(app: App, onSubmit: (name: string, date: Date) => void) {
		super(app);
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
			type: "date",
			cls: "lukit-text-input",
		});
		this.dateInputEl.value = todayIso();

		this.nameInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.dateInputEl.focus();
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
		const date = parseLocalDate(this.dateInputEl.value) ?? new Date();
		this.close();
		this.onSubmit(name, date);
	}
}

function todayIso(): string {
	const d = new Date();
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
