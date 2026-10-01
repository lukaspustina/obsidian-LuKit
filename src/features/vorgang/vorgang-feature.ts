import { Notice, TFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature, HelpEntry } from "../../types";
import { addVorgangSection, addVorgangSectionLinked, applyTypePrefix, buildStubContent, ensureVorgangSkeleton, formatCreatedAtTimestamp, formatVorgangHeadingText, listSplitParts, mergeVorgangContent, splitVorgangContent } from "./vorgang-engine";
import type { SplitSelection } from "./vorgang-engine";
import { extractDateFromTitle } from "../../shared/date-format";
import { formatDiaryEntry, addEntryUnderToday } from "../../shared/diary";
import { getDiaryNotePath } from "../../shared/diary-settings";
import { SECTION_NOTE_TAGS, addTagToFrontmatter, frontmatterTagsInclude } from "../../shared/frontmatter";
import { ConfirmModal } from "../../shared/modals/confirm-modal";
import { SectionNoteSuggestModal } from "../../shared/modals/section-note-suggest";
import { quickCreateHandler } from "../../shared/quick-create";
import { AddSectionModal } from "./add-section-modal";
import { SplitSelectModal } from "./split-select-modal";
import { parseIntakeGroups } from "./intake-engine";
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

		plugin.addCommand({
			id: "vorgang-merge",
			name: "Vorgang: In anderen Vorgang zusammenführen",
			icon: LUKIT_ICON_ID,
			callback: () => this.mergeVorgangCmd(),
		});

		plugin.addCommand({
			id: "vorgang-split",
			name: "Vorgang: Teile in anderen Vorgang verschieben",
			icon: LUKIT_ICON_ID,
			callback: () => {
				void this.splitVorgangCmd();
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
				description: 'Macht die aktive Notiz zur Zielnotiz: Typ wählen (Vorgang/Person/Bestellung/Bewerbung), ergänzt im Frontmatter das Tag, note_type: tasknote und Created at (Datei-Erstelldatum) und gleicht das Titel-Präfix an (<Typ> - <Name>: fehlendes Präfix wird vorangestellt, ein anderes Typ-Präfix ersetzt). Ergänzt das Zielnotiz-Skelett (Fakten und Pointer, Nächste Schritte, Inhalt); ein bestehender Body wandert in eine datierte Sektion „Notiz". Idempotent.',
			},
			{
				commandId: "vorgang-close",
				displayName: "Vorgang: Abschließen",
				description: 'Setzt das Abgeschlossen-Tag (Notiz verschwindet aus Pickern und Vorschlägen), entfernt note_type (verschwindet aus TaskNotes), benennt die Datei in „… - done" um und dokumentiert den Abschluss im Tagebuch. Wiedereröffnen = Tag entfernen.',
			},
			{
				commandId: "vorgang-merge",
				displayName: "Vorgang: In anderen Vorgang zusammenführen",
				description: "Führt die aktive Notiz (Quelle) strukturbewusst in eine per Picker gewählte Zielnotiz über: Fakten und Nächste Schritte werden angehängt, h5-Sektionen samt TOC-Einträgen datumssortiert eingefügt, bereits verlinkte Sektionen als Duplikate übersprungen. Die Quelle wird zum Stub mit Verweis, erhält das Abgeschlossen-Tag und verliert note_type — sie wird NICHT umbenannt. Dokumentiert die Zusammenführung im Tagebuch.",
			},
			{
				commandId: "vorgang-split",
				displayName: "Vorgang: Teile in anderen Vorgang verschieben",
				description: "Wählt Fakten und h5-Abschnitte der aktiven Notiz aus und verschiebt sie in eine per Picker gewählte (oder neu angelegte) Zielnotiz: Fakten werden angehängt, Abschnitte samt TOC-Eintrag datumssortiert eingefügt. In der Quelle verschwinden sie, dafür steht dort ein Verweis „Teile verschoben nach [[Ziel]]“. Dokumentiert den Split im Tagebuch.",
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

	// Ergänzt die Funktionsfelder (Picker-Tag, TaskNotes-Erkennung, Datierung)
	// und das Zielnotiz-Skelett; ein bestehender Body wandert in eine datierte
	// Sektion „Notiz". Bestehende Frontmatter-Werte und bereits strukturierte
	// Notizen bleiben unangetastet.
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
			await this.plugin.app.vault.process(file, (c) =>
				ensureVorgangSkeleton(c, this.plugin.settings.dateLocale, new Date()),
			);
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

		// Offene Intake-Gruppen sind noch nicht übernommene Aufgaben. Wie die
		// übrigen Guards greift die Rückfrage vor jeder Mutation — Ablehnen
		// lässt die Notiz byte-identisch zurück.
		let content: string;
		try {
			content = await this.plugin.app.vault.read(file);
		} catch (e) {
			new Notice(`„${file.basename}" konnte nicht gelesen werden — Abschließen abgebrochen: ` + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const groups = parseIntakeGroups(content);
		if (groups.length > 0) {
			const count = groups.length === 1 ? "einen unsortierten Eintrag" : `${groups.length} unsortierte Einträge`;
			new ConfirmModal(
				this.plugin.app,
				`„${file.basename}" hat noch ${count} unter „Nächste Schritte". Trotzdem abschließen?`,
				() => {
					void this.finishClose(file, doneTag);
				},
			).open();
			return;
		}

		await this.finishClose(file, doneTag);
	}

	// Der eigentliche Abschluss: Tag setzen, note_type entfernen, umbenennen,
	// Tagebucheintrag. Erst ab hier wird geschrieben.
	private async finishClose(file: TFile, doneTag: string): Promise<void> {
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

	private mergeVorgangCmd(): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}
		const tags = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.tags;
		if (!frontmatterTagsInclude(tags, SECTION_NOTE_TAGS)) {
			new Notice(`„${file.basename}“ ist keine Zielnotiz (Tag Vorgang/Person/Bestellung/Bewerbung fehlt).`);
			return;
		}
		if (frontmatterTagsInclude(tags, this.plugin.settings.doneTag)) {
			new Notice(`„${file.basename}“ ist bereits abgeschlossen.`);
			return;
		}
		this.openMergeTargetPicker(file);
	}

	// Guards like the merge, then: pick the parts, pick (or create) the target.
	private async splitVorgangCmd(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}
		const tags = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.tags;
		if (!frontmatterTagsInclude(tags, SECTION_NOTE_TAGS)) {
			new Notice(`„${file.basename}“ ist keine Zielnotiz (Tag Vorgang/Person/Bestellung/Bewerbung fehlt).`);
			return;
		}
		if (frontmatterTagsInclude(tags, this.plugin.settings.doneTag)) {
			new Notice(`„${file.basename}“ ist bereits abgeschlossen.`);
			return;
		}
		const content = await this.plugin.app.vault.read(file);
		const parts = listSplitParts(content, this.plugin.settings.dateLocale);
		if (parts.facts.length === 0 && parts.sections.length === 0) {
			new Notice(`„${file.basename}“ hat keine Fakten oder Abschnitte zum Verschieben.`);
			return;
		}
		new SplitSelectModal(this.plugin.app, {
			sourceBasename: file.basename,
			parts,
			onConfirm: (selection) => {
				this.openSplitTargetPicker(file, content, selection);
			},
		}).open();
	}

	private openSplitTargetPicker(source: TFile, sourceContent: string, selection: SplitSelection, pin?: string): void {
		new SectionNoteSuggestModal(this.plugin.app, SECTION_NOTE_TAGS, {
			placeholder: `Ziel-Vorgang wählen, in den die Teile aus „${source.basename}“ verschoben werden…`,
			excludeTag: this.plugin.settings.doneTag,
			excludePath: source.path,
			suggestions: pin ? [pin] : undefined,
			onCreateNew: quickCreateHandler(this.plugin.app, this.plugin.settings.quickAddVorgangCommandId, (basename) =>
				this.openSplitTargetPicker(source, sourceContent, selection, basename),
			),
			onPick: (target) => {
				void this.splitInto(source, sourceContent, selection, target);
			},
		}).open();
	}

	// Target first, as in the merge: a failed target write leaves the source
	// untouched. The selection's line indices refer to sourceContent, so a
	// source that changed in between is not rewritten — the target already
	// holds the parts, and the Notice says so.
	private async splitInto(source: TFile, sourceContent: string, selection: SplitSelection, target: TFile): Promise<void> {
		const locale = this.plugin.settings.dateLocale;
		const date = new Date();
		let result: ReturnType<typeof splitVorgangContent> | undefined;
		try {
			await this.plugin.app.vault.process(target, (targetContent) => {
				result = splitVorgangContent(sourceContent, targetContent, selection, target.basename, locale, date);
				return result.newTargetContent;
			});
		} catch (e) {
			new Notice("Verschieben fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const split = result!;
		const moved = split.movedFacts + split.movedSections;
		const dupWord = split.skippedDuplicates === 1 ? "Duplikat" : "Duplikate";
		if (moved === 0) {
			new Notice(`Nichts verschoben: ${split.skippedDuplicates} ${dupWord} bereits in „${target.basename}“.`);
			return;
		}

		try {
			await this.plugin.app.vault.process(source, (live) => {
				if (live !== sourceContent) throw new Error("Quelle wurde zwischenzeitlich geändert");
				return split.newSourceContent;
			});
		} catch (e) {
			new Notice("Ziel aktualisiert, aber Quelle konnte nicht bereinigt werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}

		await this.addDiaryEntry(`- [[${source.basename}]] → ${moved} ${moved === 1 ? "Teil" : "Teile"} in [[${target.basename}]] verschoben`);

		const faktWord = split.movedFacts === 1 ? "Fakt" : "Fakten";
		const sektionWord = split.movedSections === 1 ? "Sektion" : "Sektionen";
		const dupSuffix = split.skippedDuplicates > 0 ? `, ${split.skippedDuplicates} ${dupWord} übersprungen` : "";
		new Notice(`„${source.basename}“ → „${target.basename}“: ${split.movedFacts} ${faktWord}, ${split.movedSections} ${sektionWord} verschoben${dupSuffix}.`);
	}

	private openMergeTargetPicker(source: TFile): void {
		new SectionNoteSuggestModal(this.plugin.app, SECTION_NOTE_TAGS, {
			placeholder: `Ziel-Vorgang wählen, in den „${source.basename}“ zusammengeführt wird…`,
			excludeTag: this.plugin.settings.doneTag,
			excludePath: source.path,
			onPick: (target) => {
				void this.mergeInto(source, target);
			},
		}).open();
	}

	private async mergeInto(source: TFile, target: TFile): Promise<void> {
		const locale = this.plugin.settings.dateLocale;
		const sourceContent = await this.plugin.app.vault.read(source);

		// 1) Ziel zuerst schreiben — scheitert dieser Schritt, bleibt die Quelle unangetastet.
		let mergeResult: { newTargetContent: string; mergedSections: number; skippedDuplicates: number } | undefined;
		try {
			await this.plugin.app.vault.process(target, (targetContent) => {
				mergeResult = mergeVorgangContent(sourceContent, targetContent, locale, new Date());
				return mergeResult.newTargetContent;
			});
		} catch (e) {
			new Notice("Merge fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
			return;
		}

		// 2) Quelle stubben: erst der Body, dann das Frontmatter (Abgeschlossen-Tag, note_type entfernen).
		try {
			await this.plugin.app.vault.process(source, (liveContent) => buildStubContent(liveContent, target.basename));
			await this.plugin.app.fileManager.processFrontMatter(source, (fm) => {
				addTagToFrontmatter(fm, this.plugin.settings.doneTag);
				delete fm.note_type;
			});
		} catch (e) {
			new Notice("Ziel aktualisiert, aber Quelle konnte nicht gestubbt werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}

		await this.addDiaryEntry(`- [[${source.basename}]] → in [[${target.basename}]] zusammengeführt`);

		const result = mergeResult!;
		const sektionWord = result.mergedSections === 1 ? "Sektion" : "Sektionen";
		const dupWord = result.skippedDuplicates === 1 ? "Duplikat" : "Duplikate";
		new Notice(
			`„${source.basename}“ → „${target.basename}“: ${result.mergedSections} ${sektionWord} übernommen, ${result.skippedDuplicates} ${dupWord} übersprungen.`,
		);
	}

	// Dokumentiert Zusammenführung oder Split unter dem heutigen Datum im Tagebuch; fehlender
	// Pfad oder fehlende Notiz überspringt still (die Abschluss-Notice erscheint trotzdem).
	private async addDiaryEntry(entry: string): Promise<void> {
		const diaryPath = getDiaryNotePath(this.plugin);
		if (!diaryPath) return;
		const diaryAbstract = this.plugin.app.vault.getAbstractFileByPath(diaryPath);
		if (!(diaryAbstract instanceof TFile)) return;

		const locale = this.plugin.settings.dateLocale;
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
