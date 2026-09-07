import { describe, it, expect } from "vitest";

// No child_process mock here on purpose: this file spawns the real osascript.
import { runJxa } from "../../src/features/email-filing/mail-bridge";

// The JXA scripts in mail-bridge run 4–6 KB. Handed to osascript in argv
// (`-e <script>`) they get the process SIGKILLed by an EDR agent that scans the
// inline payload as "active content" — silently, with empty stdout AND stderr,
// so the failure carries no diagnostic at all. Only the stdin transport survives
// that, and only a real osascript run can show it: the mocked suite in
// mail-bridge.test.ts never spawns anything and passed throughout the outage.
//
// macOS-only, and deliberately touches neither Mail nor TCC — a plain return.
const OVERSIZED_SCRIPT = `function run(argv) { return "ok:" + argv.join("|"); }\n// ${"x".repeat(6000)}`;

describe.skipIf(process.platform !== "darwin")("runJxa — real osascript transport", () => {
	it("runs a script far past the inline-payload size limit", async () => {
		expect(OVERSIZED_SCRIPT.length).toBeGreaterThan(5000);

		expect((await runJxa(OVERSIZED_SCRIPT, [])).trim()).toBe("ok:");
	});

	it("passes argv through, including values with spaces", async () => {
		const out = await runJxa(OVERSIZED_SCRIPT, ["Acme Mail", "erika@example.com"]);

		expect(out.trim()).toBe("ok:Acme Mail|erika@example.com");
	});
});
