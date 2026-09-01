import { extractDateFromTitle, formatDate } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";
import { extractWikilinkTarget } from "../../shared/note-structure";
import { NEXT_STEP_HEADERS } from "./vorgang-engine";

/** One filed source's action items, the unit that carries state. */
export interface IntakeGroup {
	/** Full text of the parent line, the mutation key (as ReminderItem.line is). */
	line: string;
	/** Wikilink target of the parent, e.g. "Besprechung Acme Kickoff" or "#E-Mail-Thread: …". */
	source: string;
	/** Due date from the parent's trailing segment; null means due now. */
	due: Date | null;
	/** Items the user owns, without indentation. */
	ownItems: IntakeItem[];
	/** Items behind "- Warte auf:", without indentation, in source order. */
	foreignItems: IntakeItem[];
	/** Index of the parent line in the note's line array. -1 for a group built by
	 *  buildIntakeGroup but not yet inserted or parsed from a note. */
	lineIndex: number;
}

/** One action item plus the lines nested underneath it. */
export interface IntakeItem {
	text: string;
	/** Further-indented lines belonging to this item, verbatim, relative indent preserved. */
	children: string[];
}

const INTAKE_BOUNDARY = "#### Unsortiert";
const WARTE_AUF = "- Warte auf:";
const ITEM_INDENT = "    ";
const FOREIGN_INDENT = "        ";
const FAKTEN_HEADER = "# Fakten und Pointer";
// parseIntakeGroups takes no locale — the note itself does not say which one it
// was written in, so a trailing date is accepted in any of the three formats.
// Same trick tocAlreadyLinks already uses for its date-suffixed link targets.
const DATE_LOCALES: readonly DateLocale[] = ["de", "en", "iso"];

function findNextStepsHeaderIndex(lines: string[]): number {
	for (const header of NEXT_STEP_HEADERS) {
		const idx = lines.findIndex((l) => l.trim() === header);
		if (idx !== -1) return idx;
	}
	return -1;
}

// The section's true end: the next h1-h3 heading, deliberately seeing past the
// "#### Unsortiert" h4 boundary that stops sliceSectionBody.
function sectionEndIndex(lines: string[], headerIndex: number): number {
	for (let i = headerIndex + 1; i < lines.length; i++) {
		if (/^#{1,3} /.test(lines[i])) return i;
	}
	return lines.length;
}

function findBoundaryIndex(lines: string[], headerIndex: number, endIndex: number): number {
	for (let i = headerIndex + 1; i < endIndex; i++) {
		if (lines[i].trim() === INTAKE_BOUNDARY) return i;
	}
	return -1;
}

// Index of the last non-empty line in (fromIndex, toIndex), falling back to
// fromIndex itself so a caller appending at +1 lands directly below the header
// or boundary when the range holds nothing but blanks.
function lastNonEmptyIndex(lines: string[], fromIndex: number, toIndex: number): number {
	let last = fromIndex;
	for (let i = fromIndex + 1; i < toIndex; i++) {
		if (lines[i].trim() !== "") last = i;
	}
	return last;
}

function findFrontmatterEndIndex(lines: string[]): number {
	if (lines[0] !== "---") return -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") return i;
	}
	return -1;
}

function indentWidth(line: string): number {
	return line.length - line.trimStart().length;
}

function stripBulletMarker(text: string): string {
	return /^[-*+] /.test(text) ? text.slice(2) : text;
}

// The due segment is whatever follows the parent's last "]]" — a comma and a
// date inside the anchor itself (e.g. "[[#E-Mail-Thread: Angebot, 01.09.2026]]")
// belong to the link, not to a snooze.
function splitDueSegment(line: string): { head: string; tail: string } {
	const linkEnd = line.lastIndexOf("]]");
	if (linkEnd === -1) return { head: "", tail: line };
	return { head: line.slice(0, linkEnd + 2), tail: line.slice(linkEnd + 2) };
}

function parseDue(line: string): Date | null {
	const { tail } = splitDueSegment(line);
	for (const locale of DATE_LOCALES) {
		const date = extractDateFromTitle(tail, locale);
		if (date !== null) return date;
	}
	return null;
}

function stripDue(line: string): string {
	const { head, tail } = splitDueSegment(line);
	for (const locale of DATE_LOCALES) {
		if (extractDateFromTitle(tail, locale) === null) continue;
		// Split on the comma alone, not ", ": extractDateFromTitle normalises
		// invisible spaces (NBSP & co., pasted from PDFs or substituted by macOS)
		// before matching, so it accepts separators a ", " search cannot find.
		// Searching for ", " here would return -1, and slice(0, -1) would amputate
		// the line's last character while leaving the old date in place.
		const lastComma = tail.lastIndexOf(",");
		if (lastComma === -1) break;
		return head + tail.slice(0, lastComma);
	}
	return head + tail;
}

