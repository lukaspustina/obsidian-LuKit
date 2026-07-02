import { Notice, TFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID, type LuKitFeature, type HelpEntry } from "../../types";
import { formatDate } from "../../shared/date-format";
import { getDiaryNotePath } from "../../shared/diary-settings";
import { listReminders, removeReminderLine, rescheduleReminderLine, erinnerungenSection } from "../work-diary/work-diary-engine";
import type { ReminderItem } from "../work-diary/work-diary-engine";
import { createTaskNotesBridge, type TaskNotesBridge, type BridgeAvailability } from "./tasknotes-bridge";
import {
	selectTriageTasks,
	selectDueReminders,
	snoozeDate,
	buildTriagePreview,
	parseIsoDate,
	type TriageStop,
	type SnoozeKind,
} from "./task-triage-engine";
import { TaskTriageModal } from "./task-triage-modal";
import { TaskTriageDateModal } from "./task-triage-date-modal";

const PREVIEW_PLACEHOLDER = "(Vorschau nicht verfügbar)";

export class TaskTriageFeature implements LuKitFeature {
	id = "task-triage";
	private plugin!: LuKitPlugin;
	bridge!: TaskNotesBridge;

	walkActive = false;
	stops: TriageStop[] = [];
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
			name: "Vorgänge: Fällige Aufgaben durchgehen",
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
				displayName: "Vorgänge: Fällige Aufgaben durchgehen",
				description:
					"Geht fällige Tagebuch-Erinnerungen und TaskNotes-Tasks durch (Erinnerungen zuerst); pro Stop: erledigen, verschieben, heutige Instanz auslassen (nur Tasks), öffnen & stoppen oder überspringen. Ohne TaskNotes (≥ 4.10.0) läuft der Walk nur mit Erinnerungen.",
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

		// Claim the walk before the (potentially long) listing await so a
		// second command invocation cannot start a concurrent walk.
		this.walkActive = true;
		this.walkToday = this.todayIso();
		const loading = new Notice("Sammle fällige Aufgaben…", 0);

		const reminders = await this.loadDueReminders();

		let taskStops: TriageStop[] = [];
		const availability = this.bridge.availability();
		if (availability.ok) {
			let all;
			try {
				all = await this.bridge.listTasks();
			} catch (e) {
				loading.hide();
				this.walkActive = false;
				this.logError(e);
				new Notice("Konnte Tasks nicht laden — Triage abgebrochen.");
				return;
			}
			taskStops = selectTriageTasks(all, this.walkToday).map((task) => ({ kind: "task" as const, task }));
		} else {
			// Degradation statt Abbruch: Erinnerungen hängen nicht von TaskNotes ab.
			new Notice(this.availabilityMessage(availability));
		}
		loading.hide();

		const stops: TriageStop[] = [...reminders.map((reminder) => ({ kind: "reminder" as const, reminder })), ...taskStops];
		if (stops.length === 0) {
			this.walkActive = false;
			new Notice("Keine fälligen Tasks oder Erinnerungen");
			return;
		}

