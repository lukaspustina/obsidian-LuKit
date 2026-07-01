import { execFile } from "child_process";
import type { MailAttachment } from "./email-format-engine";

export interface RawMailMessageMeta {
	/** Message-ID without angle brackets. Unique within an account. */
	id: string;
	/** Owning Mail account name — used to scope all bridge calls. */
	accountName: string;
	/** Display name; falls back to the sender address when the display name is absent. */
	senderName: string;
	/** Sender's email address (used to match Sent replies in the same thread). */
	senderAddress: string;
	subject: string;
	/** ISO 8601 string. */
	dateSent: string;
}

export interface RawMailBody {
	body: string;
	attachments: MailAttachment[];
}

/** A message in an assembled thread (inbound or Sent reply). */
export interface ThreadMessage {
	id: string;
	/** "in" for received; "out" for Sent. listSentForThread always returns "out". */
	direction: "in" | "out";
	/** Display name of the party: sender (in) or first To: recipient (out). */
	partyName: string;
	/** ISO 8601 string. */
	dateSent: string;
	/** Raw body; caller strips with parseEmailBody. */
	body: string;
	subject: string;
	attachments: MailAttachment[];
}

/** A message currently selected in Apple Mail (any mailbox). */
export interface SelectedMessage {
	id: string;
	accountName: string;
	direction: "in" | "out";
	subject: string;
	/** Correspondent display name (sender if "in", first To: recipient if "out"). */
	partyName: string;
	/** Correspondent email address (sender if "in", first To: address if "out"). */
	partyAddress: string;
	/** ISO 8601 string. */
	dateSent: string;
	/** Raw body of the selected message; caller strips with parseEmailBody. */
	body: string;
	attachments: MailAttachment[];
}

export interface MailBridge {
	/** All inbox messages across all accounts, sorted by dateSent ascending. */
	listInbox(): Promise<RawMailMessageMeta[]>;
	/** Display names of all configured Mail accounts (for the settings "Detect accounts" button). */
	listAccounts(): Promise<string[]>;
	/** Body + attachments for a message in the named account. Throws if not found. */
	fetchBody(accountName: string, messageId: string): Promise<RawMailBody>;
	/** Moves the message to the account's configured archive mailbox. Throws on failure. */
	archive(accountName: string, messageId: string): Promise<void>;
	/** True if the message is still present in the named account's inbox. */
	isInInbox(accountName: string, messageId: string): Promise<boolean>;
	/**
	 * Messages in the account's Sent mailbox (sentMailboxName, else auto-detected)
	 * whose subject contains subjectContains and whose recipient matches
	 * correspondentAddress, with bodies + attachments, all direction "out". Uses a
	 * filtered `whose` query (fast) rather than scanning the whole mailbox. The
	 * caller filters by threadKey. Throws on JXA failure (caller degrades to
	 * inbound-only filing).
	 */
	listSentForThread(
		accountName: string,
		correspondentAddress: string,
		sentMailboxName: string,
		subjectContains: string,
	): Promise<ThreadMessage[]>;
	/**
	 * Messages in the account's inbox whose subject contains subjectContains, with
	 * bodies + attachments, all direction "in". Used to gather a thread's other
	 * received emails that are still in the inbox. The caller filters by threadKey
	 * (thread identity is subject-based — a CC thread's messages have varied
	 * senders). Throws on JXA failure (caller degrades to the single message).
	 */
	listInboxForThread(accountName: string, subjectContains: string): Promise<ThreadMessage[]>;
	/** The message(s) currently selected in Apple Mail across any mailbox; [] when none. */
	getSelection(): Promise<SelectedMessage[]>;
	/** Resolves each account's actual Sent mailbox name (run once at Detect time). */
	detectSentMailboxes(): Promise<Record<string, string>>;
}

