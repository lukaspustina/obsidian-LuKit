import { Notice, TFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature, HelpEntry } from "../../types";
import { addVorgangSection, addVorgangSectionLinked, applyTypePrefix, formatCreatedAtTimestamp, formatVorgangHeadingText } from "./vorgang-engine";
import { extractDateFromTitle } from "../../shared/date-format";
import { formatDiaryEntry, addEntryUnderToday } from "../../shared/diary";
import { getDiaryNotePath } from "../../shared/diary-settings";
import { SECTION_NOTE_TAGS, addTagToFrontmatter, frontmatterTagsInclude } from "../../shared/frontmatter";
import { SectionNoteSuggestModal } from "../../shared/modals/section-note-suggest";
import { AddSectionModal } from "./add-section-modal";
import { TypeSuggestModal } from "./type-suggest-modal";

export class VorgangFeature implements LuKitFeature {
	id = "vorgang";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "vorgang-add-section",
			name: "Vorgang: Abschnitt hinzufügen",
			icon: LUKIT_ICON_ID,
			callback: () => this.addVorgangSectionCmd(),
		});

		plugin.addCommand({
			id: "vorgang-reference",
			name: "Vorgang: Vorgang referenzieren",
			icon: LUKIT_ICON_ID,
			callback: () => this.referenceVorgangCmd(),
		});

		plugin.addCommand({
			id: "vorgang-convert",
			name: "Vorgang: Aktuelle Notiz umwandeln",
			icon: LUKIT_ICON_ID,
			callback: () => this.convertNoteCmd(),
		});

		plugin.addCommand({
			id: "vorgang-close",
			name: "Vorgang: Abschließen",
			icon: LUKIT_ICON_ID,
			callback: () => {
				void this.closeVorgangCmd();
			},
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	helpEntries(): HelpEntry[] {
		return [
			{
				commandId: "vorgang-add-section",
				displayName: "Vorgang: Abschnitt hinzufügen",
				description: "Fragt Name und Datum ab, fügt TOC-Eintrag + h5-Abschnitt ein. Legt zusätzlich einen verlinkten Tagebucheintrag an, wenn ein Tagebuch-Pfad konfiguriert ist.",
			},
			{
				commandId: "vorgang-reference",
				displayName: "Vorgang: Vorgang referenzieren",
				description: "Zielnotiz per Picker wählen; fügt in den aktiven Vorgang eine verlinkte Sektion (TOC-Eintrag + h5 mit [[Wikilink]]) ein — Cursor darunter für eigene Notizen. Die Zielnotiz bleibt unangetastet.",
			},
			{
				commandId: "vorgang-convert",
				displayName: "Vorgang: Aktuelle Notiz umwandeln",
				description: "Macht die aktive Notiz zur Zielnotiz: Typ wählen (Vorgang/Person/Bestellung/Bewerbung), ergänzt im Frontmatter das Tag, note_type: tasknote und Created at (Datei-Erstelldatum) und gleicht das Titel-Präfix an (<Typ> - <Name>: fehlendes Präfix wird vorangestellt, ein anderes Typ-Präfix ersetzt). Der Notiz-Inhalt bleibt unangetastet; idempotent.",
			},
			{
				commandId: "vorgang-close",
				displayName: "Vorgang: Abschließen",
				description: 'Setzt das Abgeschlossen-Tag (Notiz verschwindet aus Pickern und Vorschlägen), entfernt note_type (verschwindet aus TaskNotes), benennt die Datei in „… - done" um und dokumentiert den Abschluss im Tagebuch. Wiedereröffnen = Tag entfernen.',
			},
		];
	}

	private addVorgangSectionCmd(): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}

		const locale = this.plugin.settings.dateLocale;
		const titleDate = extractDateFromTitle(file.basename, locale) ?? undefined;
		new AddSectionModal(this.plugin.app, locale, async (name, date) => {
			await this.insertVorgangSection(file, name, date);
		}, titleDate).open();
	}

	private referenceVorgangCmd(): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}
		new SectionNoteSuggestModal(this.plugin.app, SECTION_NOTE_TAGS, {
			placeholder: `Vorgang wählen, der in „${file.basename}" referenziert wird…`,
			excludeTag: this.plugin.settings.doneTag,
			excludePath: file.path,
			onPick: (target) => {
				this.insertReference(target);
			},
		}).open();
	}

	private insertReference(target: TFile): void {
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice("Kein aktiver Editor.");
			return;
		}
		const locale = this.plugin.settings.dateLocale;
		try {
			const { newContent, cursorLineIndex } = addVorgangSectionLinked(editor.getValue(), target.basename, locale, new Date());
			editor.setValue(newContent);
			const pos = { line: cursorLineIndex, ch: 0 };
			editor.setCursor(pos);
			editor.scrollIntoView({ from: pos, to: pos }, true);
		} catch (e) {
			new Notice("Referenz konnte nicht eingefügt werden: " + (e instanceof Error ? e.message : String(e)));
		}
	}

	private convertNoteCmd(): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}
		new TypeSuggestModal(this.plugin.app, (tag) => {
			void this.convertNote(file, tag);
		}).open();
	}

	// Ergänzt nur die Funktionsfelder (Picker-Tag, TaskNotes-Erkennung,
	// Datierung); bestehende Frontmatter-Werte und der Notiz-Inhalt bleiben
	// unangetastet.
	private async convertNote(file: TFile, tag: string): Promise<void> {
		try {
			await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
				addTagToFrontmatter(fm, tag);
				if (fm.note_type === undefined) {
					fm.note_type = "tasknote";
				}
				if (fm["Created at"] === undefined) {
					fm["Created at"] = formatCreatedAtTimestamp(new Date(file.stat.ctime));
				}
			});
			// Titel-Präfix an den gewählten Typ angleichen ("<Typ> - <Name>").
			const newBasename = applyTypePrefix(file.basename, tag, SECTION_NOTE_TAGS);
			if (newBasename !== file.basename) {
				const parent = file.path.slice(0, file.path.length - file.basename.length - 3);
				await this.plugin.app.fileManager.renameFile(file, `${parent}${newBasename}.md`);
			}
			new Notice(`„${file.basename}" ist jetzt als ${tag} getaggt.`);
		} catch (e) {
			new Notice("Umwandeln fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
		}
	}

	private async closeVorgangCmd(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}
		const doneTag = this.plugin.settings.doneTag;
		if (!doneTag) {
			new Notice("Kein Abgeschlossen-Tag konfiguriert — setze ihn unter Einstellungen → LuKit.");
			return;
		}
		const tags = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.tags;
		if (!frontmatterTagsInclude(tags, SECTION_NOTE_TAGS)) {
			new Notice(`„${file.basename}" ist keine Zielnotiz (Tag Vorgang/Person/Bestellung/Bewerbung fehlt).`);
			return;
		}
		if (frontmatterTagsInclude(tags, doneTag)) {
			new Notice(`„${file.basename}" ist bereits abgeschlossen.`);
			return;
		}

		try {
			await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
				addTagToFrontmatter(fm, doneTag);
				// note_type entfernen → der Vorgang verschwindet aus TaskNotes.
				delete fm.note_type;
			});
			if (!file.basename.endsWith(" - done")) {
				const newPath = file.path.replace(/\.md$/, "") + " - done.md";
				await this.plugin.app.fileManager.renameFile(file, newPath);
			}
		} catch (e) {
			new Notice("Abschließen fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
			return;
		}

		await this.addDiaryEntryForClose(file);
		new Notice(`„${file.basename}" abgeschlossen — Tag „${doneTag}" gesetzt.`);
	}

	// Dokumentiert den Abschluss unter dem heutigen Datum im Tagebuch; fehlender
	// Pfad oder fehlende Notiz überspringt still (der Abschluss selbst zählt).
	private async addDiaryEntryForClose(file: TFile): Promise<void> {
		const diaryPath = getDiaryNotePath(this.plugin);
		if (!diaryPath) return;
		const diaryAbstract = this.plugin.app.vault.getAbstractFileByPath(diaryPath);
		if (!(diaryAbstract instanceof TFile)) return;

		const locale = this.plugin.settings.dateLocale;
		const entry = `- [[${file.basename}]] abgeschlossen`;
		try {
			await this.plugin.app.vault.process(diaryAbstract, (content) => {
				const { newContent } = addEntryUnderToday(content, entry, locale, new Date());
				return newContent;
			});
		} catch (e) {
			new Notice("Tagebuch konnte nicht geschrieben werden: " + (e instanceof Error ? e.message : String(e)));
		}
	}

	private async insertVorgangSection(activeFile: TFile, name: string, date: Date): Promise<void> {
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice("Kein aktiver Editor.");
			return;
		}

		const locale = this.plugin.settings.dateLocale;
		let content: string;
		let newContent: string;
		let cursorLineIndex: number;
		try {
			content = editor.getValue();
			({ newContent, cursorLineIndex } = addVorgangSection(content, name, locale, date));
			editor.setValue(newContent);
		} catch (e) {
			new Notice("Abschnitt konnte nicht eingefügt werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const pos = { line: cursorLineIndex, ch: 0 };
		editor.setCursor(pos);
		editor.scrollIntoView({ from: pos, to: pos }, true);

		await this.addDiaryEntryForSection(activeFile, name, date);
	}

	private async addDiaryEntryForSection(activeFile: TFile, sectionName: string, date: Date): Promise<void> {
		const diaryPath = getDiaryNotePath(this.plugin);
		if (!diaryPath) {
			new Notice("Tagebucheintrag übersprungen — setze den Tagebuch-Pfad unter Einstellungen → LuKit.");
			return;
		}

		const diaryAbstract = this.plugin.app.vault.getAbstractFileByPath(diaryPath);
		if (!(diaryAbstract instanceof TFile)) {
			new Notice("Tagebuch-Notiz nicht gefunden — Tagebucheintrag übersprungen.");
			return;
		}

		const locale = this.plugin.settings.dateLocale;
		const headingText = formatVorgangHeadingText(sectionName, locale, date);
		const entry = formatDiaryEntry(activeFile.basename, headingText);

		try {
			await this.plugin.app.vault.process(diaryAbstract, (content) => {
				const { newContent } = addEntryUnderToday(content, entry, locale, date);
				return newContent;
			});
		} catch (e) {
			new Notice("Tagebuch konnte nicht geschrieben werden: " + (e instanceof Error ? e.message : String(e)));
		}
	}
}
