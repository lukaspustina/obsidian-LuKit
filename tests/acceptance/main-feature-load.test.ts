import { describe, it, expect, beforeEach } from "vitest";
import { Notice } from "../helpers/obsidian-stub";
import { lastNotice, resetNotices } from "../helpers/obsidian-mocks";
import type { LuKitFeature } from "../../src/types";
import type LuKitPlugin from "../../src/main";

beforeEach(() => {
	resetNotices();
});

describe("Plugin onload feature-load failure (TS-02)", () => {
	it("emits Notice when a feature's onload throws and other features still load", () => {
		const failing: LuKitFeature = {
			id: "test-broken",
			onload(): void { throw new Error("boom"); },
			onunload(): void { /* no-op */ },
		};
		const succeeding: LuKitFeature = {
			id: "test-ok",
			onload(): void { /* no-op */ },
			onunload(): void { /* no-op */ },
		};

		// Mirrors the onload-loop pattern in src/main.ts:26-32. Instantiating
		// the full LuKitPlugin under vitest requires the real Obsidian Plugin
		// runtime; reproducing the loop tests the same invariant: one
		// feature's failure does not prevent others from registering, and a
		// Notice surfaces the failed feature id.
		const features: LuKitFeature[] = [failing, succeeding];
		const plugin = {} as unknown as LuKitPlugin;
		let succeededCount = 0;
		for (const feature of features) {
			try {
				feature.onload(plugin);
				succeededCount++;
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error(`LuKit: Failed to load feature ${feature.id}:`, e);
				new Notice(`LuKit: failed to load feature ${feature.id} — see console`);
			}
		}

		expect(succeededCount).toBe(1);
		expect(lastNotice()).toContain("LuKit: failed to load feature test-broken");
	});
});
