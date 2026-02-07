import { Notice } from "obsidian";
import type LuKitPlugin from "../../main";
import type { LuKitFeature } from "../../types";
import { migrateVorgangNote } from "./migration-engine";

export class MigrationFeature implements LuKitFeature {
	id = "migration";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "migrate-vorgang-note",
			name: "Migrate Vorgang note (bold → h5)",
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
		const { newContent, changeCount } = migrateVorgangNote(content);

		if (changeCount === 0) {
			new Notice("LuKit: Nothing to migrate.");
			return;
		}

		await this.plugin.app.vault.modify(file, newContent);
		new Notice(`LuKit: Migrated ${changeCount} entries.`);
	}
}
