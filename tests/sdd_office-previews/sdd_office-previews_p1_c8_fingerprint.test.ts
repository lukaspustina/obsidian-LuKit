import { describe, it, expect } from "vitest";
import { sha256Hex } from "../../src/features/office-previews/office-previews-engine";

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("SDD office-previews p1 c8 fingerprint", () => {
	it("matches the reference SHA-256 for the empty buffer", async () => {
		expect(await sha256Hex(new Uint8Array(0))).toBe(EMPTY_SHA256);
	});

	it("matches the reference SHA-256 for the bytes of 'abc'", async () => {
		const bytes = new TextEncoder().encode("abc");
		expect(await sha256Hex(bytes)).toBe(ABC_SHA256);
	});

	it("returns 64 lowercase hex characters", async () => {
		const hex = await sha256Hex(new Uint8Array([0, 255, 128, 1, 2, 3]));
		expect(hex).toMatch(/^[0-9a-f]{64}$/);
	});

	it("hashes only the viewed bytes of a subarray", async () => {
		const backing = new TextEncoder().encode("xxabcxx");
		expect(await sha256Hex(backing.subarray(2, 5))).toBe(ABC_SHA256);
	});

	it("differs for different content", async () => {
		const a = await sha256Hex(new Uint8Array([1]));
		const b = await sha256Hex(new Uint8Array([2]));
		expect(a).not.toBe(b);
	});
});
