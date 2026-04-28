import { Notice, TFile, normalizePath } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature } from "../../types";
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
import { addVorgangSectionLinked, formatLinkedBullet } from "../vorgang/vorgang-engine";
import { extractDateFromTitle } from "../../shared/date-format";

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
	}

	onunload(): void {
		// Nothing to clean up
	}

	renderSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		renderBesprechungSettings(containerEl, plugin);
	}

	private addBesprechungSummaryCmd(): void {
		const folderPath = this.plugin.settings.besprechung.folderPath;
		if (!folderPath) {
			new Notice("LuKit: No Besprechung folder configured. Set it in Settings → LuKit.");
			return;
		}

		new FolderNoteSuggestModal(this.plugin.app, folderPath, "Pick a Besprechung…", (besprechungFile) => {
			void this.insertBesprechungSummary(besprechungFile);
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
					await this.insertBesprechungSummary(besprechungFile);
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
			const expectedBullet = formatLinkedBullet(besprechungFile.basename, locale, date);
			if (vorgangContent.includes(expectedBullet)) {
				new Notice(`LuKit: "${besprechungFile.basename}" is already linked. Skipped.`);
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
		} else {
			const cursor = activeEditor.getCursor();
			activeEditor.replaceRange(summary, cursor);
		}
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
				placeholder,
				(vorgang) => {
					i++;
					void this.fileBesprechungIntoVorgang(besprechung, vorgang).then(next);
				},
				() => {
					i++;
					next();
				},
				() => {
					i++;
					void this.dropPending(besprechung).then(next);
				},
				() => {
					void this.plugin.app.workspace.getLeaf("tab").openFile(besprechung);
					new Notice(`LuKit: Stopped at "${besprechung.basename}" (${i} done, ${pending.length - i} remaining).`);
				},
				() => {
					new Notice(`LuKit: Filing stopped (${i} done, ${pending.length - i} remaining).`);
				},
			).open();
		};
		next();
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
		const expectedBullet = formatLinkedBullet(besprechung.basename, locale, date);

		try {
			if (vorgangContent.includes(expectedBullet)) {
				await this.markFiled(besprechung, vorgang, pendingTag);
				new Notice(`LuKit: "${besprechung.basename}" already linked in "${vorgang.basename}". Removed "${pendingTag}".`);
				return;
			}

			const { newContent } = addVorgangSectionLinked(
				vorgangContent,
				besprechung.basename,
				locale,
				date,
				summary.split("\n"),
			);
			await this.plugin.app.vault.modify(vorgang, newContent);
			await this.markFiled(besprechung, vorgang, pendingTag);
			new Notice(`LuKit: Filed "${besprechung.basename}" under "${vorgang.basename}".`);
		} catch (e) {
			// Pending tag stays so the user can retry.
			new Notice(`LuKit: Failed to file "${besprechung.basename}" into "${vorgang.basename}": ` + (e instanceof Error ? e.message : String(e)));
		}
	}

	private async removePendingTag(file: TFile, tag: string): Promise<void> {
		await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
			removeTagFromFrontmatter(fm, tag);
		});
	}

	private async markFiled(besprechung: TFile, vorgang: TFile, pendingTag: string): Promise<void> {
		const now = new Date();
		await this.plugin.app.fileManager.processFrontMatter(besprechung, (fm) => {
			removeTagFromFrontmatter(fm, pendingTag);
			markFiledInFrontmatter(fm, vorgang.basename, now);
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
}