// Runs a JXA script via `osascript -l JavaScript -e <script> -- <args…>`. All
// runtime values are passed as trailing argv (read by the script's run(argv)
// handler) — NEVER interpolated into the script source — so account names,
// message IDs, and mailbox names cannot inject into the script. execFile spawns
// no shell.
function runJxa(script: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			"osascript",
			["-l", "JavaScript", "-e", script, ...args],
			{ maxBuffer: 16 * 1024 * 1024 },
			(error, stdout) => {
				if (error) {
					const msg = typeof error.message === "string" ? error.message : String(error);
					if (msg.includes("-1743")) {
						reject(
							new Error(
								"Mail-Automatisierung verweigert (-1743). Bitte erlaube Obsidian den Zugriff auf Mail in den Systemeinstellungen → Datenschutz → Automatisierung.",
							),
						);
						return;
					}
					reject(error);
					return;
				}
				resolve(stdout);
			},
		);
	});
}

// Shared JXA helpers prepended to every script. `findInInbox` scopes the search
// to the named account's inbox so duplicate Message-IDs across accounts do not
// collide.
const JXA_HELPERS = `
function lukitAccount(Mail, name) {
  const accts = Mail.accounts.whose({ name: name })();
  return accts.length > 0 ? accts[0] : null;
}
function lukitInbox(Mail, accountName) {
  const acct = lukitAccount(Mail, accountName);
  if (!acct) return null;
  const boxes = acct.mailboxes.whose({ name: "INBOX" })();
  if (boxes.length > 0) return boxes[0];
  const all = acct.mailboxes();
  return all.length > 0 ? all[0] : null;
}
function lukitFindInInbox(Mail, accountName, messageId) {
  const box = lukitInbox(Mail, accountName);
  if (!box) return null;
  // Single filtered query instead of scanning every message one at a time.
  const matches = box.messages.whose({ messageId: messageId })();
  return matches.length > 0 ? matches[0] : null;
}
function lukitSentMailbox(Mail, accountName, preferredName) {
  const acct = lukitAccount(Mail, accountName);
  if (!acct) return null;
  // Exact configured name first (user override).
  if (preferredName) {
    try { const bs = acct.mailboxes.whose({ name: preferredName })(); if (bs.length) return bs[0]; } catch (e) {}
  }
  // Auto-detect: the Sent folder's scripting name varies by provider/locale
  // (Sent Messages / Sent Items / Sent Mail / Gesendet / Gesendete Elemente).
  let names = [];
  try { names = [].concat(acct.mailboxes.name()); } catch (e) { return null; }
  for (let i = 0; i < names.length; i++) {
    if (/sent|gesendet/i.test(names[i])) { try { return acct.mailboxes[i]; } catch (e) {} }
  }
  return null;
}
// Reads a message's attachments resiliently: name, mimeType and size are read
// independently so a throwing property (mimeType() throws in some Mail versions)
// does not drop the whole attachment. Skips only entries with no readable name.
function lukitReadAttachments(m) {
  let raw = [];
  try { raw = m.mailAttachments(); } catch (e) { return []; }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    let name = "";
    try { name = raw[i].name(); } catch (e) {}
    if (!name) continue;
    let mimeType = "";
    try { mimeType = raw[i].mimeType(); } catch (e) {}
    let size = -1;
    try { size = raw[i].fileSize(); } catch (e) {}
    out.push({ name: name, mimeType: mimeType, size: size });
  }
  return out;
}
`;

// Bulk property reads: one Apple Event per property per account's inbox, rather
// than per-property-per-message (which is O(messages) round-trips and the main
// source of multi-second startup latency). Iterates each account's INBOX so the
// account name is known without a per-message mailbox→account hop.
const LIST_INBOX_JS = `
function run() {
  const Mail = Application("Mail");
  const accts = Mail.accounts;
  const names = [].concat(accts.name());
  const out = [];
  for (let ai = 0; ai < names.length; ai++) {
    let box = null;
    try {
      const bs = accts[ai].mailboxes.whose({ name: "INBOX" })();
      box = bs.length ? bs[0] : null;
    } catch (e) { box = null; }
    if (!box) continue;
    const msgs = box.messages;
    let ids;
    try { ids = [].concat(msgs.messageId()); } catch (e) { continue; }
    if (ids.length === 0) continue;
    const senders = [].concat(msgs.sender());
    const subjects = [].concat(msgs.subject());
    const dates = [].concat(msgs.dateSent());
    for (let i = 0; i < ids.length; i++) {
      let sent = "";
      try { sent = dates[i] ? dates[i].toISOString() : ""; } catch (e) {}
      out.push({ id: ids[i], accountName: names[ai], sender: senders[i], subject: subjects[i], dateSent: sent });
    }
  }
  return JSON.stringify(out);
}
`;

