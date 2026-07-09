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

// Fallback name for attachments whose basename sanitizes to empty/dots-only.
const ATTACHMENT_FALLBACK_NAME = "Anhang";

// Auto-generated inline-image names: mail clients embed signature logos and
// pasted images as imageNNN.<ext>. mimeType is unreliable via JXA (often throws
// / comes back empty), so inline detection keys off this filename pattern, not
// the MIME type. Real attachments (Rechnung.pdf, Foto_Urlaub.jpg) don't match.
const INLINE_IMAGE_NAME = /^image\d+\.(png|jpe?g|gif|bmp|tiff?)$/i;
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

// Preselection threshold for image attachments (bytes, inclusive): images at
// or above this size are checked by default (likely a real photo), smaller
// ones are unchecked (likely a footer/signature graphic).
export const IMAGE_PRESELECT_MIN_BYTES = 500_000;

// Extensions recognized as images for the mimeType-empty fallback. Deliberately
// separate from INLINE_IMAGE_NAME (which detects auto-generated inline-image
// filenames, not "is this an image").
const IMAGE_EXTENSIONS = new Set([
	"jpg",
	"jpeg",
	"png",
	"gif",
	"webp",
	"heic",
	"heif",
	"bmp",
	"tiff",
	"svg",
	"avif",
	"jfif",
]);

function isImageAttachment(att: MailAttachment): boolean {
	if (att.mimeType.toLowerCase().startsWith("image/")) return true;
	if (att.mimeType !== "") return false;
	const dot = att.name.lastIndexOf(".");
	if (dot === -1) return false;
	return IMAGE_EXTENSIONS.has(att.name.slice(dot + 1).toLowerCase());
}

// Determines the default checkbox state for an attachment in the preview
// modal: documents are always checked; images are checked only when large
// enough to plausibly be a real photo (unknown size counts as small).
export function preselectAttachment(att: MailAttachment): boolean {
	if (!isImageAttachment(att)) return true;
	return att.size >= IMAGE_PRESELECT_MIN_BYTES;
}

// Drops client-embedded inline images (signature logos, pasted images),
// identified by their auto-generated imageNNN.<ext> name. Real attachments —
// including images with meaningful names — are kept. Biased to under-filter: a
// stray logo name in the list beats silently dropping a real attachment.
// Returns a new array; does not mutate the input.
export function filterAttachments(all: MailAttachment[]): MailAttachment[] {
	return all.filter((a) => !INLINE_IMAGE_NAME.test(a.name));
}

// Reduces an attacker/sender-controlled attachment name to its basename
// (everything after the last "/" or "\"), so a saved destPath can never escape
// _resources via a traversal segment. Empty or dots-only basenames (e.g. "..",
// "docs/") fall back to ATTACHMENT_FALLBACK_NAME.
function sanitizeAttachmentBasename(name: string): string {
	const idx = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
	const basename = idx === -1 ? name : name.slice(idx + 1);
	return /^\.*$/.test(basename) ? ATTACHMENT_FALLBACK_NAME : basename;
}

// Inserts a collision suffix (" 2", " 3", …) before the last "." of a
// basename; no dot, or a dot at index 0 (e.g. ".gitignore"), appends the
// suffix at the end instead.
function withCollisionSuffix(basename: string, n: number): string {
	const dot = basename.lastIndexOf(".");
	if (dot <= 0) return `${basename} ${n}`;
	return `${basename.slice(0, dot)} ${n}${basename.slice(dot)}`;
}

// Resolves attachment names against files already present in the target
// _resources folder and against collisions within this same batch (positional
// pairs, since a Map can't represent repeated originals). Sanitizes each name
// to its basename first (path-traversal guard); comparison is case-insensitive
// (APFS semantics), the resolved name keeps its own casing. Existing files are
// never overwritten.
export function resolveAttachmentFileNames(
	existingNames: Set<string>,
	attachmentNames: string[],
): { original: string; resolved: string }[] {
	const used = new Set<string>();
	for (const name of existingNames) used.add(name.toLowerCase());

	const result: { original: string; resolved: string }[] = [];
	for (const original of attachmentNames) {
		const basename = sanitizeAttachmentBasename(original);
		let resolved = basename;
		let n = 1;
		while (used.has(resolved.toLowerCase())) {
			n++;
			resolved = withCollisionSuffix(basename, n);
		}
		used.add(resolved.toLowerCase());
		result.push({ original, resolved });
	}
	return result;
}

// Renders the "Anhänge: …" line contents: names with a savedNames entry
// become a wikilink to the saved filename, all others stay plain text
// (original name) — mixed in one line, attachment order unchanged.
function formatAttachmentsLine(attachments: MailAttachment[], savedNames?: Map<string, string>): string {
	return attachments
		.map((a) => {
			const saved = savedNames?.get(a.name);
			return saved !== undefined ? `[[${saved}]]` : a.name;
		})
		.join(", ");
}

// Builds the section name (no date suffix — the caller passes the date to
// addVorgangSection) and the body lines to insert under the h5 heading.
// `locale` is part of the contract for future use; the date is applied downstream.
export function formatEmailSection(
	meta: EmailMeta,
	body: string,
	attachments: MailAttachment[],
	locale: DateLocale,
	savedNames?: Map<string, string>,
): { sectionName: string; bodyLines: string[] } {
	const sender = sanitizeSenderSubject(meta.senderName);
	const subject = sanitizeSenderSubject(stripSubjectPrefixes(meta.subject));
	const sectionName = `E-Mail von ${sender}: ${subject}`;

	const bodyLines: string[] = [`- siehe [${sectionName}](${meta.messageUrl})`];
	if (body.trim().length > 0) {
		bodyLines.push(...body.split("\n"));
	}
	if (attachments.length > 0) {
		bodyLines.push(`Anhänge: ${formatAttachmentsLine(attachments, savedNames)}`);
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
	/** Original attachment name -> saved filename; only for successfully saved attachments. */
	savedNames?: Map<string, string>;
}

// Extracts and decodes the Message-ID from a message://%3C…%3E link. No
// regex match -> null. Match but decodeURIComponent throws (malformed
// percent-escape) -> the raw captured id, not null.
export function decodeMessageIdFromUrl(url: string): string | null {
	const match = /message:\/\/%3C(.+?)%3E/i.exec(url);
	if (!match) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
}

// Parses message:// links out of a Vorgang's content and returns the set of
// already-filed Message-IDs, so a thread can be assembled without re-adding
// messages already present. Links have the form message://%3C<id>%3E (angle
// brackets percent-encoded by buildMessageUrl); decoding goes through
// decodeMessageIdFromUrl.
export function extractFiledMessageIds(vorgangContent: string): Set<string> {
	const ids = new Set<string>();
	const re = /message:\/\/%3C(.+?)%3E/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(vorgangContent)) !== null) {
		const id = decodeMessageIdFromUrl(match[0]);
		if (id !== null) ids.add(id);
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
			bodyLines.push(`Anhänge: ${formatAttachmentsLine(msg.attachments, msg.savedNames)}`);
		}
	}
	return { sectionName, bodyLines };
}
