import { existsSync } from "fs";
import { join } from "path";
import { FileSystemAdapter, Notice, Platform, Setting, TFile, type MarkdownFileInfo, type TAbstractFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID, type HelpEntry, type LuKitFeature } from "../../types";
import { createDeviceCache, type DeviceCache } from "./device-cache";
import { DropEmbed } from "./drop-embed";
import {
	MODIFY_DEBOUNCE_MS,
	RECONCILE_DELAY_MS,
	RENDER_TIMEOUT_MS,
	imageExtFor,
	isSource,
	mirrorPath,
	normalizePreviewFolder,
	writeMarkerJpeg,
	writeMarkerPng,
	type FailureEntry,
} from "./office-previews-engine";
import { PreviewQueue } from "./preview-queue";
import { PreviewStore } from "./preview-store";
import { createQuickLookRenderer, type PreviewRenderer } from "./quicklook-renderer";

export interface OfficePreviewsDeps {
	renderer: PreviewRenderer;
	random: () => number;
	shuffle: <T>(items: T[]) => T[];
	setTimeout: (fn: () => void, ms: number) => unknown;
	clearTimeout: (h: unknown) => void;
	now: () => number;
	fileExists: (abs: string) => boolean;
}

type Decision = "render" | "current" | "collision" | "failed";

const CMD_RENDER_ACTIVE = "office-previews-render-active";
const CMD_STATUS = "office-previews-status";
const NAME_RENDER_ACTIVE = "Office-Vorschau: Aktuelles Dokument jetzt erzeugen";
const NAME_STATUS = "Office-Vorschau: Status anzeigen";
const NOTICE_DISABLED = "Office-Vorschauen sind in den Einstellungen ausgeschaltet.";
const NOTICE_NOT_SOURCE = "Die aktive Datei ist kein unterstütztes Office-Dokument.";
const HINT_UNSUPPORTED = "Office-Vorschauen sind nur in der Desktop-App auf macOS verfügbar.";

function isSupportedPlatform(): boolean {
	return Platform.isDesktopApp && Platform.isMacOS;
}

function fisherYates<T>(items: T[], random: () => number): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

// Renders the first page of every Office/iWork/OpenDocument file into a
// mirror folder and keeps the images current. No locks across Macs: the source
// fingerprint lives inside each image, every job waits a random delay and
// re-checks before rendering, and image writes resolve "last modified wins".
export class OfficePreviewsFeature implements LuKitFeature {
	id = "office-previews";
	private readonly deps: OfficePreviewsDeps;
	private plugin: LuKitPlugin | null = null;
	private cache: DeviceCache | null = null;
	private queue: PreviewQueue | null = null;
	private store: PreviewStore | null = null;
	private dropEmbed: DropEmbed | null = null;
	private readonly debounce = new Map<string, unknown>();
	private reconcileTimer: unknown = null;
	/** Bumped by every stop; a reconcile loop from an older generation ends. */
	private generation = 0;
	/** Sources verified current in reconcile or rendered by this device since load. */
	private readonly current = new Set<string>();
	private disposed = false;
	/** Rename and delete events are handled one at a time, in event order. */
	private lifecycle: Promise<void> = Promise.resolve();

