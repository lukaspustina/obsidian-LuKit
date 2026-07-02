import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import { extractDateFromTitle, formatDate } from "../../shared/date-format";
import type { CachedMetadata, HeadingCache } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature, HelpEntry } from "../../types";
import {
	ensureTodayHeader,
	addEntryUnderToday,
	entryExistsUnderToday,
	formatDiaryEntry,
	formatTextEntry,
	formatReminderEntry,
	addReminder,
	stripWikilinks,
} from "./work-diary-engine";
import { renderWorkDiarySettings } from "./work-diary-settings";
import { NoteSuggestModal } from "../../shared/modals/note-suggest";
import { HeadingSuggestModal } from "../../shared/modals/heading-suggest";
import { TextDateModal } from "../../shared/modals/text-date-modal";
import { ConfirmModal } from "../../shared/modals/confirm-modal";

// Grundgerüst einer neuen Tagebuch-Notiz: Frontmatter, # Erinnerungen,
// dritter „---"-Trenner (darunter kommen die Datums-Einträge).
const DIARY_SKELETON = "---\n---\n\n# Erinnerungen\n\n---\n";

export class WorkDiaryFeature implements LuKitFeature {
	id = "work-diary";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "diary-ensure-today",
			name: "Tagebuch: Heutiges Datum hinzufügen",
			icon: LUKIT_ICON_ID,
			callback: () => this.ensureTodayHeaderCmd(),
		});

		plugin.addCommand({
			id: "diary-add-entry",
			name: "Tagebuch: Notiz per Suche hinzufügen",
			icon: LUKIT_ICON_ID,
			callback: () => this.addDiaryEntryCmd(),
		});

		plugin.addCommand({
			id: "diary-add-text",
			name: "Tagebuch: Texteintrag hinzufügen",
			icon: LUKIT_ICON_ID,
			callback: () => this.addTextEntryCmd(),
		});

		plugin.addCommand({
			id: "diary-add-reminder",
			name: "Tagebuch: Erinnerung hinzufügen",
			icon: LUKIT_ICON_ID,
			callback: () => this.addReminderCmd(),
		});

		plugin.addCommand({
			id: "diary-add-current-note",
			name: "Tagebuch: Aktuelle Notiz hinzufügen",
			icon: LUKIT_ICON_ID,
			callback: () => this.addCurrentNoteCmd(),
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	renderSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		renderWorkDiarySettings(containerEl, plugin);
	}

	helpEntries(): HelpEntry[] {
		return [
			{
				commandId: "diary-ensure-today",
				displayName: "Tagebuch: Heutiges Datum hinzufügen",
				description: "Legt die heutige Datums-Überschrift an (falls sie fehlt), öffnet die Tagebuch-Notiz und setzt den Cursor darunter.",
			},
			{
				commandId: "diary-add-entry",
				displayName: "Tagebuch: Notiz per Suche hinzufügen",
				description: "Notiz und Überschrift per Fuzzy-Suche wählen; fügt einen verlinkten Eintrag unter der heutigen Überschrift ein.",
			},
			{
				commandId: "diary-add-text",
				displayName: "Tagebuch: Texteintrag hinzufügen",
				description: "Freitext eingeben und Datum wählen; wird als Bullet unter der Überschrift dieses Datums eingefügt.",
			},
			{
				commandId: "diary-add-reminder",
				displayName: "Tagebuch: Erinnerung hinzufügen",
				description: "Erinnerung eingeben und Fälligkeitsdatum wählen; wird unter # Erinnerungen mit Datum abgelegt.",
			},
			{
				commandId: "diary-add-current-note",
				displayName: "Tagebuch: Aktuelle Notiz hinzufügen",
				description: "Fügt die aktive Notiz (mit der Überschrift an der Cursor-Position) als verlinkten Tagebucheintrag hinzu — ohne Dialoge.",
			},
		];
	}

	private getDiaryFile(): TFile | null {
		const path = this.plugin.settings.workDiary.diaryNotePath;
		if (!path) {
			new Notice("Kein Tagebuch-Pfad konfiguriert — setze ihn unter Einstellungen → LuKit.");
			return null;
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new ConfirmModal(
				this.plugin.app,
				`Tagebuch-Notiz „${path}" existiert nicht. Jetzt mit Grundgerüst anlegen (Frontmatter, „# Erinnerungen", „---"-Trenner)?`,
				() => {
					void this.plugin.app.vault
						.create(path, DIARY_SKELETON)
						.then(() => new Notice("Tagebuch-Notiz angelegt — führe das Kommando erneut aus."))
						.catch((e) => new Notice("Tagebuch-Notiz konnte nicht angelegt werden: " + (e instanceof Error ? e.message : String(e))));
				},
			).open();
			return null;
		}
		return file;
	}

	private async openDiaryNote(file: TFile, lineIndex: number): Promise<void> {
		const leaf = this.plugin.app.workspace.getLeaf(false) as WorkspaceLeaf;
		await leaf.openFile(file);
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (editor) {
			const pos = { line: lineIndex, ch: 0 };
			editor.setCursor(pos);
			editor.scrollIntoView({ from: pos, to: pos }, true);
		}
	}

	private async ensureTodayHeaderCmd(): Promise<void> {
		const file = this.getDiaryFile();
		if (!file) return;

		const locale = this.plugin.settings.dateLocale;
		let headerLineIndex = 0;
		let fallback = false;
		try {
			await this.plugin.app.vault.process(file, (content) => {
				const result = ensureTodayHeader(content, locale);
				headerLineIndex = result.headerLineIndex;
				fallback = result.fallback;
				return result.newContent;
			});
		} catch (e) {
			new Notice("Tagebuch konnte nicht geschrieben werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}

		if (fallback) {
			new Notice('Der Tagebuch-Notiz fehlt der dritte „---"-Trenner — Überschrift wurde am Ende angefügt.');
		}

		await this.openDiaryNote(file, headerLineIndex);
	}

	private addDiaryEntryCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		const locale = this.plugin.settings.dateLocale;
		new NoteSuggestModal(this.plugin.app, (selectedFile) => {
			new HeadingSuggestModal(this.plugin.app, selectedFile, async (heading) => {
				const cleanedHeading = heading ? stripWikilinks(heading) : null;
				const entry = formatDiaryEntry(selectedFile.basename, cleanedHeading);
				const date = extractDateFromTitle(cleanedHeading ?? selectedFile.basename, locale) ?? new Date();
				try {
					await this.plugin.app.vault.process(file, (content) => {
						const { newContent } = addEntryUnderToday(content, entry, locale, date);
						return newContent;
					});
				} catch (e) {
					new Notice("Tagebuch konnte nicht geschrieben werden: " + (e instanceof Error ? e.message : String(e)));
					return;
				}
				new Notice("Tagebucheintrag hinzugefügt.");
			}).open();
		}).open();
	}

	private addTextEntryCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		const locale = this.plugin.settings.dateLocale;
		new TextDateModal(this.plugin.app, "Tagebucheintrag…", locale, async (text, date) => {
			const entry = formatTextEntry(text);
			try {
				await this.plugin.app.vault.process(file, (content) => {
					const { newContent } = addEntryUnderToday(content, entry, locale, date);
					return newContent;
				});
			} catch (e) {
				new Notice("Tagebuch konnte nicht geschrieben werden: " + (e instanceof Error ? e.message : String(e)));
				return;
			}
			new Notice("Texteintrag hinzugefügt.");
		}).open();
	}

	private addReminderCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		const locale = this.plugin.settings.dateLocale;
		new TextDateModal(this.plugin.app, "Erinnerung…", locale, async (text, date) => {
			const entry = formatReminderEntry(text, locale, date);
			let success = false;
			try {
				await this.plugin.app.vault.process(file, (content) => {
					const result = addReminder(content, entry);
					if (!result) {
						return content;
					}
					success = true;
					return result.newContent;
				});
			} catch (e) {
				new Notice("Tagebuch konnte nicht geschrieben werden: " + (e instanceof Error ? e.message : String(e)));
				return;
			}
			if (!success) {
				new Notice('Der Tagebuch-Notiz fehlt der dritte „---"-Trenner — Erinnerung kann nicht eingefügt werden (Struktur: Frontmatter, optional „# Erinnerungen", dann „---").');
				return;
			}
			new Notice("Erinnerung hinzugefügt.");
		}).open();
	}

	private async addCurrentNoteCmd(): Promise<void> {
		const diaryFile = this.getDiaryFile();
		if (!diaryFile) return;

		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}

		if (activeFile.path === diaryFile.path) {
			new Notice("Die Tagebuch-Notiz kann sich nicht selbst hinzufügen.");
			return;
		}

		const locale = this.plugin.settings.dateLocale;
		const heading = this.getHeadingAtCursor(activeFile);
		const cleanedHeading = heading ? stripWikilinks(heading) : null;
		const entry = formatDiaryEntry(activeFile.basename, cleanedHeading);
		const date = extractDateFromTitle(cleanedHeading ?? activeFile.basename, locale) ?? new Date();

		let alreadyExists = false;
		try {
			await this.plugin.app.vault.process(diaryFile, (content) => {
				if (entryExistsUnderToday(content, entry, locale, date)) {
					alreadyExists = true;
					return content;
				}
				const { newContent } = addEntryUnderToday(content, entry, locale, date);
				return newContent;
			});
		} catch (e) {
			new Notice("Tagebuch konnte nicht geschrieben werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}

		if (alreadyExists) {
			new Notice(`Bereits im Tagebuch unter ${formatDate(date, locale)}.`);
			return;
		}

		new Notice("Tagebucheintrag hinzugefügt.");
	}

	private getHeadingAtCursor(file: TFile): string | null {
		const cache: CachedMetadata | null = this.plugin.app.metadataCache.getFileCache(file);
		if (!cache?.headings || cache.headings.length === 0) {
			return null;
		}

		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (!editor) {
			return null;
		}

		const cursorLine = editor.getCursor().line;
		let best: HeadingCache | null = null;
		for (const h of cache.headings) {
			if (h.position.start.line <= cursorLine) {
				best = h;
			}
		}

		return best?.heading ?? null;
	}
}
