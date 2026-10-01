import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { readMarker } from "../../src/features/office-previews/office-previews-engine";

const SHA = "a".repeat(64);
const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) {
		c ^= b;
		for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
	}
	return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
	return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const typeAndData = concat(enc.encode(type), data);
	return concat(u32(data.length), typeAndData, u32(crc32(typeAndData)));
}

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function buildPng(textPayload?: string): Uint8Array {
	const ihdr = pngChunk("IHDR", concat(u32(1), u32(1), new Uint8Array([8, 2, 0, 0, 0])));
	const idat = pngChunk("IDAT", new Uint8Array(deflateSync(new Uint8Array([0, 255, 255, 255]))));
	const iend = pngChunk("IEND", new Uint8Array(0));
	const parts = [PNG_SIG, ihdr];
	if (textPayload !== undefined) {
		parts.push(pngChunk("tEXt", enc.encode(`lukit-preview\0${textPayload}`)));
	}
	parts.push(idat, iend);
	return concat(...parts);
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
	return concat(new Uint8Array([0xff, marker]), new Uint8Array([(payload.length + 2) >> 8, (payload.length + 2) & 255]), payload);
}

function buildJpeg(comPayload?: string): Uint8Array {
	const app0 = jpegSegment(0xe0, enc.encode("JFIF\0\x01\x01\0\0\x01\0\x01\0\0"));
	const parts = [new Uint8Array([0xff, 0xd8]), app0];
	if (comPayload !== undefined) parts.push(jpegSegment(0xfe, enc.encode(comPayload)));
	const sos = jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0]));
	parts.push(sos, new Uint8Array([0x12, 0x34, 0x56]), new Uint8Array([0xff, 0xd9]));
	return concat(...parts);
}

const v1 = JSON.stringify({ version: 1, sha256: SHA });
const v2 = JSON.stringify({ version: 2, sha256: SHA });

function seededBytes(length: number, seed: number): Uint8Array {
	const out = new Uint8Array(length);
	let s = seed;
	for (let i = 0; i < length; i++) {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		out[i] = s >>> 24;
	}
	return out;
}

describe("SDD office-previews p1 c7 marker-invalid", () => {
	it("control: a hand-built version 1 marker is read in PNG and JPEG", () => {
		expect(readMarker(buildPng(v1))).toEqual({ version: 1, sha256: SHA });
		expect(readMarker(buildJpeg(`lukit-preview=${v1}`))).toEqual({ version: 1, sha256: SHA });
	});

	it("returns null for a PNG without marker", () => {
		expect(readMarker(buildPng())).toBeNull();
	});

	it("returns null for a JPEG without marker", () => {
		expect(readMarker(buildJpeg())).toBeNull();
	});

	it("returns null for a JPEG with an unrelated COM segment", () => {
		expect(readMarker(buildJpeg("just a comment"))).toBeNull();
	});

	it("returns null for a PNG marker with version 2", () => {
		expect(readMarker(buildPng(v2))).toBeNull();
	});

	it("returns null for a JPEG marker with version 2", () => {
		expect(readMarker(buildJpeg(`lukit-preview=${v2}`))).toBeNull();
	});

	it("returns null for an unparsable marker payload", () => {
		expect(readMarker(buildPng("{not json"))).toBeNull();
		expect(readMarker(buildJpeg("lukit-preview={not json"))).toBeNull();
	});

	it("returns null for a PNG truncated mid-chunk inside the marker", () => {
		const full = buildPng(v1);
		const markerStart = 8 + 25; // signature + IHDR chunk (4 + 4 + 13 + 4)
		expect(readMarker(full.slice(0, markerStart + 20))).toBeNull();
		expect(readMarker(full.slice(0, markerStart + 6))).toBeNull();
	});

	it("returns null for a JPEG truncated mid-segment inside the marker", () => {
		const full = buildJpeg(`lukit-preview=${v1}`);
		const comStart = 2 + 2 + 2 + 14; // SOI + APP0 marker + length + payload
		expect(readMarker(full.slice(0, comStart + 10))).toBeNull();
		expect(readMarker(full.slice(0, comStart + 3))).toBeNull();
	});

	it("returns null for images truncated right after the signature or SOI", () => {
		expect(readMarker(PNG_SIG)).toBeNull();
		expect(readMarker(PNG_SIG.slice(0, 5))).toBeNull();
		expect(readMarker(new Uint8Array([0xff, 0xd8]))).toBeNull();
		expect(readMarker(new Uint8Array([0xff]))).toBeNull();
	});

	it("returns null for random bytes", () => {
		for (const seed of [1, 2, 3, 42, 1337]) {
			expect(readMarker(seededBytes(512, seed))).toBeNull();
		}
	});

	it("returns null for random bytes behind a valid PNG or JPEG signature", () => {
		expect(readMarker(concat(PNG_SIG, seededBytes(256, 7)))).toBeNull();
		expect(readMarker(concat(new Uint8Array([0xff, 0xd8]), seededBytes(256, 9)))).toBeNull();
	});

	it("returns null for a PNG whose chunk length points past the buffer", () => {
		const bogus = concat(PNG_SIG, u32(0x7fffffff), enc.encode("tEXt"), enc.encode("lukit-preview\0"), enc.encode(v1));
		expect(readMarker(bogus)).toBeNull();
	});

	it("returns null for an empty buffer", () => {
		expect(readMarker(new Uint8Array(0))).toBeNull();
	});

	it("returns null for a non-image text buffer, including one that contains the marker text", () => {
		expect(readMarker(enc.encode("hello, this is not an image"))).toBeNull();
		expect(readMarker(enc.encode(`lukit-preview=${v1}`))).toBeNull();
		expect(readMarker(enc.encode(`lukit-preview\0${v1}`))).toBeNull();
	});

	it("never throws on any of the invalid inputs", () => {
		const inputs: Uint8Array[] = [
			new Uint8Array(0),
			new Uint8Array([0x89]),
			buildPng(v2).slice(0, 40),
			buildJpeg(`lukit-preview=${v2}`).slice(0, 30),
			seededBytes(64, 5),
			enc.encode("plain text"),
		];
		for (const input of inputs) {
			expect(() => readMarker(input)).not.toThrow();
		}
	});
});
