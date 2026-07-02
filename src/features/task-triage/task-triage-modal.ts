import { App, Modal } from "obsidian";
import { formatDate } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";
import { overdueLabel, formatProjectLink } from "./task-triage-engine";
import type { TriageTask, SnoozeKind } from "./task-triage-engine";

export interface TaskTriageModalOptions {
	task: TriageTask;
	preview: string;
	actions: { snooze: boolean; skipInstance: boolean };
	locale: DateLocale;
	today: string;
	position: { index: number; total: number };
	onComplete: () => void;
	onSnooze: (kind: SnoozeKind) => void;
	onSnoozeCustom: () => void;
	onSkipInstance: () => void;
	onOpenAndStop: () => void;
	onSkip: () => void;
	onStop: () => void;
}

function parseIsoDate(iso: string): Date {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export class TaskTriageModal extends Modal {
	private options: TaskTriageModalOptions;
	private chosen = false;

	constructor(app: App, options: TaskTriageModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		this.renderHeader();
		this.renderPreview();
		this.registerActionKeys();
		this.renderInstructions();
	}

	private renderHeader(): void {
		const { contentEl } = this;
		const { task, locale, today } = this.options;

		contentEl.createEl("h3", { text: task.title });

		const overdue = overdueLabel(task, today, locale);
		if (overdue !== "") {
			contentEl.createEl("p", { text: overdue, cls: "lukit-triage-overdue" });
		}

		if (task.due !== undefined) {
			contentEl.createEl("p", { text: `Fällig: ${formatDate(parseIsoDate(task.due), locale)}` });
		}
		if (task.scheduled !== undefined) {
			contentEl.createEl("p", { text: `Geplant: ${formatDate(parseIsoDate(task.scheduled), locale)}` });
		}
		if (task.priority !== undefined) {
			contentEl.createEl("p", { text: `Priorität: ${task.priority}` });
		}
		if (task.isRecurring) {
			contentEl.createEl("p", { text: "↻ (wiederkehrend)" });
		}
		if (task.contexts.length > 0) {
			contentEl.createEl("p", { text: `Kontexte: ${task.contexts.join(", ")}` });
		}
		if (task.projects.length > 0) {
			contentEl.createEl("p", { text: `Projekte: ${task.projects.map(formatProjectLink).join(", ")}` });
		}
	}

	private renderPreview(): void {
		const preview = this.contentEl.createDiv({ cls: "lukit-triage-preview" });
		preview.setText(this.options.preview);
		preview.style.flex = "0 0 auto";
		preview.style.maxHeight = "45vh";
		preview.style.overflowY = "auto";
		preview.style.whiteSpace = "pre-wrap";
		preview.style.userSelect = "text";
	}

	private registerActionKeys(): void {
		const { actions } = this.options;

		this.scope.register(["Mod"], "D", () => {
			this.act(this.options.onComplete);
			return false;
		});

		if (actions.snooze) {
			this.scope.register(["Mod"], "1", () => {
				this.act(() => this.options.onSnooze("tomorrow"));
				return false;
			});
			this.scope.register(["Mod"], "2", () => {
				this.act(() => this.options.onSnooze("week"));
				return false;
			});
			this.scope.register(["Mod"], "3", () => {
				this.act(() => this.options.onSnooze("nextMonday"));
				return false;
			});
			this.scope.register(["Mod"], "T", () => {
				this.act(this.options.onSnoozeCustom);
				return false;
			});
		}

		if (actions.skipInstance) {
			this.scope.register(["Mod"], "X", () => {
				this.act(this.options.onSkipInstance);
				return false;
			});
		}

		this.scope.register([], "Enter", () => {
			this.act(this.options.onOpenAndStop);
			return false;
		});

		this.scope.register(["Mod"], ".", () => {
			this.act(this.options.onStop);
			return false;
		});
	}

	private renderInstructions(): void {
		const { actions } = this.options;
		const instructions: { command: string; purpose: string }[] = [
			{ command: "↵", purpose: "Öffnen & Stopp" },
			{ command: "⌘D", purpose: "Erledigt" },
		];
		if (actions.snooze) {
			instructions.push(
				{ command: "⌘1", purpose: "Morgen" },
				{ command: "⌘2", purpose: "+1 Woche" },
				{ command: "⌘3", purpose: "Nächster Montag" },
				{ command: "⌘T", purpose: "Datum…" },
			);
		}
		if (actions.skipInstance) {
			instructions.push({ command: "⌘X", purpose: "Heute auslassen" });
		}
		instructions.push({ command: "esc", purpose: "Überspringen" }, { command: "⌘.", purpose: "Stopp" });

		const bar = this.contentEl.createDiv({ cls: "prompt-instructions" });
		for (const { command, purpose } of instructions) {
			const item = bar.createDiv({ cls: "prompt-instruction" });
			item.createSpan({ cls: "prompt-instruction-command", text: command });
			item.createSpan({ text: purpose });
		}
	}

	private act(fn: () => void): void {
		this.chosen = true;
		this.close();
		fn();
	}

	onClose(): void {
		this.contentEl.empty();
		setTimeout(() => {
			if (this.chosen) return;
			this.options.onSkip();
		}, 0);
	}
}