// The boundary index, or -1 when the note lost the section or the boundary
// between the read and the write.
function findIntakeBoundary(lines: string[]): number {
	const headerIndex = findNextStepsHeaderIndex(lines);
	if (headerIndex === -1) return -1;
	return findBoundaryIndex(lines, headerIndex, sectionEndIndex(lines, headerIndex));
}

// Locates the group's parent line strictly below the boundary. The search must
// be scoped: the curated part may hold a byte-identical line (a group taken over
// by hand), and two threads with the same subject filed on the same day produce
// byte-identical anchors. An unscoped indexOf would resolve above the boundary
// or onto a sibling group, while the splice arithmetic assumes the hit lies
// below — destroying the other group's lines and reporting success. Prefers the
// parsed lineIndex when it still holds, so duplicates resolve to the group the
// caller actually meant.
//
// When lineIndex has gone stale — an earlier stop in the same walk shifted the
// lines — the parent line alone no longer identifies the group: an email anchor
// is subject plus date, so two same-subject threads filed the same day carry
// byte-identical parents. Falling back to the first match then moves one group's
// items while splicing away another's. So the fallback disambiguates by the
// group's items, and gives up rather than guess when several still match.
function findParentIndex(lines: string[], group: IntakeGroup, boundaryIndex: number): number {
	if (group.lineIndex > boundaryIndex && lines[group.lineIndex] === group.line) return group.lineIndex;

	const candidates: number[] = [];
	for (let i = boundaryIndex + 1; i < lines.length; i++) {
		if (lines[i] === group.line) candidates.push(i);
	}
	if (candidates.length <= 1) return candidates[0] ?? -1;

	const wanted = itemTexts(group);
	const matches = candidates.filter((i) => {
		const block = lines.slice(i, groupRangeEnd(lines, i));
		return sameItems(itemTextsFromLines(block), wanted);
	});
	// Ambiguous beyond the items too: the groups are indistinguishable, and a
	// wrong pick loses a sibling's lines. Not-found is the safe answer — the
	// walk reports it and keeps the stop.
	return matches.length === 1 ? matches[0] : -1;
}

function itemTexts(group: IntakeGroup): string[] {
	return [...group.ownItems, ...group.foreignItems].map((i) => i.text);
}

function itemTextsFromLines(block: string[]): string[] {
	const texts: string[] = [];
	for (const line of block.slice(1)) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed === WARTE_AUF) continue;
		const indent = line.length - line.trimStart().length;
		if (indent === 4 || indent === 8) texts.push(stripBulletMarker(trimmed));
	}
	return texts;
}

function sameItems(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((text, i) => text === b[i]);
}

// The group's lines as written: the parent, the own items, then the foreign
// items behind their separator. An empty foreignItems writes no separator, so a
// hand-emptied "- Warte auf:" never comes back on a rewrite.
function renderGroup(group: IntakeGroup): string[] {
	const block = [group.line];
	for (const item of group.ownItems) {
		block.push(`${ITEM_INDENT}- ${item.text}`, ...item.children.map((c) => `${ITEM_INDENT}${c}`));
	}
	if (group.foreignItems.length > 0) {
		block.push(`${ITEM_INDENT}${WARTE_AUF}`);
		for (const item of group.foreignItems) {
			block.push(`${FOREIGN_INDENT}- ${item.text}`, ...item.children.map((c) => `${FOREIGN_INDENT}${c}`));
		}
	}
	return block;
}

// End (exclusive) of the group opened at parentIndex: every following blank or
// indented line belongs to it, but trailing blanks stay behind so the blank
// separating the group from the next one survives its removal.
function groupRangeEnd(lines: string[], parentIndex: number): number {
	let end = parentIndex + 1;
	let lastContent = parentIndex + 1;
	while (end < lines.length) {
		const line = lines[end];
		if (line.trim() === "") {
			end++;
			continue;
		}
		if (indentWidth(line) === 0) break;
		end++;
		lastContent = end;
	}
	return lastContent;
}

// Inserts a block, adding a blank line on either side only where the
// surrounding content would otherwise run into it.
function spliceWithSpacing(lines: string[], atIndex: number, block: string[]): void {
	const needLeading = atIndex > 0 && lines[atIndex - 1].trim() !== "";
	const needTrailing = atIndex < lines.length && lines[atIndex].trim() !== "";
	const segment = [...(needLeading ? [""] : []), ...block, ...(needTrailing ? [""] : [])];
	lines.splice(atIndex, 0, ...segment);
}

