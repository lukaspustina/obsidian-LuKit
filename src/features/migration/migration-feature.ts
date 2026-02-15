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

		const content = await this.plugin.app.vault.read(file);
		const noteType = detectNoteType(content);

		if (noteType === "vorgang") {
			this.migrateVorgang(content, file);
		} else {
			this.migrateDiary(content, file);
		}
	}

	private migrateVorgang(
		content: string,
		file: TFile,
	): void {
		new TextInputModal(
			this.plugin.app,
			"Frontmatter tag",
			(tag) => {
				const { changeCount: previewCount } = migrateVorgangNote(
					content,
					{ addTag: tag },
				);

				if (previewCount === 0) {
					new Notice("LuKit: Nothing to migrate.");
					return;
				}

				new ConfirmModal(
					this.plugin.app,
					`Migrate ${previewCount} entries in "${file.basename}" (Vorgang)?`,
					async () => {
						let changeCount = 0;
						await this.plugin.app.vault.process(
							file,
							(current) => {
								const result = migrateVorgangNote(current, {
									addTag: tag,
								});
								changeCount = result.changeCount;
								return result.newContent;
							},
						);

						if (changeCount === 0) {
							new Notice("LuKit: Nothing to migrate.");
						} else {
							new Notice(
								`LuKit: Migrated ${changeCount} entries.`,
							);
						}
					},
				).open();
			},
			"Vorgang",
		).open();
	}

	private migrateDiary(
		content: string,
		file: TFile,
	): void {
		const { changeCount: previewCount } = migrateDiaryNote(content);

		if (previewCount === 0) {
			new Notice("LuKit: Nothing to migrate.");
			return;
		}

		new ConfirmModal(
			this.plugin.app,
			`Migrate ${previewCount} entries in "${file.basename}" (Diary)?`,
			async () => {
				let changeCount = 0;
				await this.plugin.app.vault.process(file, (current) => {
					const result = migrateDiaryNote(current);
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
