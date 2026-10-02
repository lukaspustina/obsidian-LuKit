import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createQuickLookRenderer } from "../../src/features/office-previews/quicklook-renderer";

// Real-process test for requirement 32 / p2 c25: dispose() on unload kills the
// in-flight Quick Look child and its temp dir is removed.

const ORIGINAL_TMPDIR = process.env.TMPDIR;
let isolatedTmp = "";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe.skipIf(process.platform !== "darwin")("office-previews renderer dispose", () => {
	beforeAll(() => {
		isolatedTmp = fs.mkdtempSync(path.join(os.tmpdir(), "lukit-dispose-tmpdir-"));
		process.env.TMPDIR = isolatedTmp;
	});

	afterAll(() => {
		if (ORIGINAL_TMPDIR === undefined) delete process.env.TMPDIR;
		else process.env.TMPDIR = ORIGINAL_TMPDIR;
		fs.rmSync(isolatedTmp, { recursive: true, force: true });
	});

	it("kills the in-flight child and removes its temp dir on dispose", { timeout: 15_000 }, async () => {
		const work = fs.mkdtempSync(path.join(os.tmpdir(), "work-"));
		const pidFile = path.join(work, "pid");
		const fakeQl = path.join(work, "fake-qlmanage.sh");
		fs.writeFileSync(fakeQl, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 60\n`);
		fs.chmodSync(fakeQl, 0o755);
		const source = path.join(work, "Angebot.docx");
		fs.writeFileSync(source, "not a real document");

		const renderer = createQuickLookRenderer({ qlmanage: fakeQl });
		const pending = renderer.render(source, "png", 10_000);
		for (let i = 0; i < 50 && !fs.existsSync(pidFile); i++) await sleep(50);
		const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
		expect(fs.readdirSync(os.tmpdir()).some((n) => n.startsWith("lukit-preview-"))).toBe(true);

		renderer.dispose();
		const result = await pending;

		expect(result.ok).toBe(false);
		await sleep(200);
		expect(isAlive(pid)).toBe(false);
		expect(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("lukit-preview-"))).toEqual([]);
	});

	it("rasterizes the placeholder as PNG for documents and JPEG for presentations", { timeout: 20_000 }, async () => {
		const renderer = createQuickLookRenderer();
		const png = await renderer.placeholder("Projekte/Angebot.docx", "png", 10_000);
		const jpg = await renderer.placeholder("Folien.pptx", "jpg", 10_000);

		expect(png.ok && [...png.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
		expect(jpg.ok && [jpg.bytes[0], jpg.bytes[1]]).toEqual([0xff, 0xd8]);
		// IHDR width/height of the PNG: the portrait page.
		if (png.ok) {
			const v = new DataView(png.bytes.buffer, png.bytes.byteOffset);
			expect([v.getUint32(16), v.getUint32(20)]).toEqual([424, 600]);
		}
		expect(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("lukit-preview-"))).toEqual([]);
	});
});
