import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../../esbuild.config.mjs"), "utf8");
const lines = source.split("\n");

// Main (plugin) build: the `external:` line after `esbuild.context(`.
const contextIdx = lines.findIndex((l) => l.includes("esbuild.context("));
const externalIdx = lines.findIndex((l, i) => i > contextIdx && /^\s*external\s*:/.test(l));

function externalList(): string[] {
	const match = lines[externalIdx]?.match(/external\s*:\s*\[([^\]]*)\]/);
	if (!match) return [];
	return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function commentBlockAbove(): string {
	const block: string[] = [];
	for (let i = externalIdx - 1; i >= 0; i--) {
		const trimmed = lines[i].trim();
		if (!trimmed.startsWith("//")) break;
		block.unshift(trimmed);
	}
	return block.join("\n");
}

describe("SDD office-previews p1 c19", () => {
	it("finds the main build's external array", () => {
		expect(contextIdx).toBeGreaterThanOrEqual(0);
		expect(externalIdx).toBeGreaterThan(contextIdx);
		expect(externalList().length).toBeGreaterThan(0);
	});

	it("externalizes fs and os alongside child_process and path", () => {
		const externals = externalList();
		expect(externals).toContain("fs");
		expect(externals).toContain("os");
		expect(externals).toContain("child_process");
		expect(externals).toContain("path");
	});

	it("documents fs and os in the comment block directly above external", () => {
		const comment = commentBlockAbove();
		expect(comment).not.toBe("");
		expect(comment).toMatch(/\bfs\b/);
		expect(comment).toMatch(/\bos\b/);
	});
});
