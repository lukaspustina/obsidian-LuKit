import { MarkdownView, TFile, type App } from "obsidian";
import type { DropEmbedDeps } from "./drop-embed";
import { DROP_EMBED_DEADLINE_MS, mirrorPath, planAutoEmbed, type AutoEmbedPlan } from "./office-previews-engine";

export interface AutoEmbedOptions {
	/** The normalized preview folder, read lazily. */
	folder: () => string;
	/** False once the feature is disposed or disabled. */
	live: () => boolean;
	isDropPending: (notePath: string, sourcePath: string) => boolean;
}

/** The error's type for a log line; never its message, which may hold a path. */
function errorType(e: unknown): string {
	return e instanceof Error ? e.name : typeof e;
}

export interface BackfillResult {
	/** Embeds inserted. */
	embeds: number;
	/** Notes changed. */
	notes: number;
}

interface Waiter {
	resolve: (indexed: boolean) => void;
	timer: unknown;
}

// Embeds a preview this device just wrote into every note that links its
// document. All note writes run one at a time on one chain, in the order the
// sources entered it; a source whose image is not indexed yet waits outside it.
export class AutoEmbed {
	private chain: Promise<void> = Promise.resolve();
	/** Bumped by reset(); a pass from an older generation writes nothing more. */
	private generation = 0;
	private readonly waiters = new Map<string, Waiter[]>();
	/** Identifies the running backfill; cleared by reset(). */
	private backfillRun: object | null = null;

	constructor(
		private readonly app: App,
		private readonly deps: DropEmbedDeps,
		private readonly options: AutoEmbedOptions,
	) {}

	/** Enqueues the pass for one source; resolves once the pass is on the chain. Never throws. */
	async embedEverywhere(sourcePath: string, mirror: string): Promise<void> {
		const generation = this.generation;
		const indexed = await this.indexed(mirror);
		// A reset while waiting dropped the pass; that is no indexing failure.
		if (generation !== this.generation) return;
		if (!indexed) {
			console.warn("LuKit office previews: a preview was not indexed in time; its notes were not updated.");
			return;
		}
		this.chain = this.chain.then(async () => {
			try {
				await this.pass(sourcePath, generation);
			} catch (e) {
				console.warn(`LuKit office previews: notes could not be updated with a preview embed (${errorType(e)}).`);
			}
		});
	}

	/** A vault create event: releases a pass that waited for its image to be indexed. */
	onFileCreated(path: string): void {
		const list = this.waiters.get(path);
		if (list === undefined) return;
		this.waiters.delete(path);
		for (const w of list) {
			this.deps.clearTimeout(w.timer);
			w.resolve(true);
		}
	}

	/**
	 * Called by the feature's stopWork(): queued and waiting passes are dropped, not
	 * resumed. The chain itself stays, so a later pass still waits for a write in flight.
	 */
	reset(): void {
		this.generation++;
		this.backfillRun = null;
		for (const list of this.waiters.values()) {
			for (const w of list) {
				this.deps.clearTimeout(w.timer);
				w.resolve(false);
			}
		}
		this.waiters.clear();
	}

	isBackfilling(): boolean {
		return this.backfillRun !== null;
	}

	/**
	 * Embeds the images of `collect()`'s sources (in that order) into their linking
	 * notes, through the same chain as automatic embedding. The linking notes come
	 * from one read of `resolvedLinks`. Null when reset, disposed or disabled meanwhile.
	 */
	async backfill(collect: () => Promise<string[]>): Promise<BackfillResult | null> {
		const run = {};
		this.backfillRun = run;
		const generation = this.generation;
		try {
			const sources = await collect();
			if (!this.alive(generation)) return null;
			const index = this.linkIndex(new Set(sources));
			const changed = new Set<string>();
			let embeds = 0;
			for (const source of sources) {
				this.chain = this.chain.then(async () => {
					try {
						for (const note of await this.pass(source, generation, index.get(source) ?? [])) {
							embeds++;
							changed.add(note);
						}
					} catch (e) {
						console.warn(`LuKit office previews: notes could not be updated with a preview embed (${errorType(e)}).`);
					}
				});
			}
			await this.chain;
			return this.alive(generation) ? { embeds, notes: changed.size } : null;
		} finally {
			if (this.backfillRun === run) this.backfillRun = null;
		}
	}

