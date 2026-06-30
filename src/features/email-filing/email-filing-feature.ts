import { execFile } from "child_process";
import { Notice, Setting, type TFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature, HelpEntry } from "../../types";
import { createOsascriptBridge, type MailBridge, type RawMailMessageMeta } from "./mail-bridge";
import { parseEmailBody } from "./email-quote-engine";
import {
	formatEmailSection,
	filterAttachments,
	buildMessageUrl,
	stripSubjectPrefixes,
	type EmailMeta,
	type MailAttachment,
} from "./email-format-engine";
import { mergeDetectedAccounts, isAccountIncluded } from "./email-filing-settings";
import { addVorgangSection } from "../vorgang/vorgang-engine";
import { suggestFilingTargets } from "../besprechung/besprechung-suggest-engine";
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
					"Walk the Apple Mail inbox; for each message pick a Vorgang/Person/Bestellung/Bewerbung note, edit the extracted body, then archive the message and file the section.",
			},
		];
	}

	private makeBridge(): MailBridge {
		const s = this.plugin.settings.emailFiling;
		return createOsascriptBridge(s.archiveMailboxes, s.defaultArchiveMailbox);
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
		let metas: RawMailMessageMeta[];
		try {
			metas = this.selectWalkMessages(await this.bridge.listInbox());
		} catch (e) {
			this.logBridgeError(e);
			new Notice(e instanceof Error ? e.message : "Mail-Zugriff fehlgeschlagen.");
			this.walkInProgress = false;
			return;
		}
		if (metas.length === 0) {
			new Notice("Inbox ist leer.");
			this.walkInProgress = false;
			return;
		}
		this.presentMessage(metas, 0);
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
			new Notice(`E-Mail-Ablage fertig (${metas.length} bearbeitet).`);
			this.walkInProgress = false;
			return;
		}
		void this.presentMessageAsync(metas, i);
	}

	private async presentMessageAsync(metas: RawMailMessageMeta[], i: number): Promise<void> {
		const meta = metas[i];
		let attachments: MailAttachment[];
		let body: string;
		try {
			const raw = await this.bridge.fetchBody(meta.accountName, meta.id);
			body = parseEmailBody(raw.body).body;
			attachments = filterAttachments(raw.attachments);
		} catch (e) {
			this.logBridgeError(e);
			new Notice(`Nachricht nicht mehr im Posteingang: ${meta.subject}`);
			this.presentMessage(metas, i + 1);
			return;
		}

		const emailMeta = this.toEmailMeta(meta);
		new SectionNoteSuggestModal(this.plugin.app, SECTION_NOTE_TAGS, {
			placeholder: `[${i + 1}/${metas.length}] „${meta.subject}" ablegen unter… (ESC = Stopp)`,
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
					() => {
						this.presentMessage(metas, i + 1);
					},
				).open();
			},
			onSkip: () => this.presentMessage(metas, i + 1),
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
			const { sectionName, bodyLines } = formatEmailSection(emailMeta, body, attachments, locale);
			const { newContent } = addVorgangSection(content, sectionName, locale, emailMeta.dateSent, bodyLines);
			await this.plugin.app.vault.modify(vorgang, newContent);
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

	private openMessage(meta: EmailMeta): void {
		this.openUrl(meta.messageUrl);
	}

	private suggestionsFor(meta: RawMailMessageMeta): string[] {
		try {
			const title = `${stripSubjectPrefixes(meta.subject)} ${meta.senderName}`;
			return suggestFilingTargets(title, [], this.sectionNoteBasenames(), {
				now: Date.now(),
				minScore: SUGGEST_MIN_SCORE,
			}).map((s) => s.target);
		} catch (e) {
			console.warn("LuKit email-filing: suggestions failed:", e instanceof Error ? e.name : typeof e);
			return [];
		}
	}

	private sectionNoteBasenames(): string[] {
		return this.plugin.app.vault
			.getMarkdownFiles()
			.filter((f) =>
				frontmatterTagsInclude(
					this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.tags,
					SECTION_NOTE_TAGS,
				),
			)
			.map((f) => f.basename);
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

		for (const account of Object.keys(settings.archiveMailboxes)) {
			new Setting(containerEl)
				.setName(account)
				.setDesc("Toggle = include this account in the walk; field = its archive mailbox (e.g. Gmail → [Gmail]/All Mail)")
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
						.setValue(settings.archiveMailboxes[account])
						.onChange(async (value) => {
							settings.archiveMailboxes[account] = value.trim();
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
