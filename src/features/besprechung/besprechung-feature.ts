import { Notice, TFile, normalizePath } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature, HelpEntry } from "../../types";
import {
	formatBesprechungSummary,
	composeBesprechungInsertion,
	extractCreatedDate,
	frontmatterTagsInclude,
	removeTagFromFrontmatter,
	markFiledInFrontmatter,
} from "./besprechung-engine";
import { renderBesprechungSettings } from "./besprechung-settings";
import { FolderNoteSuggestModal } from "../../shared/modals/folder-note-suggest";
import { SectionNoteSuggestModal } from "../../shared/modals/section-note-suggest";
import { addVorgangSectionLinked } from "../vorgang/vorgang-engine";
import {
	findInhaltSectionIndex,
	findInhaltBulletRange,
	extractWikilinkTarget,
} from "../../shared/note-structure";
import { extractDateFromTitle, formatDate } from "../../shared/date-format";
import { formatDiaryEntry, addEntryUnderToday } from "../../shared/diary";
import { getDiaryNotePath } from "../../shared/diary-settings";

export class BesprechungFeature implements LuKitFeature {
	id = "besprechung";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "besprechung-add-summary",
			name: "Besprechung: Add summary",
			icon: LUKIT_ICON_ID,
			editorCallback: () => {
				this.addBesprechungSummaryCmd();
			},
		});

		plugin.addCommand({
			id: "besprechung-add-multiple-summaries",
			name: "Besprechung: Add multiple summaries",
			icon: LUKIT_ICON_ID,
			editorCallback: () => {
				this.addBesprechungSummariesCmd();
			},
		});

		plugin.addCommand({
			id: "besprechung-file-pending",
			name: "Besprechung: File pending notes",
			icon: LUKIT_ICON_ID,
			callback: () => {
				this.filePendingCmd();
			},
		});

		plugin.addCommand({
			id: "besprechung-file-this",
			name: "Besprechung: File this Besprechung",
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
				displayName: "Besprechung: Add summary",
				description: "Pick a meeting note, extract key sections, insert at cursor (or as a linked section in Vorgang/Person/Bestellung/Bewerbung notes).",
			},
			{
				commandId: "besprechung-add-multiple-summaries",
				displayName: "Besprechung: Add multiple summaries",
				description: "Picker re-opens after each insertion (already-picked files hidden) until ESC; persists the search query across iterations.",
			},
			{
				commandId: "besprechung-file-pending",
				displayName: "Besprechung: File pending notes",
				description: "Walk Besprechungen tagged with the pending tag, pick a target section note for each; files the summary, removes the tag, stamps filed_into/filed_at.",
			},
			{
				commandId: "besprechung-file-this",
				displayName: "Besprechung: File this Besprechung",
				description: "File the active Besprechung note into a target section note (Vorgang/Person/Bestellung/Bewerbung). Same insertion + stamp behaviour as 'File pending notes', but on the open note.",
			},
		];
	}

	private addBesprechungSummaryCmd(): void {
		const folderPath = this.plugin.settings.besprechung.folderPath;
		if (!folderPath) {
			new Notice("LuKit: No Besprechung folder configured. Set it in Settings → LuKit.");
			return;
		}

		new FolderNoteSuggestModal(this.plugin.app, folderPath, "Pick a Besprechung…", (besprechungFile) => {
			this.insertBesprechungSummary(besprechungFile).catch((err: unknown) => {
				new Notice(`LuKit: ${err instanceof Error ? err.message : String(err)}`);
			});
		}).open();
	}

	private addBesprechungSummariesCmd(): void {
		const folderPath = this.plugin.settings.besprechung.folderPath;
		if (!folderPath) {
			new Notice("LuKit: No Besprechung folder configured. Set it in Settings → LuKit.");
			return;
		}

		const picked = new Set<string>();
		const openPicker = (initialQuery: string): void => {
			let modal: FolderNoteSuggestModal;
			modal = new FolderNoteSuggestModal(
				this.plugin.app,
				folderPath,
				"Pick a Besprechung… (ESC to finish)",
				async (besprechungFile) => {
					const lastQuery = modal.inputEl.value;
					picked.add(besprechungFile.path);
					try {
						await this.insertBesprechungSummary(besprechungFile);
					} catch (err: unknown) {
						new Notice(`LuKit: ${err instanceof Error ? err.message : String(err)}`);
					}
					openPicker(lastQuery);
				},
				picked,
				initialQuery,
			);
			modal.open();
		};
		openPicker("");
	}

	private async insertBesprechungSummary(besprechungFile: TFile): Promise<void> {
		const headings = this.plugin.settings.besprechung.sectionHeadings;

		let besprechungContent: string;
		try {
			besprechungContent = await this.plugin.app.vault.read(besprechungFile);
		} catch (e) {
			new Notice("LuKit: Could not read besprechung file: " + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const summary = composeBesprechungInsertion(
			formatBesprechungSummary(besprechungContent, headings),
			besprechungFile.basename,
		);

		const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
		if (!activeEditor) {
			new Notice("LuKit: No active editor.");
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
				new Notice(`LuKit: "${besprechungFile.basename}" already linked in "${activeFile.basename}"`);
				return;
			}
			const { newContent, cursorLineIndex } = addVorgangSectionLinked(
				vorgangContent,
				besprechungFile.basename,
				locale,
				date,
				summary.split("\n"),
			);
			activeEditor.setValue(newContent);
			const pos = { line: cursorLineIndex, ch: 0 };
			activeEditor.setCursor(pos);
			activeEditor.scrollIntoView({ from: pos, to: pos }, true);
			await this.addDiaryEntryForBesprechung(activeFile, besprechungFile.basename, date);
		} else {
			const cursor = activeEditor.getCursor();
			activeEditor.replaceRange(summary, cursor);
		}
	}

	// Checks whether the Vorgang's `# Inhalt` TOC contains a wikilink resolving
	// to the given besprechung basename. Robust against date-resolution drift
	// because it parses the link target from each bullet rather than matching
	// the rendered bullet string.
	private vorgangAlreadyLinks(vorgangContent: string, besprechungBasename: string): boolean {
		const lines = vorgangContent.split("\n");
		const inhaltIndex = findInhaltSectionIndex(lines);
		if (inhaltIndex === -1) return false;
		const range = findInhaltBulletRange(lines, inhaltIndex);
		if (range === null) return false;
		for (let i = range.firstBullet; i < range.afterLastBullet; i++) {
			if (!lines[i].startsWith("- ")) continue;
			const target = extractWikilinkTarget(lines[i]);
			if (target === besprechungBasename) return true;
		}
		return false;
	}

	private static readonly SECTION_NOTE_TAGS: ReadonlySet<string> = new Set(["Vorgang", "Person", "Bestellung", "Bewerbung"]);

	private isSectionNote(file: TFile): boolean {
		const tags = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.tags;
		return frontmatterTagsInclude(tags, BesprechungFeature.SECTION_NOTE_TAGS);
	}

	private filePendingCmd(): void {
		const folderPath = this.plugin.settings.besprechung.folderPath;
		if (!folderPath) {
			new Notice("LuKit: No Besprechung folder configured. Set it in Settings → LuKit.");
			return;
		}
		const pendingTag = this.plugin.settings.besprechung.pendingTag;
		if (!pendingTag) {
			new Notice("LuKit: No pending tag configured. Set it in Settings → LuKit.");
			return;
		}

		const pending = this.findPendingBesprechungen();
		if (pending.length === 0) {
			new Notice(`LuKit: No Besprechungen tagged "${pendingTag}".`);
			return;
		}

		let i = 0;
		const next = (): void => {
			if (i >= pending.length) {
				new Notice(`LuKit: Filing done (${pending.length} processed).`);
				return;
			}
			const besprechung = pending[i];
			const placeholder = `[${i + 1}/${pending.length}] File "${besprechung.basename}" under… (ESC to stop)`;
			new SectionNoteSuggestModal(
				this.plugin.app,
				BesprechungFeature.SECTION_NOTE_TAGS,
				{
					placeholder,
					onPick: (vorgang) => {
						i++;
						void this.fileBesprechungIntoVorgang(besprechung, vorgang).then(next);
					},
					onSkip: () => {
						i++;
						next();
					},
					onDrop: () => {
						i++;
						void this.dropPending(besprechung).then(next);
					},
					onOpenSource: () => {
						void this.plugin.app.workspace.getLeaf("tab").openFile(besprechung);
						new Notice(`LuKit: Stopped at "${besprechung.basename}" (${i} done, ${pending.length - i} remaining).`);
					},
					onCancel: () => {
						new Notice(`LuKit: Filing stopped (${i} done, ${pending.length - i} remaining).`);
					},
				},
			).open();
		};
		next();
	}

	private fileActiveBesprechungCmd(): void {
		const active = this.plugin.app.workspace.getActiveFile();
		if (!active) {
			new Notice("LuKit: No active note open.");
			return;
		}
		const tags = this.plugin.app.metadataCache.getFileCache(active)?.frontmatter?.tags;
		if (!frontmatterTagsInclude(tags, "Besprechung")) {
			new Notice(`LuKit: "${active.basename}" is not a Besprechung (missing "Besprechung" tag).`);
			return;
		}

		new SectionNoteSuggestModal(
			this.plugin.app,
			BesprechungFeature.SECTION_NOTE_TAGS,
			{
				placeholder: `File "${active.basename}" under…`,
				onPick: (vorgang) => {
					void this.fileBesprechungIntoVorgang(active, vorgang);
				},
				onDrop: () => {
					void this.dropPending(active);
				},
			},
		).open();
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

	private async fileBesprechungIntoVorgang(besprechung: TFile, vorgang: TFile): Promise<void> {
		const headings = this.plugin.settings.besprechung.sectionHeadings;
		const locale = this.plugin.settings.dateLocale;
		const pendingTag = this.plugin.settings.besprechung.pendingTag;

		let besprechungContent: string;
		try {
			besprechungContent = await this.plugin.app.vault.read(besprechung);
		} catch (e) {
			new Notice("LuKit: Could not read besprechung: " + (e instanceof Error ? e.message : String(e)));
			return;
		}
		const summary = composeBesprechungInsertion(
			formatBesprechungSummary(besprechungContent, headings),
			besprechung.basename,
		);

		let vorgangContent: string;
		try {
			vorgangContent = await this.plugin.app.vault.read(vorgang);
		} catch (e) {
			new Notice("LuKit: Could not read Vorgang: " + (e instanceof Error ? e.message : String(e)));
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
				await this.plugin.app.vault.modify(vorgang, newContent);
				await this.addDiaryEntryForBesprechung(vorgang, besprechung.basename, date);
			}
			// Step 1: stamp filed_into/filed_at on the besprechung. If this fails,
			// surface "Failed to file" — the besprechung is still visibly pending.
			await this.plugin.app.fileManager.processFrontMatter(besprechung, (fm) => {
				markFiledInFrontmatter(fm, vorgang.basename, new Date());
			});
		} catch (e) {
			// Pending tag stays; user can retry.
			new Notice(`LuKit: Failed to file "${besprechung.basename}" into "${vorgang.basename}": ` + (e instanceof Error ? e.message : String(e)));
			return;
		}

		// Step 2: remove the pending tag in its own try/catch. Filing already
		// succeeded — partial failure here is reported separately so the user
		// knows the besprechung is filed but still tagged.
		try {
			await this.removePendingTag(besprechung, pendingTag);
		} catch (e) {
			new Notice(`LuKit: filed "${besprechung.basename}" but failed to remove tag "${pendingTag}": ` + (e instanceof Error ? e.message : String(e)));
			return;
		}

		if (alreadyLinked) {
			new Notice(`LuKit: "${besprechung.basename}" already linked in "${vorgang.basename}"`);
		} else {
			new Notice(`LuKit: Filed "${besprechung.basename}" under "${vorgang.basename}".`);
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
			new Notice(`LuKit: Removed "${pendingTag}" from "${besprechung.basename}" (not filed).`);
		} catch (e) {
			new Notice(`LuKit: Failed to remove "${pendingTag}" from "${besprechung.basename}": ` + (e instanceof Error ? e.message : String(e)));
		}
	}

	private async addDiaryEntryForBesprechung(vorgang: TFile, besprechungBasename: string, date: Date): Promise<void> {
		const diaryPath = getDiaryNotePath(this.plugin);
		if (!diaryPath) return;

		const diaryAbstract = this.plugin.app.vault.getAbstractFileByPath(diaryPath);
		if (!(diaryAbstract instanceof TFile)) {
			new Notice("LuKit: Diary note not found; diary entry skipped.");
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
			new Notice("LuKit: Failed to write diary note: " + (e instanceof Error ? e.message : String(e)));
		}
	}
}
