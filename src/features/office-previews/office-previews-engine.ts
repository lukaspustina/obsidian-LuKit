// Pure logic for Office previews: path mapping, format choice, folder
// normalization, the ownership marker inside PNG/JPEG images, fingerprinting,
// jitter, and the drop-embed helpers. No Obsidian imports.

export const RENDER_TIMEOUT_MS = 20_000;
export const JITTER_MIN_MS = 30_000;
export const JITTER_MAX_MS = 120_000;
export const RECONCILE_DELAY_MS = 120_000;
export const MODIFY_DEBOUNCE_MS = 5_000;
export const CACHE_FLUSH_MS = 5_000;
export const DROP_WINDOW_MS = 10_000;
export const DROP_EMBED_DEADLINE_MS = 60_000;
export const RENDER_LONGEST_EDGE = 1200;
export const JPEG_QUALITY = 80;
export const DEFAULT_PREVIEW_FOLDER = "_previews";

export const SUPPORTED_EXTENSIONS: readonly string[] = [
	"docx", "doc", "xlsx", "xls", "pptx", "ppt",
	"pages", "numbers", "key", "odt",
];

// ods/odp were dropped (operator decision 2026-10-02): Quick Look hangs on them.
const PRESENTATION_EXTENSIONS: readonly string[] = ["pptx", "ppt", "key"];

export type ImageExt = "png" | "jpg";

export interface PreviewMarker {
	version: 1;
	sha256: string;
	/** Set on the "no preview available" image written when rendering failed. */
	placeholder?: true;
}

export interface CacheEntry { mtime: number; size: number; sha256: string }

export interface FailureEntry {
	sha256: string;
	reason: "timeout" | "exit" | "no-output" | "write" | "collision";
	at: string;
}

export interface InsertionPlan { lineIndex: number; replacement: string }

export interface DropRecord { notePath: string; names: string[]; at: number }

// --- paths ------------------------------------------------------------------

