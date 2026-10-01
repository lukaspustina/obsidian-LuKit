import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CACHE_STORAGE_KEY,
	FAILURES_STORAGE_KEY,
	createDeviceCache,
} from "../../src/features/office-previews/device-cache";
import { CACHE_FLUSH_MS } from "../../src/features/office-previews/office-previews-engine";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const timers = {
	setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
	clearTimeout: (h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const CORRUPT_VALUES: [string, unknown][] = [
	["invalid JSON string", "{not json"],
	["empty string", ""],
	["number", 42],
	["array", [1, 2, 3]],
	["entry with wrong field types", { "a.docx": { mtime: "x", size: "y", sha256: 5 } }],
	["entry that is not an object", { "a.docx": "oops" }],
];

function storageOf(cacheValue: unknown, failureValue: unknown): { load(key: string): unknown; save(key: string, data: unknown): void } {
	return {
		load: (key: string): unknown => (key === CACHE_STORAGE_KEY ? cacheValue : key === FAILURES_STORAGE_KEY ? failureValue : null),
		save: (): void => undefined,
	};
}

describe("SDD office-previews p2 c23", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	describe("device cache", () => {
		for (const [label, value] of CORRUPT_VALUES) {
			it(`resets to empty without throwing for a corrupt cache and failure store (${label})`, async () => {
				vi.useFakeTimers();
				const cache = createDeviceCache(storageOf(value, value), timers);
				expect(cache.failureCount()).toBe(0);
				expect(cache.failures()).toEqual([]);
				expect(cache.getFailure("a.docx")).toBeUndefined();

				const bytes = new Uint8Array([1, 2, 3]);
				const read = vi.fn(async () => bytes);
				const sha = await cache.getFingerprint("a.docx", 10, 3, read);
				expect(sha).toBe(sha256Of(bytes));
				expect(read).toHaveBeenCalledTimes(1);
				cache.dispose();
			});
		}

		it("treats a load that throws as empty storage", async () => {
			vi.useFakeTimers();
			const throwing = {
				load: (): unknown => {
					throw new SyntaxError("Unexpected token");
				},
				save: (): void => undefined,
			};
			let cache: ReturnType<typeof createDeviceCache> | undefined;
			expect(() => {
				cache = createDeviceCache(throwing, timers);
			}).not.toThrow();
			expect(cache?.failureCount()).toBe(0);
			const read = vi.fn(async () => new Uint8Array([9]));
			await cache?.getFingerprint("a.docx", 1, 1, read);
			expect(read).toHaveBeenCalledTimes(1);
			cache?.dispose();
		});

		it("stays usable after the reset: a recorded failure is stored and a later flush writes valid data", () => {
			vi.useFakeTimers();
			const saved: { key: string; data: unknown }[] = [];
			const storage = {
				load: (): unknown => "{not json",
				save: (key: string, data: unknown): void => {
					saved.push({ key, data });
				},
			};
			const cache = createDeviceCache(storage, timers);
			cache.setFailure("a.docx", { sha256: "abc", reason: "exit", at: "2026-10-01T00:00:00.000Z" });
			expect(cache.failureCount()).toBe(1);
			cache.flush();
			const failures = saved.filter((s) => s.key === FAILURES_STORAGE_KEY).pop();
			expect(failures).toBeDefined();
			expect(JSON.stringify(failures?.data)).toContain("abc");
			vi.advanceTimersByTime(CACHE_FLUSH_MS);
			cache.dispose();
		});
	});

	describe("feature", () => {
		let h: Harness | undefined;
		afterEach(() => {
			h?.dispose();
			h = undefined;
		});

		it("loads with corrupt device storage, ignores it and renders a source normally", async () => {
			const storage = new Map<string, unknown>([
				[CACHE_STORAGE_KEY, "{not json"],
				[FAILURES_STORAGE_KEY, "{not json"],
			]);
			h = createHarness({ storage });
			h.addSource("Angebot.docx");
			await expect(h.start()).resolves.toBeUndefined();
			expect(h.renderer.renderedPaths()).toEqual(["Angebot.docx"]);
			expect(h.previewMarker("Angebot.docx")?.sha256).toBe(sha256Of("content of Angebot.docx"));
			expect(await h.status()).toEqual({ current: 1, queued: 0, failed: 0 });
		});

		it("ignores a wrongly shaped failure entry instead of skipping the source", async () => {
			const content = "content of Bericht.docx";
			const storage = new Map<string, unknown>([
				[FAILURES_STORAGE_KEY, { "Bericht.docx": { sha256: 5, reason: 7 } }],
				[CACHE_STORAGE_KEY, ["bad"]],
			]);
			h = createHarness({ storage });
			h.addSource("Bericht.docx", content);
			await h.start();
			expect(h.renderer.renderedPaths()).toEqual(["Bericht.docx"]);
			expect((await h.status()).failed).toBe(0);
		});

		it("re-hashes a source with a current preview when the cache is corrupt, without rendering", async () => {
			const content = "content of Folien.pptx";
			const storage = new Map<string, unknown>([[CACHE_STORAGE_KEY, { "Folien.pptx": { mtime: "x" } }]]);
			h = createHarness({ storage });
			h.addSource("Folien.pptx", content);
			h.putFile(h.mirror("Folien.pptx"), markedPreview("Folien.pptx", sha256Of(content)));
			await h.start();
			expect(h.adapterCalls.filter((c) => c.op === "readBinary" && c.path === "Folien.pptx")).toHaveLength(1);
			expect(h.renderer.calls).toHaveLength(0);
			expect(await h.status()).toEqual({ current: 1, queued: 0, failed: 0 });
		});
	});
});
