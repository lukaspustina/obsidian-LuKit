import { crc32 } from "zlib";
import { describe, expect, it } from "vitest";
import {
	matchDrop,
	normalizePreviewFolder,
	placeholderSvg,
	planAutoEmbed,
	readMarker,
	sourceForPreview,
	transformLinkLine,
	writeMarkerJpeg,
	writeMarkerPng,
	type PreviewMarker,
} from "../../src/features/office-previews/office-previews-engine";
import { tinyJpeg, tinyPng } from "../helpers/office-previews-harness";

// Pins for behaviour Stryker found unguarded in office-previews-engine.ts
// (2026-10-05). The survivors left are argued equivalent in the commit message.

const MARKER: PreviewMarker = { version: 1, sha256: "abc" };
const enc = new TextEncoder();

const isSource = (p: string): boolean => p === "a.docx";
const isImage = (p: string): boolean => p === "a.docx.png";
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);
const plan = (content: string): ReturnType<typeof planAutoEmbed> =>
	planAutoEmbed(content, isSource, isImage, isPreview, "![[a.docx.png]]");

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const typeAndData = new Uint8Array([...enc.encode(type), ...data]);
	const crc = crc32(typeAndData);
	const len = data.length;
	return new Uint8Array([len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...typeAndData, crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255]);
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (...chunks: Uint8Array[]): Uint8Array => new Uint8Array([...SIGNATURE, ...chunks.flatMap((c) => [...c])]);
const markerText = (keyword = "lukit-preview"): Uint8Array => enc.encode(`${keyword}\0${JSON.stringify(MARKER)}`);
const IHDR = pngChunk("IHDR", new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]));
const IEND = pngChunk("IEND", new Uint8Array(0));

/** A JPEG segment: marker byte, big-endian length (payload + 2), payload. */
const seg = (m: number, payload: number[]): number[] => [0xff, m, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
const comPayload = (prefix = "lukit-preview="): number[] => [...enc.encode(prefix + JSON.stringify(MARKER))];

/** Index of the inserted COM segment. */
const comAt = (bytes: Uint8Array): number => bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xfe);

describe("sourceForPreview", () => {
	it("needs the folder followed by a slash", () => {
		expect(sourceForPreview("_previewsX/a.docx.png", "_previews")).toBeNull();
	});

	it("needs the image extension at the very end", () => {
		expect(sourceForPreview("_previews/a.docx.png.bak", "_previews")).toBeNull();
	});

	it("rejects a non-image, a non-source and a mismatched image format", () => {
		expect(sourceForPreview("_previews/a.docx.gif", "_previews")).toBeNull();
		expect(sourceForPreview("_previews/a.txt.png", "_previews")).toBeNull();
		expect(sourceForPreview("_previews/a.pptx.png", "_previews")).toBeNull();
		expect(sourceForPreview("_previews/Ordner/a.pptx.jpg", "_previews")).toBe("Ordner/a.pptx");
	});
});

describe("normalizePreviewFolder", () => {
	it("keeps a nested folder and a dot inside a name", () => {
		expect(normalizePreviewFolder("Anhänge/Vorschau.v2")).toBe("Anhänge/Vorschau.v2");
	});

	it("falls back for a dot-folder or a parent reference", () => {
		expect(normalizePreviewFolder(".previews")).toBe("_previews");
		expect(normalizePreviewFolder("a/../b")).toBe("_previews");
	});
});

describe("readMarker signature checks", () => {
	it("rejects a PNG whose signature is damaged", () => {
		const bytes = writeMarkerPng(tinyPng(), MARKER);
		bytes[1] = 0x00;
		expect(readMarker(bytes)).toBeNull();
	});

	it("rejects a JPEG whose SOI is damaged in either byte", () => {
		const first = writeMarkerJpeg(tinyJpeg(), MARKER);
		first[0] = 0x00;
		expect(readMarker(first)).toBeNull();
		const second = writeMarkerJpeg(tinyJpeg(), MARKER);
		second[1] = 0x00;
		expect(readMarker(second)).toBeNull();
	});
});

describe("PNG marker chunk", () => {
	it("is read when it is the last chunk of the file", () => {
		expect(readMarker(png(IHDR, pngChunk("tEXt", markerText())))).toEqual(MARKER);
	});

	it("is not read with a wrong CRC", () => {
		const bytes = png(IHDR, pngChunk("tEXt", markerText()), IEND);
		const crcAt = 8 + IHDR.length + 8 + markerText().length;
		bytes[crcAt] ^= 0xff;
		expect(readMarker(bytes)).toBeNull();
	});

	it("is read from a tEXt chunk with the LuKit keyword only", () => {
		expect(readMarker(png(IHDR, pngChunk("iTXt", markerText()), IEND))).toBeNull();
		expect(readMarker(png(IHDR, pngChunk("tEXt", markerText("Comment")), IEND))).toBeNull();
	});

	it("is not looked for after IDAT or IEND", () => {
		const idat = pngChunk("IDAT", new Uint8Array([0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1]));
		expect(readMarker(png(IHDR, idat, pngChunk("tEXt", markerText()), IEND))).toBeNull();
		expect(readMarker(png(IHDR, IEND, pngChunk("tEXt", markerText())))).toBeNull();
	});
});

