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
	constructor(message?: string, _duration?: number) {
		if (message !== undefined) {
			lastNoticeMessage = message;
			noticeHistory.push(message);
		}
	}
	hide(): void {}
}
export class TFile {
	path = "";
	basename = "";
	extension = "md";
	stat = { mtime: 0, ctime: 0 };
}
// Recording element stub: captures created texts/children so modal render
// output can be asserted headlessly (e.g. the triage meta line). Records
// tag/cls per child and event listeners (fire via __fireEvent) so checkbox
// interactions can be simulated without a DOM.
export function __stubEl(tag = "div", cls?: string): any {
	const el: any = {
		tag,
		cls: cls ?? "",
		style: {},
		texts: [] as string[],
		children: [] as any[],
		__listeners: {} as Record<string, ((...args: any[]) => void)[]>,
		empty: () => { el.children.length = 0; el.texts.length = 0; },
		addClass: () => undefined,
		addEventListener: (type: string, fn: (...args: any[]) => void) => {
			(el.__listeners[type] ??= []).push(fn);
		},
		appendText: (t: string) => { el.texts.push(t); },
		setText: (t: string) => { el.texts.push(t); },
		createEl: (childTag: string, opts?: any) => {
			const child = __stubEl(childTag, opts && typeof opts.cls === "string" ? opts.cls : undefined);
			if (opts && typeof opts.text === "string") child.texts.push(opts.text);
			el.children.push(child);
			return child;
		},
		createDiv: (opts?: any) => el.createEl("div", opts),
		createSpan: (opts?: any) => el.createEl("span", opts),
	};
	return el;
}

// Fires all listeners registered for `type` on a stub element (e.g. "change"
// after flipping a checkbox's .checked in a test).
export function __fireEvent(el: any, type: string): void {
	for (const fn of el.__listeners?.[type] ?? []) fn();
}

// Collects all recorded texts of an element tree (depth-first).
export function __allTexts(el: any): string[] {
	const out: string[] = [...el.texts];
	for (const child of el.children ?? []) out.push(...__allTexts(child));
	return out;
}

export class Modal {
	contentEl: any = __stubEl();
	modalEl: any = __stubEl();
	scope: any = { register: () => undefined };
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
	setInstructions(_i: unknown): void {}
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
export class Component {
	load(): void {}
	unload(): void {}
}
export const MarkdownRenderer = {
	render: (_app: any, _md: string, _el: any, _path: string, _c: any): Promise<void> => Promise.resolve(),
};
export function addIcon(_id: string, _svg: string): void {}
export function normalizePath(p: string): string { return p; }
