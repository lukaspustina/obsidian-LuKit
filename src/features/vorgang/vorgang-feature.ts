import { Notice } from "obsidian";
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

		new TextInputModal(this.plugin.app, "Section name…", (name) => {
			this.insertVorgangSection(name);
		}).open();
	}

	private insertVorgangSection(name: string): void {
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice("LuKit: No active editor.");
			return;
		}

		const content = editor.getValue();
		const { newContent, cursorLineIndex } = addVorgangSection(
			content,
			name,
		);

		editor.setValue(newContent);
		const pos = { line: cursorLineIndex, ch: 0 };
		editor.setCursor(pos);
		editor.scrollIntoView({ from: pos, to: pos }, true);
	}
}