describe("JPEG marker segment", () => {
	const soi = [0xff, 0xd8];

	it("is read after an empty APP segment and when it ends the file", () => {
		expect(readMarker(new Uint8Array([...soi, ...seg(0xe0, []), ...seg(0xfe, comPayload())]))).toEqual(MARKER);
	});

	it("is not read behind a byte that does not start a segment", () => {
		expect(readMarker(new Uint8Array([...soi, 0x00, ...seg(0xfe, comPayload()).slice(1)]))).toBeNull();
	});

	it("is not looked for after SOS or EOI", () => {
		expect(readMarker(new Uint8Array([...soi, ...seg(0xda, []), ...seg(0xfe, comPayload())]))).toBeNull();
		expect(readMarker(new Uint8Array([...soi, ...seg(0xd9, []), ...seg(0xfe, comPayload())]))).toBeNull();
	});

	it("is read from a COM segment with the exact prefix only", () => {
		expect(readMarker(new Uint8Array([...soi, ...seg(0xe1, comPayload())]))).toBeNull();
		expect(readMarker(new Uint8Array([...soi, ...seg(0xfe, comPayload("lukit-previeX="))]))).toBeNull();
	});
});

describe("writeMarkerJpeg placement", () => {
	it("goes after every leading APPn segment, APP15 included, and before anything else", () => {
		const app0 = seg(0xe0, [0xf5]);
		const app15 = seg(0xef, []);
		const dqt = seg(0xdb, [0, 1]);
		expect(comAt(writeMarkerJpeg(new Uint8Array([0xff, 0xd8, ...app0, ...app15, ...dqt]), MARKER))).toBe(2 + app0.length + app15.length);
		expect(comAt(writeMarkerJpeg(new Uint8Array([0xff, 0xd8, ...seg(0xe0, []), ...dqt]), MARKER))).toBe(6);
		expect(comAt(writeMarkerJpeg(new Uint8Array([0xff, 0xd8, ...seg(0xe0, [])]), MARKER))).toBe(6);
		expect(comAt(writeMarkerJpeg(new Uint8Array([0xff, 0xd8, ...seg(0xe0, []), ...seg(0xf7, [])]), MARKER))).toBe(6);
	});

	it("does not walk a truncated or non-segment start", () => {
		expect(comAt(writeMarkerJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), MARKER))).toBe(2);
		expect(comAt(writeMarkerJpeg(new Uint8Array([0xff, 0xd8, 0x00, 0xe0, 0x00, 0x02]), MARKER))).toBe(2);
	});
});

describe("placeholderSvg", () => {
	it("draws a document page", () => {
		expect(placeholderSvg("Projekte/Angebot.docx")).toMatchInlineSnapshot(`
			"<svg xmlns="http://www.w3.org/2000/svg" width="424" height="600" viewBox="0 0 424 600">
			<rect width="424" height="600" fill="#f4f5f7"/>
			<rect x="137" y="165" width="150" height="190" rx="12" fill="#ffffff" stroke="#c9ced6" stroke-width="3"/>
			<path d="M247 165 v40 h40" fill="none" stroke="#c9ced6" stroke-width="3"/>
			<rect x="117" y="280" width="190" height="55" rx="9" fill="#2b579a"/>
			<text x="212" y="319" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="36" font-weight="700" fill="#ffffff">DOCX</text>
			<text x="212" y="422.5" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#4a5160">Keine Vorschau verfügbar</text>
			</svg>"
		`);
	});

	it("draws a 16:9 slide", () => {
		expect(placeholderSvg("Folien.pptx")).toMatchInlineSnapshot(`
			"<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
			<rect width="960" height="540" fill="#f4f5f7"/>
			<rect x="360" y="70" width="240" height="304" rx="19.200000000000003" fill="#ffffff" stroke="#c9ced6" stroke-width="4.800000000000001"/>
			<path d="M536 70 v64 h64" fill="none" stroke="#c9ced6" stroke-width="4.800000000000001"/>
			<rect x="328" y="254" width="304" height="88" rx="14.4" fill="#c43e1c"/>
			<text x="480" y="316.4" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="57.6" font-weight="700" fill="#ffffff">PPTX</text>
			<text x="480" y="454" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#4a5160">Keine Vorschau verfügbar</text>
			</svg>"
		`);
	});

	it("shrinks a label longer than four letters and greys an unknown type", () => {
		expect(placeholderSvg("Tabelle.numbers")).toContain('font-size="28" font-weight="700" fill="#ffffff">NUMBERS</text>');
		expect(placeholderSvg("Liste.xlsx")).toContain('font-size="36" font-weight="700" fill="#ffffff">XLSX</text>');
		expect(placeholderSvg("notiz.txt")).toContain('fill="#5f6673"/>');
		expect(placeholderSvg("Ordner/LIESMICH")).toContain('fill="#ffffff"></text>');
	});
});

