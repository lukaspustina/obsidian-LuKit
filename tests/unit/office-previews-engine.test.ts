import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import {
	decodeMarker,
	isSource,
	imageExtFor,
	matchDrop,
	readMarker,
	writeMarkerPng,
	type PreviewMarker,
} from "../../src/features/office-previews/office-previews-engine";

// Branch coverage for the engine paths the SDD criterion tests do not reach.

const MARKER: PreviewMarker = { version: 1, sha256: "b".repeat(64) };

function u32(n: number): number[] {
	return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function crc32(bytes: number[]): number {
	let c = 0xffffffff;
	for (const b of bytes) {
		c ^= b;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: number[]): number[] {
	const typeAndData = [...Array.from(type, (ch) => ch.charCodeAt(0)), ...data];
	return [...u32(data.length), ...typeAndData, ...u32(crc32(typeAndData))];
}

function png(extra: number[] = []): Uint8Array {
	return new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		...chunk("IHDR", [...u32(1), ...u32(1), 8, 2, 0, 0, 0]),
		...extra,
		...chunk("IDAT", Array.from(deflateSync(Buffer.from([0, 1, 2, 3])))),
		...chunk("IEND", []),
	]);
}

describe("office-previews engine — remaining branches", () => {
	it("treats extensionless names and dotfiles as non-sources with png format", () => {
		expect(isSource("Ordner/README", "_previews")).toBe(false);
		expect(isSource(".docx", "_previews")).toBe(false);
		expect(imageExtFor("Ordner/README")).toBe("png");
	});

	it("treats the preview folder path itself as a non-source", () => {
		expect(isSource("_previews", "_previews")).toBe(false);
	});

	it("rejects marker JSON that is not an object or lacks a string sha256", () => {
		expect(decodeMarker("null")).toBeNull();
		expect(decodeMarker("5")).toBeNull();
		expect(decodeMarker(JSON.stringify({ version: 1, sha256: 7 }))).toBeNull();
	});

	it("returns null for a PNG whose marker chunk has a wrong CRC", () => {
		const out = writeMarkerPng(png(), MARKER);
		const corrupted = out.slice();
		corrupted[8 + 25 + 8] ^= 0xff; // first data byte of the tEXt chunk
		expect(readMarker(corrupted)).toBeNull();
	});

	it("skips an unrelated tEXt chunk before the marker", () => {
		const comment = chunk("tEXt", Array.from("Comment\0hello", (ch) => ch.charCodeAt(0)));
		const out = writeMarkerPng(png(comment), MARKER);
		expect(readMarker(out)).toEqual(MARKER);
		expect(readMarker(png(comment))).toBeNull();
	});

	it("matches a recorded name without extension only exactly", () => {
		const record = { notePath: "a.md", names: ["Notizen"], at: 0 };
		expect(matchDrop([record], "Notizen 1", 0)).toBeNull();
		expect(matchDrop([record], "Notizen", 0)).toBe(record);
	});

	it("does not treat Office and LibreOffice lock files as sources", () => {
		expect(isSource("Projekte/~$gebot.docx", "_previews")).toBe(false);
		expect(isSource("~$ertrag.odt", "_previews")).toBe(false);
		expect(isSource("Projekte/.~lock.Angebot.docx#", "_previews")).toBe(false);
		expect(isSource("Projekte/.~lock.Angebot.xlsx", "_previews")).toBe(false);
		expect(isSource("Projekte/Angebot.docx", "_previews")).toBe(true);
	});
});