		this.stops = stops;
		this.index = 0;
		this.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0 };
		this.previewCache.clear();
		await this.presentStop();
	}

	// Fällige Erinnerungen aus der Tagebuch-Notiz; fehlender Pfad oder fehlende
	// Notiz sind kein Fehler (leere Liste, keine Meldung).
	private async loadDueReminders(): Promise<ReminderItem[]> {
		const file = this.diaryFile();
		if (file === null) return [];
		try {
			const content = await this.plugin.app.vault.read(file);
			return selectDueReminders(listReminders(content, this.plugin.settings.dateLocale), this.walkToday);
		} catch (e) {
			this.logError(e);
			new Notice("Tagebuch konnte nicht gelesen werden — Erinnerungen übersprungen: " + (e instanceof Error ? e.message : String(e)));
			return [];
		}
	}

	private diaryFile(): TFile | null {
		const path = getDiaryNotePath(this.plugin);
		if (!path) return null;
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	private availabilityMessage(a: Extract<BridgeAvailability, { ok: false }>): string {
		switch (a.reason) {
			case "plugin-missing":
				return "TaskNotes-Plugin nicht gefunden — Task-Triage benötigt TaskNotes ≥ 4.10.0.";
			case "api-missing":
				return "TaskNotes-API nicht verfügbar — bitte TaskNotes auf ≥ 4.10.0 aktualisieren.";
			case "api-version-mismatch":
				return "TaskNotes-API-Version nicht unterstützt — LuKit benötigt apiVersion 1 (TaskNotes ≥ 4.10.0).";
			case "capability-missing":
				return `TaskNotes-Funktion fehlt: ${a.capability} — bitte TaskNotes aktualisieren.`;
		}
	}

	private currentStop(): TriageStop {
		return this.stops[this.index];
	}

	private async presentStop(): Promise<void> {
		if (!this.walkActive) {
			return;
		}
		const stop = this.currentStop();
		const actions = this.availableActions(stop);
		const modal = new TaskTriageModal(this.plugin.app, {
			stop,
			actions,
			locale: this.plugin.settings.dateLocale,
			today: this.walkToday,
			position: { index: this.index, total: this.stops.length },
			sourcePath: stop.kind === "task" ? stop.task.path : (getDiaryNotePath(this.plugin) ?? ""),
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
		void this.loadPreview(stop).then((preview) => {
			modal.setPreview(preview);
		});
		// Warm the cache for the next stop while the user works this one.
		// Reminder stops are excluded: they share the diary note, which walk
		// actions mutate — their previews are always read fresh (SDD R15).
		const next = this.stops[this.index + 1];
		if (next !== undefined && next.kind === "task") {
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

	async loadPreview(stop: TriageStop): Promise<string> {
		if (stop.kind === "reminder") {
			// Immer frisch lesen: alle Erinnerungs-Stops teilen die Tagebuch-
			// Notiz, die Walk-Aktionen mutieren — Cache/Prefetch wären racy.
			const file = this.diaryFile();
			if (file === null) return PREVIEW_PLACEHOLDER;
			try {
				const content = await this.plugin.app.vault.read(file);
				const section = erinnerungenSection(content);
				return section === "" ? PREVIEW_PLACEHOLDER : section;
			} catch (e) {
				this.logError(e);
				return PREVIEW_PLACEHOLDER;
			}
		}
		const cached = this.previewCache.get(stop.task.path);
		if (cached !== undefined) {
			return cached;
		}
		try {
			const content = await this.bridge.readNote(stop.task.path);
			const preview = buildTriagePreview(content);
			this.previewCache.set(stop.task.path, preview);
			return preview;
		} catch (e) {
			this.logError(e);
			return PREVIEW_PLACEHOLDER;
		}
	}

	availableActions(stop: TriageStop): { snooze: boolean; skipInstance: boolean } {
		if (stop.kind === "reminder") {
			return { snooze: true, skipInstance: false };
		}
		return { snooze: !stop.task.isRecurring, skipInstance: stop.task.isRecurring };
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

	// Wendet eine Engine-Mutation auf die Tagebuch-Notiz an; wirft, wenn die
	// Zeile nicht mehr existiert oder die Notiz fehlt (→ onMutationError-Pfad).
	private async mutateReminder(fn: (content: string) => { newContent: string } | null): Promise<void> {
		const file = this.diaryFile();
		if (file === null) {
			throw new Error("diary-note-missing");
		}
		let found = true;
		await this.plugin.app.vault.process(file, (content) => {
			const result = fn(content);
			if (result === null) {
				found = false;
				return content;
			}
			return result.newContent;
		});
		if (!found) {
			throw new Error("reminder-line-missing");
		}
	}

	async handleComplete(): Promise<void> {
		const stop = this.currentStop();
		await this.mutateAndAdvance(
			() =>
				stop.kind === "reminder"
					? this.mutateReminder((content) => removeReminderLine(content, stop.reminder.line))
					: stop.task.isRecurring
						? this.bridge.toggleCompleteInstance(stop.task.path, this.walkToday)
						: this.bridge.complete(stop.task.path),
			"completed",
		);
	}

	async handleSnooze(kind: SnoozeKind): Promise<void> {
		await this.handleSnoozeCustom(snoozeDate(kind, this.walkToday));
	}

	async handleSnoozeCustom(date: string): Promise<void> {
		const stop = this.currentStop();
		await this.mutateAndAdvance(
			() =>
				stop.kind === "reminder"
					? this.mutateReminder((content) =>
							rescheduleReminderLine(content, stop.reminder.line, parseIsoDate(date), this.plugin.settings.dateLocale),
						)
					: this.bridge.setScheduled(stop.task.path, date),
			"snoozed",
		);
	}

	async handleSkipInstance(): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind !== "task") {
			return;
		}
		await this.mutateAndAdvance(() => this.bridge.toggleSkippedInstance(stop.task.path, this.walkToday), "instancesSkipped");
	}

	async handleSkip(): Promise<void> {
		this.counts.skipped++;
		await this.advance();
	}

	async handleOpenAndStop(): Promise<void> {
		const stop = this.currentStop();
		try {
			if (stop.kind === "reminder") {
				await this.openDiaryAtReminder(stop.reminder);
			} else {
				await this.bridge.openInNewTab(stop.task.path);
			}
		} catch (e) {
			this.logError(e);
			new Notice("Konnte Notiz nicht öffnen.");
		}
		this.finishWalk();
	}

	private async openDiaryAtReminder(reminder: ReminderItem): Promise<void> {
		const file = this.diaryFile();
		if (file === null) {
			throw new Error("diary-note-missing");
		}
		const leaf = this.plugin.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (editor) {
			const pos = { line: reminder.lineIndex, ch: 0 };
			editor.setCursor(pos);
			editor.scrollIntoView({ from: pos, to: pos }, true);
		}
	}

	handleStop(): void {
		this.finishWalk();
	}

	private async onMutationError(e: unknown): Promise<void> {
		this.logError(e);
		new Notice("Aktion fehlgeschlagen — Eintrag bleibt offen.");
		await this.presentStop();
	}

	private async advance(): Promise<void> {
		if (!this.walkActive) {
			return;
		}
		this.index++;
		if (this.index >= this.stops.length) {
			this.finishWalk();
		} else {
			await this.presentStop();
		}
	}

	private finishWalk(): void {
		const { completed, snoozed, instancesSkipped, skipped } = this.counts;
		const remaining = this.stops.length - (completed + snoozed + instancesSkipped + skipped);
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
