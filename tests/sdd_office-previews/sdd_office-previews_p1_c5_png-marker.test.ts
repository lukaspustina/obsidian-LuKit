import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import {
	readMarker,
	writeMarkerPng,
	type PreviewMarker,
} from "../../src/features/office-previews/office-previews-engine";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE: number[] = (() => {
	const table: number[] = [];
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table.push(c >>> 0);
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) {
		c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): number[] {
	return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function ascii(s: string): number[] {
	return Array.from(s).map((ch) => ch.charCodeAt(0));
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const typeAndData = new Uint8Array([...ascii(type), ...data]);
	return new Uint8Array([
		...u32(data.length),
		...typeAndData,
		...u32(crc32(typeAndData)),
	]);
}

function buildPng(): Uint8Array {
	// 1x1 RGB, 8 bit, no interlace
	const ihdr = new Uint8Array([...u32(1), ...u32(1), 8, 2, 0, 0, 0]);
	// one scanline: filter byte 0 + RGB pixel
	const idat = new Uint8Array(deflateSync(Buffer.from([0, 255, 0, 0])));
	return new Uint8Array([
		...PNG_SIGNATURE,
		...chunk("IHDR", ihdr),
		...chunk("IDAT", idat),
		...chunk("IEND", new Uint8Array(0)),
	]);
}

interface ParsedChunk {
	type: string;
	data: Uint8Array;
	crcStored: number;
	crcComputed: number;
	end: number;
}

function parseChunks(png: Uint8Array): ParsedChunk[] {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	const chunks: ParsedChunk[] = [];
	let pos = PNG_SIGNATURE.length;
	while (pos < png.length) {
		const len = view.getUint32(pos);
		const typeAndData = png.subarray(pos + 4, pos + 8 + len);
		const type = String.fromCharCode(...typeAndData.subarray(0, 4));
		const crcStored = view.getUint32(pos + 8 + len);
		const end = pos + 12 + len;
		chunks.push({
			type,
			data: typeAndData.subarray(4),
			crcStored,
			crcComputed: crc32(typeAndData),
			end,
		});
		pos = end;
	}
	return chunks;
}

const MARKER: PreviewMarker = {
	version: 1,
	sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("SDD office-previews p1 c5", () => {
	const input = buildPng();
	const output = writeMarkerPng(input, MARKER);

	it("round-trips the marker through writeMarkerPng and readMarker", () => {
		expect(readMarker(output)).toEqual(MARKER);
	});

	it("keeps the PNG signature and ends with the IEND chunk", () => {
		expect(Array.from(output.subarray(0, 8))).toEqual(PNG_SIGNATURE);

		const chunks = parseChunks(output);
		const last = chunks[chunks.length - 1];
		expect(last.type).toBe("IEND");
		expect(last.end).toBe(output.length);
	});

	it("keeps every chunk CRC valid", () => {
		const chunks = parseChunks(output);
		expect(chunks.length).toBeGreaterThanOrEqual(4);
		for (const c of chunks) {
			expect(c.crcStored, `CRC of ${c.type}`).toBe(c.crcComputed);
		}
	});

	it("places the lukit-preview tEXt chunk directly after IHDR", () => {
		const chunks = parseChunks(output);
		expect(chunks[0].type).toBe("IHDR");
		expect(chunks[1].type).toBe("tEXt");

		const data = chunks[1].data;
		const nul = data.indexOf(0);
		expect(String.fromCharCode(...data.subarray(0, nul))).toBe("lukit-preview");
		const value = String.fromCharCode(...data.subarray(nul + 1));
		expect(JSON.parse(value)).toEqual(MARKER);
	});

	it("preserves the original IHDR, IDAT and IEND chunks", () => {
		const original = parseChunks(input).map((c) => c.type);
		const written = parseChunks(output)
			.map((c) => c.type)
			.filter((t) => t !== "tEXt");
		expect(written).toEqual(original);
	});
});
