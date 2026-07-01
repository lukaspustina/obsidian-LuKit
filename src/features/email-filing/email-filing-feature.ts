import { execFile } from "child_process";
import { Notice, Setting, type TFile } from "obsidian";
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
	threadKey,
	type EmailMeta,
	type MailAttachment,
	type ThreadSectionMessage,
} from "./email-format-engine";
import { mergeDetectedAccounts, isAccountIncluded } from "./email-filing-settings";
import { mineVorgangFilings, minedFilingsToFiledRecords, isCacheStale } from "./email-routing";
import { addVorgangSection } from "../vorgang/vorgang-engine";
import { suggestFilingTargets, type FiledRecord } from "../besprechung/besprechung-suggest-engine";
import { frontmatterTagsInclude } from "../../shared/frontmatter";
import { SectionNoteSuggestModal } from "../../shared/modals/section-note-suggest";
import { EmailPreviewModal } from "./email-preview-modal";

const SECTION_NOTE_TAGS: ReadonlySet<string> = new Set([
	"Vorgang",
	"Person",
	"Bestellung",
	"Bewerbung",
]);

// minScore must sit below NAME_MATCH_WEIGHT (0.4) so name-match-only ranking
// (empty corpus) surfaces suggestions.
const SUGGEST_MIN_SCORE = 0.01;

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

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;
		this.bridge = this.makeBridge();

		plugin.addCommand({
			id: "email-filing-walk",
			name: "E-Mail: File inbox emails",
			icon: LUKIT_ICON_ID,
			callback: () => {
				this.startWalk();
			},
		});

		plugin.addCommand({
			id: "email-filing-file-selected",
			name: "E-Mail: File selected Mail message",
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
				displayName: "E-Mail: File inbox emails",
				description:
					"Walk the Apple Mail inbox; for each message pick a Vorgang/Person/Bestellung/Bewerbung note, edit the extracted body, then archive the message and file the conversation (inbound + your Sent replies).",
			},
			{
				commandId: "email-filing-file-selected",
				displayName: "E-Mail: File selected Mail message",
				description:
					"File the message(s) currently selected in Apple Mail (any mailbox, incl. Sent) and their thread into a Vorgang — capture-only, nothing is archived. Use it for threads you initiated.",
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

	// Synchronous entry point: sets the guard before any await so a second
	// invocation in the same tick is rejected.
	startWalk(): void {
		if (this.walkInProgress) {
			new Notice("Walk läuft bereits.");
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

	private presentMessage(metas: RawMailMessageMeta[], i: number): void {
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
		void this.presentMessageAsync(metas, i);
	}

	private async presentMessageAsync(metas: RawMailMessageMeta[], i: number): Promise<void> {
		const meta = metas[i];
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
			placeholder: `[${i + 1}/${metas.length}] „${meta.subject}" ablegen unter… (ESC = Stopp)`,
			previewText: `Von: ${meta.senderName}\nBetreff: ${meta.subject}\n\n${body || "(kein Textinhalt)"}`,
			suggestions: this.suggestionsFor(meta),
			skipLabel: "↪ Überspringen (im Posteingang lassen)",
			dropLabel: "✕ Nicht ablegen (nur archivieren)",
			openLabel: "→ Stopp und E-Mail in Mail öffnen",
			onPick: (vorgang) => {
				new EmailPreviewModal(
					this.plugin.app,
					emailMeta,
					body,
					vorgang.basename,
					(edited) => {
						void this.fileEmailIntoVorgang(meta, edited, attachments, vorgang).then(() =>
							this.presentMessage(metas, i + 1),
						);
					},
					// Cancelling the preview returns to the picker for this same
					// message (re-pick or choose Skip/Don't-file), rather than skipping it.
					() => {
						this.presentMessage(metas, i);
					},
				).open();
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

	// Archive-first → verify left inbox → modify Vorgang. Any failed step shows
	// an error Notice and does not run subsequent steps.
	private async fileEmailIntoVorgang(
		meta: RawMailMessageMeta,
		body: string,
		attachments: MailAttachment[],
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

		try {
			const locale = this.plugin.settings.dateLocale;
			const content = await this.plugin.app.vault.read(vorgang);
			const alreadyFiled = extractFiledMessageIds(content);
			const k = threadKey(meta.subject);

			// Pull the user's Sent replies in this thread; degrade to inbound-only on failure.
			let replies: ThreadSectionMessage[] = [];
			try {
				const sent = await this.bridge.listSentForThread(
					meta.accountName,
					meta.senderAddress,
					this.sentMailboxFor(meta.accountName),
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

			if (sectionMsgs.length === 0) {
				new Notice(`„${meta.subject}" ist bereits abgelegt.`);
				this.skippedThreads.add(k);
				return;
			}

			const { sectionName, bodyLines } = formatThreadSection(sectionMsgs, meta.subject, locale);
			const times = sectionMsgs
				.map((m) => new Date(m.dateSent).getTime())
				.filter((t) => !Number.isNaN(t));
			const latestDate = times.length > 0 ? new Date(Math.max(...times)) : emailMeta.dateSent;
			const { newContent } = addVorgangSection(content, sectionName, locale, latestDate, bodyLines);
			await this.plugin.app.vault.modify(vorgang, newContent);

			// Record the thread as handled (auto-skip its other inbox messages) and
			// feed the in-walk routing memory.
			this.skippedThreads.add(k);
			this.walkFiledRecords.push({
				rawTitle: this.titleFor(meta),
				target: vorgang.basename,
				filedAt: Date.now(),
			});
			void this.invalidateRoutingCache();
			new Notice(`Abgelegt: „${meta.subject}" → „${vorgang.basename}".`);
		} catch (e) {
			this.logBridgeError(e);
			new Notice(`Archiviert, aber nicht in „${vorgang.basename}" abgelegt.`);
		}
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
			new Notice("Walk läuft bereits.");
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

	private presentSelected(sel: SelectedMessage[], i: number): void {
		if (i >= sel.length) {
			new Notice(`Ausgewählte E-Mails abgelegt (${sel.length}).`);
			this.walkInProgress = false;
			return;
		}
		const m = sel[i];
		const body = parseEmailBody(m.body).body;
		const attachments = filterAttachments(m.attachments);
		const emailMeta: EmailMeta = {
			senderName: m.partyName,
			subject: m.subject,
			dateSent: new Date(m.dateSent),
			messageUrl: buildMessageUrl(m.id),
		};
		new SectionNoteSuggestModal(this.plugin.app, SECTION_NOTE_TAGS, {
			placeholder: `[${i + 1}/${sel.length}] „${m.subject}" ablegen unter… (ESC = Stopp)`,
			previewText: `${m.direction === "in" ? "Von" : "An"}: ${m.partyName}\nBetreff: ${m.subject}\n\n${body || "(kein Textinhalt)"}`,
			suggestions: this.suggestionsForTitle(`${stripSubjectPrefixes(m.subject)} ${m.partyName}`),
			dropLabel: "✕ Nicht ablegen",
			onPick: (vorgang) => {
				new EmailPreviewModal(
					this.plugin.app,
					emailMeta,
					body,
					vorgang.basename,
					(edited) => {
						void this.captureSelectedThread(m, edited, attachments, vorgang).then(() =>
							this.presentSelected(sel, i + 1),
						);
					},
					() => {
						this.presentSelected(sel, i);
					},
				).open();
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
	private async captureSelectedThread(
		m: SelectedMessage,
		editedBody: string,
		editedAttachments: MailAttachment[],
		vorgang: TFile,
	): Promise<void> {
		try {
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
				);
				replies = sent
					.filter((s) => threadKey(s.subject) === k && !filed.has(s.id))
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
			if (m.direction === "in" && !filed.has(m.id)) {
				sectionMsgs.push({
					direction: "in",
					partyName: m.partyName,
					dateSent: m.dateSent,
					body: editedBody,
					attachments: editedAttachments,
					messageUrl: selUrl,
				});
			}
			// Include Sent replies; the selected message's own body uses the edited text.
			for (const r of replies) {
				sectionMsgs.push(
					r.messageUrl === selUrl ? { ...r, body: editedBody, attachments: editedAttachments } : r,
				);
			}
			// If an outbound selection wasn't returned by listSentForThread, add it directly.
			if (
				m.direction === "out" &&
				!filed.has(m.id) &&
				!sectionMsgs.some((x) => x.messageUrl === selUrl)
			) {
				sectionMsgs.push({
					direction: "out",
					partyName: m.partyName,
					dateSent: m.dateSent,
					body: editedBody,
					attachments: editedAttachments,
					messageUrl: selUrl,
				});
			}

			if (sectionMsgs.length === 0) {
				new Notice(`„${m.subject}" ist bereits abgelegt.`);
				return;
			}

			const { sectionName, bodyLines } = formatThreadSection(sectionMsgs, m.subject, locale);
			const times = sectionMsgs
				.map((x) => new Date(x.dateSent).getTime())
				.filter((t) => !Number.isNaN(t));
			const latestDate = times.length > 0 ? new Date(Math.max(...times)) : new Date(m.dateSent);
			const { newContent } = addVorgangSection(content, sectionName, locale, latestDate, bodyLines);
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

	private openMessage(meta: EmailMeta): void {
		this.openUrl(meta.messageUrl);
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
		return this.plugin.app.vault
			.getMarkdownFiles()
			.filter((f) =>
				frontmatterTagsInclude(
					this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.tags,
					SECTION_NOTE_TAGS,
				),
			);
	}

	private sectionNoteBasenames(): string[] {
		return this.sectionNoteFiles().map((f) => f.basename);
	}

	// Cross-session routing corpus: cached in plugin data, rebuilt when stale (or
	// missing) by mining existing Vorgang email sections. Rebuild also happens
	// after any filing (the cache is invalidated on success).
	private async buildRoutingCorpus(): Promise<FiledRecord[]> {
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
		const settings = plugin.settings.emailFiling;
		containerEl.createEl("h3", { text: "E-Mail-Ablage" });

		new Setting(containerEl)
			.setName("Walk order")
			.setDesc("Order in which the inbox walk presents messages")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("oldest", "Oldest first")
					.addOption("newest", "Newest first")
					.setValue(settings.order)
					.onChange(async (value) => {
						settings.order = value === "newest" ? "newest" : "oldest";
						await plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default archive mailbox")
			.setDesc("Mailbox an email is moved to when its account has no specific entry below")
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
			.setName("Default Sent mailbox")
			.setDesc("Sent mailbox used to find your replies when an account has no specific entry below")
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
				.setDesc("Toggle = include in walk; first field = archive mailbox; second field = Sent mailbox")
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
						.setPlaceholder("Archive mailbox")
						.setValue(settings.archiveMailboxes[account])
						.onChange(async (value) => {
							settings.archiveMailboxes[account] = value.trim();
							await plugin.saveSettings();
							this.bridge = this.makeBridge();
						}),
				)
				.addText((text) =>
					text
						.setPlaceholder("Sent mailbox")
						.setValue(settings.sentMailboxes[account] ?? "")
						.onChange(async (value) => {
							settings.sentMailboxes[account] = value.trim();
							await plugin.saveSettings();
							this.bridge = this.makeBridge();
						}),
				);
		}

		new Setting(containerEl)
			.setName("Detect accounts")
			.setDesc("Populate the per-account list from Apple Mail")
			.addButton((button) =>
				button.setButtonText("Detect accounts").onClick(async () => {
					try {
						const accounts = await this.bridge.listAccounts();
						settings.archiveMailboxes = mergeDetectedAccounts(
							settings.archiveMailboxes,
							accounts,
							settings.defaultArchiveMailbox,
						);
						settings.sentMailboxes = mergeDetectedAccounts(
							settings.sentMailboxes,
							accounts,
							settings.defaultSentMailbox,
						);
						for (const account of accounts) {
							if (!(account in settings.walkAccounts)) {
								settings.walkAccounts[account] = true;
							}
						}
						await plugin.saveSettings();
						this.bridge = this.makeBridge();
						containerEl.empty();
						this.renderSettings(containerEl, plugin);
					} catch (e) {
						this.logBridgeError(e);
						new Notice("Konten konnten nicht ermittelt werden (Mail-Zugriff prüfen).");
					}
				}),
			);
	}
}
