export function extractCreatedDate(content: string): Date | null {
	const match = /^created:\s*(.+)$/m.exec(content);
	if (!match) return null;
	// new Date() accepts ISO date strings from frontmatter; isNaN guards against invalid values
	const d = new Date(match[1].trim());
	return isNaN(d.getTime()) ? null : d;
}

export function extractSection(content: string, heading: string, bulletsOnly = false): string | null {
	const lines = content.split("\n");
	const target = `### ${heading}`;

	let startIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === target) {
			startIdx = i + 1;
			break;
		}
	}

	if (startIdx === -1) {
		return null;
	}

	let endIdx = lines.length;
	for (let i = startIdx; i < lines.length; i++) {
		if (/^#{1,3} /.test(lines[i])) {
			endIdx = i;
			break;
		}
		if (bulletsOnly && lines[i].trim() !== "" && !lines[i].startsWith("- ")) {
			endIdx = i;
			break;
		}
	}

	const body = lines.slice(startIdx, endIdx);

	let start = 0;
	let end = body.length;
	while (start < end && body[start].trim() === "") start++;
	while (end > start && body[end - 1].trim() === "") end--;

	if (start >= end) {
		return null;
	}

	return body.slice(start, end).join("\n");
}

function removeBlankAdjacentToLabel(body: string): string {
	const lines = body.split("\n");
	const result: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const prev = result[result.length - 1];
		const next = lines[i + 1];
		const isBlank = line.trim() === "";
		const isLabel = (s: string | undefined) => s !== undefined && s.trim() !== "" && !s.startsWith("- ");
		if (isBlank && (isLabel(prev) || isLabel(next))) {
			continue;
		}
		result.push(line);
	}
	return result.join("\n");
}

export function frontmatterTagsInclude(tags: unknown, target: string | ReadonlySet<string>): boolean {
	const matches = typeof target === "string"
		? (t: unknown) => t === target
		: (t: unknown) => typeof t === "string" && target.has(t);
	if (typeof tags === "string") return matches(tags);
	if (Array.isArray(tags)) return (tags as unknown[]).some(matches);
	return false;
}

// Records the filing target on the besprechung's frontmatter so future
// automation can learn the user's filing patterns from a structured corpus.
export function markFiledInFrontmatter(
	fm: Record<string, unknown>,
	vorgangBasename: string,
	when: Date,
): void {
	fm.filed_into = `[[${vorgangBasename}]]`;
	fm.filed_at = when.toISOString();
}

// Mutates the frontmatter object in place to remove the given tag.
export function removeTagFromFrontmatter(fm: Record<string, unknown>, tag: string): void {
	const tags = fm.tags;
	if (typeof tags === "string") {
		if (tags === tag) delete fm.tags;
		return;
	}
	if (Array.isArray(tags)) {
		const filtered = (tags as unknown[]).filter((t) => t !== tag);
		if (filtered.length === 0) {
			delete fm.tags;
		} else {
			fm.tags = filtered;
		}
	}
}

export function formatBesprechungSummary(
	content: string,
	sectionHeadings: string[] = ["Nächste Schritte", "Zusammenfassung"],
): string | null {
	const parts: string[] = [];

	for (const heading of sectionHeadings) {
		const body = extractSection(content, heading);
		if (body) {
			parts.push(`**${heading}**\n${removeBlankAdjacentToLabel(body)}`);
		}
	}

	if (parts.length === 0) {
		return null;
	}

	return parts.join("\n\n");
}
