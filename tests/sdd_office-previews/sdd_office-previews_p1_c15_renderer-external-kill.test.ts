import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createQuickLookRenderer } from "../../src/features/office-previews/quicklook-renderer";

// A child that SIGKILLs itself while our own timer has not fired (external kill,
// e.g. an EDR agent) must map to "exit", never "timeout", and must log an
// English diagnostic that names the signal and the EDR suspicion without leaking
// the source path or its basename.
describe.skipIf(process.platform !== "darwin")("SDD office-previews p1 c15 renderer-external-kill", () => {
	let tmp: string;
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lukit-c15-"));
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("maps a self-SIGKILLed child to exit and logs a path-free SIGKILL/EDR diagnostic", async () => {
		const fakeQl = path.join(tmp, "fake-qlmanage.sh");
		fs.writeFileSync(fakeQl, "#!/bin/sh\nkill -9 $$\n");
		fs.chmodSync(fakeQl, 0o755);

		const basename = "Geheim-Angebot.docx";
		const source = path.join(tmp, basename);
		fs.writeFileSync(source, "not a real document");

		const renderer = createQuickLookRenderer({ qlmanage: fakeQl });
		const result = await renderer.render(source, "png", 10_000);
		renderer.dispose();

		expect(result).toEqual({ ok: false, reason: "exit" });

		expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
		const logged = warnSpy.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
		expect(logged).toContain("SIGKILL");
		expect(logged).toContain("EDR");
		expect(logged).not.toContain(source);
		expect(logged).not.toContain(basename);
		expect(logged).not.toContain("Geheim-Angebot");
	});
});
