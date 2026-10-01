import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createQuickLookRenderer } from "../../src/features/office-previews/quicklook-renderer";

// Real qlmanage, no fakes: renders a textutil-generated docx and checks the PNG
// dimensions and that the source document is left untouched.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe.skipIf(process.platform !== "darwin")("SDD office-previews p1 c16 renderer-real", () => {
	it("renders a textutil docx to a PNG of longest edge <= 1200 and leaves the source unchanged", async () => {
		const dir = mkdtempSync(join(tmpdir(), "lukit-c16-"));
		try {
			const txt = join(dir, "Angebot.txt");
			const docx = join(dir, "Angebot.docx");
			writeFileSync(txt, "Angebot Musterstadt\n\nErika Beispiel, Acme GmbH\nPosition 1: Beratung, 10 Stunden\n");
			execFileSync("/usr/bin/textutil", ["-convert", "docx", txt, "-output", docx]);

			const hashBefore = sha256(docx);

			const result = await createQuickLookRenderer().render(docx, "png", 20_000);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			const bytes = result.bytes;
			expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);

			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			const width = view.getUint32(16);
			const height = view.getUint32(20);
			expect(width).toBeGreaterThan(0);
			expect(height).toBeGreaterThan(0);
			expect(Math.max(width, height)).toBeLessThanOrEqual(1200);

			expect(sha256(docx)).toBe(hashBefore);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 30_000);
});
