import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature } from "../../types";
import { addVorgangSection } from "./vorgang-engine";
import { TextInputModal } from "../../shared/modals/text-input-modal";

export class VorgangFeature implements LuKitFeature {
	id = "vorgang";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "vorgang-add-section",
			name: "Vorgang: Add section",
			icon: LUKIT_ICON_ID,
			callback: () => this.addVorgangSectionCmd(),
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	private addVorgangSectionCmd(): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("LuKit: No active note open.");
			return;
		}

		new TextInputModal(this.plugin.app, "Section name…", async (name) => {
			await this.insertVorgangSection(file, name);
		}).open();
	}

	private async insertVorgangSection(file: TFile, name: string): Promise<void> {
		let cursorLineIndex = 0;
		await this.plugin.app.vault.process(file, (content) => {
			const result = addVorgangSection(content, name);
			cursorLineIndex = result.cursorLineIndex;
			return result.newContent;
		});

		const leaf = this.plugin.app.workspace.getLeaf(false) as WorkspaceLeaf;
		await leaf.openFile(file);
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (editor) {
			const pos = { line: cursorLineIndex, ch: 2 };
			editor.setCursor(pos);
			editor.scrollIntoView({ from: pos, to: pos }, true);
		}
	}
}
