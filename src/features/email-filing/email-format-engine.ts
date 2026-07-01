import { formatDate } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";

// Shape of a Mail attachment as surfaced by the bridge. Defined here (the pure
// consumer) so the engine carries no dependency on the Phase 3 bridge module.
export interface MailAttachment {
	name: string;
	mimeType: string;
	/** Bytes. -1 when the size is unknown. */
	size: number;
}

export interface EmailMeta {
	senderName: string;
	subject: string;
	dateSent: Date;
	/** Full percent-encoded URL built by the bridge via buildMessageUrl. */
	messageUrl: string;
}

// 50 KiB — inline images (logos, signature icons, tracking pixels) sit below this.
const INLINE_IMAGE_MAX_BYTES = 51200;
// Reply/forward subject prefixes: AW:, Re:, Fwd:, FWD:, WG: (case-insensitive).
const SUBJECT_PREFIX = /^\s*(AW|RE|FWD|WG)\s*:\s*/i;

// Wraps a bare Message-ID (no angle brackets) in encoded angle brackets to form
// a message:// URL Apple Mail can open. Matches the proven LaunchBar AppleScript
// form `message://%3c<id>%3e`; the id is left literal (Message-IDs are URL-safe).
// Example: buildMessageUrl("foo@bar.com") → "message://%3Cfoo@bar.com%3E".
export function buildMessageUrl(messageId: string): string {
	return `message://%3C${messageId}%3E`;
}

// Removes/replaces characters that collide with the vorgang "name, DD.MM.YYYY"
// heading convention or break markdown links: "]]" → "]", "," removed,
// "|" → "-", "#" removed.
export function sanitizeSenderSubject(value: string): string {
	return value
		.replace(/\]\]/g, "]")
		.replace(/,/g, "")
		.replace(/\|/g, "-")
		.replace(/#/g, "")
		.trim();
}

// Strips recognized reply/forward prefixes (possibly repeated) from a subject.
// Falls back to the original subject when stripping yields empty/whitespace.
export function stripSubjectPrefixes(subject: string): string {
	let s = subject;
	while (SUBJECT_PREFIX.test(s)) {
		s = s.replace(SUBJECT_PREFIX, "");
	}
	const trimmed = s.trim();
	return trimmed === "" ? subject : trimmed;
}

// Normalized thread identity for a subject: reply/forward prefixes stripped,
// lowercased, whitespace collapsed. Emails of one thread share the same base
// subject (only AW:/Re:/Fwd: prefixes differ) → same key. Empty when the subject
// is blank after stripping.
export function threadKey(subject: string): string {
	return stripSubjectPrefixes(subject).trim().toLowerCase().replace(/\s+/g, " ");
}

// Drops inline images: image/* attachments at or below 50 KiB (this also covers
// size === -1 unknown). Returns a new array; does not mutate the input.
export function filterAttachments(all: MailAttachment[]): MailAttachment[] {
	return all.filter(
		(a) => !(a.mimeType.startsWith("image/") && a.size <= INLINE_IMAGE_MAX_BYTES),
	);
}

// Builds the section name (no date suffix — the caller passes the date to
// addVorgangSection) and the body lines to insert under the h5 heading.
// `locale` is part of the contract for future use; the date is applied downstream.
export function formatEmailSection(
	meta: EmailMeta,
	body: string,
	attachments: MailAttachment[],
	locale: DateLocale,
): { sectionName: string; bodyLines: string[] } {
	const sender = sanitizeSenderSubject(meta.senderName);
	const subject = sanitizeSenderSubject(stripSubjectPrefixes(meta.subject));
	const sectionName = `E-Mail von ${sender}: ${subject}`;

	const bodyLines: string[] = [`- siehe [${sectionName}](${meta.messageUrl})`];
	if (body.trim().length > 0) {
		bodyLines.push(...body.split("\n"));
	}
	if (attachments.length > 0) {
		bodyLines.push(`Anhänge: ${attachments.map((a) => a.name).join(", ")}`);
	}
	return { sectionName, bodyLines };
}

// One message of an assembled conversation thread, as fed to formatThreadSection.
export interface ThreadSectionMessage {
	direction: "in" | "out";
	partyName: string;
	/** ISO 8601 string. */
	dateSent: string;
	/** Already stripped via parseEmailBody by the caller. */
	body: string;
	attachments: MailAttachment[];
	messageUrl: string;
}

// Parses message:// links out of a Vorgang's content and returns the set of
// already-filed Message-IDs, so a thread can be assembled without re-adding
// messages already present. Links have the form message://%3C<id>%3E (angle
// brackets percent-encoded by buildMessageUrl); the id is decoded with a guard.
export function extractFiledMessageIds(vorgangContent: string): Set<string> {
	const ids = new Set<string>();
	const re = /message:\/\/%3C(.+?)%3E/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(vorgangContent)) !== null) {
		let id = match[1];
		try {
			id = decodeURIComponent(id);
		} catch {
			// Malformed percent-escape — keep the raw captured id.
		}
		ids.add(id);
	}
	return ids;
}

// Renders a conversation as one Vorgang section, newest-first to match the
// reverse-chronological reading of the Vorgang. Per message (blank-line
// separated): a sub-header whose party name links to the message, the body,
// then Anhänge. There is no separate `- siehe` line — the link lives in the
// sub-header title.
export function formatThreadSection(
	messages: ThreadSectionMessage[],
	subject: string,
	locale: DateLocale,
): { sectionName: string; bodyLines: string[] } {
	const cleanSubject = sanitizeSenderSubject(stripSubjectPrefixes(subject));
	const sectionName = `E-Mail-Thread: ${cleanSubject}`;
	const sorted = [...messages].sort((a, b) => b.dateSent.localeCompare(a.dateSent));

	const bodyLines: string[] = [];
	for (let i = 0; i < sorted.length; i++) {
		const msg = sorted[i];
		if (i > 0) bodyLines.push("");
		const dir = msg.direction === "in" ? "eingegangen" : "gesendet";
		const party = sanitizeSenderSubject(msg.partyName);
		bodyLines.push(`**${formatDate(new Date(msg.dateSent), locale)} — [${party}](${msg.messageUrl}) (${dir}):**`);
		if (msg.body.trim().length > 0) {
			bodyLines.push(...msg.body.split("\n"));
		}
		if (msg.attachments.length > 0) {
			bodyLines.push(`Anhänge: ${msg.attachments.map((a) => a.name).join(", ")}`);
		}
	}
	return { sectionName, bodyLines };
}
