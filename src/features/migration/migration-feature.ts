import { Notice, type TFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature } from "../../types";
import {
	detectNoteType,
	migrateVorgangNote,
	migrateDiaryNote,
} from "./migration-engine";
import { ConfirmModal } from "../../shared/modals/confirm-modal";
import { TextInputModal } from "../../shared/modals/text-input-modal";

export class MigrationFeature implements LuKitFeature {
	id = "migration";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "migration-convert-bold",
			name: "Migration: Convert note",
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

		let content: string;
		try {
			content = await this.plugin.app.vault.read(file);
		} catch (e) {
			new Notice("LuKit: Could not read note for migration: " + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const noteType = detectNoteType(content);

		if (noteType === "vorgang") {
			this.migrateVorgang(file);
		} else {
			this.migrateDiary(file);
		}
	}

	private migrateVorgang(file: TFile): void {
		new TextInputModal(
			this.plugin.app,
			"Frontmatter tag",
			(tag) => {
				new ConfirmModal(
					this.plugin.app,
					`Migrate "${file.basename}" to current Vorgang format?`,
					async () => {
						let changeCount = 0;
						try {
							await this.plugin.app.vault.process(
								file,
								(current) => {
									const result = migrateVorgangNote(current, { addTag: tag });
									changeCount = result.changeCount;
									return result.newContent;
								},
							);
						} catch (e) {
							new Notice("LuKit: Migration failed: " + (e instanceof Error ? e.message : String(e)));
							return;
						}

						if (changeCount === 0) {
							new Notice("LuKit: Nothing to migrate.");
						} else {
							new Notice(`LuKit: Migrated ${changeCount} entries.`);
						}
					},
				).open();
			},
			"Vorgang",
		).open();
	}

	private migrateDiary(file: TFile): void {
		new ConfirmModal(
			this.plugin.app,
			`Migrate "${file.basename}" to current Diary format?`,
			async () => {
				let changeCount = 0;
				try {
					await this.plugin.app.vault.process(file, (current) => {
						const result = migrateDiaryNote(current);
						changeCount = result.changeCount;
						return result.newContent;
					});
				} catch (e) {
					new Notice("LuKit: Migration failed: " + (e instanceof Error ? e.message : String(e)));
					return;
				}

				if (changeCount === 0) {
					new Notice("LuKit: Nothing to migrate.");
				} else {
					new Notice(`LuKit: Migrated ${changeCount} entries.`);
				}
			},
		).open();
	}
}
