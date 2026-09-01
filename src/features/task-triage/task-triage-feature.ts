import { Notice, TFile } from "obsidian";
import type { CachedMetadata } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID, type LuKitFeature, type HelpEntry } from "../../types";
import { formatDate } from "../../shared/date-format";
import { getDiaryNotePath } from "../../shared/diary-settings";
import { frontmatterTagsInclude } from "../../shared/frontmatter";
import { parseIntakeGroups, takeOverGroup, dropGroup, snoozeGroup } from "../vorgang/intake-engine";
import { listReminders, removeReminderLine, rescheduleReminderLine, erinnerungenSection } from "../work-diary/work-diary-engine";
import type { ReminderItem } from "../work-diary/work-diary-engine";
import { createTaskNotesBridge, type TaskNotesBridge, type BridgeAvailability } from "./tasknotes-bridge";
import {
	selectTriageTasks,
	selectDueReminders,
	selectDueIntakeGroups,
	snoozeDate,
	buildTriagePreview,
	parseIsoDate,
	type TriageStop,
	type IntakeStopCandidate,
	type SnoozeKind,
} from "./task-triage-engine";
import { IntakeSelectModal } from "./intake-select-modal";
import { TaskTriageModal } from "./task-triage-modal";
import { TaskTriageDateModal } from "./task-triage-date-modal";

const PREVIEW_PLACEHOLDER = "(Vorschau nicht verfügbar)";

type IntakeStop = Extract<TriageStop, { kind: "intake" }>;

// The intake boundary's heading text as the metadata cache stores it
// (without the four hashes).
const INTAKE_BOUNDARY_HEADING = "Unsortiert";

// Pre-filter before reading from disk: when the metadata cache knows the
// note's headings and the boundary is absent, the note cannot hold an intake.
// A missing headings entry means "unknown", not "none" — such a note is still
// read, otherwise a cold cache would silently swallow its groups.
function mayHoldIntake(cache: CachedMetadata | null): boolean {
	const headings = cache?.headings;
	if (!Array.isArray(headings)) return true;
	return headings.some((h) => h.level === 4 && h.heading.trim() === INTAKE_BOUNDARY_HEADING);
}

export class TaskTriageFeature implements LuKitFeature {
	id = "task-triage";
	private plugin!: LuKitPlugin;
	bridge!: TaskNotesBridge;

	walkActive = false;
	stops: TriageStop[] = [];
	index = 0;
	counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
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
					"Geht fällige Tagebuch-Erinnerungen, Intake-Gruppen der Vorgänge und TaskNotes-Tasks durch (in dieser Reihenfolge); pro Stop: erledigen bzw. übernehmen, verschieben, heutige Instanz auslassen (nur Tasks), verwerfen und Punkte auswählen (nur Intake), öffnen & stoppen oder überspringen. Ohne TaskNotes (≥ 4.10.0) läuft der Walk ohne Task-Stops.",
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
		const intakeStops = await this.loadDueIntakeStops();

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

		const stops: TriageStop[] = [
			...reminders.map((reminder) => ({ kind: "reminder" as const, reminder })),
			...intakeStops,
			...taskStops,
		];
		if (stops.length === 0) {
			this.walkActive = false;
			new Notice("Keine fälligen Tasks oder Erinnerungen");
			return;
		}

