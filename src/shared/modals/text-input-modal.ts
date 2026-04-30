import { App, Modal } from "obsidian";
import { validateText } from "../modal-validation";

export class TextInputModal extends Modal {
	private onSubmit: (text: string) => void;
	private placeholder: string;
	private defaultValue: string;
	private inputEl!: HTMLInputElement;
	private errorEl!: HTMLElement;

	constructor(
		app: App,
		placeholder: string,
		onSubmit: (text: string) => void,
		defaultValue?: string,
	) {
		super(app);
		this.placeholder = placeholder;
		this.onSubmit = onSubmit;
		this.defaultValue = defaultValue ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("lukit-text-input-modal");

		this.inputEl = contentEl.createEl("input", {
			type: "text",
			placeholder: this.placeholder,
			cls: "lukit-text-input",
		});
		if (this.defaultValue) {
			this.inputEl.value = this.defaultValue;
		}

		this.errorEl = contentEl.createEl("p", { cls: "lukit-modal-error" });
		this.errorEl.style.display = "none";

		this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.submit();
			}
		});

		const buttonRow = contentEl.createEl("div", {
			cls: "lukit-text-input-buttons",
		});
		buttonRow.createEl("button", { text: "Cancel" }).addEventListener(
			"click",
			() => this.close(),
		);
		const submitBtn = buttonRow.createEl("button", {
			text: "Submit",
			cls: "mod-cta",
		});
		submitBtn.addEventListener("click", () => this.submit());

		setTimeout(() => this.inputEl.focus(), 10);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const result = validateText(this.inputEl.value);
		if (!result.ok) {
			this.errorEl.textContent = result.error;
			this.errorEl.style.display = "block";
			return;
		}
		this.close();
		this.onSubmit(result.text);
	}
}
