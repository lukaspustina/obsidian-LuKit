import { Notice } from "obsidian";
import type LuKitPlugin from "../../main";
import type { LuKitFeature } from "../../types";
import { formatBesprechungSummary } from "./besprechung-engine";
import { renderBesprechungSettings } from "./besprechung-settings";
import { FolderNoteSuggestModal } from "../../shared/modals/folder-note-suggest";

export class BesprechungFeature implements LuKitFeature {
	id = "besprechung";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "add-besprechung-summary",
			name: "Add Besprechung summary",
			editorCallback: (editor) => {
				this.addBesprechungSummaryCmd(editor);
			},
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	renderSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		renderBesprechungSettings(containerEl, plugin);
	}

	private addBesprechungSummaryCmd(editor: import("obsidian").Editor): void {
		const folderPath = this.plugin.settings.besprechung.folderPath;
		if (!folderPath) {
			new Notice("LuKit: No Besprechung folder configured. Set it in Settings → LuKit.");
			return;
		}

		new FolderNoteSuggestModal(this.plugin.app, folderPath, async (file) => {
			const content = await this.plugin.app.vault.read(file);
			const summary = formatBesprechungSummary(content);

			if (!summary) {
				new Notice("LuKit: No Nächste Schritte or Zusammenfassung found.");
				return;
			}

			const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
			if (!activeEditor) {
				new Notice("LuKit: No active editor.");
				return;
			}

			const cursor = activeEditor.getCursor();
			activeEditor.replaceRange(summary, cursor);
		}).open();
	}
}