	constructor(deps: Partial<OfficePreviewsDeps> = {}) {
		const random = deps.random ?? Math.random;
		this.deps = {
			renderer: deps.renderer ?? createQuickLookRenderer(),
			random,
			shuffle: deps.shuffle ?? (<T>(items: T[]): T[] => fisherYates(items, random)),
			setTimeout: deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
			clearTimeout: deps.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)),
			now: deps.now ?? Date.now,
			fileExists: deps.fileExists ?? ((abs) => this.plugin?.app.vault.adapter instanceof FileSystemAdapter && existsSync(abs)),
		};
	}

	onload(plugin: LuKitPlugin): void {
		if (!isSupportedPlatform()) return;
		this.plugin = plugin;
		const { app } = plugin;
		this.cache = createDeviceCache(
			{ load: (key) => app.loadLocalStorage(key), save: (key, data) => app.saveLocalStorage(key, data) },
			this.deps,
		);
		this.store = new PreviewStore(app.vault.adapter);
		this.dropEmbed = new DropEmbed(app, this.deps);
		this.queue = new PreviewQueue({
			random: this.deps.random,
			setTimeout: this.deps.setTimeout,
			clearTimeout: this.deps.clearTimeout,
			recheck: (path, immediate) => this.recheck(path, immediate),
			run: (path) => this.run(path),
		});

		plugin.addCommand({ id: CMD_RENDER_ACTIVE, name: NAME_RENDER_ACTIVE, icon: LUKIT_ICON_ID, callback: () => this.renderActive() });
		plugin.addCommand({ id: CMD_STATUS, name: NAME_STATUS, icon: LUKIT_ICON_ID, callback: () => this.showStatus() });

		// Obsidian emits `create` for every existing file while the vault loads;
		// listening only after layout ready keeps that storm out of the queue.
		app.workspace.onLayoutReady(() => {
			if (this.disposed) return;
			plugin.registerEvent(app.vault.on("create", (f) => this.onCreate(f)));
			plugin.registerEvent(app.vault.on("modify", (f) => this.onModify(f)));
			plugin.registerEvent(app.vault.on("delete", (f) => this.onDelete(f)));
			plugin.registerEvent(app.vault.on("rename", (f, oldPath) => this.onRename(f, oldPath)));
			plugin.registerEvent(app.workspace.on("editor-drop", (evt, _editor, info) => this.onDrop(evt.dataTransfer, info)));
			plugin.registerEvent(app.workspace.on("editor-paste", (evt, _editor, info) => this.onDrop(evt.clipboardData, info)));
			if (this.enabled()) this.scheduleReconcile();
		});
	}

	onunload(): void {
		this.disposed = true;
		this.stopWork();
		this.cache?.dispose();
		this.deps.renderer.dispose();
	}

	/** Called after `settings.officePreviews.enabled` changed (requirement 2). */
	setEnabled(enabled: boolean): void {
		if (this.plugin === null || this.disposed) return;
		if (enabled) this.scheduleReconcile();
		else this.stopWork();
	}

	helpEntries(): HelpEntry[] {
		return [
			{
				commandId: CMD_RENDER_ACTIVE,
				displayName: NAME_RENDER_ACTIVE,
				description:
					"Erzeugt die Vorschau des aktiven Office-Dokuments sofort, ohne Wartezeit und auch dann, wenn ein früherer Versuch fehlgeschlagen ist.",
			},
			{
				commandId: CMD_STATUS,
				displayName: NAME_STATUS,
				description: "Zeigt, wie viele Vorschauen aktuell sind, wie viele in der Warteschlange stehen und wie viele fehlgeschlagen sind.",
			},
		];
	}

	renderSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		containerEl.createEl("h3", { text: "Office-Vorschauen" });
		if (!isSupportedPlatform()) {
			containerEl.createEl("p", { text: HINT_UNSUPPORTED });
			return;
		}
		const settings = plugin.settings.officePreviews;
		new Setting(containerEl)
			.setName("Vorschauen erzeugen")
			.setDesc("Rendert die erste Seite jedes Office-Dokuments mit Quick Look als Bild in den Vorschau-Ordner.")
			.addToggle((toggle) =>
				toggle.setValue(settings.enabled).onChange(async (value) => {
					settings.enabled = value;
					await plugin.saveSettings();
					this.setEnabled(value);
				}),
			);
		new Setting(containerEl)
			.setName("Vorschau-Ordner")
			.setDesc("Ordner im Vault, der die Ordnerstruktur der Dokumente spiegelt. Bestehende Vorschauen werden beim Ändern nicht verschoben.")
			.addText((text) =>
				text
					.setPlaceholder("_previews")
					.setValue(settings.folder)
					.onChange(async (value) => {
						settings.folder = normalizePreviewFolder(value);
						await plugin.saveSettings();
					}),
			);
	}

	// --- state --------------------------------------------------------------

	private enabled(): boolean {
		return this.plugin?.settings.officePreviews.enabled === true;
	}

	private folder(): string {
		return normalizePreviewFolder(this.plugin?.settings.officePreviews.folder ?? "");
	}

	private isSource(path: string): boolean {
		return isSource(path, this.folder());
	}

	private stopWork(): void {
		this.generation++;
		this.dropEmbed?.clear();
		this.queue?.clear();
		for (const t of this.debounce.values()) this.deps.clearTimeout(t);
		this.debounce.clear();
		if (this.reconcileTimer !== null) this.deps.clearTimeout(this.reconcileTimer);
		this.reconcileTimer = null;
	}

	private sourceFile(path: string): TFile | null {
		const f = this.plugin?.app.vault.getAbstractFileByPath(path);
		return f instanceof TFile ? f : null;
	}

	private absPath(path: string): string {
		const adapter = this.plugin?.app.vault.adapter as { getBasePath?: () => string } | undefined;
		return join(adapter?.getBasePath?.() ?? "", path);
	}

	private async fingerprint(file: TFile): Promise<string> {
		const adapter = this.plugin?.app.vault.adapter;
		if (adapter === undefined || this.cache === null) throw new Error("not loaded");
		return this.cache.getFingerprint(file.path, file.stat.mtime, file.stat.size, async () => new Uint8Array(await adapter.readBinary(file.path)));
	}

	private failure(sha256: string, reason: FailureEntry["reason"]): FailureEntry {
		return { sha256, reason, at: new Date(this.deps.now()).toISOString() };
	}

	// --- decision -----------------------------------------------------------

	/** Requirement 8: failure memory, collision, current, else render. */
	private async decide(path: string, sha256: string, bypassFailures: boolean): Promise<Decision> {
		const failure = this.cache?.getFailure(path);
		if (!bypassFailures && failure !== undefined && failure.sha256 === sha256) return "failed";
		const state = await this.store?.inspect(mirrorPath(path, this.folder()));
		if (state?.kind === "foreign") return "collision";
		if (state?.kind === "marked" && state.marker.sha256 === sha256) return "current";
		return "render";
	}

	/** Applies a decision's side effects; true when the source needs a render. */
	private applyDecision(path: string, sha256: string, decision: Decision): boolean {
		if (decision === "collision") this.cache?.setFailure(path, this.failure(sha256, "collision"));
		if (decision === "current") this.current.add(path);
		else this.current.delete(path);
		return decision === "render";
	}

	private async recheck(path: string, immediate: boolean): Promise<"render" | "skip"> {
		if (this.disposed) return "skip";
		const file = this.sourceFile(path);
		if (file === null || !this.deps.fileExists(this.absPath(path))) return "skip";
		let sha256: string;
		let decision: Decision;
		try {
			sha256 = await this.fingerprint(file);
			decision = await this.decide(path, sha256, immediate);
		} catch {
			console.warn("LuKit office previews: a source or its preview could not be read.");
			if (!this.disposed) this.dropEmbed?.onFailed(path);
			return "skip";
		}
		if (this.disposed) return "skip";
		const render = this.applyDecision(path, sha256, decision);
		// A dropped document whose preview is already current still gets its embed.
		if (decision === "current") await this.dropEmbed?.onPreview(path, mirrorPath(path, this.folder()));
		if (decision === "collision") this.dropEmbed?.onFailed(path);
		return render ? "render" : "skip";
	}

	private async run(path: string): Promise<void> {
		const file = this.sourceFile(path);
		if (file === null || this.disposed || !this.enabled() || !this.deps.fileExists(this.absPath(path))) return;
		// Stamped with the fingerprint from before the render: a change during
		// the render arrives as its own modify event and requeues the source.
		const sha256 = await this.fingerprint(file);
		const kind = imageExtFor(path);
		const result = await this.deps.renderer.render(this.absPath(path), kind, RENDER_TIMEOUT_MS);
		if (this.disposed) return;
		// Renamed or deleted during the render: the lifecycle events own the path now.
		if (this.sourceFile(path) !== file || file.path !== path) return;
		if (!result.ok) {
			this.current.delete(path);
			this.cache?.setFailure(path, this.failure(sha256, result.reason));
			this.dropEmbed?.onFailed(path);
			return;
		}
		const marker = { version: 1 as const, sha256 };
		const bytes = kind === "jpg" ? writeMarkerJpeg(result.bytes, marker) : writeMarkerPng(result.bytes, marker);
		const mirror = mirrorPath(path, this.folder());
		try {
			// A foreign file may have arrived during the render; it is never overwritten.
			const occupant = await this.store?.inspect(mirror);
			// Renamed or deleted while the mirror was inspected.
			if (this.disposed || this.sourceFile(path) !== file || file.path !== path) return;
			if (occupant?.kind === "foreign") {
				this.cache?.setFailure(path, this.failure(sha256, "collision"));
				this.dropEmbed?.onFailed(path);
				return;
			}
			await this.store?.write(mirror, bytes);
		} catch {
			if (this.disposed) return;
			this.cache?.setFailure(path, this.failure(sha256, "write"));
			this.dropEmbed?.onFailed(path);
			return;
		}
		if (this.disposed) return;
		this.cache?.clearFailure(path);
		this.current.add(path);
		await this.dropEmbed?.onPreview(path, mirror);
	}

	// --- events -------------------------------------------------------------

	private onCreate(file: TAbstractFile): void {
		if (!this.enabled() || !(file instanceof TFile)) return;
		const path = file.path;
		this.retryCollisionAt(path);
		void this.dropEmbed?.onFileCreated(path);
		if (!this.isSource(path)) return;
		if (this.dropEmbed?.match(path) === true) {
			// Requirement 24: a dropped document skips the debounce and the delay.
			const pending = this.debounce.get(path);
			if (pending !== undefined) this.deps.clearTimeout(pending);
			this.debounce.delete(path);
			this.queue?.enqueue(path, { immediate: true });
			return;
		}
		this.schedule(path);
	}

	/** Requirement 23: remember which note received which file names; never prevents the default. */
	private onDrop(data: DataTransfer | null, info: MarkdownFileInfo): void {
		if (!this.enabled()) return;
		const notePath = info.file?.path;
		if (notePath === undefined) return;
		this.dropEmbed?.record(notePath, Array.from(data?.files ?? [], (f) => f.name));
	}

	private onModify(file: TAbstractFile): void {
		if (!this.enabled() || !(file instanceof TFile)) return;
		void this.dropEmbed?.onNoteChanged(file.path);
		if (!this.isSource(file.path)) return;
		if (this.queue?.isImmediate(file.path) === true) return;
		this.schedule(file.path);
	}

	private onDelete(file: TAbstractFile): void {
		if (!this.enabled() || !(file instanceof TFile)) return;
		const path = file.path;
		this.retryCollisionAt(path);
		if (!this.isSource(path)) return;
		// Bookkeeping goes at event time, so a create that arrives before the
		// serialised file work (safe-save, sync) is not wiped by it.
		this.forget(path);
		this.cache?.removeEntry(path);
		this.serialise(() => this.handleDelete(path));
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		if (!this.enabled() || !(file instanceof TFile)) return;
		const newPath = file.path;
		if (!this.isSource(oldPath)) {
			if (this.isSource(newPath)) this.schedule(newPath);
			return;
		}
		if (!this.isSource(newPath)) {
			// The document left the preview's scope; its preview stays (requirement 17).
			this.forget(oldPath);
			this.cache?.removeEntry(oldPath);
			return;
		}
		// Bookkeeping moves at event time, so a debounce or job that comes due
		// while earlier renames are still being applied is not lost.
		const hadDebounce = this.debounce.has(oldPath);
		const wasCurrent = this.current.has(oldPath);
		this.queue?.rename(oldPath, newPath);
		this.forget(oldPath);
		this.cache?.moveEntry(oldPath, newPath);
		// A collision belonged to the old mirror path; the new one is checked afresh.
		if (this.cache?.getFailure(newPath)?.reason === "collision") this.cache.clearFailure(newPath);
		if (hadDebounce) this.schedule(newPath);
		this.serialise(() => this.handleRename(oldPath, newPath, wasCurrent));
	}

	private serialise(task: () => Promise<void>): void {
		this.lifecycle = this.lifecycle.then(async () => {
			if (this.disposed) return;
			try {
				await task();
			} catch {
				console.warn("LuKit office previews: a rename or delete could not be applied to its preview.");
			}
		});
	}

	/** Drops debounce, queued job and current-set membership; the queue and cache are moved separately. */
	private forget(path: string): void {
		const pending = this.debounce.get(path);
		if (pending !== undefined) this.deps.clearTimeout(pending);
		this.debounce.delete(path);
		this.queue?.remove(path);
		this.current.delete(path);
	}

	/** Requirement 15: delete the preview only when it carries the marker. */
	private async handleDelete(path: string): Promise<void> {
		// The source is back (delete + create of one path): its preview stays.
		if (this.sourceFile(path) !== null) return;
		const mirror = mirrorPath(path, this.folder());
		if ((await this.store?.inspect(mirror))?.kind !== "marked" || this.disposed || this.sourceFile(path) !== null) return;
		await this.store?.remove(mirror);
		if (this.disposed) return;
		await this.store?.removeEmptyParents(mirror, this.folder());
	}

	/** Requirement 14: move a marked preview with the source, never over an occupied path. */
	private async handleRename(oldPath: string, newPath: string, wasCurrent: boolean): Promise<void> {
		const folder = this.folder();
		const oldMirror = mirrorPath(oldPath, folder);
		const newMirror = mirrorPath(newPath, folder);
		const state = await this.store?.inspect(oldMirror);
		if (this.disposed) return;
		if (state?.kind !== "marked") {
			this.scheduleUnlessPending(newPath);
			return;
		}
		if (imageExtFor(oldPath) !== imageExtFor(newPath)) {
			// A png cannot move to a .jpg path: drop the old image and render anew.
			await this.store?.remove(oldMirror);
			if (this.disposed) return;
			await this.store?.removeEmptyParents(oldMirror, folder);
			this.scheduleUnlessPending(newPath);
			return;
		}
		const occupant = await this.store?.inspect(newMirror);
		if (this.disposed) return;
		if (occupant !== undefined && occupant.kind !== "absent") {
			const file = this.sourceFile(newPath);
			if (file === null) return;
			const sha256 = await this.fingerprint(file);
			if (this.disposed) return;
			// Another device already moved the preview: it is current, not a collision.
			if (occupant.kind === "marked" && occupant.marker.sha256 === sha256) this.current.add(newPath);
			else this.cache?.setFailure(newPath, this.failure(sha256, "collision"));
			return;
		}
		const preview = this.plugin?.app.vault.getAbstractFileByPath(oldMirror);
		if (!(preview instanceof TFile)) {
			// Written but not indexed yet: renameFile cannot move it, so render anew.
			await this.store?.remove(oldMirror);
			if (this.disposed) return;
			await this.store?.removeEmptyParents(oldMirror, folder);
			this.scheduleUnlessPending(newPath);
			return;
		}
		await this.store?.ensureParent(newMirror);
		if (this.disposed) return;
		try {
			await this.plugin?.app.fileManager.renameFile(preview, newMirror);
		} catch {
			console.warn("LuKit office previews: a preview could not be moved with its document.");
			return;
		}
		if (wasCurrent) this.current.add(newPath);
		if (this.disposed) return;
		await this.store?.removeEmptyParents(oldMirror, folder);
		// The moved image may be stale (e.g. a re-render was running when the rename came in).
		this.scheduleUnlessPending(newPath);
	}

	private scheduleUnlessPending(path: string): void {
		if (this.queue?.has(path) !== true && !this.debounce.has(path)) this.schedule(path);
	}

	/** Requirement 11: a create/delete at a collision's mirror path clears it and queues the source. */
	private retryCollisionAt(path: string): void {
		for (const [source, f] of this.cache?.failures() ?? []) {
			if (f.reason !== "collision" || mirrorPath(source, this.folder()) !== path) continue;
			this.cache?.clearFailure(source);
			this.queue?.enqueue(source);
		}
	}

	/** Per-path debounce, then fingerprint, decide and enqueue (requirement 13). */
	private schedule(path: string): void {
		const pending = this.debounce.get(path);
		if (pending !== undefined) this.deps.clearTimeout(pending);
		this.debounce.set(
			path,
			this.deps.setTimeout(() => {
				this.debounce.delete(path);
				void this.evaluate(path);
			}, MODIFY_DEBOUNCE_MS),
		);
	}

	private async evaluate(path: string): Promise<void> {
		const file = this.sourceFile(path);
		if (file === null || this.disposed) return;
		let sha256: string;
		let decision: Decision;
		try {
			sha256 = await this.fingerprint(file);
			decision = await this.decide(path, sha256, false);
		} catch {
			console.warn("LuKit office previews: a source or its preview could not be read.");
			return;
		}
		if (this.disposed || !this.enabled()) return;
		if (this.applyDecision(path, sha256, decision)) this.queue?.enqueue(path);
	}

	// --- reconcile ----------------------------------------------------------

	private scheduleReconcile(): void {
		if (this.reconcileTimer !== null) this.deps.clearTimeout(this.reconcileTimer);
		this.reconcileTimer = this.deps.setTimeout(() => {
			this.reconcileTimer = null;
			void this.reconcile();
		}, RECONCILE_DELAY_MS);
	}

	/** Requirement 12: every source once, in shuffled order, yielding between files. */
	private async reconcile(): Promise<void> {
		const plugin = this.plugin;
		if (plugin === null) return;
		const generation = this.generation;
		const live = (): boolean => !this.disposed && this.enabled() && this.generation === generation;
		const paths = this.deps.shuffle(plugin.app.vault.getFiles().map((f) => f.path).filter((p) => this.isSource(p)));
		for (const path of paths) {
			await new Promise<void>((resolve) => this.deps.setTimeout(resolve, 0));
			if (!live()) return;
			const file = this.sourceFile(path);
			if (file === null) continue;
			try {
				const sha256 = await this.fingerprint(file);
				const decision = await this.decide(file.path, sha256, false);
				if (!live()) return;
				if (this.applyDecision(file.path, sha256, decision)) this.queue?.enqueue(file.path);
			} catch {
				console.warn("LuKit office previews: a source or its preview could not be read.");
			}
		}
		this.cache?.flush();
	}

	// --- commands -----------------------------------------------------------

	private renderActive(): void {
		if (!this.enabled()) {
			new Notice(NOTICE_DISABLED);
			return;
		}
		const file = this.plugin?.app.workspace.getActiveFile();
		if (!file || !this.isSource(file.path)) {
			new Notice(NOTICE_NOT_SOURCE);
			return;
		}
		this.queue?.enqueue(file.path, { immediate: true });
	}

	private showStatus(): void {
		if (!this.enabled()) {
			new Notice(NOTICE_DISABLED);
			return;
		}
		new Notice(
			`Office-Vorschau: ${this.current.size} aktuell, ${this.queue?.length ?? 0} in der Warteschlange, ${this.cache?.failureCount() ?? 0} fehlgeschlagen`,
		);
	}
}
