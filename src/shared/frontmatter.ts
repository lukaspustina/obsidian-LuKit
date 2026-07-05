// Frontmatter-Tags, die eine Notiz zur Ablage-Zielnotiz machen — genutzt von
// Besprechungs-/E-Mail-Filing und den Vorgang-Kommandos.
export const SECTION_NOTE_TAGS: ReadonlySet<string> = new Set(["Vorgang", "Person", "Bestellung", "Bewerbung"]);

// Mutates the frontmatter object in place to add the given tag (idempotent).
export function addTagToFrontmatter(fm: Record<string, unknown>, tag: string): void {
	const tags = fm.tags;
	if (tags === undefined || tags === null) {
		fm.tags = [tag];
		return;
	}
	if (typeof tags === "string") {
		if (tags !== tag) fm.tags = [tags, tag];
		return;
	}
	if (Array.isArray(tags) && !(tags as unknown[]).includes(tag)) {
		(tags as unknown[]).push(tag);
	}
}

export function frontmatterTagsInclude(tags: unknown, target: string | ReadonlySet<string>): boolean {
	const matches = typeof target === "string"
		? (t: unknown) => t === target
		: (t: unknown) => typeof t === "string" && target.has(t);
	if (typeof tags === "string") return matches(tags);
	if (Array.isArray(tags)) return (tags as unknown[]).some(matches);
	return false;
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

export function extractCreatedDate(content: string): Date | null {
	const match = /^created:\s*(.+)$/m.exec(content);
	if (!match) return null;
	// new Date() accepts ISO date strings from frontmatter; isNaN guards against invalid values
	const d = new Date(match[1].trim());
	return isNaN(d.getTime()) ? null : d;
}