describe("transformLinkLine", () => {
	const isA = (p: string): boolean => p === "a.docx";

	it("leaves a plain link with a numeric alias untouched", () => {
		expect(transformLinkLine("[[a.docx|300]]", isA)).toEqual({ line: "[[a.docx|300]]", matched: true });
	});

	it("drops only an alias made entirely of digits", () => {
		expect(transformLinkLine("![[a.docx|Seite 300]]", isA).line).toBe("[[a.docx|Seite 300]]");
		expect(transformLinkLine("![[a.docx|300 px]]", isA).line).toBe("[[a.docx|300 px]]");
		expect(transformLinkLine("![[a.docx|300]]", isA).line).toBe("[[a.docx]]");
	});
});

describe("planAutoEmbed code spans", () => {
	it.each([
		"`` [[a.docx]]````",
		"`[[a.docx]][[a.docx]] ```",
		"``[[a.docx]]```",
		"`[[a.docx]]``a``",
		"``[[a.docx]]``aa[[a.docx]]``",
	])("sees the link outside a closed span in %j", (line) => {
		expect(plan(`${line}\n`)?.lineIndex).toBe(0);
	});

	it.each(["`a`a`[[a.docx]]`", "`a`a``[[a.docx]]``"])("does not see the link inside a span in %j", (line) => {
		expect(plan(`${line}\n`)).toBeNull();
	});
});

describe("planAutoEmbed frontmatter and fences", () => {
	it("reads a thematic break after the first line as body, not frontmatter", () => {
		expect(plan("[[a.docx]]\n---\ntext\n")?.lineIndex).toBe(0);
	});

	it("starts scanning for fences after the frontmatter's closing line", () => {
		expect(plan("---\n```\n---\n[[a.docx]]\n")?.lineIndex).toBe(3);
	});

	it("opens a tilde fence whose info string holds a backtick", () => {
		expect(plan("~~~ a`b\n[[a.docx]]\n~~~\n")).toBeNull();
	});

	it("closes a fence only with the same character, at least as long, and nothing but spaces after", () => {
		expect(plan("```\n~~~\n[[a.docx]]\n```\n")).toBeNull();
		expect(plan("````\n```\n[[a.docx]]\n````\n")).toBeNull();
		expect(plan("```\nx\n```  \n[[a.docx]]\n")?.lineIndex).toBe(3);
	});
});

describe("planAutoEmbed shaping", () => {
	it("takes the note's first line ending as its EOL", () => {
		expect(plan("x\n[[a.docx]]\r\nend")?.lineIndex).toBe(1);
	});

	it("treats a line as a table row only when it starts with a pipe, after indentation", () => {
		expect(plan("[[a.docx]] |\n| x |\n")?.lineIndex).toBe(0);
		expect(plan("  | [[a.docx]] |\n  | y |\n")).toMatchObject({ lineIndex: 1, text: "![[a.docx.png]]" });
		expect(plan("| [[a.docx]] |")?.lineIndex).toBe(0);
	});

	it("keeps every level of a quote prefix, with or without spaces, after indentation", () => {
		expect(plan("> > [[a.docx]]\n")?.text).toBe("> > ![[a.docx.png]]");
		expect(plan("  > [[a.docx]]\n")?.text).toBe("  > ![[a.docx.png]]");
		expect(plan(">> [[a.docx]]\n")?.text).toBe(">> ![[a.docx.png]]");
		expect(plan("[[a.docx]] > x\n")?.text).toBe("![[a.docx.png]]");
	});

	it("does not extend the embed block over a line with text around a preview embed", () => {
		expect(plan("[[a.docx]]\nsiehe ![[x.docx.png]] oben\n")?.lineIndex).toBe(0);
	});
});

describe("matchDrop", () => {
	const record = (names: string[], at = 1_000): { notePath: string; names: string[]; at: number } => ({ notePath: "N.md", names, at });

	it("does not match a name whose only dot leads it", () => {
		expect(matchDrop([record([".docx"])], " 2.docx", 1_000)).toBeNull();
	});

	it("matches a copy suffix made of digits only", () => {
		expect(matchDrop([record(["Angebot.docx"])], "Angebot x2.docx", 1_000)).toBeNull();
		expect(matchDrop([record(["Angebot.docx"])], "Angebot 2x.docx", 1_000)).toBeNull();
		expect(matchDrop([record(["Angebot.docx"])], "Angebot 2.docx", 1_000)).not.toBeNull();
	});

	it("keeps the first of two records from the same moment", () => {
		const first = record(["Angebot.docx"]);
		const second = record(["Angebot.docx"]);
		expect(matchDrop([first, second], "Angebot.docx", 1_000)).toBe(first);
	});
});
