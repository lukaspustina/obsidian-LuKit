import { Notice } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature } from "../../types";
import { migrateVorgangNote } from "./migration-engine";
import { ConfirmModal } from "../../shared/modals/confirm-modal";

export class MigrationFeature implements LuKitFeature {
	id = "migration";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "migration-convert-bold",
			name: "Migration: Convert bold → h5",
			icon: LUKIT_ICON_ID,
			callback: () => this.migrateCmd(),
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	private async migrateCmd(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("LuKit: No active note open.");
			return;
		}

		const content = await this.plugin.app.vault.read(file);
		const { changeCount: previewCount } = migrateVorgangNote(content);

		if (previewCount === 0) {
			new Notice("LuKit: Nothing to migrate.");
			return;
		}

		new ConfirmModal(
			this.plugin.app,
			`Migrate ${previewCount} entries in "${file.basename}"?`,
			async () => {
				let changeCount = 0;
				await this.plugin.app.vault.process(file, (current) => {
					const result = migrateVorgangNote(current);
					changeCount = result.changeCount;
					return result.newContent;
				});

				if (changeCount === 0) {
					new Notice("LuKit: Nothing to migrate.");
				} else {
					new Notice(`LuKit: Migrated ${changeCount} entries.`);
				}
			},
		).open();
	}
}
