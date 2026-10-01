import { jitterMs } from "./office-previews-engine";

export interface PreviewQueueDeps {
	random: () => number;
	setTimeout: (fn: () => void, ms: number) => unknown;
	clearTimeout: (h: unknown) => void;
	/** Decides right before the run; `immediate` jobs bypass the failure memory. */
	recheck: (path: string, immediate: boolean) => Promise<"render" | "skip">;
	/** Render + write + failure recording. */
	run: (path: string) => Promise<void>;
}

interface Job {
	immediate: boolean;
	timer: unknown;
	/** Set once the delay has elapsed; due jobs run in the order they became due. */
	dueSeq: number | null;
}

// Delayed single-worker queue. A non-immediate job waits its own random jitter;
// an immediate job goes to the front without delay. Exactly one job runs at a
// time; a path that is enqueued again while waiting keeps one job whose delay
// restarts. A path that is running is no longer queued, so enqueueing it then
// adds a fresh job.
export class PreviewQueue {
	private readonly jobs = new Map<string, Job>();
	private running = false;
	private seq = 0;

	constructor(private readonly deps: PreviewQueueDeps) {}

	enqueue(path: string, opts: { immediate?: boolean } = {}): void {
		const existing = this.jobs.get(path);
		if (existing !== undefined && existing.timer !== null) this.deps.clearTimeout(existing.timer);
		const immediate = opts.immediate === true || existing?.immediate === true;
		const job: Job = { immediate, timer: null, dueSeq: null };
		this.jobs.set(path, job);
		job.timer = this.deps.setTimeout(() => {
			job.timer = null;
			job.dueSeq = this.seq++;
			this.pump();
		}, immediate ? 0 : jitterMs(this.deps.random));
	}

	rename(oldPath: string, newPath: string): void {
		const job = this.jobs.get(oldPath);
		if (job === undefined) return;
		this.jobs.delete(oldPath);
		this.jobs.set(newPath, job);
	}

	remove(path: string): void {
		const job = this.jobs.get(path);
		if (job === undefined) return;
		if (job.timer !== null) this.deps.clearTimeout(job.timer);
		this.jobs.delete(path);
	}

	has(path: string): boolean {
		return this.jobs.has(path);
	}

	isImmediate(path: string): boolean {
		return this.jobs.get(path)?.immediate === true;
	}

	clear(): void {
		for (const job of this.jobs.values()) {
			if (job.timer !== null) this.deps.clearTimeout(job.timer);
		}
		this.jobs.clear();
	}

	get length(): number {
		return this.jobs.size;
	}

	private next(): [string, Job] | null {
		let best: [string, Job] | null = null;
		for (const entry of this.jobs) {
			const job = entry[1];
			if (job.dueSeq === null) continue;
			if (best === null) {
				best = entry;
				continue;
			}
			const b = best[1];
			if ((job.immediate && !b.immediate) || (job.immediate === b.immediate && job.dueSeq < (b.dueSeq ?? 0))) best = entry;
		}
		return best;
	}

	private pump(): void {
		if (this.running) return;
		const next = this.next();
		if (next === null) return;
		const [path, job] = next;
		this.jobs.delete(path);
		this.running = true;
		void (async () => {
			try {
				if ((await this.deps.recheck(path, job.immediate)) === "render") await this.deps.run(path);
			} catch {
				console.warn("LuKit office previews: a render job failed unexpectedly.");
			} finally {
				this.running = false;
				this.pump();
			}
		})();
	}
}