const LIST_ACCOUNTS_JS = `
function run() {
  const Mail = Application("Mail");
  return JSON.stringify([].concat(Mail.accounts.name()));
}
`;

const FETCH_BODY_JS =
	JXA_HELPERS +
	`
function run(argv) {
  const Mail = Application("Mail");
  const m = lukitFindInInbox(Mail, argv[0], argv[1]);
  if (!m) return JSON.stringify({ notFound: true });
  const atts = lukitReadAttachments(m);
  // content() can fail (-10000) for messages whose body isn't retrievable;
  // degrade to an empty body so the message still files with its link line.
  let body = "";
  try { const c = m.content(); if (c != null) body = String(c); } catch (e) { body = ""; }
  return JSON.stringify({ body: body, attachments: atts });
}
`;

const ARCHIVE_JS =
	JXA_HELPERS +
	`
function run(argv) {
  const Mail = Application("Mail");
  const accountName = argv[0], messageId = argv[1], mailboxName = argv[2];
  const m = lukitFindInInbox(Mail, accountName, messageId);
  if (!m) return "not-found";
  const acct = lukitAccount(Mail, accountName);
  const dest = acct.mailboxes.byName(mailboxName);
  Mail.move(m, { to: dest });
  return "ok";
}
`;

const IS_IN_INBOX_JS =
	JXA_HELPERS +
	`
function run(argv) {
  const Mail = Application("Mail");
  return lukitFindInInbox(Mail, argv[0], argv[1]) ? "true" : "false";
}
`;

// Returns all messages in the account's named Sent mailbox addressed to the
// given correspondent (any To: recipient match), with bodies + attachments. The
// TS caller filters by threadKey. Iterates messages (recipient lists are not
// bulk-readable); acceptable at occasional file-time, validated by smoke test.
const LIST_SENT_FOR_THREAD_JS =
	JXA_HELPERS +
	`
function run(argv) {
  const Mail = Application("Mail");
  const accountName = argv[0], correspondent = (argv[1] || "").toLowerCase(), boxName = argv[2], subjectContains = argv[3] || "";
  const box = lukitSentMailbox(Mail, accountName, boxName);
  if (!box) return JSON.stringify([]);
  // Filtered query (one Apple Event) so we never materialize the whole mailbox.
  let msgs = [];
  try {
    msgs = subjectContains ? box.messages.whose({ subject: { _contains: subjectContains } })() : box.messages();
  } catch (e) {
    try { msgs = box.messages(); } catch (e2) { return JSON.stringify([]); }
  }
  const out = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    let match = false;
    try {
      const tos = m.toRecipients();
      for (let j = 0; j < tos.length; j++) {
        try { if ((tos[j].address() || "").toLowerCase() === correspondent) { match = true; break; } } catch (e) {}
      }
    } catch (e) {}
    if (!match) continue;
    let body = "";
    try { const c = m.content(); if (c != null) body = String(c); } catch (e) {}
    const atts = lukitReadAttachments(m);
    let sent = "";
    try { sent = m.dateSent().toISOString(); } catch (e) {}
    out.push({ id: m.messageId(), sender: m.sender(), subject: m.subject(), dateSent: sent, body: body, attachments: atts });
  }
  return JSON.stringify(out);
}
`;

