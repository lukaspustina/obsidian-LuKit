import { relative } from "node:path";

/**
 * Prints one `ADLC-RAN <path>` line per executed test file (pdt-adlc ADR 0003).
 *
 * vitest has no introspection flag the ADLC gate can ask, so the runner reports
 * what it ran instead. `adlc attest` scrapes these lines into `tests_ran`, which
 * is what turns the gate's `collection` check from UNPROVEN into proven and makes
 * the orphan check (test-shaped files no runner claims) possible at all.
 *
 * Default export because vitest resolves `--reporter=<path>` to the module's
 * default export — the same forced exception the Obsidian Plugin class carries.
 */
export default class AdlcRanReporter {
	onTestRunEnd(testModules: ReadonlyArray<{ moduleId: string }>): void {
		for (const module of testModules) {
			console.log(`ADLC-RAN ${relative(process.cwd(), module.moduleId)}`);
		}
	}
}
