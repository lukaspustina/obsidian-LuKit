import { App, Modal, Setting } from "obsidian";

export class DescriptionModal extends Modal {
	private onSubmit: (description: string | null) => void;
	private value = "";

	constructor(app: App, onSubmit: (description: string | null) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h4", { text: "Description (optional)" });

		new Setting(contentEl)
			.setName("Description")
			.addText((text) => {
				text.setPlaceholder("Short description…");
				text.onChange((val) => {
					this.value = val;
				});
				text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.key === "Enter") {
						e.preventDefault();
						this.submit();
					}
				});
				// Focus the input
				setTimeout(() => text.inputEl.focus(), 10);
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Submit").setCta().onClick(() => this.submit())
			)
			.addButton((btn) =>
				btn.setButtonText("Skip").onClick(() => {
					this.close();
					this.onSubmit(null);
				})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const trimmed = this.value.trim();
		this.close();
		this.onSubmit(trimmed.length > 0 ? trimmed : null);
	}
}
