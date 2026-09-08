import { Notice, TFile } from "obsidian";
import type { CachedMetadata } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID, type LuKitFeature, type HelpEntry } from "../../types";
import { formatDate } from "../../shared/date-format";
import { getDiaryNotePath } from "../../shared/diary-settings";
import { frontmatterTagsInclude } from "../../shared/frontmatter";
import { parseIntakeGroups, takeOverGroup, dropGroup, snoozeGroup, findIntakeGroupLine } from "../vorgang/intake-engine";
import type { IntakeGroup } from "../vorgang/intake-engine";
import { listReminders, removeReminderLine, rescheduleReminderLine, erinnerungenSection } from "../work-diary/work-diary-engine";
import type { ReminderItem } from "../work-diary/work-diary-engine";
import { createTaskNotesBridge, type TaskNotesBridge, type BridgeAvailability } from "./tasknotes-bridge";
import {
	selectTriageTasks,
	isOpenToday,
	selectDueReminders,
	selectDueIntakeGroups,
	selectNoteStops,
	snoozeDate,
	buildTriagePreview,
	parseIsoDate,
	type TriageStop,
	type TriageTask,
	type IntakeStopCandidate,
	type SnoozeKind,
} from "./task-triage-engine";
import { IntakeSelectModal } from "./intake-select-modal";
import type { IntakeGroupOutcome } from "./intake-select-modal";
import { TaskTriageModal } from "./task-triage-modal";
import { TaskTriageDateModal } from "./task-triage-date-modal";
import { NoteDateModal } from "./note-date-modal";
import type { NoteDates } from "./note-date-modal";

const PREVIEW_PLACEHOLDER = "(Vorschau nicht verfügbar)";

type NoteTriageStop = Extract<TriageStop, { kind: "note" }>;

// The intake boundary's heading text as the metadata cache stores it
// (without the four hashes).
const INTAKE_BOUNDARY_HEADING = "Unsortiert";

// Pre-filter before reading from disk: when the metadata cache knows the
// note's headings and the boundary is absent, the note cannot hold an intake.
// A missing headings entry means "unknown", not "none" — such a note is still
// read, otherwise a cold cache would silently swallow its groups.
//
// Deliberate trade-off: Obsidian also omits `headings` for a note that simply
// has none, so every heading-less note is read once per walk. Treating the
// absent entry as "no headings" would save those reads but lose real groups
// whenever the cache is merely cold — correctness outranks the reads here.
function mayHoldIntake(cache: CachedMetadata | null): boolean {
	const headings = cache?.headings;
	if (!Array.isArray(headings)) return true;
	return headings.some((h) => h.level === 4 && h.heading.trim() === INTAKE_BOUNDARY_HEADING);
}

// Whether a group's outcome leaves the group standing. Mirrors takeOverGroup's
// own rule: an empty selection on both sides removes the group entirely, which
// is what decides whether a date still has a line to be written onto.
function keepsAnything(outcome: IntakeGroupOutcome): boolean {
	return outcome.keptOwn.length > 0 || outcome.keptForeign.length > 0;
}

export class TaskTriageFeature implements LuKitFeature {
	id = "task-triage";
	private plugin!: LuKitPlugin;
	bridge!: TaskNotesBridge;

