import { spawn, type ChildProcess } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { JPEG_QUALITY, RENDER_LONGEST_EDGE, type ImageExt } from "./office-previews-engine";

export type RenderResult =
	| { ok: true; bytes: Uint8Array }
	| { ok: false; reason: "timeout" | "exit" | "no-output" };

export interface PreviewRenderer {
	/** `timeoutMs` covers the whole call: qlmanage plus, for `jpg`, sips. */
	render(absSource: string, kind: ImageExt, timeoutMs: number): Promise<RenderResult>;
	/** SIGKILLs the in-flight child; the pending render removes its temp dir. */
	dispose(): void;
}

type RunOutcome = "ok" | "exit" | "timeout";

// Renders the first page of a document via Quick Look (`qlmanage -t`) into a
// private temp dir, converting presentations to JPEG with `sips`. Runtime values
// travel as argv; spawn starts no shell. One budget covers both children, and on
// expiry the running child is SIGKILLed — a hung Quick Look ignores politer
// signals and would block the single render worker.
export function createQuickLookRenderer(opts: { qlmanage?: string; sips?: string } = {}): PreviewRenderer {
	const qlmanage = opts.qlmanage ?? "/usr/bin/qlmanage";
	const sips = opts.sips ?? "/usr/bin/sips";
	let current: ChildProcess | null = null;
	let disposing = false;

	function run(cmd: string, args: string[], deadline: number): Promise<RunOutcome> {
		return new Promise((resolve) => {
			let timedOut = false;
			const child = spawn(cmd, args, { stdio: "ignore" });
			current = child;
			let settled = false;
			const finish = (outcome: RunOutcome): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				if (current === child) current = null;
				resolve(outcome);
			};
			// Settles at once: a child the kill cannot end must not hold the worker.
			const timer = setTimeout(() => {
				timedOut = true;
				child.kill("SIGKILL");
				finish("timeout");
			}, Math.max(0, deadline - Date.now()));
			child.on("error", () => finish("exit"));
			child.on("close", (code, signal) => {
				if (timedOut) return;
				if (signal !== null && !disposing) {
					console.warn(`LuKit office previews: renderer was terminated by ${signal} — likely a security agent (EDR).`);
				}
				finish(code === 0 ? "ok" : "exit");
			});
		});
	}

	async function render(absSource: string, kind: ImageExt, timeoutMs: number): Promise<RenderResult> {
		const deadline = Date.now() + timeoutMs;
		let dir: string;
		try {
			dir = await fs.mkdtemp(path.join(os.tmpdir(), "lukit-preview-"));
		} catch {
			return { ok: false, reason: "exit" };
		}
		try {
			const ql = await run(qlmanage, ["-t", "-s", String(RENDER_LONGEST_EDGE), "-o", dir, absSource], deadline);
			if (ql !== "ok") return { ok: false, reason: ql };
			const png = path.join(dir, `${path.basename(absSource)}.png`);
			let out = png;
			if (kind === "jpg") {
				try {
					await fs.access(png);
				} catch {
					return { ok: false, reason: "no-output" };
				}
				out = path.join(dir, "out.jpg");
				const conv = await run(sips, ["-s", "format", "jpeg", "-s", "formatOptions", String(JPEG_QUALITY), png, "--out", out], deadline);
				if (conv !== "ok") return { ok: false, reason: conv };
			}
			try {
				return { ok: true, bytes: new Uint8Array(await fs.readFile(out)) };
			} catch {
				return { ok: false, reason: kind === "jpg" ? "exit" : "no-output" };
			}
		} finally {
			await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	return {
		render,
		dispose(): void {
			disposing = true;
			current?.kill("SIGKILL");
		},
	};
}