// Where a missing "# Nächste Schritte" is created: after the Fakten section's
// content, else before the note's first heading of any level, else at the end —
// a Vorgang-tagged note that never went through ensureVorgangSkeleton must not
// lose its action items.
//
// Never directly after the frontmatter when a body follows: the intake region
// closes only at the next h1-h3, so a body placed below the new heading would
// sit INSIDE the intake, parse as bogus groups, and be deleted by a discard.
// Putting the section before the first heading — or after everything, when the
// note has none — keeps existing content outside the region either way.
function newSectionIndex(lines: string[]): number {
	const faktenIndex = lines.findIndex((l) => l.trim() === FAKTEN_HEADER);
	if (faktenIndex !== -1) {
		for (let i = faktenIndex + 1; i < lines.length; i++) {
			if (/^#{1,5} /.test(lines[i])) return i;
		}
		return lines.length;
	}
	const fmEnd = findFrontmatterEndIndex(lines);
	for (let i = fmEnd + 1; i < lines.length; i++) {
		if (/^#{1,5} /.test(lines[i])) return i;
	}
	return lines.length;
}

/**
 * Returns the full body of the "# Nächste Schritte" section (either spelling,
 * via NEXT_STEP_HEADERS), from just after the header to the next heading
 * matching `^#{1,3} ` or end of note — curated part, boundary and intake
 * together. Unlike sliceSectionBody, does not stop at the "#### Unsortiert" h4
 * boundary. Returns [] when neither spelling of the header is present.
 */
export function extractNextStepsBody(content: string): string[] {
	const lines = content.split("\n");
	const headerIndex = findNextStepsHeaderIndex(lines);
	if (headerIndex === -1) return [];
	return lines.slice(headerIndex + 1, sectionEndIndex(lines, headerIndex));
}

/**
 * Builds one group from raw item lines: top-level entries at indent 0, each
 * optionally followed by its own further-indented continuation lines. A
 * top-level entry may or may not carry a bullet marker — extractSection yields
 * "- Angebot einholen", the email preview yields whatever the user typed — so
 * "- ", "* " and "+ " are stripped and IntakeItem.text is always bare.
 * An item whose text opens with "<name>: " for a name outside ownNames is
 * foreign; everything else, prefix or none, is the user's own. An empty
 * ownNames turns detection off rather than making everything foreign: without
 * configured names there is nothing to tell an assignee from ordinary prose,
 * and "Angebot: bis Freitag prüfen" is not a person. That is also what the
 * setting's own description promises.
 */
export function buildIntakeGroup(itemLines: string[], source: string, ownNames: string[]): IntakeGroup {
	const ownItems: IntakeItem[] = [];
	const foreignItems: IntakeItem[] = [];
	let current: IntakeItem | null = null;

	for (const raw of itemLines) {
		if (raw.trim() === "") continue;
		if (indentWidth(raw) > 0) {
			if (current !== null) current.children.push(raw);
			continue;
		}
		const text = stripBulletMarker(raw.trim());
		current = { text, children: [] };
		const assignee = ownNames.length === 0 ? null : /^([^:]+): /.exec(text);
		const foreign = assignee !== null && !ownNames.includes(assignee[1]);
		(foreign ? foreignItems : ownItems).push(current);
	}

	return { line: `- Aus [[${source}]]`, source, due: null, ownItems, foreignItems, lineIndex: -1 };
}

/**
 * Appends group below the note's "#### Unsortiert" boundary, after the last
 * existing group. Creates "# Nächste Schritte" and/or the boundary first when
 * either is missing. Writes the group unconditionally, including a zero-item
 * one; callers that must skip an empty group check before calling.
 */
export function insertIntakeGroup(content: string, group: IntakeGroup): string {
	const lines = content.split("\n");
	const block = renderGroup(group);

	const headerIndex = findNextStepsHeaderIndex(lines);
	if (headerIndex === -1) {
		spliceWithSpacing(lines, newSectionIndex(lines), [NEXT_STEP_HEADERS[0], INTAKE_BOUNDARY, ...block]);
		return lines.join("\n");
	}

	const endIndex = sectionEndIndex(lines, headerIndex);
	const boundaryIndex = findBoundaryIndex(lines, headerIndex, endIndex);
	if (boundaryIndex === -1) {
		const createAt = lastNonEmptyIndex(lines, headerIndex, endIndex) + 1;
		lines.splice(createAt, 0, INTAKE_BOUNDARY, ...block);
		return lines.join("\n");
	}

	lines.splice(lastNonEmptyIndex(lines, boundaryIndex, endIndex) + 1, 0, ...block);
	return lines.join("\n");
}

/**
 * Parses every group in the note's intake region into IntakeGroup[], in note
 * order (oldest first). Any line at indent 0 opens a new group; blank lines
 * belong to none; a "- Warte auf:" without indented lines beneath it yields
 * foreignItems: []. Not used for merge carryover, which splices raw lines.
 */
export function parseIntakeGroups(content: string): IntakeGroup[] {
	const lines = content.split("\n");
	const headerIndex = findNextStepsHeaderIndex(lines);
	if (headerIndex === -1) return [];
	const endIndex = sectionEndIndex(lines, headerIndex);
	const boundaryIndex = findBoundaryIndex(lines, headerIndex, endIndex);
	if (boundaryIndex === -1) return [];

	const groups: IntakeGroup[] = [];
	let group: IntakeGroup | null = null;
	let waiting = false;
	let item: IntakeItem | null = null;

	for (let i = boundaryIndex + 1; i < endIndex; i++) {
		const line = lines[i];
		if (line.trim() === "") continue;

		if (indentWidth(line) === 0) {
			group = {
				line,
				source: extractWikilinkTarget(line) ?? "",
				due: parseDue(line),
				ownItems: [],
				foreignItems: [],
				lineIndex: i,
			};
			groups.push(group);
			waiting = false;
			item = null;
			continue;
		}
		// An indented line before any parent has no group to belong to.
		if (group === null) continue;

		if (line.trim() === WARTE_AUF) {
			waiting = true;
			item = null;
			continue;
		}

		const base = waiting ? FOREIGN_INDENT.length : ITEM_INDENT.length;
		if (item !== null && indentWidth(line) > base) {
			item.children.push(line.slice(base));
			continue;
		}
		item = { text: stripBulletMarker(line.trim()), children: [] };
		(waiting ? group.foreignItems : group.ownItems).push(item);
	}

	return groups;
}

/**
 * Moves every item of group (own and foreign, in that order) above the
 * boundary as top-level bullets appended to the curated part, dropping the
 * "- Warte auf:" separator; then removes the group's whole line range. With
 * selectedIndices, only the items at those indices (own first, then foreign,
 * 0-based) move — the rest go with the group, which is always removed.
 * Returns null, without modifying content, when group.line is no longer
 * present — mirrors removeReminderLine's not-found contract.
 */
export function takeOverGroup(
	content: string,
	group: IntakeGroup,
	selectedIndices?: number[],
): { newContent: string } | null {
	const lines = content.split("\n");
	const headerIndex = findNextStepsHeaderIndex(lines);
	const boundaryIndex =
		headerIndex === -1 ? -1 : findBoundaryIndex(lines, headerIndex, sectionEndIndex(lines, headerIndex));
	// A parsed group always sits below a boundary; a note that lost the
	// structure between read and write is the same failure as a lost line.
	if (boundaryIndex === -1) return null;

	const parentIndex = findParentIndex(lines, group, boundaryIndex);
	if (parentIndex === -1) return null;

	const items = [...group.ownItems, ...group.foreignItems];
	const moved = selectedIndices === undefined ? items : items.filter((_, i) => selectedIndices.includes(i));
	const movedLines = moved.flatMap((item) => [`- ${item.text}`, ...item.children]);

	const rangeEnd = groupRangeEnd(lines, parentIndex);
	// The curated part sits above the boundary, hence above the group: insert
	// first, then remove the group at its shifted position.
	lines.splice(lastNonEmptyIndex(lines, headerIndex, boundaryIndex) + 1, 0, ...movedLines);
	lines.splice(parentIndex + movedLines.length, rangeEnd - parentIndex);
	return { newContent: lines.join("\n") };
}

/**
 * Removes group's parent line and all of its sub-bullets; moves nothing.
 * Returns null, without modifying content, when group.line is no longer
 * present.
 */
export function dropGroup(content: string, group: IntakeGroup): { newContent: string } | null {
	const lines = content.split("\n");
	const boundaryIndex = findIntakeBoundary(lines);
	if (boundaryIndex === -1) return null;
	const parentIndex = findParentIndex(lines, group, boundaryIndex);
	if (parentIndex === -1) return null;
	lines.splice(parentIndex, groupRangeEnd(lines, parentIndex) - parentIndex);
	return { newContent: lines.join("\n") };
}

/**
 * Rewrites group's parent line with due as its new trailing comma-separated
 * date segment, replacing any prior one; sub-bullets are untouched. Returns
 * null, without modifying content, when group.line is no longer present.
 */
export function snoozeGroup(
	content: string,
	group: IntakeGroup,
	due: Date,
	locale: DateLocale,
): { newContent: string } | null {
	const lines = content.split("\n");
	const boundaryIndex = findIntakeBoundary(lines);
	if (boundaryIndex === -1) return null;
	const index = findParentIndex(lines, group, boundaryIndex);
	if (index === -1) return null;
	lines[index] = `${stripDue(group.line)}, ${formatDate(due, locale)}`;
	return { newContent: lines.join("\n") };
}
