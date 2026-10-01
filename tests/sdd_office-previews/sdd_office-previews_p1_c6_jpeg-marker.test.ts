import { describe, it, expect } from "vitest";
import {
	writeMarkerJpeg,
	readMarker,
	encodeMarker,
	decodeMarker,
	type PreviewMarker,
} from "../../src/features/office-previews/office-previews-engine";

const MARKER: PreviewMarker = {
	version: 1,
	sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};
const OTHER_MARKER: PreviewMarker = {
	version: 1,
	sha256: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
};
const COM_PREFIX = "lukit-preview=";

function segment(marker: number, payload: number[]): number[] {
	const len = payload.length + 2;
	return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}

function filler(n: number, seed: number): number[] {
	return Array.from({ length: n }, (_, i) => (seed + i) % 0xf0);
}

interface JpegOptions {
	app0?: boolean;
	app1?: boolean;
	app2?: boolean;
}

/** SOI, optional APP0/APP1/APP2, DQT/SOF0/DHT stubs, SOS + scan bytes (no 0xFF), EOI. */
function buildJpeg(opts: JpegOptions = {}): Uint8Array {
	const bytes: number[] = [0xff, 0xd8];
	if (opts.app0) bytes.push(...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, ...filler(9, 1)]));
	if (opts.app1) bytes.push(...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...filler(20, 3)]));
	if (opts.app2) {
		bytes.push(...segment(0xe2, [...Array.from("ICC_PROFILE\0", (c) => c.charCodeAt(0)), 1, 1, ...filler(30, 5)]));
	}
	bytes.push(...segment(0xdb, [0x00, ...filler(64, 7)]));
	bytes.push(...segment(0xc0, [0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00]));
	bytes.push(...segment(0xc4, [0x00, ...filler(28, 9)]));
	bytes.push(...segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
	bytes.push(...filler(40, 11)); // entropy-coded scan bytes, never 0xFF
	bytes.push(0xff, 0xd9);
	return new Uint8Array(bytes);
}

interface Segment {
	marker: number;
	start: number; // offset of the 0xFF byte
	length: number; // value of the length field
	payload: Uint8Array;
}

/**
 * Walks the segment structure from SOI up to and including SOS.
 * Throws when the structure is invalid; returns the segments and the offset where scan data begins.
 */
function walk(bytes: Uint8Array): { segments: Segment[]; scanStart: number } {
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("missing SOI");
	const segments: Segment[] = [];
	let pos = 2;
	for (;;) {
		if (pos + 4 > bytes.length) throw new Error("ran off the end before SOS");
		if (bytes[pos] !== 0xff) throw new Error(`expected marker at ${pos}`);
		const marker = bytes[pos + 1];
		const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
		if (length < 2 || pos + 2 + length > bytes.length) throw new Error("invalid segment length");
		segments.push({
			marker,
			start: pos,
			length,
			payload: bytes.subarray(pos + 4, pos + 2 + length),
		});
		pos += 2 + length;
		if (marker === 0xda) return { segments, scanStart: pos };
	}
}

function assertDecodable(bytes: Uint8Array): Segment[] {
	const { segments, scanStart } = walk(bytes);
	expect(segments[segments.length - 1].marker).toBe(0xda);
	expect(bytes[bytes.length - 2]).toBe(0xff);
	expect(bytes[bytes.length - 1]).toBe(0xd9);
	expect(scanStart).toBeLessThanOrEqual(bytes.length - 2);
	return segments;
}

function comSegments(segments: Segment[]): Segment[] {
	return segments.filter((s) => s.marker === 0xfe);
}

function ascii(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

describe("SDD office-previews p1 c6: JPEG marker", () => {
	it("round-trips the marker through write then read", () => {
		const out = writeMarkerJpeg(buildJpeg(), MARKER);

		expect(readMarker(out)).toEqual(MARKER);
	});

	it("keeps SOI and EOI intact and the stream decodable", () => {
		const out = writeMarkerJpeg(buildJpeg(), MARKER);

		expect(out[0]).toBe(0xff);
		expect(out[1]).toBe(0xd8);
		assertDecodable(out);
	});

	it("writes exactly one COM segment with the 'lukit-preview=' + JSON payload", () => {
		const out = writeMarkerJpeg(buildJpeg(), MARKER);
		const coms = comSegments(assertDecodable(out));

		expect(coms).toHaveLength(1);
		const payload = ascii(coms[0].payload);
		expect(payload.startsWith(COM_PREFIX)).toBe(true);
		const json = payload.slice(COM_PREFIX.length);
		expect(JSON.parse(json)).toEqual(MARKER);
		expect(decodeMarker(json)).toEqual(MARKER);
		expect(payload).toBe(COM_PREFIX + encodeMarker(MARKER));
		// ASCII only, within the COM size limit
		expect(/^[\x20-\x7e]*$/.test(payload)).toBe(true);
		expect(coms[0].payload.length).toBeLessThanOrEqual(65533);
		expect(coms[0].length).toBe(coms[0].payload.length + 2);
	});

	it("puts the COM segment directly after SOI when there are no leading APPn segments", () => {
		const out = writeMarkerJpeg(buildJpeg(), MARKER);
		const segments = assertDecodable(out);

		expect(segments[0].marker).toBe(0xfe);
		expect(segments[0].start).toBe(2);
		expect(segments[1].marker).toBe(0xdb);
	});

	it("puts the COM segment after the last of leading APP0, APP1 and APP2 segments", () => {
		const out = writeMarkerJpeg(buildJpeg({ app0: true, app1: true, app2: true }), MARKER);
		const segments = assertDecodable(out);

		expect(segments.map((s) => s.marker).slice(0, 5)).toEqual([0xe0, 0xe1, 0xe2, 0xfe, 0xdb]);
		expect(readMarker(out)).toEqual(MARKER);
	});

	it("places the COM segment after APP0 only when APP0 is the sole leading segment", () => {
		const out = writeMarkerJpeg(buildJpeg({ app0: true }), MARKER);
		const segments = assertDecodable(out);

		expect(segments.map((s) => s.marker).slice(0, 3)).toEqual([0xe0, 0xfe, 0xdb]);
	});

	it("preserves every original segment and the scan data byte for byte", () => {
		const original = buildJpeg({ app0: true, app1: true, app2: true });
		const out = writeMarkerJpeg(original, MARKER);

		const before = walk(original);
		const after = walk(out);
		const withoutCom = after.segments.filter((s) => s.marker !== 0xfe);

		expect(withoutCom.map((s) => s.marker)).toEqual(before.segments.map((s) => s.marker));
		withoutCom.forEach((s, i) => {
			expect(Array.from(s.payload)).toEqual(Array.from(before.segments[i].payload));
		});
		expect(Array.from(out.subarray(after.scanStart))).toEqual(Array.from(original.subarray(before.scanStart)));
	});

	it("does not mutate the input buffer", () => {
		const original = buildJpeg({ app1: true });
		const copy = original.slice();

		writeMarkerJpeg(original, MARKER);

		expect(Array.from(original)).toEqual(Array.from(copy));
	});

	it("stays decodable with a different marker and reads that marker back", () => {
		const out = writeMarkerJpeg(buildJpeg({ app0: true, app2: true }), OTHER_MARKER);

		assertDecodable(out);
		expect(readMarker(out)).toEqual(OTHER_MARKER);
	});
});
