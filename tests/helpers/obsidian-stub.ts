// Stub module aliased to "obsidian" in vitest.config.ts. Provides empty class
// shims so feature/modal source files can be loaded under vitest without a
// real Obsidian runtime. Tests that need behavioural mocks should still use
// the helpers in obsidian-mocks.ts and supply mock app/vault objects.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Capture state shared with obsidian-mocks.ts via re-export.
let lastNoticeMessage: string | undefined;
const noticeHistory: string[] = [];

export function __getLastNotice(): string | undefined { return lastNoticeMessage; }
export function __getNoticeHistory(): readonly string[] { return noticeHistory; }
export function __resetNotices(): void {
	lastNoticeMessage = undefined;
	noticeHistory.length = 0;
}

export class Notice {
	constructor(message?: string) {
		if (message !== undefined) {
			lastNoticeMessage = message;
			noticeHistory.push(message);
		}
	}
}
export class TFile {
	path = "";
	basename = "";
	stat = { mtime: 0, ctime: 0 };
}
export class Modal {
	contentEl: any = { empty: () => undefined, addClass: () => undefined, createEl: () => ({ addClass: () => undefined, addEventListener: () => undefined, appendText: () => undefined, createEl: () => ({}) }) };
	app: any;
	constructor(app: any) { this.app = app; }
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}
export class FuzzySuggestModal<T> {
	app: any;
	inputEl: any = { value: "", focus: () => undefined, dispatchEvent: () => undefined };
	scope: any = { register: () => undefined };
	constructor(app: any) { this.app = app; }
	setPlaceholder(_p: string): void {}
	open(): void {}
	close(): void {}
	getItems(): T[] { return []; }
	getItemText(_item: T): string { return ""; }
	onChooseItem(_item: T): void {}
	onOpen(): void {}
	onClose(): void {}
}
export class Plugin {
	app: any;
	constructor() { this.app = {}; }
	addCommand(_cmd: any): void {}
	addSettingTab(_tab: any): void {}
	loadData(): Promise<unknown> { return Promise.resolve({}); }
	saveData(_data: unknown): Promise<void> { return Promise.resolve(); }
}
export class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl: any = { empty: () => undefined, createEl: () => ({}) };
	constructor(app: any, plugin: any) { this.app = app; this.plugin = plugin; }
	display(): void {}
}
export class WorkspaceLeaf {}
export class Setting {
	constructor(_containerEl: any) {}
	setName(_name: string): this { return this; }
	setDesc(_desc: string): this { return this; }
	addText(_fn: any): this { return this; }
	addDropdown(_fn: any): this { return this; }
	addToggle(_fn: any): this { return this; }
	addButton(_fn: any): this { return this; }
}
export function addIcon(_id: string, _svg: string): void {}
export function normalizePath(p: string): string { return p; }
