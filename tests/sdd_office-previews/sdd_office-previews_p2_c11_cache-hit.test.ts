import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createDeviceCache } from "../../src/features/office-previews/device-cache";

const enc = new TextEncoder();

function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function makeCache() {
	const store = new Map<string, unknown>();
	const storage = {
		load: (key: string): unknown => (store.has(key) ? store.get(key) : null),
		save: (key: string, data: unknown): void => {
			store.set(key, data);
		},
	};
	const timers = {
		setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
		clearTimeout: (h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>),
	};
	return createDeviceCache(storage, timers);
}

describe("SDD office-previews p2 c11", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("reads the file once when the same path, size and mtime are fingerprinted twice", async () => {
		vi.useFakeTimers();
		const cache = makeCache();
		const bytes = enc.encode("document content");
		const read = vi.fn(async (): Promise<Uint8Array> => bytes);

		const first = await cache.getFingerprint("Docs/Angebot.docx", 1000, bytes.length, read);
		const second = await cache.getFingerprint("Docs/Angebot.docx", 1000, bytes.length, read);

		expect(read).toHaveBeenCalledTimes(1);
		expect(first).toBe(sha256Hex(bytes));
		expect(second).toBe(first);
		cache.dispose();
	});

	it("reads again when the mtime or the size differs", async () => {
		vi.useFakeTimers();
		const cache = makeCache();
		const bytes = enc.encode("document content");
		const read = vi.fn(async (): Promise<Uint8Array> => bytes);

		await cache.getFingerprint("Docs/Angebot.docx", 1000, bytes.length, read);
		await cache.getFingerprint("Docs/Angebot.docx", 2000, bytes.length, read);
		await cache.getFingerprint("Docs/Angebot.docx", 2000, bytes.length + 1, read);

		expect(read).toHaveBeenCalledTimes(3);
		cache.dispose();
	});

	it("keeps separate entries per path", async () => {
		vi.useFakeTimers();
		const cache = makeCache();
		const a = enc.encode("aaa");
		const b = enc.encode("bbb");
		const readA = vi.fn(async (): Promise<Uint8Array> => a);
		const readB = vi.fn(async (): Promise<Uint8Array> => b);

		const fa = await cache.getFingerprint("a.docx", 1, 3, readA);
		const fb = await cache.getFingerprint("b.docx", 1, 3, readB);

		expect(readA).toHaveBeenCalledTimes(1);
		expect(readB).toHaveBeenCalledTimes(1);
		expect(fa).toBe(sha256Hex(a));
		expect(fb).toBe(sha256Hex(b));
		cache.dispose();
	});
});
