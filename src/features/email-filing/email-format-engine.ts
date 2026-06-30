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
