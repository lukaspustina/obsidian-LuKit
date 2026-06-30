export interface ParsedEmail {
	/** New text only — quoted history, signature, and footer removed. Empty string when nothing remains. */
	body: string;
	/** Removed quoted block (diagnostic; not surfaced to callers in v1). */
	quoted: string;
	/** Removed signature/footer block (diagnostic; not surfaced to callers in v1). */
	signature: string;
}

// Apple Mail attribution line, e.g. "Am 01.06.2026 um 10:00 schrieb Max:".
const ATTRIBUTION = /^Am\s.+\bschrieb\b.*:\s*$/;
// "-----Ursprüngliche Nachricht-----" separator (Outlook reply/forward).
const ORIGINAL_MESSAGE = /^-+\s*Ursprüngliche Nachricht\s*-+/;
// Continuation lines of the German Outlook header block.
const OUTLOOK_HEADER_CONT = /^(Gesendet|An|Betreff):/;

// Closing salutations (German + English). Matched at the start of a trimmed
// line; everything from there down is treated as signature/footer.
const SALUTATION_PHRASE =
	/^(mit freundlichen grüßen|mit besten grüßen|mit freundlichem gruß|freundliche grüße|freundlichen gruß|beste grüße|viele grüße|herzliche grüße|liebe grüße|best regards|kind regards|warm regards|best wishes|thanks and regards|many thanks|regards|sincerely|cheers)\b/i;
// Salutation abbreviations standing alone on a line, e.g. "VG", "MfG".
const SALUTATION_ABBR = /^(mfg|vg|lg|bg)[.,!]?$/i;
// Legal-disclaimer / company-footer markers at the start of a trimmed line.
const DISCLAIMER =
	/^(diese e-?mail|diese nachricht|vertraulichkeitshinweis|this e-?mail|this message contains|if you are not the intended|confidentiality|sitz der gesellschaft|handelsregister|registergericht|amtsgericht|geschäftsführer|ust-?id|steuernummer)/i;

// True when a line begins a signature/footer block: the "-- " delimiter, a
// closing salutation, or a disclaimer/company footer.
function isSignatureBoundary(line: string): boolean {
	const t = line.trim();
	if (t === "--") return true; // "--" or "-- " (trailing space trimmed)
	if (SALUTATION_ABBR.test(t)) return true;
	if (SALUTATION_PHRASE.test(t)) return true;
	if (DISCLAIMER.test(t)) return true;
	return false;
}

// Extracts the new content of a message body. Order:
//   1. Hard-cut markers ("-----Ursprüngliche Nachricht-----", German Outlook
//      "Von:/Gesendet:/An:/Betreff:" block) — everything below → quoted.
//   2. Apple Mail "Am … schrieb …:" attribution lines and ">"-prefixed quote
//      lines → quoted; any other line (incl. non-quoted inline replies) is kept
//      (under-trim rule).
//   3. Within the remaining new content, cut a signature/footer block at the
//      first boundary: "-- " delimiter, a closing salutation, or a disclaimer.
export function parseEmailBody(raw: string): ParsedEmail {
	const lines = raw.replace(/\r\n/g, "\n").split("\n");

	// 1. Earliest hard-cut marker.
	let cutIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (ORIGINAL_MESSAGE.test(lines[i])) {
			cutIdx = i;
			break;
		}
		if (
			/^Von:\s/.test(lines[i]) &&
			lines.slice(i + 1, i + 5).some((l) => OUTLOOK_HEADER_CONT.test(l))
		) {
			cutIdx = i;
			break;
		}
	}
	const quotedChunks: string[] = [];
	let working = lines;
	if (cutIdx !== -1) {
		quotedChunks.push(lines.slice(cutIdx).join("\n"));
		working = lines.slice(0, cutIdx);
	}

	// 2. Attribution + ">" quote lines → quoted; everything else → content.
	const contentLines: string[] = [];
	for (const line of working) {
		if (ATTRIBUTION.test(line) || line.startsWith(">")) {
			quotedChunks.push(line);
		} else {
			contentLines.push(line);
		}
	}

	// 3. Signature/footer cut within the new content.
	let signature = "";
	let bodyLines = contentLines;
	const sigIdx = contentLines.findIndex((l) => isSignatureBoundary(l));
	if (sigIdx !== -1) {
		signature = contentLines.slice(sigIdx).join("\n").trim();
		bodyLines = contentLines.slice(0, sigIdx);
	}

	return {
		body: bodyLines.join("\n").trim(),
		quoted: quotedChunks.join("\n").trim(),
		signature,
	};
}
