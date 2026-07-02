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

function parseIsoDate(iso: string): Date {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d);
}

function toIso(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
	const dt = parseIsoDate(iso);
	dt.setDate(dt.getDate() + days);
	return toIso(dt);
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

function firstH5Section(body: string): string {
	const lines = body.split("\n");
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		if (/^##### /.test(lines[i])) {
			start = i;
			break;
		}
	}
	if (start === -1) return "";

	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^#{1,5} /.test(lines[i])) {
			end = i;
			break;
		}
	}
	return lines.slice(start, end).join("\n").trimEnd();
}

export function buildTriagePreview(content: string): string {
	const stripped = stripFrontmatter(content);
	const fakten = extractSection(stripped, "Fakten und Pointer");

	if (fakten === null) {
		return stripped;
	}

	const h5 = firstH5Section(stripped);
	if (h5 === "") {
		return `# Fakten und Pointer\n${fakten}`;
	}
	return `# Fakten und Pointer\n${fakten}\n\n${h5}`;
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
