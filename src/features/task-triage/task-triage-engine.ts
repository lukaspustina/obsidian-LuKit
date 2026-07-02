import { formatDate, parseDateString } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";
import { extractSection } from "../besprechung/besprechung-engine";

export interface TriageTask {
	path: string;
	title: string;
	isCompleted: boolean;
	due?: string; // YYYY-MM-DD
	scheduled?: string; // YYYY-MM-DD
	priority?: string;
	contexts: string[];
	projects: string[]; // raw wikilink strings, e.g. "[[Name]]" or "[[Name|Alias]]"
	isRecurring: boolean;
	completeInstances: string[];
	skippedInstances: string[];
}

export type SnoozeKind = "tomorrow" | "week" | "nextMonday";

export interface TriageSummary {
	completed: number;
	snoozed: number;
	instancesSkipped: number;
	skipped: number;
	remaining: number;
}

// All triage dates are YYYY-MM-DD by the bridge's normalization contract;
// anything else is a programming error, so fail fast instead of NaN-math.
export function parseIsoDate(iso: string): Date {
	const parsed = parseDateString(iso, "iso");
	if (parsed === null) {
		throw new Error("invalid-iso-date");
	}
	return parsed;
}

function addDays(iso: string, days: number): string {
	const dt = parseIsoDate(iso);
	dt.setDate(dt.getDate() + days);
	return formatDate(dt, "iso");
}

function daysBetween(fromIso: string, toIsoStr: string): number {
	const ms = parseIsoDate(toIsoStr).getTime() - parseIsoDate(fromIso).getTime();
	return Math.round(ms / 86_400_000);
}

function cmpDate(a: string | undefined, b: string | undefined): number {
	if (a === b) return 0;
	if (a === undefined) return 1;
	if (b === undefined) return -1;
	return a < b ? -1 : 1;
}

function isTriageCandidate(task: TriageTask, today: string): boolean {
	const dateGate = (task.due !== undefined && task.due <= today) || (task.scheduled !== undefined && task.scheduled <= today);
	if (!dateGate) return false;

	if (task.isRecurring) {
		if (task.completeInstances.includes(today)) return false;
		if (task.skippedInstances.includes(today)) return false;
		return true;
	}

	return !task.isCompleted;
}

export function selectTriageTasks(tasks: TriageTask[], today: string): TriageTask[] {
	return tasks
		.filter((task) => isTriageCandidate(task, today))
		.slice()
		.sort((x, y) => cmpDate(x.scheduled, y.scheduled) || cmpDate(x.due, y.due));
}

export function snoozeDate(kind: SnoozeKind, today: string): string {
	if (kind === "tomorrow") return addDays(today, 1);
	if (kind === "week") return addDays(today, 7);

	const dow = parseIsoDate(today).getDay();
	let delta = (8 - dow) % 7;
	if (delta === 0) delta = 7;
	return addDays(today, delta);
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function stripFrontmatter(text: string): string {
	return text.replace(FRONTMATTER, "");
}

// Vorgang h5 sections are stored newest-first; show the newest few so the
// preview reveals what happened last and what the next steps are.
const VORGANG_PREVIEW_SECTIONS = 3;

function newestH5Sections(body: string, count: number): string {
	const lines = body.split("\n");
	const sections: string[] = [];
	let start = -1;

	for (let i = 0; i < lines.length && sections.length < count; i++) {
		if (start === -1) {
			if (/^##### /.test(lines[i])) start = i;
			continue;
		}
		if (/^#{1,5} /.test(lines[i])) {
			sections.push(lines.slice(start, i).join("\n").trimEnd());
			start = /^##### /.test(lines[i]) ? i : -1;
		}
	}
	if (start !== -1 && sections.length < count) {
		sections.push(lines.slice(start).join("\n").trimEnd());
	}
	return sections.join("\n\n");
}

const FAKTEN_HEADING = /^# Fakten und Pointer\s*$/;

// The body after the Fakten h1 section (from the next h1 on), so the h5 scan
// never re-counts h5 headings that live inside the Fakten section itself.
function bodyAfterFakten(lines: string[], faktenIdx: number): string {
	for (let i = faktenIdx + 1; i < lines.length; i++) {
		if (/^# /.test(lines[i])) {
			return lines.slice(i).join("\n");
		}
	}
	return "";
}

export function buildTriagePreview(content: string): string {
	const stripped = stripFrontmatter(content);
	const lines = stripped.split("\n");
	const faktenIdx = lines.findIndex((line) => FAKTEN_HEADING.test(line));

	// Detect Vorgang-ness by the heading itself — extractSection returns null
	// for an empty-bodied section too, which must still get the trimmed view.
	if (faktenIdx === -1) {
		return stripped;
	}

	const fakten = extractSection(stripped, "Fakten und Pointer");
	const head = fakten === null ? "# Fakten und Pointer" : `# Fakten und Pointer\n${fakten}`;
	const h5 = newestH5Sections(bodyAfterFakten(lines, faktenIdx), VORGANG_PREVIEW_SECTIONS);
	if (h5 === "") {
		return head;
	}
	return `${head}\n\n${h5}`;
}

export function overdueLabel(task: TriageTask, today: string, locale: DateLocale): string {
	let source: string | undefined;
	if (task.due !== undefined && task.due <= today) {
		source = task.due;
	} else if (task.scheduled !== undefined && task.scheduled <= today) {
		source = task.scheduled;
	}

	if (source === undefined) return "";

	const n = daysBetween(source, today);
	if (n <= 0) return "";

	return locale === "de" ? `${n}d überfällig` : `${n}d overdue`;
}

const WIKILINK = /^\[\[([^\]]+)\]\]$/;

export function formatProjectLink(raw: string): string {
	const match = WIKILINK.exec(raw.trim());
	if (match === null) return raw;

	const inner = match[1];
	const pipeIdx = inner.lastIndexOf("|");
	if (pipeIdx === -1) return inner.trim();
	return inner.slice(pipeIdx + 1).trim();
}
