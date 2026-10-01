import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createQuickLookRenderer } from "../../src/features/office-previews/quicklook-renderer";

// Real-process test: a fake qlmanage records its PID and then never exits.
// The renderer must report "timeout", SIGKILL the child and remove its temp dir.

const TIMEOUT_MS = 1000;
const TMP_PREFIX = "lukit-preview-";

function listPreviewTmpDirs(): Set<string> {
	return new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(TMP_PREFIX)));
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Each renderer test file gets its own TMPDIR so the temp-dir leak check cannot
// see a dir created by a render running concurrently in another test file.
const ORIGINAL_TMPDIR = process.env.TMPDIR;
let isolatedTmp = "";
beforeAll(() => {
	isolatedTmp = fs.mkdtempSync(path.join(os.tmpdir(), "lukit-c13-tmpdir-"));
	process.env.TMPDIR = isolatedTmp;
});
afterAll(() => {
	if (ORIGINAL_TMPDIR === undefined) delete process.env.TMPDIR;
	else process.env.TMPDIR = ORIGINAL_TMPDIR;
	fs.rmSync(isolatedTmp, { recursive: true, force: true });
});

describe.skipIf(process.platform !== "darwin")("SDD office-previews p1 c13 — renderer timeout", () => {
	let workDir = "";
	let pidFile = "";

	afterEach(() => {
		if (pidFile && fs.existsSync(pidFile)) {
			const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
			if (Number.isInteger(pid) && isAlive(pid)) {
				try {
					process.kill(pid, "SIGKILL");
				} catch {
					// already gone
				}
			}
		}
		if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
		workDir = "";
		pidFile = "";
	});

	it("reports timeout, kills the hung child and leaves no temp dir behind", { timeout: 15_000 }, async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lukit-c13-test-"));
		pidFile = path.join(workDir, "pid");
		const fakeQl = path.join(workDir, "fake-qlmanage.sh");
		fs.writeFileSync(fakeQl, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 60\n`);
		fs.chmodSync(fakeQl, 0o755);
		const source = path.join(workDir, "Angebot.docx");
		fs.writeFileSync(source, "not a real document");

		const before = listPreviewTmpDirs();
		const renderer = createQuickLookRenderer({ qlmanage: fakeQl });

		const result = await renderer.render(source, "png", TIMEOUT_MS);

		expect(result).toEqual({ ok: false, reason: "timeout" });

		expect(fs.existsSync(pidFile)).toBe(true);
		const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
		expect(Number.isInteger(pid)).toBe(true);

		// T + 1 s: the child must be dead
		await sleep(1000);
		expect(() => process.kill(pid, 0)).toThrow();

		const leaked = [...listPreviewTmpDirs()].filter((n) => !before.has(n));
		expect(leaked).toEqual([]);
	});
});
