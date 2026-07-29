import { Notice, TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature, HelpEntry } from "../../types";
import {
	formatBesprechungSummary,
	composeBesprechungInsertion,
	buildBesprechungFilingPreview,
	extractDecisionLines,
	extractCreatedDate,
	frontmatterTagsInclude,
	removeTagFromFrontmatter,
	markFiledInFrontmatter,
} from "./besprechung-engine";
import { suggestFilingTargets, type FiledRecord } from "./besprechung-suggest-engine";
import { renderBesprechungSettings } from "./besprechung-settings";
import { FolderNoteSuggestModal } from "../../shared/modals/folder-note-suggest";
import { SectionNoteSuggestModal } from "../../shared/modals/section-note-suggest";
import { addVorgangSectionLinked, appendDecisionsToFakten } from "../vorgang/vorgang-engine";
import {
	tocAlreadyLinks,
	extractWikilinkTarget,
} from "../../shared/note-structure";
import { extractDateFromTitle, formatDate } from "../../shared/date-format";
import { SECTION_NOTE_TAGS } from "../../shared/frontmatter";
import { formatDiaryEntry, addEntryUnderToday } from "../../shared/diary";
import { getDiaryNotePath } from "../../shared/diary-settings";
import { createSectionNoteViaCommand } from "../../shared/quick-create";

