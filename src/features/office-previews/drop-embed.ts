import { MarkdownView, Notice, TFile, type App } from "obsidian";
import {
	DROP_EMBED_DEADLINE_MS,
	DROP_WINDOW_MS,
	matchDrop,
	planPreviewInsertion,
	transformLinkLine,
	type DropRecord,
} from "./office-previews-engine";

export type { DropRecord } from "./office-previews-engine";

export interface DropEmbedDeps {
	setTimeout: (fn: () => void, ms: number) => unknown;
	clearTimeout: (h: unknown) => void;
	now: () => number;
}

interface PendingEmbed {
	notePath: string;
	deadline: unknown;
	/** Mirror path awaited when the written preview is not indexed by the vault yet. */
	awaiting: string | null;
	/** Set once the preview exists but the note has no link yet: retried on each note change. */
	preview: TFile | null;
}

type InsertOutcome = "inserted" | "no-link" | "unchanged";

function nameOf(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

// Drag & drop / paste of documents into a note: remembers which note received
// which file names, matches the attachment Obsidian then creates, and once its
// preview exists inserts the preview embed below the document link.
export class DropEmbed {
	private records: DropRecord[] = [];
	private readonly pending = new Map<string, PendingEmbed>();

	constructor(private readonly app: App, private readonly deps: DropEmbedDeps) {}

	/** Requirement 23: called from editor-drop / editor-paste; never prevents the default. */
	record(notePath: string, names: string[]): void {
		this.prune();
		if (names.length === 0) return;
		this.records.push({ notePath, names: [...names], at: this.deps.now() });
	}

	/** True when a just-created source belongs to a recorded drop; starts its deadline. */
	match(sourcePath: string): boolean {
		this.prune();
		const record = matchDrop(this.records, nameOf(sourcePath), this.deps.now());
		if (record === null) return false;
		this.cancel(sourcePath);
		this.pending.set(sourcePath, {
			notePath: record.notePath,
			awaiting: null,
			preview: null,
			deadline: this.deps.setTimeout(() => this.pending.delete(sourcePath), DROP_EMBED_DEADLINE_MS),
		});
		return true;
	}

	/** Live drop records; a read-only view for tests of the pruning rule. */
	recordCount(): number {
		return this.records.length;
	}

	/** True while the drop record of `sourcePath` waits to embed into `notePath`. */
	isPending(notePath: string, sourcePath: string): boolean {
		return this.pending.get(sourcePath)?.notePath === notePath;
	}

	/** The preview exists: insert its embed below the document link. */
	async onPreview(sourcePath: string, mirror: string): Promise<void> {
		const entry = this.pending.get(sourcePath);
		if (entry === undefined) return;
		const preview = this.app.vault.getAbstractFileByPath(mirror);
		if (!(preview instanceof TFile)) {
			entry.awaiting = mirror;
			return;
		}
		await this.attempt(sourcePath, entry, preview);
	}

	/** A note changed: Obsidian writes the dropped link only after the attachment is saved. */
	async onNoteChanged(notePath: string): Promise<void> {
		for (const [sourcePath, entry] of this.pending) {
			if (entry.notePath === notePath && entry.preview !== null) await this.attempt(sourcePath, entry, entry.preview);
		}
	}

	// The link may not be in the note yet; until the deadline a missing link is
	// retried on the next note change rather than treated as removed.
	private async attempt(sourcePath: string, entry: PendingEmbed, preview: TFile): Promise<void> {
		entry.preview = preview;
		entry.awaiting = null;
		if ((await this.insert(entry.notePath, sourcePath, preview)) !== "no-link") this.cancel(sourcePath);
	}

	/** A vault create event: completes an insertion that waited for the preview to be indexed. */
	async onFileCreated(path: string): Promise<void> {
		for (const [sourcePath, entry] of this.pending) {
			if (entry.awaiting === path) await this.onPreview(sourcePath, path);
		}
	}

	/** The render failed but a placeholder exists: one Notice, and the placeholder is embedded. */
	async onPlaceholder(sourcePath: string, mirror: string): Promise<void> {
		if (!this.pending.has(sourcePath)) return;
		new Notice(`Office-Vorschau fehlgeschlagen: ${nameOf(sourcePath)}`);
		await this.onPreview(sourcePath, mirror);
	}

	/** Requirement 27: one Notice per dropped source whose render failed. */
	onFailed(sourcePath: string): void {
		if (!this.pending.has(sourcePath)) return;
		this.cancel(sourcePath);
		new Notice(`Office-Vorschau fehlgeschlagen: ${nameOf(sourcePath)}`);
	}

	clear(): void {
		for (const path of [...this.pending.keys()]) this.cancel(path);
		this.records = [];
	}

	private cancel(sourcePath: string): void {
		const entry = this.pending.get(sourcePath);
		if (entry === undefined) return;
		this.deps.clearTimeout(entry.deadline);
		this.pending.delete(sourcePath);
	}

	private prune(): void {
		const now = this.deps.now();
		this.records = this.records.filter((r) => now - r.at <= DROP_WINDOW_MS && r.names.length > 0);
	}

	/** Requirements 25/26: one editor transaction, or vault.process when the note is not open. */
	private async insert(notePath: string, sourcePath: string, preview: TFile): Promise<InsertOutcome> {
		const { metadataCache, fileManager, vault, workspace } = this.app;
		const resolvesTo = (target: string) => (linkpath: string): boolean =>
			metadataCache.getFirstLinkpathDest(linkpath, notePath)?.path === target;
		const isSourceLink = resolvesTo(sourcePath);
		const isPreviewLink = resolvesTo(preview.path);
		const embedText = "!" + fileManager.generateMarkdownLink(preview, notePath);
		const plan = (content: string): ReturnType<typeof planPreviewInsertion> =>
			planPreviewInsertion(content, isSourceLink, isPreviewLink, embedText);
		const noLinkOr = (content: string): InsertOutcome => {
			for (const line of content.split("\n")) {
				if (transformLinkLine(line, isSourceLink).matched) return "unchanged";
			}
			return "no-link";
		};

		let view: MarkdownView | null = null;
		workspace.iterateAllLeaves((leaf) => {
			if (view === null && leaf.view instanceof MarkdownView && leaf.view.file?.path === notePath) view = leaf.view;
		});
		const editor = (view as MarkdownView | null)?.editor;
		if (editor !== undefined) {
			const content = editor.getValue();
			const p = plan(content);
			if (p === null) return noLinkOr(content);
			const line = editor.getLine(p.lineIndex);
			editor.transaction({ changes: [{ from: { line: p.lineIndex, ch: 0 }, to: { line: p.lineIndex, ch: line.length }, text: p.replacement }] });
			return "inserted";
		}
		const note = vault.getAbstractFileByPath(notePath);
		if (!(note instanceof TFile)) return "unchanged";
		const current = await vault.read(note);
		// Unloaded, disabled or past the deadline while the note was read.
		if (!this.pending.has(sourcePath)) return "unchanged";
		if (plan(current) === null) return noLinkOr(current);
		// The note may have changed since the read; its fresh content decides the outcome.
		let outcome: InsertOutcome = "inserted";
		await vault.process(note, (content) => {
			const p = plan(content);
			if (p === null) {
				outcome = noLinkOr(content);
				return content;
			}
			const lines = content.split("\n");
			lines[p.lineIndex] = p.replacement;
			return lines.join("\n");
		});
		return outcome;
	}
}
