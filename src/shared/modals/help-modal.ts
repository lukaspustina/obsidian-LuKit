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
		contentEl.addClass("lukit-help-modal");

		contentEl.createEl("h2", { text: "LuKit — Commands" });

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