// Returns the message(s) currently selected in Apple Mail (any mailbox). The TS
// wrapper derives direction and the correspondent party from mailboxName/sender/To.
const GET_SELECTION_JS =
	JXA_HELPERS +
	`
function run() {
  const Mail = Application("Mail");
  let sel = [];
  try { sel = Mail.selection(); } catch (e) { sel = []; }
  const out = [];
  for (let i = 0; i < sel.length; i++) {
    const m = sel[i];
    let acct = "", box = "";
    try { const mb = m.mailbox(); box = mb.name(); acct = mb.account().name(); } catch (e) {}
    let toName = "", toAddr = "";
    try { const tos = m.toRecipients(); if (tos.length) { try { toName = tos[0].name() || ""; } catch (e) {} try { toAddr = tos[0].address() || ""; } catch (e) {} } } catch (e) {}
    let sent = "";
    try { sent = m.dateSent().toISOString(); } catch (e) {}
    let body = "";
    try { const c = m.content(); if (c != null) body = String(c); } catch (e) {}
    const atts = lukitReadAttachments(m);
    out.push({ id: m.messageId(), accountName: acct, mailboxName: box, subject: m.subject(), sender: m.sender(), toName: toName, toAddress: toAddr, dateSent: sent, body: body, attachments: atts });
  }
  return JSON.stringify(out);
}
`;

// Like LIST_SENT_FOR_THREAD_JS but on the inbox and without a recipient filter:
// a thread's received siblings can come from many senders (CC threads), so
// identity is subject-based and the TS caller filters by threadKey.
const LIST_INBOX_FOR_THREAD_JS =
	JXA_HELPERS +
	`
function run(argv) {
  const Mail = Application("Mail");
  const accountName = argv[0], subjectContains = argv[1] || "";
  const box = lukitInbox(Mail, accountName);
  if (!box) return JSON.stringify([]);
  let msgs = [];
  try {
    msgs = subjectContains ? box.messages.whose({ subject: { _contains: subjectContains } })() : box.messages();
  } catch (e) {
    try { msgs = box.messages(); } catch (e2) { return JSON.stringify([]); }
  }
  const out = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    let body = "";
    try { const c = m.content(); if (c != null) body = String(c); } catch (e) {}
    const atts = lukitReadAttachments(m);
    let sent = "";
    try { sent = m.dateSent().toISOString(); } catch (e) {}
    out.push({ id: m.messageId(), sender: m.sender(), subject: m.subject(), dateSent: sent, body: body, attachments: atts });
  }
  return JSON.stringify(out);
}
`;

// Resolves each account's actual Sent mailbox name via the same heuristic used
// at file time — run once at Detect time so subsequent filings use the exact
// name (fast) instead of re-detecting.
const DETECT_SENT_JS =
	JXA_HELPERS +
	`
function run() {
  const Mail = Application("Mail");
  const names = [].concat(Mail.accounts.name());
  const out = {};
  for (let ai = 0; ai < names.length; ai++) {
    const box = lukitSentMailbox(Mail, names[ai], "");
    if (box) { try { out[names[ai]] = box.name(); } catch (e) {} }
  }
  return JSON.stringify(out);
}
`;

// Parses Mail's "Display Name <addr@host>" sender into a display name, falling
// back to the bare address when no display name is present.
function parseSenderName(sender: string): string {
	const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(sender);
	if (match) {
		const name = match[1].trim();
		return name.length > 0 ? name : match[2].trim();
	}
	return sender.trim();
}

// Parallel to parseSenderName: extracts the address (match[2]) from a
// "Display Name <addr@host>" sender, falling back to the raw string.
function parseSenderAddress(sender: string): string {
	const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(sender);
	return match ? match[2].trim() : sender.trim();
}

