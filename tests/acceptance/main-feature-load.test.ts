import { describe, it, expect, beforeEach } from "vitest";
import { loadFeatures } from "../../src/main";
import { lastNotice, resetNotices, asLuKitPlugin } from "../helpers/obsidian-mocks";
import { Notice } from "../helpers/obsidian-stub";
import type { LuKitFeature } from "../../src/types";

beforeEach(() => {
	resetNotices();
});

describe("loadFeatures (TS-02)", () => {
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

		const errors: { id: string; e: unknown }[] = [];
		const succeeded = loadFeatures(
			[failing, succeeding],
			asLuKitPlugin({ settings: {}, app: {}, features: [], addCommand: () => undefined, commands: new Map() } as never),
			(id, e) => {
				errors.push({ id, e });
				new Notice(`LuKit: failed to load feature ${id} — see console`);
			},
		);

		expect(succeeded).toBe(1);
		expect(errors).toHaveLength(1);
		expect(errors[0].id).toBe("test-broken");
		expect(lastNotice()).toBe("LuKit: failed to load feature test-broken — see console");
	});
});
