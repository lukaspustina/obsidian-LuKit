import { Notice, type TFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature, HelpEntry } from "../../types";
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
			name: "Konvertierung: Altes Format migrieren",
			icon: LUKIT_ICON_ID,
			callback: () => this.migrateCmd(),
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	helpEntries(): HelpEntry[] {
		return [
			{
				commandId: "migration-convert-bold",
				displayName: "Konvertierung: Altes Format migrieren",
				description: "Erkennt den Notiztyp automatisch und konvertiert das Altformat ins aktuelle. Zeigt vorher einen Bestätigungsdialog mit Änderungsumfang.",
			},
		];
	}

	private async migrateCmd(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}

		let content: string;
		try {
			content = await this.plugin.app.vault.read(file);
		} catch (e) {
			new Notice("Notiz konnte nicht gelesen werden: " + (e instanceof Error ? e.message : String(e)));
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
			"Frontmatter-Tag",
			async (tag) => {
				let preview;
				try {
					const content = await this.plugin.app.vault.read(file);
					preview = migrateVorgangNote(content, { addTag: tag });
				} catch (e) {
					new Notice("Notiz konnte nicht gelesen werden: " + (e instanceof Error ? e.message : String(e)));
					return;
				}
				const diff = countChangedLines(await this.plugin.app.vault.read(file), preview.newContent);
				new ConfirmModal(
					this.plugin.app,
					`${diff} Zeilen ändern sich. „${file.basename}" ins aktuelle Vorgang-Format migrieren?`,
					async () => {
						try {
							await this.plugin.app.vault.process(file, () => preview.newContent);
						} catch (e) {
							new Notice("Migration fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
							return;
						}
						if (preview.changeCount === 0) {
							new Notice("Nichts zu migrieren.");
						} else {
							new Notice(`Migration abgeschlossen: ${preview.changeCount} Änderungen.`);
						}
					},
				).open();
			},
			"Vorgang",
		).open();
	}

	private async migrateDiary(file: TFile): Promise<void> {
		let preview;
		let original: string;
		try {
			original = await this.plugin.app.vault.read(file);
			preview = migrateDiaryNote(original);
		} catch (e) {
			new Notice("Notiz konnte nicht gelesen werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const diff = countChangedLines(original, preview.newContent);
		new ConfirmModal(
			this.plugin.app,
			`${diff} Zeilen ändern sich. „${file.basename}" ins aktuelle Tagebuch-Format migrieren?`,
			async () => {
				try {
					await this.plugin.app.vault.process(file, () => preview.newContent);
				} catch (e) {
					new Notice("Migration fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
					return;
				}
				if (preview.changeCount === 0) {
					new Notice("Nichts zu migrieren.");
				} else {
					new Notice(`Migration abgeschlossen: ${preview.changeCount} Änderungen.`);
				}
			},
		).open();
	}
}

function countChangedLines(before: string, after: string): number {
	const a = before.split("\n");
	const b = after.split("\n");
	const max = Math.max(a.length, b.length);
	let diff = 0;
	for (let i = 0; i < max; i++) {
		if (a[i] !== b[i]) diff++;
	}
	return diff;
}
