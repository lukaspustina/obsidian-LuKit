// Headless harness for the office-previews feature (SDD office-previews, phases 2-4).
// Builds a fake app (binary vault with events, adapter, fileManager, metadataCache,
// workspace with leaves/editors, device-local storage), a fake renderer, counted
// timers on vitest fake timers, a seeded RNG and an injectable shuffle, then
// loads OfficePreviewsFeature against it.

import { vi } from "vitest";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { MarkdownView, TFile, __resetPlatform, __setPlatform } from "./obsidian-stub";
import { makeTestSettings, noticeMessages, resetNotices } from "./obsidian-mocks";
import type { LuKitSettings } from "../../src/types";
import type LuKitPlugin from "../../src/main";
import { OfficePreviewsFeature } from "../../src/features/office-previews/office-previews-feature";
import type { PreviewRenderer, RenderResult } from "../../src/features/office-previews/quicklook-renderer";
import {
	JITTER_MAX_MS,
	MODIFY_DEBOUNCE_MS,
	RECONCILE_DELAY_MS,
	mirrorPath,
	readMarker,
	writeMarkerJpeg,
	writeMarkerPng,
	type ImageExt,
	type PreviewMarker,
} from "../../src/features/office-previews/office-previews-engine";

export const BASE_PATH = "/vault";
const enc = new TextEncoder();
const dec = new TextDecoder();

// --- fixtures ---------------------------------------------------------------

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) {
		c ^= b;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const typeAndData = new Uint8Array([...enc.encode(type), ...data]);
	const len = data.length;
	const crc = crc32(typeAndData);
	return new Uint8Array([
		len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255,
		...typeAndData,
		crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255,
	]);
}

/** A valid 1x1 RGB PNG; `shade` varies the pixel so two fixtures differ. */
export function tinyPng(shade = 0): Uint8Array {
	const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
	const idat = new Uint8Array(deflateSync(Buffer.from([0, shade & 255, 0, 0])));
	return new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		...pngChunk("IHDR", ihdr),
		...pngChunk("IDAT", idat),
		...pngChunk("IEND", new Uint8Array(0)),
	]);
}

