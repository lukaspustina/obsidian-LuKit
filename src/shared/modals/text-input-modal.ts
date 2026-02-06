import { App, Modal, Setting } from "obsidian";

export class TextInputModal extends Modal {
	private onSubmit: (text: string) => void;
	private value = "";

	constructor(app: App, onSubmit: (text: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h4", { text: "Text entry" });

		new Setting(contentEl)
			.setName("Text")
			.addText((text) => {
				text.setPlaceholder("Type your entry…");
				text.onChange((val) => {
					this.value = val;
				});
				text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.key === "Enter") {
						e.preventDefault();
						this.submit();
					}
				});
				setTimeout(() => text.inputEl.focus(), 10);
			});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Submit").setCta().onClick(() => this.submit())
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const trimmed = this.value.trim();
		if (trimmed.length === 0) {
			return;
		}
		this.close();
		this.onSubmit(trimmed);
	}
}
