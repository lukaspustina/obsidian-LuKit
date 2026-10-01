import { describe, it, expect } from "vitest";
import {
	normalizePreviewFolder,
	DEFAULT_PREVIEW_FOLDER,
} from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p1 c4", () => {
	it("falls back to the default for empty, traversal and dot-folder values", () => {
		expect(DEFAULT_PREVIEW_FOLDER).toBe("_previews");
		expect(normalizePreviewFolder("")).toBe("_previews");
		expect(normalizePreviewFolder("../x")).toBe("_previews");
		expect(normalizePreviewFolder(".obsidian/p")).toBe("_previews");
		expect(normalizePreviewFolder("a/../b")).toBe("_previews");
	});

	it("strips leading and trailing slashes", () => {
		expect(normalizePreviewFolder("/a/")).toBe("a");
	});

	it("trims whitespace, converts backslashes and collapses repeated slashes", () => {
		expect(normalizePreviewFolder("  a  ")).toBe("a");
		expect(normalizePreviewFolder("a\\b")).toBe("a/b");
		expect(normalizePreviewFolder("a//b///c")).toBe("a/b/c");
		expect(normalizePreviewFolder("  \\a\\\\b/ ")).toBe("a/b");
	});

	it("falls back for whitespace-only and slash-only values", () => {
		expect(normalizePreviewFolder("   ")).toBe("_previews");
		expect(normalizePreviewFolder("///")).toBe("_previews");
	});

	it("keeps valid nested folders and dots inside later segments", () => {
		expect(normalizePreviewFolder("Anhänge/_previews")).toBe("Anhänge/_previews");
		expect(normalizePreviewFolder("a/.b")).toBe("a/.b");
	});
});