/** A structurally valid JPEG stream (SOI, APP0, DQT, SOF0, SOS, scan, EOI). */
export function tinyJpeg(shade = 0): Uint8Array {
	const seg = (m: number, payload: number[]): number[] => [0xff, m, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
	return new Uint8Array([
		0xff, 0xd8,
		...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
		...seg(0xdb, [0, ...Array.from({ length: 64 }, (_, i) => (i + 1) & 0x7f)]),
		...seg(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
		...seg(0xda, [1, 1, 0, 0, 0x3f, 0]),
		0x12, shade & 0x7f, 0x56,
		0xff, 0xd9,
	]);
}

export function sha256Of(content: Uint8Array | string): string {
	return createHash("sha256").update(typeof content === "string" ? enc.encode(content) : content).digest("hex");
}

/** Preview bytes carrying a LuKit marker for `sha256`, in the format of `sourcePath`. */
export function markedPreview(sourcePath: string, sha256: string, version: number = 1): Uint8Array {
	const marker = { version, sha256 } as unknown as PreviewMarker;
	return sourcePath.toLowerCase().match(/\.(pptx|ppt|key|odp)$/)
		? writeMarkerJpeg(tinyJpeg(), marker)
		: writeMarkerPng(tinyPng(), marker);
}

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// --- fake renderer ----------------------------------------------------------

interface HeldRender { absSource: string; kind: ImageExt; resolve: (r: RenderResult) => void }

export class FakeRenderer implements PreviewRenderer {
	calls: { absSource: string; kind: ImageExt; timeoutMs: number }[] = [];
	disposeCalls = 0;
	inFlight = 0;
	maxInFlight = 0;
	/** Result factory for non-held renders. Default: success with fixture bytes. */
	result: (absSource: string, kind: ImageExt) => RenderResult = (_a, kind) => ({
		ok: true,
		bytes: kind === "jpg" ? tinyJpeg() : tinyPng(),
	});
	private holding = false;
	readonly held: HeldRender[] = [];

	/** Subsequent renders stay pending until release() is called. */
	hold(): void { this.holding = true; }
	/** Stop holding; already held renders stay pending until released. */
	unhold(): void { this.holding = false; }
	/** Resolves the oldest held render with `result` (default: the result factory). */
	release(result?: RenderResult): void {
		const h = this.held.shift();
		if (h === undefined) throw new Error("FakeRenderer: nothing held");
		h.resolve(result ?? this.result(h.absSource, h.kind));
	}
	failWith(reason: "timeout" | "exit" | "no-output"): void {
		this.result = () => ({ ok: false, reason });
	}

	async render(absSource: string, kind: ImageExt, timeoutMs: number): Promise<RenderResult> {
		this.calls.push({ absSource, kind, timeoutMs });
		this.inFlight++;
		this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
		try {
			if (this.holding) {
				return await new Promise<RenderResult>((resolve) => this.held.push({ absSource, kind, resolve }));
			}
			return this.result(absSource, kind);
		} finally {
			this.inFlight--;
		}
	}

	dispose(): void { this.disposeCalls++; }

	/** Vault paths rendered so far, in order. */
	renderedPaths(): string[] {
		return this.calls.map((c) => c.absSource.slice(BASE_PATH.length + 1));
	}
}

// --- fake editor ------------------------------------------------------------

export interface EditorChange { from: { line: number; ch: number }; to?: { line: number; ch: number }; text: string }

export class FakeEditor {
	transactions: { changes: EditorChange[] }[] = [];
	private history: string[] = [];
	constructor(public value: string) {}
	getValue(): string { return this.value; }
	setValue(v: string): void { this.value = v; }
	lineCount(): number { return this.value.split("\n").length; }
	getLine(n: number): string { return this.value.split("\n")[n] ?? ""; }
	private offset(pos: { line: number; ch: number }): number {
		const lines = this.value.split("\n");
		let off = 0;
		for (let i = 0; i < pos.line; i++) off += lines[i].length + 1;
		return off + pos.ch;
	}
	transaction(tx: { changes?: EditorChange[]; selection?: unknown }): void {
		const changes = tx.changes ?? [];
		this.transactions.push({ changes });
		this.history.push(this.value);
		// Apply from the end so earlier offsets stay valid.
		const sorted = [...changes].sort((a, b) => this.offset(b.from) - this.offset(a.from));
		let v = this.value;
		for (const c of sorted) {
			const from = this.offset(c.from);
			const to = this.offset(c.to ?? c.from);
			v = v.slice(0, from) + c.text + v.slice(to);
		}
		this.value = v;
	}
	/** One undo step reverts one transaction. */
	undo(): void {
		const prev = this.history.pop();
		if (prev !== undefined) this.value = prev;
	}
	replaceRange(text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }): void {
		this.transaction({ changes: [{ from, to, text }] });
	}
}

// --- harness ----------------------------------------------------------------

type Listener = (...args: unknown[]) => unknown;

export interface HarnessOptions {
	enabled?: boolean;
	folder?: string;
	platform?: { isDesktopApp?: boolean; isMacOS?: boolean };
	/** Device-local storage to start from (shared across harnesses to simulate a reload). */
	storage?: Map<string, unknown>;
	seed?: number;
	shuffle?: <T>(items: T[]) => T[];
	fileExists?: (abs: string) => boolean;
	/** Do not call feature.onload (default: load). */
	load?: boolean;
	/** "shortest" (default, `[[name]]`) or "absolute" (`[[full/path]]`) for generateMarkdownLink. */
	linkStyle?: "shortest" | "absolute";
}

interface VaultEntry { bytes: Uint8Array; file: TFile }

export interface Harness {
	feature: OfficePreviewsFeature;
	/** The injected empty-folder removal (fs.rmdir semantics). */
	removeEmptyDir: ReturnType<typeof vi.fn>;
	plugin: { app: unknown; settings: LuKitSettings; commands: Map<string, { id: string; name: string; icon?: string; callback?: () => unknown; checkCallback?: (checking: boolean) => unknown }>; registered: unknown[] };
	renderer: FakeRenderer;
	storage: Map<string, unknown>;
	saveLocalStorageCalls: { key: string; data: unknown }[];
	adapterCalls: { op: string; path: string }[];
	vaultListeners: Map<string, Listener[]>;
	workspaceListeners: Map<string, Listener[]>;
	timersScheduled: number;
	leaves: { view: MarkdownView }[];
	settings: LuKitSettings;

	addSource(path: string, content?: Uint8Array | string): TFile;
	putFile(path: string, content: Uint8Array | string): TFile;
	createSource(path: string, content?: Uint8Array | string): TFile;
	changeSource(path: string, content: Uint8Array | string): void;
	/** Vault rename of a file plus the rename event (old path). */
	renameSource(oldPath: string, newPath: string): void;
	deleteFile(path: string): void;
	emit(event: "create" | "modify" | "delete" | "rename", path: string, oldPath?: string): void;
	read(path: string): Uint8Array | undefined;
	readText(path: string): string | undefined;
	exists(path: string): boolean;
	files(): string[];
	folders(): string[];
	preview(sourcePath: string): Uint8Array | undefined;
	previewMarker(sourcePath: string): PreviewMarker | null;
	mirror(sourcePath: string): string;
	setActiveFile(path: string | null): void;
	openNote(path: string): FakeEditor;
	closeNote(path: string): void;
	drop(notePath: string, names: string[]): void;
	paste(notePath: string, names: string[]): void;
	layoutReady(): void;
	advance(ms: number): Promise<void>;
	/** Flush pending microtasks and zero-delay timers. */
	settle(): Promise<void>;
	/** layoutReady + RECONCILE_DELAY_MS + drain. */
	start(): Promise<void>;
	/** Advance until every queued job (jitter + debounce) has run. */
	drain(): Promise<void>;
	runCommand(id: string): Promise<void>;
	notices(): readonly string[];
	lastNotice(): string | undefined;
	/** Status counts parsed from the status command's Notice. */
	status(): Promise<{ current: number; queued: number; failed: number }>;
	setEnabled(enabled: boolean): void;
	unload(): void;
	dispose(): void;
}

export function createHarness(opts: HarnessOptions = {}): Harness {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
	// crypto.subtle.digest resolves on a native thread, outside the fake clock, so
	// a hash started inside advance() would not finish there. The stub resolves
	// as a microtask with the same digest.
	const digestSpy = vi.spyOn(crypto.subtle, "digest").mockImplementation(
		async (_alg: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
			const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			const out = createHash("sha256").update(view).digest();
			return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
		},
	);
	resetNotices();
	if (opts.platform) __setPlatform(opts.platform);

	const entries = new Map<string, VaultEntry>();
	const folderSet = new Set<string>();
	const vaultListeners = new Map<string, Listener[]>();
	const workspaceListeners = new Map<string, Listener[]>();
	const layoutCallbacks: (() => unknown)[] = [];
	let isLayoutReady = false;
	const storage = opts.storage ?? new Map<string, unknown>();
	const saveLocalStorageCalls: { key: string; data: unknown }[] = [];
	const adapterCalls: { op: string; path: string }[] = [];
	const leaves: { view: MarkdownView }[] = [];
	let activeFile: TFile | null = null;

	const addFolders = (path: string): void => {
		const parts = path.split("/");
		for (let i = 1; i < parts.length; i++) folderSet.add(parts.slice(0, i).join("/"));
	};
	const makeFile = (path: string, bytes: Uint8Array): TFile => {
		const existing = entries.get(path);
		const file = existing?.file ?? new TFile();
		file.path = path;
		const name = path.slice(path.lastIndexOf("/") + 1);
		const dot = name.lastIndexOf(".");
		file.basename = dot > 0 ? name.slice(0, dot) : name;
		file.extension = dot > 0 ? name.slice(dot + 1) : "";
		(file as unknown as { name: string }).name = name;
		const prevMtime = existing?.file.stat.mtime ?? 0;
		file.stat = { mtime: Math.max(Date.now(), prevMtime + 1), ctime: existing?.file.stat.ctime ?? Date.now(), size: bytes.length };
		entries.set(path, { bytes, file });
		addFolders(path);
		return file;
	};
	const toBytes = (c: Uint8Array | string): Uint8Array => (typeof c === "string" ? enc.encode(c) : c);
	const emitVault = (event: string, ...args: unknown[]): void => {
		for (const fn of vaultListeners.get(event) ?? []) fn(...args);
	};

	const adapter = {
		getBasePath: (): string => BASE_PATH,
		exists: vi.fn(async (p: string): Promise<boolean> => entries.has(p) || folderSet.has(p)),
		readBinary: vi.fn(async (p: string): Promise<ArrayBuffer> => {
			adapterCalls.push({ op: "readBinary", path: p });
			const e = entries.get(p);
			if (!e) throw new Error("ENOENT");
			return e.bytes.slice().buffer;
		}),
		writeBinary: vi.fn(async (p: string, data: ArrayBuffer): Promise<void> => {
			adapterCalls.push({ op: "writeBinary", path: p });
			const parent = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
			if (parent !== "" && !folderSet.has(parent)) throw new Error("ENOENT: parent folder missing");
			const existed = entries.has(p);
			const file = makeFile(p, new Uint8Array(data.slice(0)));
			emitVault(existed ? "modify" : "create", file);
		}),
		mkdir: vi.fn(async (p: string): Promise<void> => {
			adapterCalls.push({ op: "mkdir", path: p });
			addFolders(p + "/x");
		}),
		list: vi.fn(async (p: string): Promise<{ files: string[]; folders: string[] }> => {
			adapterCalls.push({ op: "list", path: p });
			const prefix = p + "/";
			const direct = (x: string): boolean => x.startsWith(prefix) && !x.slice(prefix.length).includes("/");
			return { files: [...entries.keys()].filter(direct), folders: [...folderSet].filter(direct) };
		}),
		remove: vi.fn(async (p: string): Promise<void> => {
			adapterCalls.push({ op: "remove", path: p });
			const e = entries.get(p);
			if (!e) throw new Error("ENOENT");
			entries.delete(p);
			emitVault("delete", e.file);
		}),
		// Mirrors Obsidian (measured 2026-10-02 via obsidian-cli eval): a
		// non-recursive rmdir fails with EISDIR on every folder, empty or not.
		rmdir: vi.fn(async (p: string, recursive?: boolean): Promise<void> => {
			adapterCalls.push({ op: "rmdir", path: p });
			if (recursive !== true) throw new Error(`Path is a directory: rm returned EISDIR (is a directory) ${p}`);
			for (const k of [...entries.keys()]) if (k.startsWith(p + "/")) entries.delete(k);
			for (const f of [...folderSet]) if (f === p || f.startsWith(p + "/")) folderSet.delete(f);
		}),
	};

	const vault = {
		adapter,
		on: vi.fn((name: string, cb: Listener) => {
			const list = vaultListeners.get(name) ?? [];
			list.push(cb);
			vaultListeners.set(name, list);
			return { name, cb };
		}),
		offref: vi.fn(),
		getFiles: vi.fn((): TFile[] => [...entries.values()].map((e) => e.file)),
		getAbstractFileByPath: vi.fn((p: string): TFile | null => entries.get(p)?.file ?? null),
		read: vi.fn(async (f: TFile): Promise<string> => {
			const e = entries.get(f.path);
			if (!e) throw new Error("ENOENT");
			return dec.decode(e.bytes);
		}),
		cachedRead: vi.fn(async (f: TFile): Promise<string> => dec.decode(entries.get(f.path)?.bytes ?? new Uint8Array())),
		readBinary: vi.fn(async (f: TFile): Promise<ArrayBuffer> => {
			const e = entries.get(f.path);
			if (!e) throw new Error("ENOENT");
			return e.bytes.slice().buffer;
		}),
		modify: vi.fn(async (f: TFile, content: string): Promise<void> => {
			makeFile(f.path, enc.encode(content));
			emitVault("modify", entries.get(f.path)?.file);
		}),
		process: vi.fn(async (f: TFile, fn: (c: string) => string): Promise<string> => {
			const e = entries.get(f.path);
			if (!e) throw new Error("ENOENT");
			const next = fn(dec.decode(e.bytes));
			makeFile(f.path, enc.encode(next));
			emitVault("modify", entries.get(f.path)?.file);
			return next;
		}),
	};

	const fileManager = {
		renameFile: vi.fn(async (file: TFile, newPath: string): Promise<void> => {
			const oldPath = file.path;
			const e = entries.get(oldPath);
			if (!e) throw new Error("ENOENT");
			const parent = newPath.includes("/") ? newPath.slice(0, newPath.lastIndexOf("/")) : "";
			if (parent !== "" && !folderSet.has(parent)) throw new Error("ENOENT: parent folder missing");
			if (entries.has(newPath)) throw new Error("EEXIST");
			entries.delete(oldPath);
			makeFile(newPath, e.bytes);
			emitVault("rename", e.file, oldPath);
		}),
		generateMarkdownLink: vi.fn((file: TFile, _sourcePath: string): string => {
			const name = file.path.slice(file.path.lastIndexOf("/") + 1);
			return opts.linkStyle === "absolute" ? `[[${file.path}]]` : `[[${name}]]`;
		}),
	};

	const metadataCache = {
		getFirstLinkpathDest: vi.fn((linkpath: string, _source: string): TFile | null => {
			const direct = entries.get(linkpath);
			if (direct) return direct.file;
			for (const e of entries.values()) {
				if (e.file.path.slice(e.file.path.lastIndexOf("/") + 1) === linkpath) return e.file;
			}
			return null;
		}),
	};

	const workspace = {
		onLayoutReady: vi.fn((cb: () => unknown): void => {
			if (isLayoutReady) cb();
			else layoutCallbacks.push(cb);
		}),
		get layoutReady(): boolean { return isLayoutReady; },
		on: vi.fn((name: string, cb: Listener) => {
			const list = workspaceListeners.get(name) ?? [];
			list.push(cb);
			workspaceListeners.set(name, list);
			return { name, cb };
		}),
		getActiveFile: vi.fn((): TFile | null => activeFile),
		iterateAllLeaves: vi.fn((cb: (leaf: { view: MarkdownView }) => unknown): void => {
			for (const leaf of leaves) cb(leaf);
		}),
	};

	const app = {
		vault,
		fileManager,
		metadataCache,
		workspace,
		loadLocalStorage: vi.fn((key: string): unknown => (storage.has(key) ? storage.get(key) : null)),
		saveLocalStorage: vi.fn((key: string, data: unknown): void => {
			saveLocalStorageCalls.push({ key, data });
			if (data === null) storage.delete(key);
			else storage.set(key, data);
		}),
	};

	const settings = makeTestSettings();
	(settings as unknown as { officePreviews: { enabled: boolean; folder: string } }).officePreviews = {
		enabled: opts.enabled ?? true,
		folder: opts.folder ?? "_previews",
	};

	const commands = new Map<string, { id: string; name: string; icon?: string; callback?: () => unknown; checkCallback?: (checking: boolean) => unknown }>();
	const registered: unknown[] = [];
	const plugin = {
		app,
		settings,
		features: [],
		commands,
		registered,
		addCommand(spec: { id: string; name: string; icon?: string; callback?: () => unknown }): unknown {
			commands.set(spec.id, spec);
			return spec;
		},
		registerEvent(ref: unknown): void { registered.push(ref); },
		saveSettings: vi.fn(async (): Promise<void> => undefined),
	};

	const counters = { timersScheduled: 0 };
	const renderer = new FakeRenderer();
	const fileExists = opts.fileExists ?? ((abs: string): boolean => entries.has(abs.slice(BASE_PATH.length + 1)));
	// Mirrors fs.rmdir: removes an empty folder, refuses a non-empty one.
	const removeEmptyDir = vi.fn(async (p: string): Promise<void> => {
		adapterCalls.push({ op: "removeEmptyDir", path: p });
		const prefix = p + "/";
		if ([...entries.keys(), ...folderSet].some((x) => x.startsWith(prefix))) throw new Error(`ENOTEMPTY: directory not empty, rmdir '${p}'`);
		if (!folderSet.has(p)) throw new Error(`ENOENT: no such file or directory, rmdir '${p}'`);
		folderSet.delete(p);
	});
	const feature = new OfficePreviewsFeature({
		renderer,
		random: mulberry32(opts.seed ?? 1),
		shuffle: opts.shuffle ?? (<T>(items: T[]): T[] => [...items]),
		setTimeout: (fn: () => void, ms: number): unknown => {
			counters.timersScheduled++;
			return setTimeout(fn, ms);
		},
		clearTimeout: (h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>),
		now: () => Date.now(),
		fileExists,
		removeEmptyDir,
	});
	if (opts.load !== false) feature.onload(plugin as unknown as LuKitPlugin);

	const folder = (): string => (settings as unknown as { officePreviews: { folder: string } }).officePreviews.folder;
	const fireWorkspace = (event: string, ...args: unknown[]): void => {
		for (const fn of workspaceListeners.get(event) ?? []) fn(...args);
	};
	const viewFor = (notePath: string): MarkdownView => {
		const found = leaves.find((l) => (l.view.file as TFile | null)?.path === notePath);
		if (found) return found.view;
		const view = new MarkdownView();
		view.file = entries.get(notePath)?.file ?? Object.assign(new TFile(), { path: notePath });
		return view;
	};

	const h: Harness = {
		feature,
		removeEmptyDir,
		plugin,
		renderer,
		storage,
		saveLocalStorageCalls,
		adapterCalls,
		vaultListeners,
		workspaceListeners,
		get timersScheduled(): number { return counters.timersScheduled; },
		leaves,
		settings,

		addSource(path, content = `content of ${path}`) { return makeFile(path, toBytes(content)); },
		putFile(path, content) { return makeFile(path, toBytes(content)); },
		createSource(path, content = `content of ${path}`) {
			const f = makeFile(path, toBytes(content));
			emitVault("create", f);
			return f;
		},
		changeSource(path, content) {
			const f = makeFile(path, toBytes(content));
			emitVault("modify", f);
		},
		renameSource(oldPath, newPath) {
			const e = entries.get(oldPath);
			if (!e) throw new Error(`no file ${oldPath}`);
			entries.delete(oldPath);
			const f = makeFile(newPath, e.bytes);
			emitVault("rename", f, oldPath);
		},
		deleteFile(path) {
			const e = entries.get(path);
			if (!e) throw new Error(`no file ${path}`);
			entries.delete(path);
			emitVault("delete", e.file);
		},
		emit(event, path, oldPath) {
			const file = entries.get(path)?.file ?? Object.assign(new TFile(), { path });
			if (event === "rename") emitVault("rename", file, oldPath);
			else emitVault(event, file);
		},
		read: (path) => entries.get(path)?.bytes,
		readText: (path) => {
			const e = entries.get(path);
			return e ? dec.decode(e.bytes) : undefined;
		},
		exists: (path) => entries.has(path) || folderSet.has(path),
		files: () => [...entries.keys()].sort(),
		folders: () => [...folderSet].sort(),
		mirror: (sourcePath) => mirrorPath(sourcePath, folder()),
		preview: (sourcePath) => entries.get(mirrorPath(sourcePath, folder()))?.bytes,
		previewMarker: (sourcePath) => {
			const b = entries.get(mirrorPath(sourcePath, folder()))?.bytes;
			return b ? readMarker(b) : null;
		},
		setActiveFile(path) { activeFile = path === null ? null : (entries.get(path)?.file ?? null); },
		openNote(path) {
			const existing = leaves.find((l) => (l.view.file as TFile | null)?.path === path);
			if (existing) return existing.view.editor as FakeEditor;
			const view = new MarkdownView();
			view.file = entries.get(path)?.file ?? null;
			const editor = new FakeEditor(h.readText(path) ?? "");
			view.editor = editor;
			leaves.push({ view });
			return editor;
		},
		closeNote(path) {
			const i = leaves.findIndex((l) => (l.view.file as TFile | null)?.path === path);
			if (i >= 0) leaves.splice(i, 1);
		},
		drop(notePath, names) {
			const view = viewFor(notePath);
			const evt = { dataTransfer: { files: names.map((name) => ({ name })) }, defaultPrevented: false, preventDefault: vi.fn() };
			fireWorkspace("editor-drop", evt, view.editor, view);
		},
		paste(notePath, names) {
			const view = viewFor(notePath);
			const evt = { clipboardData: { files: names.map((name) => ({ name })) }, defaultPrevented: false, preventDefault: vi.fn() };
			fireWorkspace("editor-paste", evt, view.editor, view);
		},
		layoutReady() {
			isLayoutReady = true;
			for (const cb of layoutCallbacks.splice(0)) cb();
		},
		async advance(ms) { await vi.advanceTimersByTimeAsync(ms); },
		async settle() {
			// A zero-delay timer is due 1 ms later (Node semantics, mirrored by the
			// fake clock), so each round advances 1 ms; 20 rounds cover a reconcile
			// that yields once per file.
			for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1);
		},
		async start() {
			h.layoutReady();
			await vi.advanceTimersByTimeAsync(RECONCILE_DELAY_MS);
			await h.drain();
		},
		async drain() {
			for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(JITTER_MAX_MS + MODIFY_DEBOUNCE_MS);
		},
		async runCommand(id) {
			const cmd = commands.get(id);
			if (!cmd) throw new Error(`command ${id} not registered`);
			if (cmd.callback) await cmd.callback();
			else if (cmd.checkCallback) await cmd.checkCallback(false);
			await h.settle();
		},
		notices: () => noticeMessages(),
		lastNotice: () => {
			const all = noticeMessages();
			return all[all.length - 1];
		},
		async status() {
			await h.runCommand("office-previews-status");
			const m = /(\d+) aktuell, (\d+) in der Warteschlange, (\d+) fehlgeschlagen/.exec(h.lastNotice() ?? "");
			if (!m) throw new Error(`no status notice: ${h.lastNotice()}`);
			return { current: Number(m[1]), queued: Number(m[2]), failed: Number(m[3]) };
		},
		setEnabled(enabled) {
			(settings as unknown as { officePreviews: { enabled: boolean } }).officePreviews.enabled = enabled;
			feature.setEnabled(enabled);
		},
		unload() { feature.onunload(); },
		dispose() {
			digestSpy.mockRestore();
			vi.useRealTimers();
			__resetPlatform();
			resetNotices();
		},
	};
	return h;
}