export function createOsascriptBridge(
	archiveMailboxes: Record<string, string>,
	defaultArchiveMailbox: string,
	sentMailboxes: Record<string, string>,
	defaultSentMailbox: string,
): MailBridge {
	const mailboxFor = (accountName: string): string =>
		archiveMailboxes[accountName] ?? defaultArchiveMailbox;

	return {
		async listInbox(): Promise<RawMailMessageMeta[]> {
			const raw = JSON.parse(await runJxa(LIST_INBOX_JS, [])) as Array<{
				id: string;
				accountName: string;
				sender: string;
				subject: string;
				dateSent: string;
			}>;
			return raw
				.map((m) => ({
					id: m.id,
					accountName: m.accountName,
					senderName: parseSenderName(m.sender),
					senderAddress: parseSenderAddress(m.sender),
					subject: m.subject,
					dateSent: m.dateSent,
				}))
				.sort((a, b) => a.dateSent.localeCompare(b.dateSent));
		},

		async listAccounts(): Promise<string[]> {
			return JSON.parse(await runJxa(LIST_ACCOUNTS_JS, [])) as string[];
		},

		async fetchBody(accountName: string, messageId: string): Promise<RawMailBody> {
			const parsed = JSON.parse(await runJxa(FETCH_BODY_JS, [accountName, messageId])) as
				RawMailBody & { notFound?: boolean };
			if (parsed.notFound) {
				throw new Error("lukit-not-found");
			}
			return parsed;
		},

		async archive(accountName: string, messageId: string): Promise<void> {
			const result = (
				await runJxa(ARCHIVE_JS, [accountName, messageId, mailboxFor(accountName)])
			).trim();
			if (result !== "ok" && result !== "not-found") {
				throw new Error(`Archivierung fehlgeschlagen (${result})`);
			}
		},

		async isInInbox(accountName: string, messageId: string): Promise<boolean> {
			return (await runJxa(IS_IN_INBOX_JS, [accountName, messageId])).trim() === "true";
		},

		async listSentForThread(
			accountName: string,
			correspondentAddress: string,
			sentMailboxName: string,
			subjectContains: string,
		): Promise<ThreadMessage[]> {
			const raw = JSON.parse(
				await runJxa(LIST_SENT_FOR_THREAD_JS, [accountName, correspondentAddress, sentMailboxName, subjectContains]),
			) as Array<{
				id: string;
				sender: string;
				subject: string;
				dateSent: string;
				body: string;
				attachments: MailAttachment[];
			}>;
			return raw.map((m) => ({
				id: m.id,
				direction: "out" as const,
				partyName: parseSenderName(m.sender),
				dateSent: m.dateSent,
				body: m.body,
				subject: m.subject,
				attachments: m.attachments,
			}));
		},

		async listInboxForThread(
			accountName: string,
			subjectContains: string,
		): Promise<ThreadMessage[]> {
			const raw = JSON.parse(
				await runJxa(LIST_INBOX_FOR_THREAD_JS, [accountName, subjectContains]),
			) as Array<{
				id: string;
				sender: string;
				subject: string;
				dateSent: string;
				body: string;
				attachments: MailAttachment[];
			}>;
			return raw.map((m) => ({
				id: m.id,
				direction: "in" as const,
				partyName: parseSenderName(m.sender),
				dateSent: m.dateSent,
				body: m.body,
				subject: m.subject,
				attachments: m.attachments,
			}));
		},

		async getSelection(): Promise<SelectedMessage[]> {
			const raw = JSON.parse(await runJxa(GET_SELECTION_JS, [])) as Array<{
				id: string;
				accountName: string;
				mailboxName: string;
				subject: string;
				sender: string;
				toName: string;
				toAddress: string;
				dateSent: string;
				body: string;
				attachments: MailAttachment[];
			}>;
			return raw.map((m) => {
				const configured = sentMailboxes[m.accountName];
				// Configured exact name, else the provider/locale-agnostic heuristic.
				const isOut = (!!configured && m.mailboxName === configured) || /sent|gesendet/i.test(m.mailboxName);
				return {
					id: m.id,
					accountName: m.accountName,
					direction: isOut ? ("out" as const) : ("in" as const),
					subject: m.subject,
					partyName: isOut ? m.toName : parseSenderName(m.sender),
					partyAddress: isOut ? m.toAddress : parseSenderAddress(m.sender),
					dateSent: m.dateSent,
					body: m.body,
					attachments: m.attachments,
				};
			});
		},

		async detectSentMailboxes(): Promise<Record<string, string>> {
			return JSON.parse(await runJxa(DETECT_SENT_JS, [])) as Record<string, string>;
		},
	};
}
