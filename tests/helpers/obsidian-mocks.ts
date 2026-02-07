export interface MockTFile {
	path: string;
	basename: string;
	stat: { mtime: number };
}

export interface MockEditor {
	getCursor: () => { line: number; ch: number };
	setCursor: (pos: { line: number; ch: number }) => void;
	scrollIntoView: (range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center: boolean) => void;
	replaceRange: (text: string, from: { line: number; ch: number }) => void;
	cursorPos: { line: number; ch: number };
	lastReplacedText: string | null;
}

export interface MockVault {
	files: Map<string, string>;
	read: (file: MockTFile) => Promise<string>;
	modify: (file: MockTFile, content: string) => Promise<void>;
	process: (file: MockTFile, fn: (content: string) => string) => Promise<void>;
}

export function createMockTFile(path: string, basename?: string): MockTFile {
	return {
		path,
		basename: basename ?? path.replace(/^.*\//, "").replace(/\.md$/, ""),
		stat: { mtime: Date.now() },
	};
}

export function createMockVault(initialFiles?: Record<string, string>): MockVault {
	const files = new Map<string, string>(
		initialFiles ? Object.entries(initialFiles) : [],
	);

	return {
		files,
		read: async (file: MockTFile): Promise<string> => {
			const content = files.get(file.path);
			if (content === undefined) {
				throw new Error(`File not found: ${file.path}`);
			}
			return content;
		},
		modify: async (file: MockTFile, content: string): Promise<void> => {
			if (!files.has(file.path)) {
				throw new Error(`File not found: ${file.path}`);
			}
			files.set(file.path, content);
		},
		process: async (file: MockTFile, fn: (content: string) => string): Promise<void> => {
			const content = files.get(file.path);
			if (content === undefined) {
				throw new Error(`File not found: ${file.path}`);
			}
			files.set(file.path, fn(content));
		},
	};
}

export function createMockEditor(): MockEditor {
	return {
		cursorPos: { line: 0, ch: 0 },
		lastReplacedText: null,
		getCursor(): { line: number; ch: number } {
			return this.cursorPos;
		},
		setCursor(pos: { line: number; ch: number }): void {
			this.cursorPos = pos;
		},
		scrollIntoView(): void {
			// no-op
		},
		replaceRange(text: string): void {
			this.lastReplacedText = text;
		},
	};
}
