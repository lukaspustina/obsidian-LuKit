import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { createQuickLookRenderer } from "../../src/features/office-previews/quicklook-renderer";

// Real /usr/bin/sips, fake qlmanage that copies a generated fixture PNG.

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (const byte of buf) {
		c ^= byte;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function buildPng(width: number, height: number): Buffer {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // RGB
	const raw = Buffer.alloc((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) {
		const row = y * (width * 3 + 1);
		raw[row] = 0; // filter none
		for (let x = 0; x < width * 3; x++) raw[row + 1 + x] = (x * 40 + y * 20) & 0xff;
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

describe.skipIf(process.platform !== "darwin")("SDD office-previews p1 c17 renderer-jpeg", () => {
	let dir: string;
	let fakeQl: string;
	const source = "Folien.pptx";

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), "lukit-c17-"));
		const fixture = join(dir, "fixture.png");
		writeFileSync(fixture, buildPng(4, 4));
		fakeQl = join(dir, "fake-qlmanage.sh");
		writeFileSync(fakeQl, `#!/bin/sh\ncp "${fixture}" "$5/$(basename "$6").png"\n`);
		chmodSync(fakeQl, 0o755);
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("renders kind jpg as a decodable JPEG", async () => {
		const renderer = createQuickLookRenderer({ qlmanage: fakeQl });

		const result = await renderer.render(join(dir, source), "jpg", 15_000);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const bytes = result.bytes;
		expect(bytes.length).toBeGreaterThan(4);
		expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
		expect([bytes[bytes.length - 2], bytes[bytes.length - 1]]).toEqual([0xff, 0xd9]);

		const out = join(dir, "decoded.jpg");
		writeFileSync(out, bytes);
		const info = execFileSync("/usr/bin/sips", ["-g", "pixelWidth", out], { encoding: "utf8" });
		expect(info).toMatch(/pixelWidth:\s*\d+/);
		renderer.dispose();
	}, 30_000);
});
