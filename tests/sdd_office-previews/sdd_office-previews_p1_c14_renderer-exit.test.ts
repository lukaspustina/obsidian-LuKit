import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { deflateSync } from "node:zlib";
import { createQuickLookRenderer } from "../../src/features/office-previews/quicklook-renderer";

// Real-process tests: fake qlmanage/sips are temp shell scripts passed via opts.

const CRC_TABLE = ((): Uint32Array => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
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

function minimalPng(): Buffer {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(1, 0);
	ihdr.writeUInt32BE(1, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // RGB
	const raw = Buffer.from([0, 255, 255, 255]); // filter byte + one white pixel
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

function lukitTmpEntries(): string[] {
	return fs.readdirSync(os.tmpdir()).filter((e) => e.startsWith("lukit-preview-"));
}

// Each renderer test file gets its own TMPDIR so the temp-dir leak check cannot
// see a dir created by a render running concurrently in another test file.
const ORIGINAL_TMPDIR = process.env.TMPDIR;
let isolatedTmp = "";
beforeAll(() => {
	isolatedTmp = fs.mkdtempSync(path.join(os.tmpdir(), "lukit-c14-tmpdir-"));
	process.env.TMPDIR = isolatedTmp;
});
afterAll(() => {
	if (ORIGINAL_TMPDIR === undefined) delete process.env.TMPDIR;
	else process.env.TMPDIR = ORIGINAL_TMPDIR;
	fs.rmSync(isolatedTmp, { recursive: true, force: true });
});

describe.skipIf(process.platform !== "darwin")("SDD office-previews p1 c14 renderer-exit", () => {
	let dir: string;
	let source: string;
	let fixturePng: string;

	function script(name: string, body: string): string {
		const p = path.join(dir, name);
		fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
		fs.chmodSync(p, 0o755);
		return p;
	}

	beforeAll(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "lukit-c14-"));
		source = path.join(dir, "Folien.pptx");
		fs.writeFileSync(source, "not a real document");
		fixturePng = path.join(dir, "fixture.png");
		fs.writeFileSync(fixturePng, minimalPng());
	});

	afterAll(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("maps a non-zero qlmanage exit to exit", async () => {
		const ql = script("ql-exit3.sh", "exit 3");
		const renderer = createQuickLookRenderer({ qlmanage: ql });

		const result = await renderer.render(source, "png", 10_000);

		expect(result).toEqual({ ok: false, reason: "exit" });
	});

	it("maps exit 0 without an output image to no-output", async () => {
		const ql = script("ql-empty.sh", "exit 0");
		const renderer = createQuickLookRenderer({ qlmanage: ql });

		const result = await renderer.render(source, "png", 10_000);

		expect(result).toEqual({ ok: false, reason: "no-output" });
	});

	it("maps a failing sips to exit for kind jpg", async () => {
		const ql = script("ql-ok.sh", `cp "${fixturePng}" "$5"/"$(basename "$6")".png`);
		const sips = script("sips-fail.sh", "exit 1");
		const renderer = createQuickLookRenderer({ qlmanage: ql, sips });

		const result = await renderer.render(source, "jpg", 10_000);

		expect(result).toEqual({ ok: false, reason: "exit" });
	});

	it("maps a nonexistent qlmanage binary to exit without an unhandled error", async () => {
		const uncaught: unknown[] = [];
		const onUncaught = (e: unknown): void => {
			uncaught.push(e);
		};
		process.on("uncaughtException", onUncaught);
		process.on("unhandledRejection", onUncaught);
		try {
			const renderer = createQuickLookRenderer({ qlmanage: "/nonexistent/qlmanage" });

			const result = await renderer.render(source, "png", 10_000);
			// Let any stray 'error' event surface before asserting.
			await new Promise((r) => setTimeout(r, 100));

			expect(result).toEqual({ ok: false, reason: "exit" });
			expect(uncaught).toEqual([]);
		} finally {
			process.off("uncaughtException", onUncaught);
			process.off("unhandledRejection", onUncaught);
		}
	});

	it("leaves no temp dir behind after any failure", async () => {
		const before = lukitTmpEntries();
		const ql = script("ql-exit3b.sh", "exit 3");

		await createQuickLookRenderer({ qlmanage: ql }).render(source, "png", 10_000);
		await createQuickLookRenderer({ qlmanage: "/nonexistent/qlmanage" }).render(source, "png", 10_000);

		expect(lukitTmpEntries().sort()).toEqual(before.sort());
	});
});