	private alive(generation: number): boolean {
		return this.options.live() && generation === this.generation;
	}

	private async indexed(mirror: string): Promise<boolean> {
		if (this.app.vault.getAbstractFileByPath(mirror) instanceof TFile) return true;
		return new Promise<boolean>((resolve) => {
			const list = this.waiters.get(mirror) ?? [];
			const waiter: Waiter = {
				resolve,
				timer: this.deps.setTimeout(() => {
					const rest = (this.waiters.get(mirror) ?? []).filter((w) => w !== waiter);
					if (rest.length > 0) this.waiters.set(mirror, rest);
					else this.waiters.delete(mirror);
					resolve(false);
				}, DROP_EMBED_DEADLINE_MS),
			};
			list.push(waiter);
			this.waiters.set(mirror, list);
		});
	}

	/** Source → the Markdown notes linking it (embed or plain link), outside the preview folder; one read of resolvedLinks. */
	private linkIndex(sources: ReadonlySet<string>): Map<string, string[]> {
		const prefix = this.options.folder() + "/";
		const index = new Map<string, string[]>();
		for (const [note, targets] of Object.entries(this.app.metadataCache.resolvedLinks)) {
			// Markdown notes only: a canvas or other file in resolvedLinks is JSON, not a note.
			if (note.startsWith(prefix) || !note.endsWith(".md")) continue;
			for (const target of Object.keys(targets)) {
				if (!sources.has(target)) continue;
				const notes = index.get(target);
				if (notes === undefined) index.set(target, [note]);
				else notes.push(note);
			}
		}
		return index;
	}

	/** Embeds into every linking note, one at a time; the notes changed. */
	private async pass(
		sourcePath: string,
		generation: number,
		notes: string[] = this.linkIndex(new Set([sourcePath])).get(sourcePath) ?? [],
	): Promise<string[]> {
		const changed: string[] = [];
		for (const notePath of notes) {
			await new Promise<void>((resolve) => this.deps.setTimeout(resolve, 0));
			if (!this.alive(generation)) return changed;
			if (this.options.isDropPending(notePath, sourcePath)) continue;
			try {
				if (await this.embedInto(notePath, sourcePath, generation)) changed.push(notePath);
			} catch (e) {
				console.warn(`LuKit office previews: a note could not be updated with a preview embed (${errorType(e)}).`);
			}
		}
		return changed;
	}

	/** True when the note gained the embed. */
	private async embedInto(notePath: string, sourcePath: string, generation: number): Promise<boolean> {
		const { vault, metadataCache, fileManager, workspace } = this.app;
		const folder = this.options.folder();
		// Re-resolved at write time: a rename or delete may have moved either file.
		const image = vault.getAbstractFileByPath(mirrorPath(sourcePath, folder));
		if (!(vault.getAbstractFileByPath(sourcePath) instanceof TFile) || !(image instanceof TFile)) return false;
		const dest = (linkpath: string): string | undefined => metadataCache.getFirstLinkpathDest(linkpath, notePath)?.path;
		const embedText = "!" + fileManager.generateMarkdownLink(image, notePath);
		const plan = (content: string): AutoEmbedPlan | null =>
			planAutoEmbed(
				content,
				(l) => dest(l) === sourcePath,
				(l) => dest(l) === image.path,
				(l) => dest(l)?.startsWith(folder + "/") === true,
				embedText,
			);

		let view: MarkdownView | null = null;
		workspace.iterateAllLeaves((leaf) => {
			if (view === null && leaf.view instanceof MarkdownView && leaf.view.file?.path === notePath) view = leaf.view;
		});
		const editor = (view as MarkdownView | null)?.editor;
		if (editor !== undefined) {
			const p = plan(editor.getValue());
			if (p === null) return false;
			const end = { line: p.lineIndex, ch: editor.getLine(p.lineIndex).length };
			editor.transaction({ changes: [{ from: end, to: end, text: "\n" + p.text }] });
			return true;
		}
		const note = vault.getAbstractFileByPath(notePath);
		if (!(note instanceof TFile)) return false;
		if (plan(await vault.read(note)) === null || !this.alive(generation)) return false;
		let inserted = false;
		await vault.process(note, (content) => {
			const p = plan(content);
			if (p === null) return content;
			inserted = true;
			return p.newContent;
		});
		return inserted;
	}
}
