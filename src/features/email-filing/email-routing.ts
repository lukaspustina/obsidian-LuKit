import type { FiledRecord } from "../besprechung/besprechung-suggest-engine";

/** 24 hours in milliseconds. */
export const ROUTING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface MinedFiling {
	/** Sender from an "E-Mail von <sender>" heading; "" for "E-Mail-Thread" headings. */
	correspondent: string;
	/** Stripped subject from the section heading. */
	subject: string;
	/** Basename of the Vorgang note this heading was found in. */
	target: string;
}

// Matches the h5 headings produced by formatEmailSection / formatThreadSection,
// each followed by ", <date>" (sanitizeSenderSubject strips commas from sender
// and subject, so the only ", <date>" is the trailing date group).
const EMAIL_VON_HEADING = /^#####\s+E-Mail von (.+?): (.+), [\d./-]{8,10}$/;
const EMAIL_THREAD_HEADING = /^#####\s+E-Mail-Thread: (.+), [\d./-]{8,10}$/;

// Parses one section note's content for prior email filings (the h5 headings).
// Returns one MinedFiling per matching heading, targeting `basename`.
export function mineVorgangFilings(content: string, basename: string): MinedFiling[] {
	const filings: MinedFiling[] = [];
	for (const line of content.split("\n")) {
		const von = EMAIL_VON_HEADING.exec(line);
		if (von) {
			filings.push({ correspondent: von[1].trim(), subject: von[2].trim(), target: basename });
			continue;
		}
		const thread = EMAIL_THREAD_HEADING.exec(line);
		if (thread) {
			filings.push({ correspondent: "", subject: thread[1].trim(), target: basename });
		}
	}
	return filings;
}

// Converts mined filings to FiledRecord[] for suggestFilingTargets. rawTitle is
// the subject (present in both heading forms); the correspondent, when present,
// is appended to mirror the live title `${subject} ${sender}`. filedAt is null
// (recency unknown — mined headings carry a date but it is not the filing time).
export function minedFilingsToFiledRecords(filings: MinedFiling[]): FiledRecord[] {
	return filings.map((f) => ({
		rawTitle: f.correspondent ? `${f.subject} ${f.correspondent}` : f.subject,
		target: f.target,
		filedAt: null,
	}));
}

// True when the routing cache should be rebuilt: no cache, or older than the TTL.
export function isCacheStale(builtAt: string | undefined, now: number): boolean {
	if (builtAt === undefined) return true;
	const built = new Date(builtAt).getTime();
	if (Number.isNaN(built)) return true;
	return now - built > ROUTING_CACHE_TTL_MS;
}
