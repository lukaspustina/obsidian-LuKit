import { App, Modal } from "obsidian";
import type LuKitPlugin from "../../main";

export class HelpModal extends Modal {
	private plugin: LuKitPlugin;

	constructor(app: App, plugin: LuKitPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		// Width belongs on the modal box; on contentEl it only narrowed the text
		// column and left the box's own width unused.
		this.modalEl.addClass("lukit-help-modal");

		contentEl.createEl("h2", { text: "LuKit — Kommandos" });

		const list = contentEl.createEl("ul", { cls: "lukit-help-list" });
		const entries = this.plugin.features.flatMap((f) => f.helpEntries?.() ?? []);
		for (const entry of entries) {
			const li = list.createEl("li");
			li.createEl("strong", { text: entry.displayName });
			li.appendText(" — " + entry.description);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
