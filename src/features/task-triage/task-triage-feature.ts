import { Notice } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID, type LuKitFeature, type HelpEntry } from "../../types";
import { formatDate } from "../../shared/date-format";
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
	// Pinned once per walk so a walk crossing midnight keeps mutating the
	// instances/dates the selection (and the visible modal) was based on.
	walkToday = "";
	private modal?: TaskTriageModal;
	private previewCache = new Map<string, string>();

	todayIso: () => string = () => formatDate(new Date(), "iso");

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;
		this.bridge = createTaskNotesBridge(plugin.app);
		plugin.addCommand({
			id: "task-triage-walk",
			name: "Vorgänge: Fällige Tasks durchgehen",
			icon: LUKIT_ICON_ID,
			callback: () => this.startWalk(),
		});
	}

	onunload(): void {
		// Abort a running walk so a surviving modal's dismiss cannot
		// resurrect it from the unloaded plugin instance.
		this.walkActive = false;
		this.modal?.closeSilently();
		this.modal = undefined;
	}

	helpEntries(): HelpEntry[] {
		return [
			{
				commandId: "task-triage-walk",
				displayName: "Vorgänge: Fällige Tasks durchgehen",
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

		const availability = this.bridge.availability();
		if (!availability.ok) {
			new Notice(this.availabilityMessage(availability));
			return;
		}

		// Claim the walk before the (potentially long) listing await so a
		// second command invocation cannot start a concurrent walk.
		this.walkActive = true;
		this.walkToday = this.todayIso();
		const loading = new Notice("Sammle fällige Tasks…", 0);
		let all: TriageTask[];
		try {
			all = await this.bridge.listTasks();
		} catch (e) {
			this.walkActive = false;
			this.logError(e);
			new Notice("Konnte Tasks nicht laden — Triage abgebrochen.");
			return;
		} finally {
			loading.hide();
		}
		const selected = selectTriageTasks(all, this.walkToday);
		if (selected.length === 0) {
			this.walkActive = false;
			new Notice("Keine fälligen Tasks");
			return;
		}

		this.tasks = selected;
		this.index = 0;
		this.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0 };
		this.previewCache.clear();
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
		if (!this.walkActive) {
			return;
		}
		const task = this.tasks[this.index];
		const actions = this.availableActions(task);
		const modal = new TaskTriageModal(this.plugin.app, {
			task,
			actions,
			locale: this.plugin.settings.dateLocale,
			today: this.walkToday,
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
		this.modal = modal;
		modal.open();
		void this.loadPreview(task).then((preview) => {
			modal.setPreview(preview);
		});
		// Warm the cache for the next stop while the user works this one.
		const next = this.tasks[this.index + 1];
		if (next !== undefined) {
			void this.loadPreview(next);
		}
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
		const cached = this.previewCache.get(task.path);
		if (cached !== undefined) {
			return cached;
		}
		try {
			const content = await this.bridge.readNote(task.path);
			const preview = buildTriagePreview(content);
			this.previewCache.set(task.path, preview);
			return preview;
		} catch (e) {
			this.logError(e);
			return PREVIEW_PLACEHOLDER;
		}
	}

	availableActions(task: TriageTask): { snooze: boolean; skipInstance: boolean } {
		return { snooze: !task.isRecurring, skipInstance: task.isRecurring };
	}

	private async mutateAndAdvance(mutate: () => Promise<void>, counter: "completed" | "snoozed" | "instancesSkipped"): Promise<void> {
		try {
			await mutate();
		} catch (e) {
			return this.onMutationError(e);
		}
		this.counts[counter]++;
		await this.advance();
	}

	async handleComplete(): Promise<void> {
		const t = this.tasks[this.index];
		await this.mutateAndAdvance(
			() => (t.isRecurring ? this.bridge.toggleCompleteInstance(t.path, this.walkToday) : this.bridge.complete(t.path)),
			"completed",
		);
	}

	async handleSnooze(kind: SnoozeKind): Promise<void> {
		await this.handleSnoozeCustom(snoozeDate(kind, this.walkToday));
	}

	async handleSnoozeCustom(date: string): Promise<void> {
		const t = this.tasks[this.index];
		await this.mutateAndAdvance(() => this.bridge.setScheduled(t.path, date), "snoozed");
	}

	async handleSkipInstance(): Promise<void> {
		const t = this.tasks[this.index];
		await this.mutateAndAdvance(() => this.bridge.toggleSkippedInstance(t.path, this.walkToday), "instancesSkipped");
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
		if (!this.walkActive) {
			return;
		}
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
		this.modal = undefined;
	}

	private logError(e: unknown): void {
		console.error("LuKit task-triage: error:", e instanceof Error ? e.name : typeof e);
	}
}
