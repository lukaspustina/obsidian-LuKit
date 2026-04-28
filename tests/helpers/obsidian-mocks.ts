import { vi } from "vitest";

export interface MockTFile {
	path: string;
	basename: string;
	stat: { mtime: number; ctime: number };
}

export interface MockEditor {
	getCursor: () => { line: number; ch: number };
	setCursor: (pos: { line: number; ch: number }) => void;
	scrollIntoView: (range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center: boolean) => void;
	replaceRange: (text: string, from: { line: number; ch: number }) => void;
	getValue: () => string;
	setValue: (text: string) => void;
	cursorPos: { line: number; ch: number };
	lastReplacedText: string | null;
	lastReplaceFrom: { line: number; ch: number } | null;
	value: string;
}

export interface MockVault {
	files: Map<string, string>;
	processCallCount: number;
	lastProcessedPath: string | null;
	read: (file: MockTFile) => Promise<string>;
	modify: (file: MockTFile, content: string) => Promise<void>;
	process: (file: MockTFile, fn: (content: string) => string) => Promise<void>;
	getAbstractFileByPath: (path: string) => MockTFile | null;
	getMarkdownFiles: () => MockTFile[];
	register: (file: MockTFile, content: string) => void;
}

export interface MockMetadataCache {
	getFileCache: (file: MockTFile) => { frontmatter?: Record<string, unknown> } | null;
	setFrontmatter: (path: string, fm: Record<string, unknown>) => void;
}

export interface MockFileManager {
	processFrontMatter: (file: MockTFile, fn: (fm: Record<string, unknown>) => void) => Promise<void>;
	frontmatter: Map<string, Record<string, unknown>>;
}

export interface MockWorkspace {
	activeEditor: { editor: MockEditor | null } | null;
	activeFile: MockTFile | null;
	openedFiles: MockTFile[];
	getActiveFile: () => MockTFile | null;
	getLeaf: (newLeaf?: boolean | "tab") => { openFile: (file: MockTFile) => Promise<void> };
}

export interface MockApp {
	vault: MockVault;
	metadataCache: MockMetadataCache;
	fileManager: MockFileManager;
	workspace: MockWorkspace;
}

let lastNoticeMessage: string | undefined;
const noticeHistory: string[] = [];

export function lastNotice(): string | undefined {
	return lastNoticeMessage;
}

export function noticeMessages(): readonly string[] {
	return noticeHistory;
}

export function resetNotices(): void {
	lastNoticeMessage = undefined;
	noticeHistory.length = 0;
}

// Capture-only Notice shim. Tests import Notice from "obsidian"; vitest's
// alias system in vitest.config.ts can route that to this stub.
export class MockNotice {
	constructor(message: string) {
		lastNoticeMessage = message;
		noticeHistory.push(message);
	}
}

export function createMockTFile(
	path: string,
	basenameOrOverrides?: string | { basename?: string; mtime?: number; ctime?: number },
): MockTFile {
	const now = Date.now();
	const overrides = typeof basenameOrOverrides === "string"
		? { basename: basenameOrOverrides }
		: basenameOrOverrides;
	return {
		path,
		basename: overrides?.basename ?? path.replace(/^.*\//, "").replace(/\.md$/, ""),
		stat: {
			mtime: overrides?.mtime ?? now,
			ctime: overrides?.ctime ?? now,
		},
	};
}

export function createMockVault(initialFiles?: Record<string, string>): MockVault {
	const files = new Map<string, string>(
		initialFiles ? Object.entries(initialFiles) : [],
	);
	const tfiles = new Map<string, MockTFile>();
	for (const path of files.keys()) {
		tfiles.set(path, createMockTFile(path));
	}

	const vault: MockVault = {
		files,
		processCallCount: 0,
		lastProcessedPath: null,
		read: vi.fn(async (file: MockTFile): Promise<string> => {
			const content = files.get(file.path);
			if (content === undefined) {
				throw new Error(`File not found: ${file.path}`);
			}
			return content;
		}),
		modify: vi.fn(async (file: MockTFile, content: string): Promise<void> => {
			if (!files.has(file.path)) {
				throw new Error(`File not found: ${file.path}`);
			}
			files.set(file.path, content);
		}),
		// Note: this mock runs synchronously; concurrent process() calls are not supported
		process: vi.fn(async (file: MockTFile, fn: (content: string) => string): Promise<void> => {
			vault.processCallCount++;
			vault.lastProcessedPath = file.path;
			const content = files.get(file.path);
			if (content === undefined) {
				throw new Error(`File not found: ${file.path}`);
			}
			files.set(file.path, fn(content));
		}),
		getAbstractFileByPath: vi.fn((path: string): MockTFile | null => {
			return tfiles.get(path) ?? null;
		}),
		getMarkdownFiles: vi.fn((): MockTFile[] => {
			return Array.from(tfiles.values());
		}),
		register(file: MockTFile, content: string): void {
			files.set(file.path, content);
			tfiles.set(file.path, file);
		},
	};
	return vault;
}

export function createMockMetadataCache(): MockMetadataCache {
	const fmByPath = new Map<string, Record<string, unknown>>();
	return {
		getFileCache: vi.fn((file: MockTFile) => {
			const fm = fmByPath.get(file.path);
			return fm ? { frontmatter: fm } : null;
		}),
		setFrontmatter(path: string, fm: Record<string, unknown>): void {
			fmByPath.set(path, fm);
		},
	};
}

export function createMockFileManager(metadataCache: MockMetadataCache): MockFileManager {
	const frontmatter = new Map<string, Record<string, unknown>>();
	return {
		frontmatter,
		processFrontMatter: vi.fn(async (file: MockTFile, fn: (fm: Record<string, unknown>) => void): Promise<void> => {
			const existing = frontmatter.get(file.path) ?? {};
			fn(existing);
			frontmatter.set(file.path, existing);
			metadataCache.setFrontmatter(file.path, existing);
		}),
	};
}

export function createMockWorkspace(): MockWorkspace {
	const ws: MockWorkspace = {
		activeEditor: null,
		activeFile: null,
		openedFiles: [],
		getActiveFile: vi.fn((): MockTFile | null => ws.activeFile),
		getLeaf: vi.fn((_newLeaf?: boolean | "tab") => ({
			openFile: vi.fn(async (file: MockTFile): Promise<void> => {
				ws.openedFiles.push(file);
			}),
		})),
	};
	return ws;
}

export function createMockApp(initialFiles?: Record<string, string>): MockApp {
	const vault = createMockVault(initialFiles);
	const metadataCache = createMockMetadataCache();
	const fileManager = createMockFileManager(metadataCache);
	const workspace = createMockWorkspace();
	return { vault, metadataCache, fileManager, workspace };
}

export function createMockEditor(initialValue: string = ""): MockEditor {
	return {
		cursorPos: { line: 0, ch: 0 },
		lastReplacedText: null,
		lastReplaceFrom: null,
		value: initialValue,
		getCursor(): { line: number; ch: number } {
			return this.cursorPos;
		},
		setCursor(pos: { line: number; ch: number }): void {
			this.cursorPos = pos;
		},
		scrollIntoView(): void {
			// no-op
		},
		replaceRange(text: string, from: { line: number; ch: number }): void {
			this.lastReplacedText = text;
			this.lastReplaceFrom = from;
		},
		getValue(): string {
			return this.value;
		},
		setValue(text: string): void {
			this.value = text;
		},
	};
}
