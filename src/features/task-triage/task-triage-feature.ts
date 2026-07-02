import { Notice } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID, type LuKitFeature, type HelpEntry } from "../../types";
import { createTaskNotesBridge, type TaskNotesBridge, type BridgeAvailability } from "./tasknotes-bridge";
import { selectTriageTasks, snoozeDate, buildTriagePreview, type TriageTask, type SnoozeKind } from "./task-triage-engine";
import { TaskTriageModal } from "./task-triage-modal";
import { TaskTriageDateModal } from "./task-triage-date-modal";

const PREVIEW_PLACEHOLDER = "(Vorschau nicht verfügbar)";

export class TaskTriageFeature implements LuKitFeature {
	id = "task-triage";
	private plugin!: LuKitPlugin;
	bridge!: TaskNotesBridge;

	walkActive = false;
	tasks: TriageTask[] = [];
	index = 0;
	counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0 };

	todayIso: () => string = () => {
		const d = new Date();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${d.getFullYear()}-${m}-${day}`;
	};

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;
		this.bridge = createTaskNotesBridge(plugin.app);
		plugin.addCommand({
			id: "task-triage-walk",
			name: "Vorgang: Triage due tasks",
			icon: LUKIT_ICON_ID,
			callback: () => this.startWalk(),
		});
	}

	onunload(): void {
		// nothing to clean up
	}

	helpEntries(): HelpEntry[] {
		return [
			{
				commandId: "task-triage-walk",
				displayName: "Vorgang: Triage due tasks",
				description:
					"Walk every TaskNotes task due or scheduled by today; per task: complete, snooze, skip today's recurring instance, open & stop, or skip. Requires the TaskNotes plugin.",
			},
		];
	}

	private startWalk(): void {
		void this.beginWalk();
	}

	private async beginWalk(): Promise<void> {
		if (this.walkActive) {
			new Notice("Triage läuft bereits.");
			return;
		}

		const started = Date.now();
		const availability = this.bridge.availability();
		if (!availability.ok) {
			new Notice(this.availabilityMessage(availability));
			return;
		}
		console.log(`LuKit task-triage: availability ms=${Date.now() - started}`);

		const today = this.todayIso();
		const loading = new Notice("Sammle fällige Tasks…", 0);
		let all: TriageTask[];
		try {
			all = await this.bridge.listTasks();
		} finally {
			loading.hide();
		}
		const selected = selectTriageTasks(all, today);
		if (selected.length === 0) {
			new Notice("Keine fälligen Tasks");
			return;
		}

		this.tasks = selected;
		this.index = 0;
		this.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0 };
		this.walkActive = true;
		await this.presentStop();
	}

	private availabilityMessage(a: Extract<BridgeAvailability, { ok: false }>): string {
		switch (a.reason) {
			case "plugin-missing":
				return "TaskNotes-Plugin nicht gefunden.";
			case "api-missing":
				return "TaskNotes-API nicht verfügbar.";
			case "api-version-mismatch":
				return "TaskNotes-API-Version nicht unterstützt.";
			case "capability-missing":
				return `TaskNotes-Funktion fehlt: ${a.capability}`;
		}
	}

	private async presentStop(): Promise<void> {
		const task = this.tasks[this.index];
		const actions = this.availableActions(task);
		const modal = new TaskTriageModal(this.plugin.app, {
			task,
			actions,
			locale: this.plugin.settings.dateLocale,
			today: this.todayIso(),
			position: { index: this.index, total: this.tasks.length },
			onComplete: () => {
				void this.handleComplete();
			},
			onSnooze: (kind) => {
				void this.handleSnooze(kind);
			},
			onSnoozeCustom: () => {
				this.promptCustomDate();
			},
			onSkipInstance: () => {
				void this.handleSkipInstance();
			},
			onOpenAndStop: () => {
				void this.handleOpenAndStop();
			},
			onSkip: () => {
				void this.handleSkip();
			},
			onStop: () => {
				this.handleStop();
			},
		});
		modal.open();
		const previewStarted = Date.now();
		void this.loadPreview(task).then((preview) => {
			console.log(`LuKit task-triage: preview ms=${Date.now() - previewStarted}`);
			modal.setPreview(preview);
		});
	}

	private promptCustomDate(): void {
		new TaskTriageDateModal(
			this.plugin.app,
			(dateIso) => {
				void this.handleSnoozeCustom(dateIso);
			},
			() => {
				// Cancelled — re-present the current stop so the walk continues.
				void this.presentStop();
			},
		).open();
	}

	async loadPreview(task: TriageTask): Promise<string> {
		try {
			const content = await this.bridge.readNote(task.path);
			return buildTriagePreview(content);
		} catch (e) {
			this.logError(e);
			return PREVIEW_PLACEHOLDER;
		}
	}

	availableActions(task: TriageTask): { snooze: boolean; skipInstance: boolean } {
		return { snooze: !task.isRecurring, skipInstance: task.isRecurring };
	}

	async handleComplete(): Promise<void> {
		const t = this.tasks[this.index];
		try {
			if (t.isRecurring) {
				await this.bridge.toggleCompleteInstance(t.path, this.todayIso());
			} else {
				await this.bridge.complete(t.path);
			}
		} catch (e) {
			return this.onMutationError(e);
		}
		this.counts.completed++;
		await this.advance();
	}

	async handleSnooze(kind: SnoozeKind): Promise<void> {
		const t = this.tasks[this.index];
		try {
			await this.bridge.setScheduled(t.path, snoozeDate(kind, this.todayIso()));
		} catch (e) {
			return this.onMutationError(e);
		}
		this.counts.snoozed++;
		await this.advance();
	}

	async handleSnoozeCustom(date: string): Promise<void> {
		const t = this.tasks[this.index];
		try {
			await this.bridge.setScheduled(t.path, date);
		} catch (e) {
			return this.onMutationError(e);
		}
		this.counts.snoozed++;
		await this.advance();
	}

	async handleSkipInstance(): Promise<void> {
		const t = this.tasks[this.index];
		try {
			await this.bridge.toggleSkippedInstance(t.path, this.todayIso());
		} catch (e) {
			return this.onMutationError(e);
		}
		this.counts.instancesSkipped++;
		await this.advance();
	}

	async handleSkip(): Promise<void> {
		this.counts.skipped++;
		await this.advance();
	}

	async handleOpenAndStop(): Promise<void> {
		const t = this.tasks[this.index];
		try {
			await this.bridge.openInNewTab(t.path);
		} catch (e) {
			this.logError(e);
			new Notice("Konnte Task nicht öffnen.");
		}
		this.finishWalk();
	}

	handleStop(): void {
		this.finishWalk();
	}

	private async onMutationError(e: unknown): Promise<void> {
		this.logError(e);
		new Notice("Aktion fehlgeschlagen — Task bleibt offen.");
		await this.presentStop();
	}

	private async advance(): Promise<void> {
		this.index++;
		if (this.index >= this.tasks.length) {
			this.finishWalk();
		} else {
			await this.presentStop();
		}
	}

	private finishWalk(): void {
		const { completed, snoozed, instancesSkipped, skipped } = this.counts;
		const remaining = this.tasks.length - (completed + snoozed + instancesSkipped + skipped);
		new Notice(
			`Triage beendet: ${completed} erledigt, ${snoozed} verschoben, ${instancesSkipped} ausgelassen, ${skipped} übersprungen, ${remaining} offen`,
		);
		this.walkActive = false;
	}

	private logError(e: unknown): void {
		console.error("LuKit task-triage: error:", e instanceof Error ? e.name : typeof e);
	}
}