export class BesprechungFeature implements LuKitFeature {
	id = "besprechung";
	private plugin!: LuKitPlugin;
	private filingWalkActive = false;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "besprechung-add-summary",
			name: "Besprechung: Zusammenfassung einfügen",
			icon: LUKIT_ICON_ID,
			editorCallback: () => {
				this.addBesprechungSummaryCmd();
			},
		});

		plugin.addCommand({
			id: "besprechung-file-pending",
			name: "Besprechungen: Alle offenen ablegen",
			icon: LUKIT_ICON_ID,
			callback: () => {
				this.filePendingCmd();
			},
		});

		plugin.addCommand({
			id: "besprechung-file-this",
			name: "Besprechung: Aktuelle Notiz ablegen",
			icon: LUKIT_ICON_ID,
			callback: () => {
				this.fileActiveBesprechungCmd();
			},
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	renderSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		renderBesprechungSettings(containerEl, plugin);
	}

	helpEntries(): HelpEntry[] {
		return [
			{
				commandId: "besprechung-add-summary",
				displayName: "Besprechung: Zusammenfassung einfügen",
				description: "Besprechungs-Notiz wählen, Kernabschnitte extrahieren, an der Cursor-Position einfügen (in Vorgang/Person/Bestellung/Bewerbung-Notizen als verlinkter Abschnitt).",
			},
			{
				commandId: "besprechung-file-pending",
				displayName: "Besprechungen: Alle offenen ablegen",
				description: "Geht alle Besprechungen mit Offen-Tag durch; pro Besprechung Zielnotiz wählen — legt die Zusammenfassung ab, entfernt das Tag, stempelt filed_into/filed_at.",
			},
			{
				commandId: "besprechung-file-this",
				displayName: "Besprechung: Aktuelle Notiz ablegen",
				description: "Legt die aktive Besprechung in eine Zielnotiz ab (Vorgang/Person/Bestellung/Bewerbung). Gleiche Einfügung + Stempel wie ‚Alle offenen ablegen‘, nur für die geöffnete Notiz.",
			},
		];
	}

	private addBesprechungSummaryCmd(): void {
		const folderPath = this.plugin.settings.besprechung.folderPath;
		if (!folderPath) {
			new Notice("Kein Besprechungs-Ordner konfiguriert — setze ihn unter Einstellungen → LuKit.");
			return;
		}

		new FolderNoteSuggestModal(this.plugin.app, folderPath, "Besprechung wählen…", (besprechungFile) => {
			this.insertBesprechungSummary(besprechungFile).catch((err: unknown) => {
				new Notice(`Zusammenfassung konnte nicht eingefügt werden: ${err instanceof Error ? err.message : String(err)}`);
			});
		}).open();
	}

	private async insertBesprechungSummary(besprechungFile: TFile): Promise<void> {
		const headings = this.plugin.settings.besprechung.sectionHeadings;
		const decisionHeadings = this.plugin.settings.besprechung.decisionHeadings;

		let besprechungContent: string;
		try {
			besprechungContent = await this.plugin.app.vault.read(besprechungFile);
		} catch (e) {
			new Notice("Besprechung konnte nicht gelesen werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const summary = composeBesprechungInsertion(
			formatBesprechungSummary(besprechungContent, headings, decisionHeadings),
			besprechungFile.basename,
		);

		const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
		if (!activeEditor) {
			new Notice("Kein aktiver Editor.");
			return;
		}

		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (activeFile && this.isSectionNote(activeFile)) {
			const locale = this.plugin.settings.dateLocale;
			const date = extractDateFromTitle(activeFile.basename, locale)
				?? extractCreatedDate(besprechungContent)
				?? new Date();
			const vorgangContent = activeEditor.getValue();
			if (this.vorgangAlreadyLinks(vorgangContent, besprechungFile.basename)) {
				new Notice(`„${besprechungFile.basename}" ist in „${activeFile.basename}" bereits verlinkt.`);
				return;
			}
			const { newContent, cursorLineIndex } = addVorgangSectionLinked(
				vorgangContent,
				besprechungFile.basename,
				locale,
				date,
				summary.split("\n"),
			);
			const logged = appendDecisionsToFakten(
				newContent,
				besprechungFile.basename,
				extractDecisionLines(besprechungContent, decisionHeadings),
				locale,
				date,
			);
			activeEditor.setValue(logged.content);
			// Der Fakten-Block sitzt oberhalb der neuen h5-Sektion, verschiebt
			// deren Zeilen also nach unten.
			const pos = { line: cursorLineIndex + logged.insertedLines, ch: 0 };
			activeEditor.setCursor(pos);
			activeEditor.scrollIntoView({ from: pos, to: pos }, true);
			await this.addDiaryEntryForBesprechung(activeFile, besprechungFile.basename, date);
			// Stempel wie beim Ablegen, damit auch manuelle Einfügungen den
			// Vorschlags-Korpus füttern (das Pending-Tag bleibt unangetastet).
			try {
				await this.plugin.app.fileManager.processFrontMatter(besprechungFile, (fm) => {
					markFiledInFrontmatter(fm, activeFile.basename, new Date());
				});
			} catch (e) {
				new Notice("Eingefügt, aber der filed_into-Stempel schlug fehl: " + (e instanceof Error ? e.message : String(e)));
			}
		} else {
			const cursor = activeEditor.getCursor();
			activeEditor.replaceRange(summary, cursor);
		}
	}

	private vorgangAlreadyLinks(vorgangContent: string, besprechungBasename: string): boolean {
		return tocAlreadyLinks(vorgangContent.split("\n"), besprechungBasename);
	}

	private isSectionNote(file: TFile): boolean {
		const tags = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.tags;
		return frontmatterTagsInclude(tags, SECTION_NOTE_TAGS);
	}

	private filePendingCmd(): void {
		if (this.filingWalkActive) {
			new Notice("Ablage läuft bereits.");
			return;
		}
		const folderPath = this.plugin.settings.besprechung.folderPath;
		if (!folderPath) {
			new Notice("Kein Besprechungs-Ordner konfiguriert — setze ihn unter Einstellungen → LuKit.");
			return;
		}
		const pendingTag = this.plugin.settings.besprechung.pendingTag;
		if (!pendingTag) {
			new Notice("Kein Offen-Tag konfiguriert — setze ihn unter Einstellungen → LuKit.");
			return;
		}

		const pending = this.findPendingBesprechungen();
		if (pending.length === 0) {
			new Notice(`Keine Besprechungen mit Tag „${pendingTag}".`);
			return;
		}

		this.filingWalkActive = true;
		let i = 0;
		const counts = { filed: 0, skipped: 0, dropped: 0 };
		const summary = (): string => `${counts.filed} abgelegt, ${counts.skipped} übersprungen, ${counts.dropped} nicht abgelegt`;
		const next = (): void => {
			if (i >= pending.length) {
				this.filingWalkActive = false;
				new Notice(`Ablage beendet: ${summary()}`);
				return;
			}
			present();
		};
		const present = (pin?: string): void => {
			const besprechung = pending[i];
			const placeholder = `[${i + 1}/${pending.length}] „${besprechung.basename}" ablegen unter… (Esc = Überspringen)`;
			void this.buildFilingPreviewText(besprechung).then((previewText) => {
				new SectionNoteSuggestModal(
					this.plugin.app,
					SECTION_NOTE_TAGS,
					{
						placeholder,
						previewText,
						suggestions: pin ? [pin, ...this.suggestionsFor(besprechung)] : this.suggestionsFor(besprechung),
						onCreateNew: this.createNewHandler((basename) => present(basename)),
						dropHint: "Tag entfernen",
						excludeTag: this.plugin.settings.doneTag,
						onPick: (vorgang) => {
							i++;
							counts.filed++;
							void this.fileBesprechungIntoVorgang(besprechung, vorgang).then(next);
						},
						onSkip: () => {
							i++;
							counts.skipped++;
							next();
						},
						onDrop: () => {
							i++;
							counts.dropped++;
							void this.dropPending(besprechung).then(next);
						},
						onOpenSource: () => {
							this.filingWalkActive = false;
							void this.plugin.app.workspace.getLeaf("tab").openFile(besprechung);
							new Notice(`Ablage gestoppt bei „${besprechung.basename}": ${summary()}, ${pending.length - i} offen`);
						},
						onCancel: () => {
							this.filingWalkActive = false;
							new Notice(`Ablage gestoppt: ${summary()}, ${pending.length - i} offen`);
						},
					},
				).open();
			});
		};
		next();
	}

	// Reads the besprechung once per stop and builds its filing-preview panel
	// text; any read failure degrades to no preview so the picker still opens.
	private async buildFilingPreviewText(besprechung: TFile): Promise<string | undefined> {
		try {
			const content = await this.plugin.app.vault.read(besprechung);
			return buildBesprechungFilingPreview(content, this.plugin.settings.besprechung.sectionHeadings);
		} catch {
			return undefined;
		}
	}

	private fileActiveBesprechungCmd(): void {
		const active = this.plugin.app.workspace.getActiveFile();
		if (!active) {
			new Notice("Keine aktive Notiz geöffnet.");
			return;
		}
		const tags = this.plugin.app.metadataCache.getFileCache(active)?.frontmatter?.tags;
		if (!frontmatterTagsInclude(tags, "Besprechung")) {
			new Notice(`„${active.basename}" ist keine Besprechung (Tag „Besprechung" fehlt).`);
			return;
		}

		const openPicker = (pin?: string): void => {
			new SectionNoteSuggestModal(
				this.plugin.app,
				SECTION_NOTE_TAGS,
				{
					placeholder: `„${active.basename}" ablegen unter…`,
					suggestions: pin ? [pin, ...this.suggestionsFor(active)] : this.suggestionsFor(active),
					onCreateNew: this.createNewHandler((basename) => openPicker(basename)),
					excludeTag: this.plugin.settings.doneTag,
					onPick: (vorgang) => {
						void this.fileBesprechungIntoVorgang(active, vorgang);
					},
					onDrop: () => {
						void this.dropPending(active);
					},
				},
			).open();
		};
		openPicker();
	}

	// Baut den „Neuen Vorgang anlegen"-Callback: führt das konfigurierte
	// Kommando aus, wartet auf die indexierte Notiz und öffnet den Picker
	// erneut — mit der neuen Notiz gepinnt (undefined bei Abbruch).
	private createNewHandler(reopen: (basename?: string) => void): (() => void) | undefined {
		const commandId = this.plugin.settings.quickAddVorgangCommandId;
		if (!commandId) return undefined;
		return () => {
			void createSectionNoteViaCommand(this.plugin.app, commandId).then((created) => {
				reopen(created?.basename);
			});
		};
	}

	private findPendingBesprechungen(): TFile[] {
		const { folderPath, pendingTag, pendingOrder } = this.plugin.settings.besprechung;
		const prefix = normalizePath(folderPath) + "/";
		const direction = pendingOrder === "newest" ? -1 : 1;
		return this.plugin.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(prefix))
			.filter((f) => {
				const tags = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.tags;
				return frontmatterTagsInclude(tags, pendingTag);
			})
			.sort((a, b) => direction * (a.stat.ctime - b.stat.ctime));
	}

	// Computes ranked filing-target basenames for the besprechung from past
	// filings + its title. Never throws: any failure degrades to no suggestions
	// so the picker still opens with the full list.
	private suggestionsFor(besprechung: TFile): string[] {
		try {
			// Geteiltes Routing-Wissen: eigene filed_into-Stempel plus der von der
			// E-Mail-Ablage geminte Vorgang-Korpus (Cache; Staleness egal — leicht
			// veraltete Vorschläge sind besser als keine).
			const corpus = [
				...this.buildFilingCorpus(besprechung),
				...(this.plugin.settings.emailFiling.routingCache?.records ?? []),
			];
			const candidateBasenames = this.sectionNoteBasenames();
			const fm = this.plugin.app.metadataCache.getFileCache(besprechung)?.frontmatter;
			const candidateTitle = typeof fm?.title === "string" ? fm.title : besprechung.basename;
			return suggestFilingTargets(candidateTitle, corpus, candidateBasenames, {
				now: Date.now(),
				selfNameStopwords: this.plugin.settings.besprechung.selfNameStopwords,
			}).map((s) => s.target);
		} catch (e) {
			console.warn("LuKit: failed to compute filing suggestions:", e);
			return [];
		}
	}

	// Builds the filing corpus from besprechungen under folderPath that carry a
	// filed_into value, excluding the one currently being filed.
	private buildFilingCorpus(exclude: TFile): FiledRecord[] {
		return collectBesprechungFiledRecords(this.plugin.app, this.plugin.settings.besprechung.folderPath, exclude.path);
	}

	// Selectable section-note basenames, using the same filter the modal applies.
	private sectionNoteBasenames(): string[] {
		const done = this.plugin.settings.doneTag;
		return this.plugin.app.vault
			.getMarkdownFiles()
			.filter((f) => {
				const tags = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.tags;
				if (!frontmatterTagsInclude(tags, SECTION_NOTE_TAGS)) return false;
				return !done || !frontmatterTagsInclude(tags, done);
			})
			.map((f) => f.basename);
	}

	private async fileBesprechungIntoVorgang(besprechung: TFile, vorgang: TFile): Promise<void> {
		const headings = this.plugin.settings.besprechung.sectionHeadings;
		const decisionHeadings = this.plugin.settings.besprechung.decisionHeadings;
		const locale = this.plugin.settings.dateLocale;
		const pendingTag = this.plugin.settings.besprechung.pendingTag;

		let besprechungContent: string;
		try {
			besprechungContent = await this.plugin.app.vault.read(besprechung);
		} catch (e) {
			new Notice("Besprechung konnte nicht gelesen werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const summary = composeBesprechungInsertion(
			formatBesprechungSummary(besprechungContent, headings, decisionHeadings),
			besprechung.basename,
		);

		let vorgangContent: string;
		try {
			vorgangContent = await this.plugin.app.vault.read(vorgang);
		} catch (e) {
			new Notice("Vorgang konnte nicht gelesen werden: " + (e instanceof Error ? e.message : String(e)));
			return;
		}

		const date = extractDateFromTitle(vorgang.basename, locale)
			?? extractCreatedDate(besprechungContent)
			?? new Date();
		const alreadyLinked = this.vorgangAlreadyLinks(vorgangContent, besprechung.basename);

		try {
			if (!alreadyLinked) {
				const { newContent } = addVorgangSectionLinked(
					vorgangContent,
					besprechung.basename,
					locale,
					date,
					summary.split("\n"),
				);
				const logged = appendDecisionsToFakten(
					newContent,
					besprechung.basename,
					extractDecisionLines(besprechungContent, decisionHeadings),
					locale,
					date,
				);
				await this.plugin.app.vault.modify(vorgang, logged.content);
				await this.addDiaryEntryForBesprechung(vorgang, besprechung.basename, date);
			}
			// Step 1: stamp filed_into/filed_at on the besprechung. If this fails,
			// surface "Failed to file" — the besprechung is still visibly pending.
			await this.plugin.app.fileManager.processFrontMatter(besprechung, (fm) => {
				markFiledInFrontmatter(fm, vorgang.basename, new Date());
			});
		} catch (e) {
			// Pending tag stays; user can retry.
			new Notice(`„${besprechung.basename}" konnte nicht in „${vorgang.basename}" abgelegt werden: ` + (e instanceof Error ? e.message : String(e)));
			return;
		}

		// Step 2: remove the pending tag in its own try/catch. Filing already
		// succeeded — partial failure here is reported separately so the user
		// knows the besprechung is filed but still tagged.
		try {
			await this.removePendingTag(besprechung, pendingTag);
		} catch (e) {
			new Notice(`„${besprechung.basename}" abgelegt, aber Tag „${pendingTag}" konnte nicht entfernt werden: ` + (e instanceof Error ? e.message : String(e)));
			return;
		}

		if (alreadyLinked) {
			new Notice(`„${besprechung.basename}" ist in „${vorgang.basename}" bereits verlinkt.`);
		} else {
			new Notice(`Abgelegt: „${besprechung.basename}" → „${vorgang.basename}".`);
		}
	}

	private async removePendingTag(file: TFile, tag: string): Promise<void> {
		await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
			removeTagFromFrontmatter(fm, tag);
		});
	}

	private async dropPending(besprechung: TFile): Promise<void> {
		const pendingTag = this.plugin.settings.besprechung.pendingTag;
		try {
			await this.removePendingTag(besprechung, pendingTag);
			new Notice(`Tag „${pendingTag}" von „${besprechung.basename}" entfernt (nicht abgelegt).`);
		} catch (e) {
			new Notice(`Tag „${pendingTag}" konnte nicht von „${besprechung.basename}" entfernt werden: ` + (e instanceof Error ? e.message : String(e)));
		}
	}

	private async addDiaryEntryForBesprechung(vorgang: TFile, besprechungBasename: string, date: Date): Promise<void> {
		const diaryPath = getDiaryNotePath(this.plugin);
		if (!diaryPath) return;

		const diaryAbstract = this.plugin.app.vault.getAbstractFileByPath(diaryPath);
		if (!(diaryAbstract instanceof TFile)) {
			new Notice("Tagebuch-Notiz nicht gefunden — Tagebucheintrag übersprungen.");
			return;
		}

		const locale = this.plugin.settings.dateLocale;
		const nameDate = extractDateFromTitle(besprechungBasename, locale);
		const headingText = nameDate !== null
			? besprechungBasename
			: `${besprechungBasename}, ${formatDate(date, locale)}`;
		const entry = formatDiaryEntry(vorgang.basename, headingText);

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

// Filed-into-Korpus aus Besprechungen unter folderPath — geteiltes Routing-
// Wissen, das auch die E-Mail-Ablage für ihre Vorschläge einbezieht.
export function collectBesprechungFiledRecords(app: App, folderPath: string, excludePath?: string): FiledRecord[] {
	if (!folderPath) return [];
	const prefix = normalizePath(folderPath) + "/";
	const records: FiledRecord[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		if (f.path === excludePath || !f.path.startsWith(prefix)) continue;
		const fm = app.metadataCache.getFileCache(f)?.frontmatter;
		const filedInto = fm?.filed_into;
		if (typeof filedInto !== "string") continue;
		const target = extractWikilinkTarget(filedInto);
		if (target === null) continue;
		const rawTitle = typeof fm?.title === "string" ? fm.title : f.basename;
		const parsed = fm?.filed_at == null ? NaN : Date.parse(String(fm.filed_at));
		records.push({ rawTitle, target, filedAt: Number.isFinite(parsed) ? parsed : null });
	}
	return records;
}
