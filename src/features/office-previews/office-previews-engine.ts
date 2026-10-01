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
	"pages", "numbers", "key", "odt", "ods", "odp",
];

const PRESENTATION_EXTENSIONS: readonly string[] = ["pptx", "ppt", "key", "odp"];

export type ImageExt = "png" | "jpg";

export interface PreviewMarker {
	version: 1;
	sha256: string;
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
	return SUPPORTED_EXTENSIONS.includes(extensionOf(path));
}

export function imageExtFor(sourcePath: string): ImageExt {
	return PRESENTATION_EXTENSIONS.includes(extensionOf(sourcePath)) ? "jpg" : "png";
}

export function mirrorPath(sourcePath: string, previewFolder: string): string {
	return `${previewFolder}/${sourcePath}.${imageExtFor(sourcePath)}`;
}

export function normalizePreviewFolder(value: string): string {
	const collapsed = value.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
	if (collapsed === "") return DEFAULT_PREVIEW_FOLDER;
	const segments = collapsed.split("/");
	if (segments.includes("..") || segments[0].startsWith(".")) return DEFAULT_PREVIEW_FOLDER;
	return collapsed;
}

// --- marker -----------------------------------------------------------------

const MARKER_KEYWORD = "lukit-preview";
const JPEG_COM_PREFIX = MARKER_KEYWORD + "=";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function encodeMarker(m: PreviewMarker): string {
	return JSON.stringify({ version: m.version, sha256: m.sha256 });
}

export function decodeMarker(s: string): PreviewMarker | null {
	try {
		const parsed: unknown = JSON.parse(s);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { version, sha256 } = parsed as Record<string, unknown>;
		if (version !== 1 || typeof sha256 !== "string") return null;
		return { version: 1, sha256 };
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

// --- fingerprint, jitter ----------------------------------------------------

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function jitterMs(random: () => number): number {
	return JITTER_MIN_MS + Math.floor(random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
}

// --- drop embed -------------------------------------------------------------

const WIKILINK_RE = /(!?)\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

export function transformLinkLine(
	line: string,
	matches: (linkpath: string) => boolean,
): { line: string; matched: boolean } {
	for (const m of line.matchAll(WIKILINK_RE)) {
		const [whole, bang, linkpath, heading, alias] = m;
		if (!matches(linkpath)) continue;
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
	for (const m of content.matchAll(WIKILINK_RE)) {
		if (m[1] === "!" && isPreviewLink(m[2])) return null;
	}
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const { line, matched } = transformLinkLine(lines[i], isSourceLink);
		if (!matched) continue;
		const indent = lines[i].slice(0, lines[i].length - lines[i].trimStart().length);
		return { lineIndex: i, replacement: `${line}\n${indent}${embedText}` };
	}
	return null;
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
