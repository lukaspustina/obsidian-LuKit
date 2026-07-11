import { execFile } from "child_process";
import { join } from "path";
import { Notice, Setting, normalizePath, type App, type FileSystemAdapter, type TFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature, HelpEntry } from "../../types";
import { createOsascriptBridge, type MailBridge, type RawMailMessageMeta, type RawMailBody, type SelectedMessage } from "./mail-bridge";
import { parseEmailBody } from "./email-quote-engine";
import {
	extractFiledMessageIds,
	formatThreadSection,
	filterAttachments,
	buildMessageUrl,
	stripSubjectPrefixes,
	sanitizeSenderSubject,
	threadKey,
	resolveAttachmentFileNames,
	decodeMessageIdFromUrl,
	preselectAttachment,
	type EmailMeta,
	type MailAttachment,
	type ThreadSectionMessage,
} from "./email-format-engine";
import { formatDate } from "../../shared/date-format";
import { mergeDetectedAccounts, isAccountIncluded } from "./email-filing-settings";
import { mineVorgangFilings, minedFilingsToFiledRecords, isCacheStale } from "./email-routing";
import { addVorgangSection } from "../vorgang/vorgang-engine";
import { suggestFilingTargets, type FiledRecord } from "../besprechung/besprechung-suggest-engine";
import { collectBesprechungFiledRecords } from "../besprechung/besprechung-feature";
import { SECTION_NOTE_TAGS, frontmatterTagsInclude } from "../../shared/frontmatter";
import { createSectionNoteViaCommand } from "../../shared/quick-create";
import { SectionNoteSuggestModal } from "../../shared/modals/section-note-suggest";
import {
	EmailPreviewModal,
	type PreviewMessage,
	type PreviewMessageResult,
} from "./email-preview-modal";

// minScore must sit below NAME_MATCH_WEIGHT (0.4) so name-match-only ranking
// (empty corpus) surfaces suggestions.
const SUGGEST_MIN_SCORE = 0.01;

// Absolute filesystem destination for a saved attachment: getBasePath() (the
// bridge doesn't know the vault) + the vault-relative _resources folder +
// the already-resolved filename.
function resolveAttachmentDestPath(app: App, vaultRelativeFolder: string, fileName: string): string {
	const basePath = (app.vault.adapter as FileSystemAdapter).getBasePath();
	return join(basePath, vaultRelativeFolder, fileName);
}

// A fully-gathered thread, ready to preview and then commit. Built read-only by
// assembleThread (no archive, no write); committed by commitThread.
interface AssembledThread {
	sectionName: string;
	/** All thread messages, sorted newest-first (matches the written + previewed order). */
	messages: ThreadSectionMessage[];
	/** Inbox sibling message ids to archive on commit (empty for single-shot capture). */
	siblingIds: string[];
	latestDate: Date;
	threadKey: string;
}

export class EmailFilingFeature implements LuKitFeature {
	id = "email-filing";
	private plugin!: LuKitPlugin;
	// Injection seams: tests replace these before invoking methods.
	bridge!: MailBridge;
	openUrl: (url: string) => void = (url) => {
		execFile("open", [url], () => undefined);
	};
	private walkInProgress = false;
	// Section-note candidates, computed once per walk (not per message).
	private walkCandidates: string[] = [];
	// Lazily-fetched message bodies keyed by walk index; the next message is
	// prefetched while the user works the current one.
	private bodyCache = new Map<number, Promise<RawMailBody>>();
	// Messages that left the inbox (server rule, another client) between the
	// snapshot and their turn — skipped silently, summarized at walk end.
	private vanishedCount = 0;
	// Messages whose body couldn't be read (transient Mail/Apple Event failure)
	// — skipped, summarized at walk end.
	private unreadableCount = 0;
	// In-walk routing memory: each successful filing feeds the suggestion ranker
	// so later emails (e.g. same thread) are steered to the same Vorgang.
	private walkFiledRecords: FiledRecord[] = [];
	// Cross-session routing corpus mined from existing Vorgänge (cached in data.json).
	private routingCorpus: FiledRecord[] = [];
	// In-walk skip memory: subjects (thread keys) the user skipped; later emails
	// of the same thread are auto-skipped (left in the inbox).
	private skippedThreads = new Set<string>();
	private autoSkippedCount = 0;
	// Inbox messages filed + archived as siblings of a thread we filed. When the
	// walk later reaches them (they're still in the snapshot), skip silently —
	// they were filed, not left behind, so they must not count as auto-skipped.
	private threadHandledIds = new Set<string>();

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;
		this.bridge = this.makeBridge();

		plugin.addCommand({
			id: "email-filing-walk",
			name: "E-Mails: Posteingang ablegen",
			icon: LUKIT_ICON_ID,
			callback: () => {
				this.startWalk();
			},
		});

