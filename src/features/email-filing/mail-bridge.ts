import { execFile } from "child_process";
import type { MailAttachment } from "./email-format-engine";

export interface RawMailMessageMeta {
	/** Message-ID without angle brackets. Unique within an account. */
	id: string;
	/** Owning Mail account name — used to scope all bridge calls. */
	accountName: string;
	/** Display name; falls back to the sender address when the display name is absent. */
	senderName: string;
	subject: string;
	/** ISO 8601 string. */
	dateSent: string;
}

export interface RawMailBody {
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
function lukitInboxMessages(Mail, accountName) {
  const acct = lukitAccount(Mail, accountName);
  if (!acct) return [];
  const boxes = acct.mailboxes.whose({ name: "INBOX" })();
  const box = boxes.length > 0 ? boxes[0] : acct.mailboxes()[0];
  return box ? box.messages() : [];
}
function lukitFindInInbox(Mail, accountName, messageId) {
  const msgs = lukitInboxMessages(Mail, accountName);
  for (let i = 0; i < msgs.length; i++) {
    try { if (msgs[i].messageId() === messageId) return msgs[i]; } catch (e) {}
  }
  return null;
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
  const atts = [];
  let raw = [];
  try { raw = m.mailAttachments(); } catch (e) { raw = []; }
  for (let i = 0; i < raw.length; i++) {
    try {
      let size = -1;
      try { size = raw[i].fileSize(); } catch (e) {}
      atts.push({ name: raw[i].name(), mimeType: raw[i].mimeType(), size: size });
    } catch (e) {}
  }
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

export function createOsascriptBridge(
	archiveMailboxes: Record<string, string>,
	defaultArchiveMailbox: string,
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
	};
}
