import { CACHE_FLUSH_MS, sha256Hex, type CacheEntry, type FailureEntry } from "./office-previews-engine";

export const CACHE_STORAGE_KEY = "lukit.officePreviews.cache";
export const FAILURES_STORAGE_KEY = "lukit.officePreviews.failures";

export interface DeviceStorage {
	load(key: string): unknown;
	save(key: string, data: unknown): void;
}

export interface CacheTimers {
	setTimeout: (fn: () => void, ms: number) => unknown;
	clearTimeout: (h: unknown) => void;
}

export interface DeviceCache {
	getFingerprint(path: string, mtime: number, size: number, read: () => Promise<Uint8Array>): Promise<string>;
	/** Moves the cache entry and the failure entry. */
	moveEntry(oldPath: string, newPath: string): void;
	/** Drops the cache entry and the failure entry. */
	removeEntry(path: string): void;
	getFailure(path: string): FailureEntry | undefined;
	setFailure(path: string, f: FailureEntry): void;
	clearFailure(path: string): void;
	failureCount(): number;
	failures(): Array<[string, FailureEntry]>;
	/** Immediate write; otherwise writes are coalesced by CACHE_FLUSH_MS. */
	flush(): void;
	/** Final flush, then clears the flush timer. */
	dispose(): void;
}

const FAILURE_REASONS: ReadonlySet<string> = new Set(["timeout", "exit", "no-output", "write", "collision"]);

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isCacheEntry(v: unknown): v is CacheEntry {
	return isObject(v) && typeof v.mtime === "number" && typeof v.size === "number" && typeof v.sha256 === "string";
}

function isFailureEntry(v: unknown): v is FailureEntry {
	return isObject(v) && typeof v.sha256 === "string" && typeof v.reason === "string" && FAILURE_REASONS.has(v.reason) && typeof v.at === "string";
}

// Device storage may hold anything: a hand-edited value, a JSON string, or a
// shape from an older version. Whatever does not validate is dropped, never thrown.
function loadRecord<T>(storage: DeviceStorage, key: string, valid: (v: unknown) => v is T): Map<string, T> {
	const out = new Map<string, T>();
	let raw: unknown;
	try {
		raw = storage.load(key);
		if (typeof raw === "string") raw = JSON.parse(raw);
	} catch {
		return out;
	}
	if (!isObject(raw)) return out;
	for (const [path, entry] of Object.entries(raw)) {
		if (valid(entry)) out.set(path, entry);
	}
	return out;
}

export function createDeviceCache(storage: DeviceStorage, timers: CacheTimers): DeviceCache {
	const cache = loadRecord(storage, CACHE_STORAGE_KEY, isCacheEntry);
	const failures = loadRecord(storage, FAILURES_STORAGE_KEY, isFailureEntry);
	let cacheDirty = false;
	let failuresDirty = false;
	let timer: unknown = null;
	let disposed = false;

	const flush = (): void => {
		if (disposed) return;
		if (timer !== null) {
			timers.clearTimeout(timer);
			timer = null;
		}
		if (cacheDirty) storage.save(CACHE_STORAGE_KEY, Object.fromEntries(cache));
		if (failuresDirty) storage.save(FAILURES_STORAGE_KEY, Object.fromEntries(failures));
		cacheDirty = false;
		failuresDirty = false;
	};
	const schedule = (): void => {
		if (!disposed && timer === null) timer = timers.setTimeout(flush, CACHE_FLUSH_MS);
	};
	const touchCache = (): void => {
		cacheDirty = true;
		schedule();
	};
	const touchFailures = (): void => {
		failuresDirty = true;
		schedule();
	};

	return {
		async getFingerprint(path, mtime, size, read) {
			const hit = cache.get(path);
			if (hit !== undefined && hit.mtime === mtime && hit.size === size) return hit.sha256;
			const sha256 = await sha256Hex(await read());
			cache.set(path, { mtime, size, sha256 });
			touchCache();
			return sha256;
		},
		moveEntry(oldPath, newPath) {
			const entry = cache.get(oldPath);
			if (entry !== undefined) {
				cache.delete(oldPath);
				cache.set(newPath, entry);
				touchCache();
			}
			const failure = failures.get(oldPath);
			if (failure !== undefined) {
				failures.delete(oldPath);
				failures.set(newPath, failure);
				touchFailures();
			}
		},
		removeEntry(path) {
			if (cache.delete(path)) touchCache();
			if (failures.delete(path)) touchFailures();
		},
		getFailure: (path) => failures.get(path),
		setFailure(path, f) {
			failures.set(path, f);
			touchFailures();
		},
		clearFailure(path) {
			if (failures.delete(path)) touchFailures();
		},
		failureCount: () => failures.size,
		failures: () => [...failures.entries()],
		flush,
		// After the final flush nothing reaches device storage again.
		dispose(): void {
			flush();
			disposed = true;
		},
	};
}