		this.stops = stops;
		this.index = 0;
		this.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
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
		return this.noteFile(path);
	}

	private noteFile(path: string): TFile | null {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	// Due intake groups of every note that may carry a boundary and is not
	// closed. An unreadable note costs its own groups, never the walk.
	private async loadDueIntakeStops(): Promise<TriageStop[]> {
		const candidates: IntakeStopCandidate[] = [];
		for (const file of this.plugin.app.vault.getMarkdownFiles()) {
			const cache = this.plugin.app.metadataCache.getFileCache(file);
			if (!mayHoldIntake(cache) || this.isDone(cache)) continue;
			let content: string;
			try {
				content = await this.plugin.app.vault.read(file);
			} catch (e) {
				this.logError(e);
				continue;
			}
			for (const group of parseIntakeGroups(content)) {
				candidates.push({ group, notePath: file.path, noteBasename: file.basename });
			}
		}
		return selectDueIntakeGroups(candidates, this.walkToday).map((c) => ({
			kind: "intake" as const,
			group: c.group,
			notePath: c.notePath,
			noteBasename: c.noteBasename,
		}));
	}

	private isDone(cache: CachedMetadata | null): boolean {
		const doneTag = this.plugin.settings.doneTag;
		return doneTag !== "" && frontmatterTagsInclude(cache?.frontmatter?.tags, doneTag);
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

	// Render context for MarkdownRenderer: the note the stop came from.
	private stopSourcePath(stop: TriageStop): string {
		if (stop.kind === "task") return stop.task.path;
		if (stop.kind === "intake") return stop.notePath;
		return getDiaryNotePath(this.plugin) ?? "";
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
			sourcePath: this.stopSourcePath(stop),
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
			onIntakeDiscard: () => {
				void this.handleIntakeDiscard();
			},
			onIntakeSelect: () => {
				this.handleIntakeSelect();
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
		if (stop.kind === "intake") {
			// Always read fresh: several groups share one Vorgang note that earlier
			// stops of the same walk have already changed — a cache or a prefetch
			// would show the state before that take-over.
			const file = this.noteFile(stop.notePath);
			if (file === null) return PREVIEW_PLACEHOLDER;
			try {
				return buildTriagePreview(await this.plugin.app.vault.read(file));
			} catch (e) {
				this.logError(e);
				return PREVIEW_PLACEHOLDER;
			}
		}
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
		// At an intake stop ⌘X means "discard" — the modal registers that from
		// the stop kind itself, not through skipInstance.
		if (stop.kind === "reminder" || stop.kind === "intake") {
			return { snooze: true, skipInstance: false };
		}
		return { snooze: !stop.task.isRecurring, skipInstance: stop.task.isRecurring };
	}

	private async mutateAndAdvance(
		mutate: () => Promise<void>,
		counter: "completed" | "snoozed" | "instancesSkipped" | "takenOver" | "discarded",
	): Promise<void> {
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

	// Applies an engine mutation to the Vorgang note; throws when the note is
	// gone or the group no longer stands in it (→ onMutationError path). The
	// vault.process callback hands over what is on disk, hence always fresh.
	private async mutateIntake(stop: IntakeStop, fn: (content: string) => { newContent: string } | null): Promise<void> {
		const file = this.noteFile(stop.notePath);
		if (file === null) {
			throw new Error("intake-note-missing");
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
			throw new Error("intake-group-missing");
		}
	}

	async handleComplete(): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind === "intake") {
			// At an intake stop ⌘D means "take over", not "complete".
			await this.handleIntakeTakeOver();
			return;
		}
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
		if (stop.kind === "intake") {
			await this.handleIntakeSnoozeCustom(date);
			return;
		}
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

	async handleIntakeTakeOver(selectedIndices?: number[]): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind !== "intake") return;
		await this.mutateAndAdvance(
			() => this.mutateIntake(stop, (content) => takeOverGroup(content, stop.group, selectedIndices)),
			"takenOver",
		);
	}

	async handleIntakeDiscard(): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind !== "intake") return;
		await this.mutateAndAdvance(() => this.mutateIntake(stop, (content) => dropGroup(content, stop.group)), "discarded");
	}

	async handleIntakeSnoozeCustom(date: string): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind !== "intake") return;
		const locale = this.plugin.settings.dateLocale;
		await this.mutateAndAdvance(
			() => this.mutateIntake(stop, (content) => snoozeGroup(content, stop.group, parseIsoDate(date), locale)),
			"snoozed",
		);
	}

	handleIntakeSelect(): void {
		const stop = this.currentStop();
		if (stop.kind !== "intake") return;
		new IntakeSelectModal(this.plugin.app, {
			group: stop.group,
			onConfirm: (selectedIndices) => {
				void this.handleIntakeTakeOver(selectedIndices);
			},
			onCancel: () => {
				// Dismissal writes nothing — the same stop is presented again.
				void this.presentStop();
			},
		}).open();
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
			} else if (stop.kind === "intake") {
				await this.openNoteAtIntakeGroup(stop);
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

	private async openNoteAtIntakeGroup(stop: IntakeStop): Promise<void> {
		const file = this.noteFile(stop.notePath);
		if (file === null) {
			throw new Error("intake-note-missing");
		}
		const leaf = this.plugin.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (!editor) return;
		// The line index noted at collection time can be stale — the line itself
		// is the key, exactly as it is for the mutations.
		const found = editor.getValue().split("\n").indexOf(stop.group.line);
		const pos = { line: found === -1 ? Math.max(stop.group.lineIndex, 0) : found, ch: 0 };
		editor.setCursor(pos);
		editor.scrollIntoView({ from: pos, to: pos }, true);
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
		const { completed, snoozed, instancesSkipped, skipped, takenOver, discarded } = this.counts;
		const remaining = this.stops.length - (completed + snoozed + instancesSkipped + skipped + takenOver + discarded);
		// The two intake buckets appear only when the walk actually had intake
		// stops — a pure task/reminder walk keeps its existing sentence.
		const intake = this.stops.some((s) => s.kind === "intake") ? `${takenOver} übernommen, ${discarded} verworfen, ` : "";
		new Notice(
			`Triage beendet: ${completed} erledigt, ${snoozed} verschoben, ${instancesSkipped} ausgelassen, ${skipped} übersprungen, ${intake}${remaining} offen`,
		);
		this.walkActive = false;
		this.modal = undefined;
	}

	private logError(e: unknown): void {
		console.error("LuKit task-triage: error:", e instanceof Error ? e.name : typeof e);
	}
}
