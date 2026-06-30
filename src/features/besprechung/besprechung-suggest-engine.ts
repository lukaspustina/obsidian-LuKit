// Pure ranker that suggests filing targets for a Besprechung from past
// `filed_into` history plus the besprechung's own title. No Obsidian imports —
// unit-testable on plain data.

export interface FiledRecord {
	rawTitle: string; // frontmatter `title`, else basename, of a past filed besprechung
	target: string; // resolved filed_into target basename (no path, no [[ ]], no alias, no .md)
	filedAt: number | null; // epoch ms; null when filed_at is absent/unparseable
}

export type SuggestionReason = "history" | "name-match" | "both";

export interface FilingSuggestion {
	target: string; // candidate note basename (no .md)
	score: number;
	reason: SuggestionReason;
}

export interface SuggestOptions {
	now: number; // epoch ms, for recency weighting
	maxSuggestions?: number; // default 3
	minScore?: number; // default 0.15
	selfNameStopwords?: string[]; // extra tokens to ignore (e.g. the note-owner's own name)
}

const DEFAULT_MAX_SUGGESTIONS = 3;
const DEFAULT_MIN_SCORE = 0.15;
const HISTORY_WEIGHT = 0.6;
const NAME_MATCH_WEIGHT = 0.4;
const RECENCY_HALF_LIFE_DAYS = 180;
const RECENCY_FLOOR = 0.25;
const MS_PER_DAY = 86_400_000;

const DEFAULT_STOPWORDS: ReadonlySet<string> = new Set([
	"mit",
	"zu",
	"und",
	"der",
	"die",
	"das",
	"am",
	"im",
	"vs",
	"call",
	"update",
	"abstimmung",
	"austausch",
	"status",
	"bi",
	"weekly",
]);

const SECTION_TYPE_PREFIX = /^(?:vorgang|person|bestellung|bewerbung)\s*-\s*/i;

export function normalizeTitleTokens(raw: string, extraStopwords?: ReadonlySet<string>): string[] {
	let text = raw.replace(/^besprechung\s*-\s*/i, "");
	while (/(?:,\s*\d{2}\.\d{2}\.\d{4})\s*$/.test(text)) {
		text = text.replace(/(?:,\s*\d{2}\.\d{2}\.\d{4})\s*$/, "");
	}
	return text
		.toLowerCase()
		.split(/[^a-z0-9äöüß]+/)
		.filter(
			(token) =>
				token.length > 1 &&
				!/^\d+$/.test(token) &&
				!DEFAULT_STOPWORDS.has(token) &&
				!(extraStopwords?.has(token) ?? false),
		);
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const token of a) {
		if (b.has(token)) intersection++;
	}
	const union = a.size + b.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

function recencyWeight(filedAt: number | null, now: number): number {
	if (filedAt === null) return RECENCY_FLOOR;
	const ageDays = Math.max(0, (now - filedAt) / MS_PER_DAY);
	const weight = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
	return Math.max(RECENCY_FLOOR, weight);
}

function nameMatchScore(
	candidateBasename: string,
	titleTokens: ReadonlySet<string>,
	extraStopwords: ReadonlySet<string>,
): number {
	const nameTokens = normalizeTitleTokens(candidateBasename.replace(SECTION_TYPE_PREFIX, ""), extraStopwords);
	if (nameTokens.length === 0) return 0;
	let present = 0;
	for (const token of nameTokens) {
		if (titleTokens.has(token)) present++;
	}
	return present / nameTokens.length;
}

export function suggestFilingTargets(
	candidateTitle: string,
	corpus: FiledRecord[],
	candidateBasenames: string[],
	options: SuggestOptions,
): FilingSuggestion[] {
	const maxSuggestions = options.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;
	const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

	const extraStopwords = new Set((options.selfNameStopwords ?? []).map((s) => s.toLowerCase()));
	const titleTokens = new Set(normalizeTitleTokens(candidateTitle, extraStopwords));

	// Summed, recency-weighted Jaccard per target.
	const historyByTarget = new Map<string, number>();
	for (const record of corpus) {
		const sim = jaccard(titleTokens, new Set(normalizeTitleTokens(record.rawTitle, extraStopwords)));
		if (sim === 0) continue;
		const contribution = sim * recencyWeight(record.filedAt, options.now);
		historyByTarget.set(record.target, (historyByTarget.get(record.target) ?? 0) + contribution);
	}

	let maxHistory = 0;
	for (const value of historyByTarget.values()) {
		if (value > maxHistory) maxHistory = value;
	}

	const scored = candidateBasenames.map((target) => {
		const summedHistory = historyByTarget.get(target) ?? 0;
		const normalizedHistory = maxHistory > 0 ? summedHistory / maxHistory : 0;
		const nameMatch = nameMatchScore(target, titleTokens, extraStopwords);
		const score = HISTORY_WEIGHT * normalizedHistory + NAME_MATCH_WEIGHT * nameMatch;
		const reason: SuggestionReason =
			summedHistory > 0 && nameMatch > 0
				? "both"
				: summedHistory > 0
					? "history"
					: "name-match";
		return { target, score, reason, summedHistory };
	});

	return scored
		.filter((s) => s.score >= minScore)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (b.summedHistory !== a.summedHistory) return b.summedHistory - a.summedHistory;
			return a.target < b.target ? -1 : a.target > b.target ? 1 : 0;
		})
		.slice(0, maxSuggestions)
		.map(({ target, score, reason }) => ({ target, score, reason }));
}
