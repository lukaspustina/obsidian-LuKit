export interface ParsedEmail {
	/** New text only — quoted history and signature removed. Empty string when nothing remains. */
	body: string;
	/** Removed quoted block (diagnostic; not surfaced to callers in v1). */
	quoted: string;
	/** Removed signature block (diagnostic; not surfaced to callers in v1). */
	signature: string;
}

// Apple Mail attribution line, e.g. "Am 01.06.2026 um 10:00 schrieb Max:".
const ATTRIBUTION = /^Am\s.+\bschrieb\b.*:\s*$/;
// "-----Ursprüngliche Nachricht-----" separator (Outlook reply/forward).
const ORIGINAL_MESSAGE = /^-+\s*Ursprüngliche Nachricht\s*-+/;
// Continuation lines of the German Outlook header block.
const OUTLOOK_HEADER_CONT = /^(Gesendet|An|Betreff):/;

// Extracts the new content of a message body. Heuristic priority order:
//   1. Cut at the first "-- " signature delimiter (everything below → signature).
//   2. Cut at "-----Ursprüngliche Nachricht-----" (everything below → quoted).
//   3. Cut at the German Outlook "Von:/Gesendet:/An:/Betreff:" header block.
//   4. Move Apple Mail "Am … schrieb …:" attribution lines and ">"-prefixed
//      quote lines to quoted.
//   5. Under-trim rule: any other line (incl. non-quoted inline-reply text) is
//      kept in body.
export function parseEmailBody(raw: string): ParsedEmail {
	const lines = raw.replace(/\r\n/g, "\n").split("\n");

	// 1. Signature delimiter "-- " (dash dash space; "--" tolerated).
	let signature = "";
	let working = lines;
	const sigIdx = lines.findIndex((l) => l === "-- " || l === "--");
	if (sigIdx !== -1) {
		signature = lines.slice(sigIdx).join("\n");
		working = lines.slice(0, sigIdx);
	}

	// 2 & 3. Earliest hard-cut marker: Ursprüngliche Nachricht / Outlook header block.
	let cutIdx = -1;
	for (let i = 0; i < working.length; i++) {
		if (ORIGINAL_MESSAGE.test(working[i])) {
			cutIdx = i;
			break;
		}
		if (
			/^Von:\s/.test(working[i]) &&
			working.slice(i + 1, i + 5).some((l) => OUTLOOK_HEADER_CONT.test(l))
		) {
			cutIdx = i;
			break;
		}
	}
	const quotedChunks: string[] = [];
	if (cutIdx !== -1) {
		quotedChunks.push(working.slice(cutIdx).join("\n"));
		working = working.slice(0, cutIdx);
	}

	// 4 & 5. Attribution + ">" quote lines → quoted; everything else → body.
	const bodyLines: string[] = [];
	for (const line of working) {
		if (ATTRIBUTION.test(line) || line.startsWith(">")) {
			quotedChunks.push(line);
		} else {
			bodyLines.push(line);
		}
	}

	return {
		body: bodyLines.join("\n").trim(),
		quoted: quotedChunks.join("\n").trim(),
		signature,
	};
}