		plugin.addCommand({
			id: "email-filing-file-selected",
			name: "E-Mail: In Mail ausgewählte Nachricht ablegen",
			icon: LUKIT_ICON_ID,
			callback: () => {
				this.startSelectedWalk();
			},
		});
	}

	onunload(): void {
		// Nothing to clean up.
	}

	helpEntries(): HelpEntry[] {
		return [
			{
				commandId: "email-filing-walk",
				displayName: "E-Mails: Posteingang ablegen",
				description:
					"Geht den Apple-Mail-Posteingang durch; pro Nachricht Zielnotiz wählen, extrahierten Text prüfen/bearbeiten — die Konversation (eingehend + eigene Antworten) wird abgelegt und archiviert.",
			},
			{
				commandId: "email-filing-file-selected",
				displayName: "E-Mail: In Mail ausgewählte Nachricht ablegen",
				description:
					"Legt die in Apple Mail ausgewählte(n) Nachricht(en) samt Thread in einen Vorgang ab (beliebiges Postfach, inkl. Gesendet) — nur Erfassung, nichts wird archiviert. Für selbst gestartete Threads.",
			},
		];
	}

	private makeBridge(): MailBridge {
		const s = this.plugin.settings.emailFiling;
		return createOsascriptBridge(
			s.archiveMailboxes,
			s.defaultArchiveMailbox,
			s.sentMailboxes,
			s.defaultSentMailbox,
		);
	}

	private sentMailboxFor(accountName: string): string {
		const s = this.plugin.settings.emailFiling;
		return s.sentMailboxes[accountName] ?? s.defaultSentMailbox;
	}

	// Baut den „Neuen Vorgang anlegen"-Callback für die Picker: führt das
	// konfigurierte Kommando aus, wartet auf die indexierte Notiz und öffnet
	// den Picker fürs selbe Element erneut — mit der neuen Notiz gepinnt.
	private createNewHandler(represent: () => void, representPinned: (basename: string) => void): (() => void) | undefined {
		const commandId = this.plugin.settings.quickAddVorgangCommandId;
		if (!commandId) return undefined;
		return () => {
			void createSectionNoteViaCommand(this.plugin.app, commandId).then((created) => {
				if (created) {
					this.walkCandidates.push(created.basename);
					representPinned(created.basename);
				} else {
					represent();
				}
			});
		};
	}

	// Synchronous entry point: sets the guard before any await so a second
	// invocation in the same tick is rejected.
	startWalk(): void {
		if (this.walkInProgress) {
			new Notice("Ablage läuft bereits.");
			return;
		}
		this.walkInProgress = true;
		void this.beginWalk();
	}

	private async beginWalk(): Promise<void> {
		const loading = new Notice("Lade Posteingang…", 0);
		let metas: RawMailMessageMeta[];
		try {
			metas = this.selectWalkMessages(await this.bridge.listInbox());
		} catch (e) {
			loading.hide();
			this.logBridgeError(e);
			new Notice(e instanceof Error ? e.message : "Mail-Zugriff fehlgeschlagen.");
			this.walkInProgress = false;
			return;
		}
		loading.hide();
		if (metas.length === 0) {
			new Notice("Inbox ist leer.");
			this.walkInProgress = false;
			return;
		}
		// Compute the picker candidate set once for the whole walk.
		this.bodyCache.clear();
		this.vanishedCount = 0;
		this.unreadableCount = 0;
		this.autoSkippedCount = 0;
		this.walkFiledRecords = [];
		this.skippedThreads.clear();
		this.threadHandledIds.clear();
		this.walkCandidates = this.sectionNoteBasenames();
		this.routingCorpus = await this.buildRoutingCorpus();
		this.presentMessage(metas, 0);
	}

	// Lazily fetches (and memoizes) a message body so the next message can be
	// prefetched while the user works the current one.
	private fetchBodyFor(metas: RawMailMessageMeta[], i: number): Promise<RawMailBody> {
		let p = this.bodyCache.get(i);
		if (!p) {
			p = this.bridge.fetchBody(metas[i].accountName, metas[i].id);
			this.bodyCache.set(i, p);
		}
		return p;
	}

	// Keeps only messages from included accounts, then applies the configured order.
	private selectWalkMessages(metas: RawMailMessageMeta[]): RawMailMessageMeta[] {
		const { walkAccounts } = this.plugin.settings.emailFiling;
		return this.orderMessages(metas.filter((m) => isAccountIncluded(walkAccounts, m.accountName)));
	}

	private orderMessages(metas: RawMailMessageMeta[]): RawMailMessageMeta[] {
		return this.plugin.settings.emailFiling.order === "newest" ? [...metas].reverse() : metas;
	}

	private presentMessage(metas: RawMailMessageMeta[], i: number, pin?: string): void {
		if (i >= metas.length) {
			const parts: string[] = [];
			if (this.autoSkippedCount > 0) parts.push(`${this.autoSkippedCount} automatisch übersprungen (gleicher Thread)`);
			if (this.vanishedCount > 0) parts.push(`${this.vanishedCount} nicht mehr im Posteingang`);
			if (this.unreadableCount > 0) parts.push(`${this.unreadableCount} nicht ladbar`);
			const suffix = parts.length > 0 ? `, ${parts.join(", ")}` : "";
			new Notice(`E-Mail-Ablage fertig (${metas.length} bearbeitet${suffix}).`);
			this.walkInProgress = false;
			return;
		}
		void this.presentMessageAsync(metas, i, pin);
	}

	private async presentMessageAsync(metas: RawMailMessageMeta[], i: number, pin?: string): Promise<void> {
		const meta = metas[i];
		// Already filed + archived as a sibling of an earlier thread filing — skip
		// silently (not left behind, so not counted as auto-skipped).
		if (this.threadHandledIds.has(meta.id)) {
			this.presentMessage(metas, i + 1);
			return;
		}
		// Auto-skip a message whose thread the user already skipped this walk
		// (before fetching its body — left in the inbox, counted at the end).
		const key = threadKey(meta.subject);
		if (key.length > 0 && this.skippedThreads.has(key)) {
			this.autoSkippedCount++;
			this.presentMessage(metas, i + 1);
			return;
		}
		const loading = new Notice(`Lade Nachricht ${i + 1}/${metas.length}…`, 0);
		let attachments: MailAttachment[];
		let body: string;
		try {
			const raw = await this.fetchBodyFor(metas, i);
			body = parseEmailBody(raw.body).body;
			attachments = filterAttachments(raw.attachments);
		} catch (e) {
			loading.hide();
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes("-1743")) {
				// Mail automation permission lost — fatal, stop the walk.
				this.logBridgeError(e);
				new Notice(msg);
				this.walkInProgress = false;
				return;
			}
			if (msg.includes("lukit-not-found")) {
				// Benign: the message left the inbox since the snapshot.
				this.vanishedCount++;
			} else {
				// Transient per-message read failure — skip, never halt the walk.
				this.logBridgeError(e);
				this.unreadableCount++;
			}
			this.presentMessage(metas, i + 1);
			return;
		}
		loading.hide();
		// Prefetch the next body while the user works this message.
		if (i + 1 < metas.length) {
			void this.fetchBodyFor(metas, i + 1).catch(() => undefined);
		}

		const emailMeta = this.toEmailMeta(meta);
		new SectionNoteSuggestModal(this.plugin.app, SECTION_NOTE_TAGS, {
			placeholder: `[${i + 1}/${metas.length}] „${meta.subject}" ablegen unter… (Esc = Überspringen)`,
			previewText: `Von: ${meta.senderName}\nBetreff: ${meta.subject}\n\n${body || "(kein Textinhalt)"}`,
			suggestions: pin ? [pin, ...this.suggestionsFor(meta)] : this.suggestionsFor(meta),
			onCreateNew: this.createNewHandler(() => this.presentMessage(metas, i), (basename) => this.presentMessage(metas, i, basename)),
			skipLabel: "↪ Überspringen (im Posteingang lassen)",
			dropLabel: "✕ Nicht ablegen (nur archivieren)",
			dropHint: "Nur archivieren",
			excludeTag: this.plugin.settings.doneTag,
			openLabel: "→ Stopp und E-Mail in Mail öffnen",
			onPick: (vorgang) => {
				const loading = new Notice("Thread wird zusammengestellt…", 0);
				void this.assembleThread(meta, body, attachments, vorgang).then((assembled) => {
					loading.hide();
					if (!assembled) {
						this.presentMessage(metas, i + 1);
						return;
					}
					new EmailPreviewModal(
						this.plugin.app,
						vorgang.basename,
						`Betreff: ${meta.subject} · ${assembled.messages.length} Nachricht(en)`,
						assembled.sectionName,
						this.toPreviewMessages(assembled.messages),
						(results, outcome) => {
							void this.commitThread(
								meta,
								{ ...assembled, sectionName: outcome.sectionName },
								this.applyPreviewResults(assembled.messages, results),
								vorgang,
							)
								.then(() => {
									if (outcome.openAfterFiling) {
										// „Ablegen und Öffnen" beendet den Walk — die Notiz
										// im aktuellen Fenster wäre sonst sofort vom nächsten
										// Picker verdeckt.
										this.openFiledNote(vorgang);
										new Notice("E-Mail-Ablage beendet — Notiz geöffnet.");
										this.walkInProgress = false;
										return;
									}
									this.presentMessage(metas, i + 1);
								})
								.catch((e) => {
									this.logBridgeError(e);
									new Notice("Ablage fehlgeschlagen — E-Mail wird erneut angezeigt.");
									this.presentMessage(metas, i);
								});
						},
						// Cancelling the preview returns to the picker for this same
						// message (re-pick or choose Skip/Don't-file), rather than skipping it.
						() => {
							this.presentMessage(metas, i);
						},
					).open();
				}).catch((e) => {
					// Without this catch a rejection wedges the walk: the loading
					// Notice never hides and walkInProgress stays true.
					loading.hide();
					this.logBridgeError(e);
					new Notice("Thread konnte nicht zusammengestellt werden — E-Mail wird erneut angezeigt.");
					this.presentMessage(metas, i);
				});
			},
			onSkip: () => {
				if (key.length > 0) this.skippedThreads.add(key);
				this.presentMessage(metas, i + 1);
			},
			onDrop: () => {
				void this.archiveOnly(meta).then(() => this.presentMessage(metas, i + 1));
			},
			onOpenSource: () => {
				this.openMessage(emailMeta);
				new Notice(`Gestoppt bei „${meta.subject}".`);
				this.walkInProgress = false;
			},
			onCancel: () => {
				new Notice("E-Mail-Ablage gestoppt.");
				this.walkInProgress = false;
			},
		}).open();
	}

	private toEmailMeta(meta: RawMailMessageMeta): EmailMeta {
		return {
			senderName: meta.senderName,
			subject: meta.subject,
			dateSent: new Date(meta.dateSent),
			messageUrl: buildMessageUrl(meta.id),
		};
	}

	// Read-only preview rows: header (date · party · direction) and attachment
	// names are locked; only the body and the per-attachment checkboxes are
	// editable. The message:// link stays in the underlying message and is
	// re-emitted verbatim on commit.
	private toPreviewMessages(messages: ThreadSectionMessage[]): PreviewMessage[] {
		const locale = this.plugin.settings.dateLocale;
		return messages.map((msg) => ({
			header: `${formatDate(new Date(msg.dateSent), locale)} — ${sanitizeSenderSubject(msg.partyName)} (${msg.direction === "in" ? "eingegangen" : "gesendet"})`,
			body: msg.body,
			attachments: msg.attachments.map((a) => ({ name: a.name, preselected: preselectAttachment(a) })),
		}));
	}

	// Maps per-message preview results back onto the assembled messages: keeps the
	// included ones (in order) with their edited body and their checked attachments
	// (filtered positionally against attachmentsIncluded), drops the excluded ones.
	private applyPreviewResults(
		messages: ThreadSectionMessage[],
		results: PreviewMessageResult[],
	): ThreadSectionMessage[] {
		const out: ThreadSectionMessage[] = [];
		results.forEach((r, i) => {
			if (!r.included) return;
			const msg = messages[i];
			const attachments = msg.attachments.filter((_, j) => r.attachmentsIncluded[j] === true);
			out.push({ ...msg, body: r.body, attachments });
		});
		return out;
	}

	// Read-only: gather the whole thread (this message + the user's Sent replies +
	// the thread's other inbox emails) and build the section for preview. No
	// archive, no write. Returns null when nothing new remains to file.
	private async assembleThread(
		meta: RawMailMessageMeta,
		body: string,
		attachments: MailAttachment[],
		vorgang: TFile,
	): Promise<AssembledThread | null> {
		const locale = this.plugin.settings.dateLocale;
		const content = await this.plugin.app.vault.read(vorgang);
		const alreadyFiled = extractFiledMessageIds(content);
		const k = threadKey(meta.subject);

		// The user's Sent replies in this thread; degrade to none on failure.
		let replies: ThreadSectionMessage[] = [];
		try {
			const sent = await this.bridge.listSentForThread(
				meta.accountName,
				meta.senderAddress,
				this.sentMailboxFor(meta.accountName),
				stripSubjectPrefixes(meta.subject),
			);
			replies = sent
				.filter((s) => threadKey(s.subject) === k && !alreadyFiled.has(s.id))
				.map((s) => ({
					direction: "out" as const,
					partyName: s.partyName,
					dateSent: s.dateSent,
					body: parseEmailBody(s.body).body,
					attachments: filterAttachments(s.attachments),
					messageUrl: buildMessageUrl(s.id),
				}));
		} catch (e) {
			this.logBridgeError(e);
			new Notice(
				"Gesendete Nachrichten konnten nicht geladen werden – nur die eingegangene E-Mail abgelegt.",
			);
		}

		// The thread's other received emails still in the inbox (archived on commit).
		let siblings: ThreadSectionMessage[] = [];
		const siblingIds: string[] = [];
		try {
			const inbox = await this.bridge.listInboxForThread(
				meta.accountName,
				stripSubjectPrefixes(meta.subject),
			);
			const toFile = inbox.filter(
				(s) => s.id !== meta.id && threadKey(s.subject) === k && !alreadyFiled.has(s.id),
			);
			siblings = toFile.map((s) => ({
				direction: "in" as const,
				partyName: s.partyName,
				dateSent: s.dateSent,
				body: parseEmailBody(s.body).body,
				attachments: filterAttachments(s.attachments),
				messageUrl: buildMessageUrl(s.id),
			}));
			for (const s of toFile) siblingIds.push(s.id);
		} catch (e) {
			this.logBridgeError(e);
		}

		const sectionMsgs: ThreadSectionMessage[] = [];
		if (!alreadyFiled.has(meta.id)) {
			sectionMsgs.push({
				direction: "in",
				partyName: meta.senderName,
				dateSent: meta.dateSent,
				body,
				attachments,
				messageUrl: buildMessageUrl(meta.id),
			});
		}
		sectionMsgs.push(...replies);
		sectionMsgs.push(...siblings);

		if (sectionMsgs.length === 0) {
			new Notice(`„${meta.subject}" ist bereits abgelegt.`);
			this.skippedThreads.add(k);
			return null;
		}

		const sorted = [...sectionMsgs].sort((a, b) => b.dateSent.localeCompare(a.dateSent));
		const { sectionName } = formatThreadSection(sorted, meta.subject, locale);
		const times = sorted
			.map((m) => new Date(m.dateSent).getTime())
			.filter((t) => !Number.isNaN(t));
		const latestDate = times.length > 0 ? new Date(Math.max(...times)) : new Date(meta.dateSent);
		return { sectionName, messages: sorted, siblingIds, latestDate, threadKey: k };
	}

	// Commit an assembled thread: archive-first (this message) → verify it left the
	// inbox → archive the sibling inbox messages → write the section for the
	// included messages into the Vorgang. Include/exclude only affects the written
	// content; the whole thread is archived regardless (inbox-zero). Any failed
	// step shows a Notice and stops.
	private async commitThread(
		meta: RawMailMessageMeta,
		assembled: AssembledThread,
		contentMessages: ThreadSectionMessage[],
		vorgang: TFile,
	): Promise<void> {
		const emailMeta = this.toEmailMeta(meta);

		try {
			await this.bridge.archive(meta.accountName, meta.id);
		} catch (e) {
			this.logBridgeError(e);
			new Notice(`Archivierung fehlgeschlagen für „${meta.subject}". ${emailMeta.messageUrl}`);
			return;
		}

		let stillInInbox: boolean;
		try {
			stillInInbox = await this.bridge.isInInbox(meta.accountName, meta.id);
		} catch (e) {
			this.logBridgeError(e);
			new Notice(`Archivierung fehlgeschlagen für „${meta.subject}". ${emailMeta.messageUrl}`);
			return;
		}
		if (stillInInbox) {
			new Notice(
				"Archivierung hat die Nachricht nicht aus dem Posteingang entfernt. Bitte Postfach-Konfiguration prüfen.",
			);
			return;
		}

		// Archive the thread's other inbox emails too, so the inbox is truly zeroed.
		for (const id of assembled.siblingIds) {
			try {
				await this.bridge.archive(meta.accountName, id);
				this.threadHandledIds.add(id);
			} catch (e) {
				this.logBridgeError(e);
			}
		}

		this.skippedThreads.add(assembled.threadKey);

		if (contentMessages.length === 0) {
			new Notice(`Thread archiviert; nichts in „${vorgang.basename}" übernommen (alle abgewählt).`);
			return;
		}

		await this.saveThreadAttachments(meta.accountName, contentMessages, vorgang);

		try {
			const locale = this.plugin.settings.dateLocale;
			const content = await this.plugin.app.vault.read(vorgang);
			const { bodyLines } = formatThreadSection(contentMessages, meta.subject, locale);
			const { newContent } = addVorgangSection(
				content,
				assembled.sectionName,
				locale,
				assembled.latestDate,
				bodyLines,
			);
			await this.plugin.app.vault.modify(vorgang, newContent);
		} catch (e) {
			this.logBridgeError(e);
			new Notice(`Archiviert, aber nicht in „${vorgang.basename}" abgelegt.`);
			return;
		}

		this.walkFiledRecords.push({
			rawTitle: this.titleFor(meta),
			target: vorgang.basename,
			filedAt: Date.now(),
		});
		void this.invalidateRoutingCache();
		const extra = contentMessages.length - 1;
		const suffix = extra > 0 ? ` (+${extra} Thread-Nachrichten)` : "";
		new Notice(`Abgelegt: „${meta.subject}" → „${vorgang.basename}".${suffix}`);
	}

	// Vault-relative _resources folder for a target Vorgang note: the note's own
	// folder plus "_resources". Falls back to deriving the folder from the note's
	// path when `.parent` isn't populated (root-level notes have no parent path).
	private resourcesFolderPathFor(vorgang: TFile): string {
		const parentPath = vorgang.parent?.path;
		if (parentPath) return `${parentPath}/_resources`;
		const idx = vorgang.path.lastIndexOf("/");
		return idx === -1 ? "_resources" : `${vorgang.path.slice(0, idx)}/_resources`;
	}

	// Saves the attachments of the included messages into the target Vorgang's
	// _resources folder and fills msg.savedNames for the ones that succeed.
	// Never throws — any failure (folder, listing, bridge) degrades the affected
	// message(s) to plaintext names; the filing itself always proceeds.
	private async saveThreadAttachments(
		accountName: string,
		contentMessages: ThreadSectionMessage[],
		vorgang: TFile,
	): Promise<void> {
		const withAttachments = contentMessages.filter((m) => m.attachments.length > 0);
		if (withAttachments.length === 0) return;

		const adapter = this.plugin.app.vault.adapter;
		const resourcesFolderPath = this.resourcesFolderPathFor(vorgang);
		let existingNames: Set<string>;
		try {
			if (!(await adapter.exists(normalizePath(resourcesFolderPath)))) {
				await adapter.mkdir(normalizePath(resourcesFolderPath));
			}
			const listed = await adapter.list(resourcesFolderPath);
			existingNames = new Set(listed.files.map((p) => p.split("/").pop() as string));
		} catch (e) {
			// _resources not creatable/listable — no save attempt for any message
			// of this thread, all attachment names stay plaintext.
			this.logBridgeError(e);
			return;
		}

		for (const msg of withAttachments) {
			const pairs = resolveAttachmentFileNames(existingNames, msg.attachments.map((a) => a.name));
			for (const { resolved } of pairs) existingNames.add(resolved);

			const messageId = decodeMessageIdFromUrl(msg.messageUrl);
			if (messageId === null) continue;

			const items = pairs.map(({ original, resolved }) => ({
				attachmentName: original,
				destPath: resolveAttachmentDestPath(this.plugin.app, resourcesFolderPath, resolved),
			}));

			let saved: string[];
			try {
				saved = await this.bridge.saveAttachments(accountName, messageId, items);
			} catch (e) {
				this.logBridgeError(e);
				continue;
			}

			const remaining = [...saved];
			const savedNames = new Map<string, string>();
			for (const { original, resolved } of pairs) {
				const idx = remaining.indexOf(original);
				if (idx === -1) continue;
				savedNames.set(original, resolved);
				remaining.splice(idx, 1);
			}
			if (savedNames.size > 0) msg.savedNames = savedNames;
		}
	}

	// Non-interactive filing (assemble → commit with all messages, unedited). The
	// interactive walk inserts an editable preview between the two steps.
	private async fileEmailIntoVorgang(
		meta: RawMailMessageMeta,
		body: string,
		attachments: MailAttachment[],
		vorgang: TFile,
	): Promise<void> {
		const assembled = await this.assembleThread(meta, body, attachments, vorgang);
		if (!assembled) return;
		await this.commitThread(meta, assembled, assembled.messages, vorgang);
	}

	private async archiveOnly(meta: RawMailMessageMeta): Promise<void> {
		try {
			await this.bridge.archive(meta.accountName, meta.id);
			new Notice(`Archiviert (nicht abgelegt): „${meta.subject}".`);
		} catch (e) {
			this.logBridgeError(e);
			new Notice(`Archivierung fehlgeschlagen für „${meta.subject}".`);
		}
	}

	// --- Single-shot: file the currently selected Mail message(s), capture-only ---

	private startSelectedWalk(): void {
		if (this.walkInProgress) {
			new Notice("Ablage läuft bereits.");
			return;
		}
		this.walkInProgress = true;
		void this.beginSelectedWalk();
	}

	private async beginSelectedWalk(): Promise<void> {
		const loading = new Notice("Lade Auswahl…", 0);
		let sel: SelectedMessage[];
		try {
			sel = await this.bridge.getSelection();
		} catch (e) {
			loading.hide();
			this.logBridgeError(e);
			new Notice(e instanceof Error ? e.message : "Mail-Zugriff fehlgeschlagen.");
			this.walkInProgress = false;
			return;
		}
		loading.hide();
		if (sel.length === 0) {
			new Notice("Keine Nachricht in Mail ausgewählt.");
			this.walkInProgress = false;
			return;
		}
		const ordered = [...sel].sort((a, b) => a.dateSent.localeCompare(b.dateSent));
		this.walkFiledRecords = [];
		this.walkCandidates = this.sectionNoteBasenames();
		this.routingCorpus = await this.buildRoutingCorpus();
		this.presentSelected(ordered, 0);
	}

	private presentSelected(sel: SelectedMessage[], i: number, pin?: string): void {
		if (i >= sel.length) {
			new Notice(`Ausgewählte E-Mails abgelegt (${sel.length}).`);
			this.walkInProgress = false;
			return;
		}
		const m = sel[i];
		const body = parseEmailBody(m.body).body;
		const attachments = filterAttachments(m.attachments);
		new SectionNoteSuggestModal(this.plugin.app, SECTION_NOTE_TAGS, {
			placeholder: `[${i + 1}/${sel.length}] „${m.subject}" ablegen unter… (ESC = Stopp)`,
			previewText: `${m.direction === "in" ? "Von" : "An"}: ${m.partyName}\nBetreff: ${m.subject}\n\n${body || "(kein Textinhalt)"}`,
			suggestions: pin
				? [pin, ...this.suggestionsForTitle(`${stripSubjectPrefixes(m.subject)} ${m.partyName}`)]
				: this.suggestionsForTitle(`${stripSubjectPrefixes(m.subject)} ${m.partyName}`),
			onCreateNew: this.createNewHandler(() => this.presentSelected(sel, i), (basename) => this.presentSelected(sel, i, basename)),
			dropLabel: "✕ Nicht ablegen",
			dropHint: "Nicht ablegen",
			excludeTag: this.plugin.settings.doneTag,
			onPick: (vorgang) => {
				const loading = new Notice("Thread wird zusammengestellt…", 0);
				void this.assembleSelectedThread(m, body, attachments, vorgang).then((assembled) => {
					loading.hide();
					if (!assembled) {
						this.presentSelected(sel, i + 1);
						return;
					}
					new EmailPreviewModal(
						this.plugin.app,
						vorgang.basename,
						`Betreff: ${m.subject} · ${assembled.messages.length} Nachricht(en)`,
						assembled.sectionName,
						this.toPreviewMessages(assembled.messages),
						(results, outcome) => {
							void this.commitSelectedThread(
								m,
								{ ...assembled, sectionName: outcome.sectionName },
								this.applyPreviewResults(assembled.messages, results),
								vorgang,
							)
								.then(() => {
									if (outcome.openAfterFiling) {
										this.openFiledNote(vorgang);
										new Notice("Ablage beendet — Notiz geöffnet.");
										this.walkInProgress = false;
										return;
									}
									this.presentSelected(sel, i + 1);
								})
								.catch((e) => {
									this.logBridgeError(e);
									new Notice("Ablage fehlgeschlagen — Nachricht wird erneut angezeigt.");
									this.presentSelected(sel, i);
								});
						},
						() => {
							this.presentSelected(sel, i);
						},
					).open();
				}).catch((e) => {
					// Without this catch a rejection wedges the walk: the loading
					// Notice never hides and walkInProgress stays true.
					loading.hide();
					this.logBridgeError(e);
					new Notice("Thread konnte nicht zusammengestellt werden — Nachricht wird erneut angezeigt.");
					this.presentSelected(sel, i);
				});
			},
			onDrop: () => this.presentSelected(sel, i + 1),
			onCancel: () => {
				new Notice("Ablage gestoppt.");
				this.walkInProgress = false;
			},
		}).open();
	}

	// Capture-only: assembles the selected message's thread and inserts it into
	// the Vorgang. Never archives (the selected message may live in any mailbox).
	// Read-only: assemble the selected message + its Sent replies into a section
	// for preview. Capture-only — no archive. Returns null when nothing new remains.
	private async assembleSelectedThread(
		m: SelectedMessage,
		body: string,
		attachments: MailAttachment[],
		vorgang: TFile,
	): Promise<AssembledThread | null> {
		const locale = this.plugin.settings.dateLocale;
		const content = await this.plugin.app.vault.read(vorgang);
		const filed = extractFiledMessageIds(content);
		const k = threadKey(m.subject);
		const selUrl = buildMessageUrl(m.id);

		let replies: ThreadSectionMessage[] = [];
		try {
			const sent = await this.bridge.listSentForThread(
				m.accountName,
				m.partyAddress,
				this.sentMailboxFor(m.accountName),
				stripSubjectPrefixes(m.subject),
			);
			// Exclude the selected message itself; it is added explicitly below so it
			// carries the parsed/edited `body` rather than a re-fetched one.
			replies = sent
				.filter((s) => threadKey(s.subject) === k && !filed.has(s.id) && s.id !== m.id)
				.map((s) => ({
					direction: "out" as const,
					partyName: s.partyName,
					dateSent: s.dateSent,
					body: parseEmailBody(s.body).body,
					attachments: filterAttachments(s.attachments),
					messageUrl: buildMessageUrl(s.id),
				}));
		} catch (e) {
			this.logBridgeError(e);
			new Notice("Gesendete Nachrichten konnten nicht geladen werden.");
		}

		const sectionMsgs: ThreadSectionMessage[] = [];
		if (!filed.has(m.id)) {
			sectionMsgs.push({
				direction: m.direction,
				partyName: m.partyName,
				dateSent: m.dateSent,
				body,
				attachments,
				messageUrl: selUrl,
			});
		}
		sectionMsgs.push(...replies);

		if (sectionMsgs.length === 0) {
			new Notice(`„${m.subject}" ist bereits abgelegt.`);
			return null;
		}

		const sorted = [...sectionMsgs].sort((a, b) => b.dateSent.localeCompare(a.dateSent));
		const { sectionName } = formatThreadSection(sorted, m.subject, locale);
		const times = sorted
			.map((x) => new Date(x.dateSent).getTime())
			.filter((t) => !Number.isNaN(t));
		const latestDate = times.length > 0 ? new Date(Math.max(...times)) : new Date(m.dateSent);
		return { sectionName, messages: sorted, siblingIds: [], latestDate, threadKey: k };
	}

	// Commit a selected-thread assembly: write the section for the included
	// messages into the Vorgang. Capture-only — never archives.
	private async commitSelectedThread(
		m: SelectedMessage,
		assembled: AssembledThread,
		contentMessages: ThreadSectionMessage[],
		vorgang: TFile,
	): Promise<void> {
		if (contentMessages.length === 0) {
			new Notice(`Nichts in „${vorgang.basename}" übernommen (alle abgewählt).`);
			return;
		}
		await this.saveThreadAttachments(m.accountName, contentMessages, vorgang);
		try {
			const locale = this.plugin.settings.dateLocale;
			const content = await this.plugin.app.vault.read(vorgang);
			const { bodyLines } = formatThreadSection(contentMessages, m.subject, locale);
			const { newContent } = addVorgangSection(
				content,
				assembled.sectionName,
				locale,
				assembled.latestDate,
				bodyLines,
			);
			await this.plugin.app.vault.modify(vorgang, newContent);
			this.walkFiledRecords.push({
				rawTitle: `${stripSubjectPrefixes(m.subject)} ${m.partyName}`,
				target: vorgang.basename,
				filedAt: Date.now(),
			});
			void this.invalidateRoutingCache();
			new Notice(`Abgelegt: „${m.subject}" → „${vorgang.basename}".`);
		} catch (e) {
			this.logBridgeError(e);
			new Notice(`Nicht in „${vorgang.basename}" abgelegt.`);
		}
	}

	// Non-interactive capture (assemble → commit with all messages, unedited).
	private async captureSelectedThread(
		m: SelectedMessage,
		body: string,
		attachments: MailAttachment[],
		vorgang: TFile,
	): Promise<void> {
		const assembled = await this.assembleSelectedThread(m, body, attachments, vorgang);
		if (!assembled) return;
		await this.commitSelectedThread(m, assembled, assembled.messages, vorgang);
	}

	private openMessage(meta: EmailMeta): void {
		this.openUrl(meta.messageUrl);
	}

	// „Ablegen und Öffnen": öffnet die Zielnotiz im aktuellen Fenster (kein
	// neuer Tab).
	private openFiledNote(vorgang: TFile): void {
		void this.plugin.app.workspace.getLeaf(false).openFile(vorgang);
	}

	private titleFor(meta: RawMailMessageMeta): string {
		return `${stripSubjectPrefixes(meta.subject)} ${meta.senderName}`;
	}

	private suggestionsFor(meta: RawMailMessageMeta): string[] {
		return this.suggestionsForTitle(this.titleFor(meta));
	}

	private suggestionsForTitle(title: string): string[] {
		try {
			const corpus = [...this.routingCorpus, ...this.walkFiledRecords];
			return suggestFilingTargets(title, corpus, this.walkCandidates, {
				now: Date.now(),
				minScore: SUGGEST_MIN_SCORE,
			}).map((s) => s.target);
		} catch (e) {
			console.warn("LuKit email-filing: suggestions failed:", e instanceof Error ? e.name : typeof e);
			return [];
		}
	}

	private sectionNoteFiles(): TFile[] {
		const done = this.plugin.settings.doneTag;
		return this.plugin.app.vault.getMarkdownFiles().filter((f) => {
			const tags = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.tags;
			if (!frontmatterTagsInclude(tags, SECTION_NOTE_TAGS)) return false;
			return !done || !frontmatterTagsInclude(tags, done);
		});
	}

	private sectionNoteBasenames(): string[] {
		return this.sectionNoteFiles().map((f) => f.basename);
	}

	// Cross-session routing corpus: cached in plugin data, rebuilt when stale (or
	// missing) by mining existing Vorgang email sections. Rebuild also happens
	// after any filing (the cache is invalidated on success).
	private async buildRoutingCorpus(): Promise<FiledRecord[]> {
		// Geteiltes Routing-Wissen: geminte Vorgang-Headings plus die
		// filed_into-Stempel der Besprechungs-Ablage.
		return [
			...(await this.minedRoutingRecords()),
			...collectBesprechungFiledRecords(this.plugin.app, this.plugin.settings.besprechung.folderPath),
		];
	}

	private async minedRoutingRecords(): Promise<FiledRecord[]> {
		const settings = this.plugin.settings.emailFiling;
		const cache = settings.routingCache;
		if (cache && !isCacheStale(cache.builtAt, Date.now())) {
			return cache.records;
		}
		const records: FiledRecord[] = [];
		for (const f of this.sectionNoteFiles()) {
			try {
				const content = await this.plugin.app.vault.read(f);
				records.push(...minedFilingsToFiledRecords(mineVorgangFilings(content, f.basename)));
			} catch (e) {
				console.warn("LuKit email-filing: mining failed for a note:", e instanceof Error ? e.name : typeof e);
			}
		}
		settings.routingCache = { builtAt: new Date().toISOString(), records };
		await this.plugin.saveSettings();
		return records;
	}

	// Invalidates the routing cache so the next walk re-mines (picking up the
	// just-filed section). The current walk already sees it via walkFiledRecords.
	private async invalidateRoutingCache(): Promise<void> {
		this.plugin.settings.emailFiling.routingCache = undefined;
		await this.plugin.saveSettings();
	}

	private logBridgeError(e: unknown): void {
		// PII-safe: log only the error type/name, never subject or sender.
		console.error("LuKit email-filing: bridge error:", e instanceof Error ? e.name : typeof e);
	}

	renderSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		// Own section div so "Konten erkennen" can re-render only this feature's
		// block instead of wiping the whole settings tab.
		this.renderEmailSettings(containerEl.createDiv(), plugin);
	}

	private renderEmailSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		const settings = plugin.settings.emailFiling;
		containerEl.createEl("h3", { text: "E-Mail-Ablage" });

		new Setting(containerEl)
			.setName("Reihenfolge")
			.setDesc("Reihenfolge, in der der Posteingang abgearbeitet wird")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("oldest", "Älteste zuerst")
					.addOption("newest", "Neueste zuerst")
					.setValue(settings.order)
					.onChange(async (value) => {
						settings.order = value === "newest" ? "newest" : "oldest";
						await plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Standard-Archiv-Postfach")
			.setDesc("Postfach, in das E-Mails verschoben werden, wenn das Konto unten keinen eigenen Eintrag hat")
			.addText((text) =>
				text
					.setPlaceholder("Archive")
					.setValue(settings.defaultArchiveMailbox)
					.onChange(async (value) => {
						settings.defaultArchiveMailbox = value.trim() || "Archive";
						await plugin.saveSettings();
						this.bridge = this.makeBridge();
					}),
			);

		new Setting(containerEl)
			.setName("Standard-Gesendet-Postfach")
			.setDesc("Gesendet-Postfach für die Suche nach eigenen Antworten, wenn das Konto unten keinen eigenen Eintrag hat")
			.addText((text) =>
				text
					.setPlaceholder("Sent")
					.setValue(settings.defaultSentMailbox)
					.onChange(async (value) => {
						settings.defaultSentMailbox = value.trim() || "Sent";
						await plugin.saveSettings();
						this.bridge = this.makeBridge();
					}),
			);

		for (const account of Object.keys(settings.archiveMailboxes)) {
			new Setting(containerEl)
				.setName(account)
				.setDesc("Schalter = in der Ablage berücksichtigen; erstes Feld = Archiv-Postfach; zweites Feld = Gesendet-Postfach")
				.addToggle((toggle) =>
					toggle
						.setValue(isAccountIncluded(settings.walkAccounts, account))
						.onChange(async (value) => {
							settings.walkAccounts[account] = value;
							await plugin.saveSettings();
						}),
				)
				.addText((text) =>
					text
						.setPlaceholder("Archiv-Postfach")
						.setValue(settings.archiveMailboxes[account])
						.onChange(async (value) => {
							settings.archiveMailboxes[account] = value.trim();
							await plugin.saveSettings();
							this.bridge = this.makeBridge();
						}),
				)
				.addText((text) =>
					text
						.setPlaceholder("Gesendet-Postfach (auto)")
						.setValue(settings.sentMailboxes[account] ?? "")
						.onChange(async (value) => {
							settings.sentMailboxes[account] = value.trim();
							await plugin.saveSettings();
							this.bridge = this.makeBridge();
						}),
				);
		}

		new Setting(containerEl)
			.setName("Konten erkennen")
			.setDesc("Konto-Liste aus Apple Mail befüllen")
			.addButton((button) =>
				button.setButtonText("Konten erkennen").onClick(async () => {
					try {
						const accounts = await this.bridge.listAccounts();
						settings.archiveMailboxes = mergeDetectedAccounts(
							settings.archiveMailboxes,
							accounts,
							settings.defaultArchiveMailbox,
						);
						// Resolve each account's real Sent mailbox name once, here, so
						// filing uses the exact name (fast) instead of re-detecting.
						try {
							const sentNames = await this.bridge.detectSentMailboxes();
							for (const [acct, name] of Object.entries(sentNames)) {
								settings.sentMailboxes[acct] = name;
							}
						} catch (e) {
							this.logBridgeError(e);
						}
						for (const account of accounts) {
							if (!(account in settings.walkAccounts)) {
								settings.walkAccounts[account] = true;
							}
						}
						await plugin.saveSettings();
						this.bridge = this.makeBridge();
						containerEl.empty();
						this.renderEmailSettings(containerEl, plugin);
					} catch (e) {
						this.logBridgeError(e);
						new Notice("Konten konnten nicht ermittelt werden (Mail-Zugriff prüfen).");
					}
				}),
			);
	}
}