	walkActive = false;
	stops: TriageStop[] = [];
	index = 0;
	counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0 };
	// Indices of stops whose intake a ⌘S pass already moved out; they count as
	// taken over whenever they are finally left.
	private takenOverStops = new Set<number>();
	// Pinned once per walk so a walk crossing midnight keeps mutating the
	// instances/dates the selection (and the visible modal) was based on.
	walkToday = "";
	private modal?: TaskTriageModal;

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
					"Geht fällige Tagebuch-Erinnerungen und danach jede fällige Notiz durch — eine Notiz ist ein Stop, mit ihrer TaskNotes-Task und ihren fälligen Intake-Gruppen zusammen. Pro Stop: erledigen, verschieben, heutige Instanz auslassen (nur wiederkehrende Tasks), Datum der Notiz setzen, Punkte auswählen (nur mit Intake-Gruppen), öffnen & stoppen oder überspringen. Ohne TaskNotes (≥ 4.10.0) läuft der Walk ohne Tasks.",
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

		let dueTasks: TriageTask[] = [];
		let otherTasks: TriageTask[] = [];
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
			// A closed note is out of the walk whichever half made it due — the
			// intake candidates are filtered the same way while they are read.
			const open = all.filter((task) => !this.isDone(this.cacheFor(task.path)));
			dueTasks = selectTriageTasks(open, this.walkToday);
			// A note can qualify through its intake alone. Its task is then not in
			// dueTasks, but the stop still has to carry it — otherwise ⌘D, ⌘G and
			// the snoozes are withdrawn on exactly the notes this walk is for.
			const due = new Set(dueTasks.map((task) => task.path));
			otherTasks = open.filter((task) => !due.has(task.path) && isOpenToday(task, this.walkToday));
		} else {
			// Degradation statt Abbruch: Erinnerungen hängen nicht von TaskNotes ab.
			new Notice(this.availabilityMessage(availability));
		}
		const candidates = await this.loadDueIntakeCandidates();
		loading.hide();

		const stops: TriageStop[] = [
			...reminders.map((reminder) => ({ kind: "reminder" as const, reminder })),
			...selectNoteStops(dueTasks, candidates, otherTasks).map((stop) => ({ kind: "note" as const, ...stop })),
		];
		if (stops.length === 0) {
			this.walkActive = false;
			new Notice("Keine fälligen Tasks oder Erinnerungen");
			return;
		}

		this.stops = stops;
		this.index = 0;
		this.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0 };
		this.takenOverStops.clear();
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
	private async loadDueIntakeCandidates(): Promise<IntakeStopCandidate[]> {
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
		return selectDueIntakeGroups(candidates, this.walkToday);
	}

	private isDone(cache: CachedMetadata | null): boolean {
		const doneTag = this.plugin.settings.doneTag;
		return doneTag !== "" && frontmatterTagsInclude(cache?.frontmatter?.tags, doneTag);
	}

	private cacheFor(path: string): CachedMetadata | null {
		const file = this.noteFile(path);
		return file === null ? null : this.plugin.app.metadataCache.getFileCache(file);
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
		return stop.kind === "reminder" ? (getDiaryNotePath(this.plugin) ?? "") : stop.notePath;
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
			onIntakeSelect: () => {
				this.handleIntakeSelect();
			},
			onIntakeNoteDate: () => {
				this.handleIntakeNoteDate();
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
		// Always read fresh: a ⌘S pass on this very stop rewrites the note, so a
		// cached or prefetched copy would show the state before it.
		const file = this.noteFile(stop.notePath);
		if (file === null) return PREVIEW_PLACEHOLDER;
		try {
			return buildTriagePreview(await this.plugin.app.vault.read(file));
		} catch (e) {
			this.logError(e);
			return PREVIEW_PLACEHOLDER;
		}
	}

	availableActions(stop: TriageStop): { snooze: boolean; skipInstance: boolean } {
		if (stop.kind === "reminder") {
			return { snooze: true, skipInstance: false };
		}
		// A note TaskNotes does not know has no dates to move and no instance to
		// skip; only its intake and the note itself can be acted on.
		const task = stop.task;
		if (task === undefined) {
			return { snooze: false, skipInstance: false };
		}
		return { snooze: !task.isRecurring, skipInstance: task.isRecurring };
	}

	private async mutateAndAdvance(
		mutate: () => Promise<void>,
		counter: "completed" | "snoozed" | "instancesSkipped" | "takenOver",
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

	async handleComplete(): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind === "reminder") {
			await this.mutateAndAdvance(() => this.mutateReminder((content) => removeReminderLine(content, stop.reminder.line)), "completed");
			return;
		}
		const task = stop.task;
		if (task === undefined) return;
		await this.mutateAndAdvance(
			() => (task.isRecurring ? this.bridge.toggleCompleteInstance(task.path, this.walkToday) : this.bridge.complete(task.path)),
			"completed",
		);
	}

	async handleSnooze(kind: SnoozeKind): Promise<void> {
		await this.handleSnoozeCustom(snoozeDate(kind, this.walkToday));
	}

	async handleSnoozeCustom(date: string): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind === "reminder") {
			await this.mutateAndAdvance(
				() =>
					this.mutateReminder((content) =>
						rescheduleReminderLine(content, stop.reminder.line, parseIsoDate(date), this.plugin.settings.dateLocale),
					),
				"snoozed",
			);
			return;
		}
		const task = stop.task;
		if (task === undefined) return;
		await this.mutateAndAdvance(() => this.bridge.setScheduled(task.path, date), "snoozed");
	}

	async handleSkipInstance(): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind === "reminder") return;
		const task = stop.task;
		if (task === undefined || !task.isRecurring) return;
		await this.mutateAndAdvance(() => this.bridge.toggleSkippedInstance(task.path, this.walkToday), "instancesSkipped");
	}

	handleIntakeSelect(): void {
		const stop = this.currentStop();
		if (stop.kind !== "note" || stop.groups.length === 0) return;
		new IntakeSelectModal(this.plugin.app, {
			groups: stop.groups,
			onConfirm: (outcomes) => {
				void this.handleIntakeGroupOutcomes(outcomes);
			},
			onCancel: () => {
				// Dismissal writes nothing — the same stop is presented again.
				void this.presentStop();
			},
		}).open();
	}

	// Applies every group's outcome in the stop's group order, threading one
	// content string through the engine calls and committing them as a single
	// write — a discard and a take-over on the same note are one edit. A group
	// whose parent line is no longer there aborts the batch, writing nothing.
	async handleIntakeGroupOutcomes(outcomes: IntakeGroupOutcome[]): Promise<void> {
		const stop = this.currentStop();
		if (stop.kind !== "note") return;
		const file = this.noteFile(stop.notePath);
		if (file === null) return this.onMutationError(new Error("intake-note-missing"));

		let applied = true;
		try {
			await this.plugin.app.vault.process(file, (content) => {
				let working = content;
				for (const outcome of outcomes) {
					// A group the stop no longer carries was worked off by an
					// earlier pass; the dialog's own outcome for it is stale.
					const group = stop.groups.find((g) => g.lineIndex === outcome.lineIndex);
					if (group === undefined) continue;
					const result = outcome.discard
						? dropGroup(working, group)
						: takeOverGroup(working, group, {
								taken: outcome.taken,
								keptOwn: outcome.keptOwn,
								keptForeign: outcome.keptForeign,
							});
					if (result === null) {
						applied = false;
						return content;
					}
					working = result.newContent;

					// The group's own date lands after its take-over, on the
					// line that rewrite left behind — a snooze first would be
					// overwritten by renderGroup's verbatim rewrite. Skipped
					// when the take-over kept nothing: the group is gone, and
					// its date with it, so snoozing would only report the
					// parent line missing.
					if (outcome.due === null || outcome.discard || !keepsAnything(outcome)) continue;
					const snoozed = snoozeGroup(working, group, parseIsoDate(outcome.due), this.plugin.settings.dateLocale);
					if (snoozed === null) {
						applied = false;
						return content;
					}
					working = snoozed.newContent;
				}
				return working;
			});
		} catch (e) {
			return this.onMutationError(e);
		}
		if (!applied) return this.onMutationError(new Error("intake-group-missing"));

		// Only a pass that actually moved a line makes the stop "übernommen";
		// the bucket itself is awarded by whatever finally leaves it.
		if (outcomes.some((o) => !o.discard && o.taken.length > 0)) this.takenOverStops.add(this.index);
		await this.refreshIntakeStop(stop);
		// Sorting the intake is a sub-task of working the note, not the end of
		// it: ⌘S returns to the stop, so the note's own dates can still be set.
		await this.presentStop();
	}

	// Re-reads the note and puts its due groups back on the stop, so the
	// re-presented dialog acts on current line numbers and items. A group that
	// left the note, or whose date moved past today, is simply gone from the
	// stop — the stop itself stays, with the note's own actions.
	private async refreshIntakeStop(stop: NoteTriageStop): Promise<void> {
		const file = this.noteFile(stop.notePath);
		let content: string | null = null;
		if (file !== null) {
			try {
				content = await this.plugin.app.vault.read(file);
			} catch (e) {
				this.logError(e);
			}
		}
		const parsed = content === null ? [] : parseIntakeGroups(content);
		const groups = selectDueIntakeGroups(
			parsed.map((group) => ({ group, notePath: stop.notePath, noteBasename: stop.noteBasename })),
			this.walkToday,
		)
			.map((candidate) => candidate.group)
			// selectDueIntakeGroups orders by due date; the stop shows file order.
			.sort((a, b) => a.lineIndex - b.lineIndex);
		this.stops[this.index] = { ...stop, groups };
	}

	// Datum der Notiz selbst (nicht das einer Gruppe): schreibt über die
	// TaskNotes-Bridge und kehrt zum Stop zurück — es beendet ihn nicht. Nur für
	// Notizen, die TaskNotes kennt; ein Fehlschlag kostet nur das Datum.
	handleIntakeNoteDate(): void {
		const stop = this.currentStop();
		if (stop.kind !== "note") return;
		const task = stop.task;
		if (task === undefined) return;
		new NoteDateModal(
			this.plugin.app,
			stop.noteBasename,
			{ due: task.due ?? "", scheduled: task.scheduled ?? "" },
			(dates) => {
				void this.setNoteDates(stop, dates);
			},
			() => {
				void this.presentStop();
			},
		).open();
	}

	// Writes only what changed, and an emptied field clears the property rather
	// than writing "". A failure costs the date, never the stop.
	private async setNoteDates(stop: NoteTriageStop, dates: NoteDates): Promise<void> {
		const task = stop.task;
		if (task === undefined) return;
		const writes: { current: string; next: string; set: (d: string) => Promise<void>; clear: () => Promise<void> }[] = [
			{
				current: task.due ?? "",
				next: dates.due,
				set: (d) => this.bridge.setDue(task.path, d),
				clear: () => this.bridge.clearDue(task.path),
			},
			{
				current: task.scheduled ?? "",
				next: dates.scheduled,
				set: (d) => this.bridge.setScheduled(task.path, d),
				clear: () => this.bridge.clearScheduled(task.path),
			},
		];
		try {
			for (const w of writes) {
				if (w.current === w.next) continue;
				await (w.next === "" ? w.clear() : w.set(w.next));
			}
			this.stops[this.index] = {
				...stop,
				task: { ...task, due: dates.due === "" ? undefined : dates.due, scheduled: dates.scheduled === "" ? undefined : dates.scheduled },
			};
		} catch (e) {
			this.logError(e);
			new Notice("Datum der Notiz konnte nicht gesetzt werden.");
		}
		await this.presentStop();
	}

	async handleSkip(): Promise<void> {
		// Leaving a stop whose intake was worked reports what happened to it —
		// "übersprungen" would hide the take-over from the summary.
		if (this.takenOverStops.has(this.index)) this.counts.takenOver++;
		else this.counts.skipped++;
		await this.advance();
	}

	async handleOpenAndStop(): Promise<void> {
		const stop = this.currentStop();
		try {
			if (stop.kind === "reminder") {
				await this.openDiaryAtReminder(stop.reminder);
			} else if (stop.task !== undefined && stop.groups.length === 0) {
				// Nothing to place the cursor at — TaskNotes opens the task note.
				await this.bridge.openInNewTab(stop.task.path);
			} else {
				await this.openNoteAt(stop.notePath, stop.groups[0]);
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

	private async openNoteAt(notePath: string, group?: IntakeGroup): Promise<void> {
		const file = this.noteFile(notePath);
		if (file === null) {
			throw new Error("intake-note-missing");
		}
		const leaf = this.plugin.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (!editor || group === undefined) return;
		// The line index noted at collection time can be stale — the line itself
		// is the key, and it is resolved exactly as the mutations resolve it:
		// scoped below the boundary, so a curated copy of the line or a sibling
		// group with a byte-identical anchor cannot capture the cursor.
		const found = findIntakeGroupLine(editor.getValue(), group);
		const pos = { line: found === -1 ? Math.max(group.lineIndex, 0) : found, ch: 0 };
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
		// A stop the walk never revisits still has to report what happened to it:
		// ⌘. and Enter leave the current stop without a counting action, and if
		// ⌘S moved lines out of its intake, that work is a take-over, not "offen".
		if (this.walkActive && this.takenOverStops.has(this.index)) {
			this.takenOverStops.delete(this.index);
			this.counts.takenOver++;
		}
		const { completed, snoozed, instancesSkipped, skipped, takenOver } = this.counts;
		const remaining = this.stops.length - (completed + snoozed + instancesSkipped + skipped + takenOver);
		// Always all six buckets, zeros included: a summary whose shape depends
		// on what the walk happened to contain cannot be read at a glance.
		new Notice(
			`Triage beendet: ${completed} erledigt, ${snoozed} verschoben, ${instancesSkipped} ausgelassen, ${skipped} übersprungen, ${takenOver} übernommen, ${remaining} offen`,
		);
		this.walkActive = false;
		this.modal = undefined;
	}

	private logError(e: unknown): void {
		console.error("LuKit task-triage: error:", e instanceof Error ? e.name : typeof e);
	}
}
