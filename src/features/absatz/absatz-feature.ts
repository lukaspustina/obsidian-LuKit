import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import type LuKitPlugin from "../../main";
import type { LuKitFeature } from "../../types";
import { addAbsatz } from "./absatz-engine";
import { TextInputModal } from "../../shared/modals/text-input-modal";

export class AbsatzFeature implements LuKitFeature {
	id = "absatz";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "add-absatz",
			name: "Add Absatz section",
			callback: () => this.addAbsatzCmd(),
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	private addAbsatzCmd(): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("LuKit: No active note open.");
			return;
		}

		new TextInputModal(this.plugin.app, async (name) => {
			await this.insertAbsatz(file, name);
		}).open();
	}

	private async insertAbsatz(file: TFile, name: string): Promise<void> {
		const content = await this.plugin.app.vault.read(file);
		const { newContent, cursorLineIndex } = addAbsatz(content, name);

		await this.plugin.app.vault.modify(file, newContent);

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