function extensionOf(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isSource(path: string, previewFolder: string): boolean {
	if (path === previewFolder || path.startsWith(previewFolder + "/")) return false;
	// Lock files an open document leaves beside itself: Word `~$name.docx`,
	// LibreOffice `.~lock.name#`. They carry an Office extension but no document.
	const name = path.slice(path.lastIndexOf("/") + 1);
	if (name.startsWith("~$") || name.startsWith(".~lock.")) return false;
	return SUPPORTED_EXTENSIONS.includes(extensionOf(path));
}

export function imageExtFor(sourcePath: string): ImageExt {
	return PRESENTATION_EXTENSIONS.includes(extensionOf(sourcePath)) ? "jpg" : "png";
}

export function mirrorPath(sourcePath: string, previewFolder: string): string {
	return `${previewFolder}/${sourcePath}.${imageExtFor(sourcePath)}`;
}

/** The source a preview image belongs to, or null when `path` is not a preview. */
export function sourceForPreview(path: string, previewFolder: string): string | null {
	if (!path.startsWith(previewFolder + "/")) return null;
	const m = /^(.*)\.(png|jpg)$/.exec(path.slice(previewFolder.length + 1));
	if (m === null || !isSource(m[1], previewFolder) || imageExtFor(m[1]) !== m[2]) return null;
	return m[1];
}

export function normalizePreviewFolder(value: string): string {
	const collapsed = value.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
	if (collapsed === "") return DEFAULT_PREVIEW_FOLDER;
	const segments = collapsed.split("/");
	// Obsidian never indexes a dot-folder, so previews written there would never become TFiles.
	if (segments.some((seg) => seg === ".." || seg.startsWith("."))) return DEFAULT_PREVIEW_FOLDER;
	return collapsed;
}

// --- marker -----------------------------------------------------------------

const MARKER_KEYWORD = "lukit-preview";
const JPEG_COM_PREFIX = MARKER_KEYWORD + "=";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function encodeMarker(m: PreviewMarker): string {
	return JSON.stringify(m.placeholder === true ? { version: m.version, sha256: m.sha256, placeholder: true } : { version: m.version, sha256: m.sha256 });
}

export function decodeMarker(s: string): PreviewMarker | null {
	try {
		const parsed: unknown = JSON.parse(s);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { version, sha256, placeholder } = parsed as Record<string, unknown>;
		if (version !== 1 || typeof sha256 !== "string") return null;
		return placeholder === true ? { version: 1, sha256, placeholder: true } : { version: 1, sha256 };
	} catch {
		return null;
	}
}

const CRC_TABLE: Uint32Array = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function asciiBytes(s: string): Uint8Array {
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
	return out;
}

function asciiString(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return s;
}

function readU32(bytes: Uint8Array, pos: number): number {
	return ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
	return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function isJpeg(bytes: Uint8Array): boolean {
	return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

/** Inserts a `tEXt` chunk carrying the marker directly after IHDR. */
export function writeMarkerPng(png: Uint8Array, m: PreviewMarker): Uint8Array {
	const ihdrEnd = 8 + 12 + readU32(png, 8);
	const typeAndData = asciiBytes(`tEXt${MARKER_KEYWORD}\0${encodeMarker(m)}`);
	const len = typeAndData.length - 4;
	const header = new Uint8Array([len >>> 24, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff]);
	const crc = crc32(typeAndData);
	const trailer = new Uint8Array([crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff]);
	return concatBytes(png.subarray(0, ihdrEnd), header, typeAndData, trailer, png.subarray(ihdrEnd));
}

/** Inserts a COM segment after all consecutive leading APPn segments. */
export function writeMarkerJpeg(jpeg: Uint8Array, m: PreviewMarker): Uint8Array {
	let pos = 2;
	while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff && jpeg[pos + 1] >= 0xe0 && jpeg[pos + 1] <= 0xef) {
		pos += 2 + ((jpeg[pos + 2] << 8) | jpeg[pos + 3]);
	}
	const payload = asciiBytes(JPEG_COM_PREFIX + encodeMarker(m));
	const len = payload.length + 2;
	const head = new Uint8Array([0xff, 0xfe, len >> 8, len & 0xff]);
	return concatBytes(jpeg.subarray(0, pos), head, payload, jpeg.subarray(pos));
}

function readPngMarker(bytes: Uint8Array): PreviewMarker | null {
	let pos = 8;
	while (pos + 12 <= bytes.length) {
		const len = readU32(bytes, pos);
		const end = pos + 12 + len;
		if (end > bytes.length) return null;
		const typeAndData = bytes.subarray(pos + 4, pos + 8 + len);
		const type = asciiString(typeAndData.subarray(0, 4));
		if (readU32(bytes, pos + 8 + len) !== crc32(typeAndData)) return null;
		if (type === "tEXt") {
			const data = typeAndData.subarray(4);
			const nul = data.indexOf(0);
			if (nul > 0 && asciiString(data.subarray(0, nul)) === MARKER_KEYWORD) {
				return decodeMarker(asciiString(data.subarray(nul + 1)));
			}
		}
		if (type === "IEND" || type === "IDAT") return null;
		pos = end;
	}
	return null;
}

function readJpegMarker(bytes: Uint8Array): PreviewMarker | null {
	let pos = 2;
	while (pos + 4 <= bytes.length) {
		if (bytes[pos] !== 0xff) return null;
		const marker = bytes[pos + 1];
		if (marker === 0xda || marker === 0xd9) return null;
		const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
		if (len < 2 || pos + 2 + len > bytes.length) return null;
		if (marker === 0xfe) {
			const payload = asciiString(bytes.subarray(pos + 4, pos + 2 + len));
			if (payload.startsWith(JPEG_COM_PREFIX)) return decodeMarker(payload.slice(JPEG_COM_PREFIX.length));
		}
		pos += 2 + len;
	}
	return null;
}

export function readMarker(bytes: Uint8Array): PreviewMarker | null {
	if (isPng(bytes)) return readPngMarker(bytes);
	if (isJpeg(bytes)) return readJpegMarker(bytes);
	return null;
}

// --- placeholder ------------------------------------------------------------

const PLACEHOLDER_COLORS: Readonly<Record<string, string>> = {
	docx: "#2b579a", doc: "#2b579a", xlsx: "#217346", xls: "#217346",
	pptx: "#c43e1c", ppt: "#c43e1c", pages: "#e8860c", numbers: "#2e9e4f",
	key: "#1d6fd6", odt: "#1f5fa8",
};

/** The "no preview available" image for a source, as SVG: a page for documents, 16:9 for presentations. */
export function placeholderSvg(sourcePath: string): string {
	const ext = extensionOf(sourcePath);
	const slide = imageExtFor(sourcePath) === "jpg";
	const [w, h] = slide ? [960, 540] : [424, 600];
	const s = slide ? 0.8 : 0.5;
	const cx = w / 2;
	const top = slide ? 70 : 165;
	const iw = 300 * s;
	const ih = 380 * s;
	const ix = cx - iw / 2;
	const fold = 80 * s;
	const label = ext.toUpperCase();
	const labelSize = (label.length > 4 ? 56 : 72) * s;
	const color = PLACEHOLDER_COLORS[ext] ?? "#5f6673";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="#f4f5f7"/>
<rect x="${ix}" y="${top}" width="${iw}" height="${ih}" rx="${24 * s}" fill="#ffffff" stroke="#c9ced6" stroke-width="${6 * s}"/>
<path d="M${ix + iw - fold} ${top} v${fold} h${fold}" fill="none" stroke="#c9ced6" stroke-width="${6 * s}"/>
<rect x="${cx - 190 * s}" y="${top + 230 * s}" width="${380 * s}" height="${110 * s}" rx="${18 * s}" fill="${color}"/>
<text x="${cx}" y="${top + 308 * s}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${labelSize}" font-weight="700" fill="#ffffff">${label}</text>
<text x="${cx}" y="${top + ih + 75 * s + (slide ? 20 : 30)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${slide ? 40 : 26}" fill="#4a5160">Keine Vorschau verfügbar</text>
</svg>`;
}

// --- fingerprint, jitter ----------------------------------------------------

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function jitterMs(random: () => number): number {
	return JITTER_MIN_MS + Math.floor(random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
}

// --- drop embed -------------------------------------------------------------

// A single `]` may sit inside a name (`[Entwurf] Angebot.docx`); only `]]` closes the link.
const WIKILINK_RE = /(!?)\[\[((?:[^\]|#]|\](?!\]))*)(#(?:[^\]|]|\](?!\]))*)?(?:\|((?:[^\]]|\](?!\]))*))?\]\]/g;

export function transformLinkLine(
	line: string,
	matches: (linkpath: string) => boolean,
): { line: string; matched: boolean } {
	for (const m of line.matchAll(WIKILINK_RE)) {
		const [whole, bang, linkpath, heading, alias] = m;
		if (!matches(linkpath.normalize("NFC"))) continue;
		if (bang !== "!") return { line, matched: true };
		const keptAlias = alias !== undefined && !/^\d+$/.test(alias) ? `|${alias}` : "";
		const converted = `[[${linkpath}${heading ?? ""}${keptAlias}]]`;
		const start = m.index ?? 0;
		return { line: line.slice(0, start) + converted + line.slice(start + whole.length), matched: true };
	}
	return { line, matched: false };
}

export function planPreviewInsertion(
	content: string,
	isSourceLink: (linkpath: string) => boolean,
	isPreviewLink: (linkpath: string) => boolean,
	embedText: string,
): InsertionPlan | null {
	if (containsEmbedOf(content, isPreviewLink)) return null;
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const { line, matched } = transformLinkLine(lines[i], isSourceLink);
		if (!matched) continue;
		const indent = lines[i].slice(0, lines[i].length - lines[i].trimStart().length);
		return { lineIndex: i, replacement: `${line}\n${indent}${embedText}` };
	}
	return null;
}

/**
 * The wikilink path as the resolver sees it: `\|` in a table row leaves a trailing
 * backslash, and the text is NFC-normalized — names pasted from Finder carry
 * decomposed umlauts, which Obsidian normalizes when it indexes links.
 */
function linkPathOf(match: RegExpMatchArray): string {
	const path = match[2].endsWith("\\") ? match[2].slice(0, -1) : match[2];
	return path.normalize("NFC");
}

export type LinkResolver = (linkPath: string) => boolean;

// A Markdown-style embed, as generateMarkdownLink writes it with "Use [[Wikilinks]]"
// off: `![alt](target "title")`, the target URL-encoded or wrapped in `<…>`; a
// hand-written title may also be `'title'` or `(title)` (CommonMark).
// Balanced parentheses (one level) stay in the target: encodeURI leaves `(`/`)`,
// and copies are often named `Angebot (1).docx`. The alt text is bounded so a
// pathological line stays cheap.
const MD_EMBED_SRC = String.raw`!\[[^\]\n]{0,1000}\]\(\s*(<[^>]*>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)`;
const MD_EMBED_RE = new RegExp(MD_EMBED_SRC, "g");

/** The path a Markdown embed target names: `<…>` unwrapped, URL-decoded (kept raw when malformed). */
function markdownTargetOf(raw: string): string {
	const target = raw.startsWith("<") ? raw.slice(1, -1) : raw;
	try {
		return decodeURIComponent(target).normalize("NFC");
	} catch {
		return target.normalize("NFC");
	}
}

/** True when `text` holds an embed (`![[…]]` or `![alt](target)`) whose path `isTarget` accepts. */
export function containsEmbedOf(text: string, isTarget: LinkResolver): boolean {
	for (const m of text.matchAll(WIKILINK_RE)) {
		if (m[1] === "!" && isTarget(linkPathOf(m))) return true;
	}
	for (const m of text.matchAll(MD_EMBED_RE)) {
		if (isTarget(markdownTargetOf(m[1]))) return true;
	}
	return false;
}

export interface AutoEmbedPlan {
	/** Index (in the EOL-split lines) of the line after which the embed line is inserted. */
	lineIndex: number;
	/** The inserted line, prefix included, without EOL. */
	text: string;
	/** Content after insertion, in the note's EOL. */
	newContent: string;
}

// Any leading whitespace: a fence nested in a list item is indented by a tab or
// 4+ spaces and is still code. Over-skipping misses an embed; under-skipping
// would write into the user's code block.
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})(.*)$/;
const QUOTE_PREFIX_RE = /^\s*(?:>\s*)+/;
// Line shape only; `[^\]]*` stops at the first `]`, so two embeds on one line never match.
// Which file the embed resolves to is decided by containsEmbedOf.
const BLOCK_EMBED_RE = new RegExp(String.raw`^\s*(?:>\s*)*(?:!\[\[(?:[^\]]|\](?!\]))*\]\]|${MD_EMBED_SRC})\s*$`);

function withoutQuotePrefix(line: string): string {
	return line.replace(QUOTE_PREFIX_RE, "");
}

/** Blanks inline code spans (a backtick run closed by a run of equal length). */
function withoutCodeSpans(line: string): string {
	let out = line;
	let i = 0;
	while (i < out.length) {
		if (out[i] !== "`") {
			i++;
			continue;
		}
		let n = 1;
		while (out[i + n] === "`") n++;
		const fence = "`".repeat(n);
		let close = out.indexOf(fence, i + n);
		while (close >= 0 && out[close + n] === "`") {
			let skip = n;
			while (out[close + skip] === "`") skip++;
			close = out.indexOf(fence, close + skip);
		}
		if (close < 0) {
			i += n;
			continue;
		}
		out = out.slice(0, i) + " ".repeat(close + n - i) + out.slice(close + n);
		i = close + n;
	}
	return out;
}

/** Per line: its scannable text, or null inside frontmatter and fenced code. */
function bodyView(lines: string[]): (string | null)[] {
	const view: (string | null)[] = lines.map(withoutCodeSpans);
	let start = 0;
	if (lines[0] === "---") {
		const close = lines.indexOf("---", 1);
		if (close > 0) {
			view.fill(null, 0, close + 1);
			start = close + 1;
		}
	}
	// CommonMark fences, also inside a blockquote/callout: an opening backtick
	// fence's info string holds no backtick; a closing fence holds nothing else.
	let fence: string | null = null;
	for (let i = start; i < lines.length; i++) {
		const m = FENCE_RE.exec(withoutQuotePrefix(lines[i]));
		if (fence === null) {
			if (m === null || (m[1][0] === "`" && m[2].includes("`"))) continue;
			fence = m[1];
			view[i] = null;
			continue;
		}
		view[i] = null;
		if (m !== null && m[1][0] === fence[0] && m[1].length >= fence.length && m[2].trim() === "") fence = null;
	}
	return view;
}

/**
 * Where to insert an embed of a document's preview in a note linking it: below the
 * first body line linking the source, after that line's block of preview embeds;
 * null when the body already embeds the image or no body line links the source.
 */
export function planAutoEmbed(
	content: string,
	isSourceLink: LinkResolver,
	isImageEmbed: LinkResolver,
	isPreviewEmbed: LinkResolver,
	embedText: string,
): AutoEmbedPlan | null {
	const eol = /\r?\n/.exec(content)?.[0] ?? "\n";
	const lines = content.split(eol);
	const view = bodyView(lines);
	if (view.some((text) => text !== null && containsEmbedOf(text, isImageEmbed))) return null;
	const anchor = view.findIndex(
		(text) => text !== null && [...text.matchAll(WIKILINK_RE)].some((m) => isSourceLink(linkPathOf(m))),
	);
	if (anchor < 0) return null;

	const line = lines[anchor];
	let end = anchor;
	const quote = QUOTE_PREFIX_RE.exec(line)?.[0];
	const isTableRow = (l: string): boolean => withoutQuotePrefix(l).trimStart().startsWith("|");
	let prefix: string;
	if (isTableRow(line)) {
		while (end + 1 < lines.length && isTableRow(lines[end + 1])) end++;
		prefix = quote ?? "";
	} else {
		prefix = quote ?? line.slice(0, line.length - line.trimStart().length);
	}
	while (
		end + 1 < lines.length &&
		BLOCK_EMBED_RE.test(lines[end + 1]) &&
		containsEmbedOf(lines[end + 1], isPreviewEmbed)
	) end++;

	const text = prefix + embedText;
	const out = [...lines];
	out.splice(end + 1, 0, text);
	return { lineIndex: end, text, newContent: out.join(eol) };
}

function nameMatches(recorded: string, created: string): boolean {
	if (recorded === created) return true;
	const dot = recorded.lastIndexOf(".");
	if (dot <= 0) return false;
	const stem = recorded.slice(0, dot);
	const ext = recorded.slice(dot);
	if (!created.startsWith(stem + " ") || !created.endsWith(ext)) return false;
	return /^\d+$/.test(created.slice(stem.length + 1, created.length - ext.length));
}

/** Most recent in-window record holding a matching name; the matched name is consumed. */
export function matchDrop(records: DropRecord[], createdBasename: string, now: number): DropRecord | null {
	let best: { record: DropRecord; index: number } | null = null;
	for (const record of records) {
		if (now - record.at > DROP_WINDOW_MS) continue;
		if (best !== null && record.at <= best.record.at) continue;
		const index = record.names.findIndex((n) => nameMatches(n, createdBasename));
		if (index >= 0) best = { record, index };
	}
	if (best === null) return null;
	best.record.names.splice(best.index, 1);
	return best.record;
}
