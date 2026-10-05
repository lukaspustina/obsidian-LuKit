import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FAILURES_STORAGE_KEY } from "../../src/features/office-previews/device-cache";
import { RECONCILE_DELAY_MS, writeMarkerPng } from "../../src/features/office-previews/office-previews-engine";
import { fisherYates } from "../../src/features/office-previews/office-previews-feature";
import type { TFile } from "obsidian";
import type LuKitPlugin from "../../src/main";
import { Setting, __stubEl } from "../helpers/obsidian-stub";
import { createHarness, markedPreview, mulberry32, sha256Of, tinyPng, type Harness } from "../helpers/office-previews-harness";

// Pins for behaviour Stryker found unguarded in office-previews-feature.ts
// (2026-10-05). The survivors left are argued equivalent in the commit message.

type AdapterOp = "exists" | "readBinary" | "writeBinary" | "mkdir" | "remove";

interface AppMocks {
	vault: { adapter: Record<AdapterOp, Mock> };
	fileManager: { renameFile: Mock };
	workspace: { getActiveFile: Mock };
}

let h: Harness | undefined;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	h?.dispose();
	h = undefined;
	warn.mockRestore();
});

const app = (harness: Harness): AppMocks => harness.plugin.app as unknown as AppMocks;
const warnings = (): string[] => warn.mock.calls.map((args) => String(args[0]));
const renames = (harness: Harness): Mock => app(harness).fileManager.renameFile;
/** Adapter calls that change the vault or walk its folders. */
const mutations = (harness: Harness): string[] =>
	harness.adapterCalls.filter((c) => ["writeBinary", "remove", "mkdir", "list", "removeEmptyDir"].includes(c.op)).map((c) => `${c.op} ${c.path}`);

interface Pause {
	reached(): boolean;
	resume(): void;
}

/** Holds the `nth` call of an adapter op (or renameFile) on `path` until resumed; `during` runs when it is reached. */
function pause(harness: Harness, op: AdapterOp | "renameFile", path: string, opts: { nth?: number; during?: () => void } = {}): Pause {
	const mock = op === "renameFile" ? renames(harness) : app(harness).vault.adapter[op];
	const original = mock.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
	let seen = 0;
	let hit = false;
	let release = (): void => undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	mock.mockImplementation(async (...args: unknown[]) => {
		const target = op === "renameFile" ? (args[0] as TFile).path : (args[0] as string);
		if (target === path && ++seen === (opts.nth ?? 1)) {
			hit = true;
			opts.during?.();
			await gate;
		}
		return original(...args);
	});
	return { reached: () => hit, resume: () => release() };
}

async function currentSource(path = "Alt/Angebot.docx", content = "v1"): Promise<Harness> {
	const harness = createHarness();
	harness.addSource(path, content);
	harness.putFile(harness.mirror(path), markedPreview(path, sha256Of(content)));
	await harness.start();
	expect((await harness.status()).current).toBe(1);
	return harness;
}

/** Unloads while `p` holds, then lets it go; returns the mutations and renames made after the unload. */
async function unloadWhile(harness: Harness, p: Pause): Promise<{ mutations: string[]; renames: number }> {
	await harness.settle();
	expect(p.reached()).toBe(true);
	const before = mutations(harness).length;
	const renamesBefore = renames(harness).mock.calls.length;
	harness.unload();
	p.resume();
	await harness.settle();
	await harness.drain();
	return { mutations: mutations(harness).slice(before), renames: renames(harness).mock.calls.length - renamesBefore };
}

describe("handleRename after unload", () => {
	it("stops after reading the old preview", async () => {
		h = await currentSource();
		const p = pause(h, "exists", h.mirror("Alt/Angebot.docx"));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		expect(await unloadWhile(h, p)).toEqual({ mutations: [], renames: 0 });
	});

	it("stops after checking the new mirror path", async () => {
		h = await currentSource();
		const p = pause(h, "exists", h.mirror("Neu/Angebot.docx"));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		expect(await unloadWhile(h, p)).toEqual({ mutations: [], renames: 0 });
	});

	it("stops after fingerprinting the source next to an occupied mirror", async () => {
		h = await currentSource();
		h.putFile(h.mirror("Neu/Angebot.docx"), markedPreview("Neu/Angebot.docx", sha256Of("v1")));
		const p = pause(h, "readBinary", "Neu/Angebot.docx");
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		expect(await unloadWhile(h, p)).toEqual({ mutations: [], renames: 0 });
	});

	it("stops before removing the old image beside a current new one", async () => {
		h = await currentSource();
		h.putFile(h.mirror("Neu/Angebot.docx"), markedPreview("Neu/Angebot.docx", sha256Of("v1")));
		const p = pause(h, "exists", h.mirror("Alt/Angebot.docx"), { nth: 2 });
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		expect(await unloadWhile(h, p)).toEqual({ mutations: [], renames: 0 });
	});

	it("stops after removing the old image beside a current new one", async () => {
		h = await currentSource();
		h.putFile(h.mirror("Neu/Angebot.docx"), markedPreview("Neu/Angebot.docx", sha256Of("v1")));
		const p = pause(h, "remove", h.mirror("Alt/Angebot.docx"));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		expect((await unloadWhile(h, p)).mutations).toEqual([`remove ${h.mirror("Alt/Angebot.docx")}`]);
	});

	it("stops after removing an image whose format no longer fits", async () => {
		h = await currentSource("Alt/Bericht.docx");
		const p = pause(h, "remove", h.mirror("Alt/Bericht.docx"));
		h.renameSource("Alt/Bericht.docx", "Alt/Bericht.pptx");
		expect((await unloadWhile(h, p)).mutations).toEqual([`remove ${h.mirror("Alt/Bericht.docx")}`]);
	});

	it("stops after removing an image the vault has not indexed yet", async () => {
		h = createHarness();
		await h.start();
		h.deferIndexing(h.mirror("Alt/Angebot.docx"));
		h.createSource("Alt/Angebot.docx");
		await h.drain();
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(true);
		const p = pause(h, "remove", h.mirror("Alt/Angebot.docx"));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		expect((await unloadWhile(h, p)).mutations).toEqual([`remove ${h.mirror("Alt/Angebot.docx")}`]);
	});

	it("stops after preparing the new folder", async () => {
		h = await currentSource();
		const p = pause(h, "exists", "_previews/Neu");
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		expect((await unloadWhile(h, p)).renames).toBe(0);
	});

	it("stops after moving the image", async () => {
		h = await currentSource();
		const p = pause(h, "renameFile", h.mirror("Alt/Angebot.docx"));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		expect((await unloadWhile(h, p)).mutations).toEqual([]);
	});
});

describe("handleRename outcomes", () => {
	it("keeps a foreign file that replaced the old image while the new one was checked", async () => {
		h = await currentSource();
		h.putFile(h.mirror("Neu/Angebot.docx"), markedPreview("Neu/Angebot.docx", sha256Of("v1")));
		const harness = h;
		const p = pause(h, "exists", h.mirror("Alt/Angebot.docx"), {
			nth: 2,
			during: () => harness.putFile(harness.mirror("Alt/Angebot.docx"), "foreign"),
		});
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();
		p.resume();
		await h.settle();

		expect(h.readText(h.mirror("Alt/Angebot.docx"))).toBe("foreign");
	});

	it("counts a preview another device already moved as current and removes the leftover and its folder", async () => {
		h = await currentSource();
		h.putFile(h.mirror("Neu/Angebot.docx"), markedPreview("Neu/Angebot.docx", sha256Of("v1")));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();

		expect(await h.status()).toEqual({ current: 1, queued: 0, failed: 0 });
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(false);
		expect(h.folders()).not.toContain("_previews/Alt");
	});

	it("leaves a rename followed by a delete of the new path silent", async () => {
		h = await currentSource();
		h.putFile(h.mirror("Neu/Angebot.docx"), markedPreview("Neu/Angebot.docx", sha256Of("v1")));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		h.deleteFile("Neu/Angebot.docx");
		await h.settle();
		await h.drain();

		expect(warnings()).toEqual([]);
	});

	it("records a collision on an occupied new path that a later delete there clears", async () => {
		h = await currentSource();
		h.putFile(h.mirror("Neu/Angebot.docx"), "foreign");
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();
		expect((await h.status()).failed).toBe(1);

		h.deleteFile(h.mirror("Neu/Angebot.docx"));
		await h.settle();
		await h.drain();

		expect(h.previewMarker("Neu/Angebot.docx")?.sha256).toBe(sha256Of("v1"));
		expect((await h.status()).failed).toBe(0);
	});

	it("keeps a current source current across the move and a stale one not", async () => {
		h = await currentSource();
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();
		expect((await h.status()).current).toBe(1);
		h.dispose();

		h = createHarness();
		h.addSource("Alt/Angebot.docx", "v2");
		h.putFile(h.mirror("Alt/Angebot.docx"), markedPreview("Alt/Angebot.docx", sha256Of("v1")));
		h.renderer.failWith("exit");
		await h.start();
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 1 });
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();

		expect(h.exists(h.mirror("Neu/Angebot.docx"))).toBe(true);
		expect((await h.status()).current).toBe(0);
	});

	it("warns and leaves the old image when it cannot be moved", async () => {
		h = await currentSource();
		renames(h).mockRejectedValueOnce(new Error("EBUSY"));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		await h.settle();
		await h.drain();

		expect(warnings()).toEqual(["LuKit office previews: a preview could not be moved with its document."]);
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(true);
		expect(h.renderer.renderedPaths()).toEqual([]);
	});
});

describe("rename and delete events", () => {
	it("are ignored while previews are off", async () => {
		h = await currentSource();
		h.addSource("Brief.docx", "b");
		h.putFile(h.mirror("Brief.docx"), markedPreview("Brief.docx", sha256Of("b")));
		h.setEnabled(false);
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		h.deleteFile("Brief.docx");
		await h.settle();

		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(true);
		expect(h.exists(h.mirror("Brief.docx"))).toBe(true);
		expect(renames(h)).not.toHaveBeenCalled();
	});

	it("leave a marked image at a non-source's mirror path alone", async () => {
		h = await currentSource();
		h.addSource("Notiz.txt", "x");
		h.putFile("_previews/Notiz.txt.png", markedPreview("Notiz.txt", sha256Of("x")));
		h.renameSource("Notiz.txt", "Notiz.docx");
		h.addSource("Liste.md", "y");
		h.putFile("_previews/Liste.md.png", markedPreview("Liste.md", sha256Of("y")));
		h.deleteFile("Liste.md");
		await h.settle();

		expect(h.exists("_previews/Notiz.txt.png")).toBe(true);
		expect(h.exists("_previews/Liste.md.png")).toBe(true);
	});

	it("drop a source renamed out of scope from the current set", async () => {
		h = await currentSource();
		h.renameSource("Alt/Angebot.docx", "Alt/Angebot.txt");
		await h.settle();

		expect((await h.status()).current).toBe(0);
	});

	it("are not applied once unloaded, even when queued behind a busy one", async () => {
		h = await currentSource();
		h.addSource("Brief.docx", "b");
		h.putFile(h.mirror("Brief.docx"), markedPreview("Brief.docx", sha256Of("b")));
		const p = pause(h, "exists", h.mirror("Alt/Angebot.docx"));
		h.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx");
		h.renameSource("Brief.docx", "Briefe/Brief.docx");
		const after = await unloadWhile(h, p);

		expect(after.renames).toBe(0);
		expect(h.exists(h.mirror("Brief.docx"))).toBe(true);
	});

	it("warn when a preview cannot be removed and keep applying later events", async () => {
		h = await currentSource();
		h.addSource("Brief.docx", "b");
		h.putFile(h.mirror("Brief.docx"), markedPreview("Brief.docx", sha256Of("b")));
		app(h).vault.adapter.remove.mockRejectedValueOnce(new Error("EPERM"));
		h.deleteFile("Alt/Angebot.docx");
		h.renameSource("Brief.docx", "Briefe/Brief.docx");
		await h.settle();

		expect(warnings()).toEqual(["LuKit office previews: a rename or delete could not be applied to its preview."]);
		expect(h.exists(h.mirror("Briefe/Brief.docx"))).toBe(true);
	});

	it("keep a preview whose source came back while it was inspected", async () => {
		h = await currentSource();
		const harness = h;
		const p = pause(h, "exists", h.mirror("Alt/Angebot.docx"), { during: () => harness.createSource("Alt/Angebot.docx", "v1") });
		h.deleteFile("Alt/Angebot.docx");
		await h.settle();
		p.resume();
		await h.settle();

		expect(p.reached()).toBe(true);
		expect(h.exists(h.mirror("Alt/Angebot.docx"))).toBe(true);
	});

	it("stop a delete after its removal once unloaded", async () => {
		h = await currentSource();
		const p = pause(h, "remove", h.mirror("Alt/Angebot.docx"));
		h.deleteFile("Alt/Angebot.docx");
		expect((await unloadWhile(h, p)).mutations).toEqual([`remove ${h.mirror("Alt/Angebot.docx")}`]);
	});
});

describe("collision retry", () => {
	it("ignores files created elsewhere", async () => {
		h = createHarness();
		h.addSource("Angebot.docx", "body");
		h.putFile(h.mirror("Angebot.docx"), "foreign");
		await h.start();
		h.createSource("Notizen/x.md", "x");
		await h.settle();

		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 1 });
	});

	it("retries a collision run found once the foreign file is gone", async () => {
		h = await currentSource("Angebot.docx");
		h.renderer.hold();
		h.changeSource("Angebot.docx", "v2");
		for (let i = 0; i < 30 && h.renderer.held.length === 0; i++) await h.advance(10_000);
		h.putFile(h.mirror("Angebot.docx"), "foreign");
		h.renderer.unhold();
		h.renderer.release();
		await h.settle();
		expect((await h.status()).failed).toBe(1);

		h.deleteFile(h.mirror("Angebot.docx"));
		await h.settle();
		await h.drain();

		expect(h.previewMarker("Angebot.docx")?.sha256).toBe(sha256Of("v2"));
	});
});

const RENDER_NOW = "office-previews-render-active";
const EMBED_MISSING = "office-previews-embed-missing";
const placeholderOf = (sha256: string): Uint8Array => writeMarkerPng(tinyPng(3), { version: 1, sha256, placeholder: true });

/** Persisted failure reasons, read after the final flush of an unload. */
function failureReasons(harness: Harness): Record<string, string> {
	harness.unload();
	const stored = (harness.storage.get(FAILURES_STORAGE_KEY) ?? {}) as Record<string, { reason: string }>;
	return Object.fromEntries(Object.entries(stored).map(([path, f]) => [path, f.reason]));
}

/** "Render now" for `path` through the command, with `path` as the active file. */
async function renderNow(harness: Harness, path: string): Promise<void> {
	harness.setActiveFile(path);
	await harness.runCommand(RENDER_NOW);
}

async function dropped(harness: Harness, source = "_resources/Angebot.docx"): Promise<void> {
	harness.putFile("Notizen/N.md", "Intro\n![[Angebot.docx]]\n");
	harness.openNote("Notizen/N.md");
	harness.drop("Notizen/N.md", ["Angebot.docx"]);
	harness.createSource(source);
	await harness.settle();
}

const failedNotices = (harness: Harness): string[] => harness.notices().filter((n) => n.startsWith("Office-Vorschau fehlgeschlagen"));

describe("run", () => {
	it("records a throw while rendering as an exit failure with a path-free warning", async () => {
		h = createHarness();
		await h.start();
		vi.spyOn(h.renderer, "render").mockRejectedValueOnce(new Error("spawn EACCES"));
		h.createSource("Angebot.docx");
		await h.drain();

		expect(warnings()).toEqual(["LuKit office previews: a source could not be read or rendered."]);
		expect(failureReasons(h)).toEqual({ "Angebot.docx": "exit" });
	});

	it("drops a source whose re-render failed from the current set", async () => {
		h = await currentSource("Angebot.docx");
		h.renderer.failWith("exit");
		h.changeSource("Angebot.docx", "v2");
		await h.drain();

		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 1 });
	});

	it("reports a failed render without a placeholder to a drop and to render now", async () => {
		h = createHarness();
		await h.start();
		h.renderer.failWith("exit");
		h.renderer.placeholderResult = () => ({ ok: false, reason: "exit" });
		await dropped(h);
		expect(failedNotices(h)).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
		expect(h.exists(h.mirror("_resources/Angebot.docx"))).toBe(false);

		await renderNow(h, "_resources/Angebot.docx");
		await h.settle();
		expect(failedNotices(h)).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx", "Office-Vorschau fehlgeschlagen: Angebot.docx"]);
	});

	it("reports no placeholder to render now when a real stale preview stays", async () => {
		h = await currentSource("Angebot.docx");
		h.renderer.failWith("exit");
		h.changeSource("Angebot.docx", "v2");
		await renderNow(h, "Angebot.docx");
		await h.settle();

		expect(failedNotices(h)).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
	});

	it("drops a source counted current during its failing render from the current set", async () => {
		h = await currentSource("Angebot.docx");
		h.renderer.hold();
		h.changeSource("Angebot.docx", "v2");
		for (let i = 0; i < 30 && h.renderer.held.length === 0; i++) await h.advance(10_000);
		h.putFile(h.mirror("Angebot.docx"), markedPreview("Angebot.docx", sha256Of("v2")));
		h.emit("modify", "Angebot.docx");
		await h.advance(10_000);
		expect((await h.status()).current).toBe(1);
		h.renderer.release({ ok: false, reason: "exit" });
		await h.settle();

		expect((await h.status()).current).toBe(0);
	});

	it("records a failed image write as a write failure and tells the drop", async () => {
		h = createHarness();
		await h.start();
		app(h).vault.adapter.writeBinary.mockRejectedValueOnce(new Error("ENOSPC"));
		await dropped(h);

		expect(failedNotices(h)).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
		expect(failureReasons(h)).toEqual({ "_resources/Angebot.docx": "write" });
	});

	it("removes an image that landed after the delete of its source was handled", async () => {
		h = await currentSource("Angebot.docx");
		h.renderer.hold();
		h.changeSource("Angebot.docx", "v2");
		for (let i = 0; i < 30 && h.renderer.held.length === 0; i++) await h.advance(10_000);
		const harness = h;
		const p = pause(h, "writeBinary", h.mirror("Angebot.docx"), { during: () => harness.deleteFile("Angebot.docx") });
		h.renderer.unhold();
		h.renderer.release();
		await h.settle();
		expect(p.reached()).toBe(true);
		expect(h.exists(h.mirror("Angebot.docx"))).toBe(false);
		p.resume();
		await h.settle();

		expect(h.exists(h.mirror("Angebot.docx"))).toBe(false);
	});
});

describe("placeholder", () => {
	it("replaces an older placeholder but keeps a real stale preview", async () => {
		h = createHarness();
		h.addSource("Angebot.docx", "v2");
		h.putFile(h.mirror("Angebot.docx"), placeholderOf(sha256Of("v1")));
		h.addSource("Bericht.docx", "v2");
		h.putFile(h.mirror("Bericht.docx"), markedPreview("Bericht.docx", sha256Of("v1")));
		h.renderer.failWith("exit");
		await h.start();

		expect(h.previewMarker("Angebot.docx")).toEqual({ version: 1, sha256: sha256Of("v2"), placeholder: true });
		expect(h.previewMarker("Bericht.docx")).toEqual({ version: 1, sha256: sha256Of("v1") });
	});

	it("is written as JPEG for a presentation", async () => {
		h = createHarness();
		await h.start();
		h.renderer.failWith("exit");
		h.createSource("Folien.pptx");
		await h.drain();

		const bytes = h.preview("Folien.pptx");
		expect([bytes?.[0], bytes?.[1]]).toEqual([0xff, 0xd8]);
		expect(h.previewMarker("Folien.pptx")?.placeholder).toBe(true);
	});

	it("is not written over a foreign file that arrived during the render", async () => {
		h = createHarness();
		await h.start();
		h.renderer.hold();
		h.createSource("Angebot.docx");
		for (let i = 0; i < 30 && h.renderer.held.length === 0; i++) await h.advance(10_000);
		h.putFile(h.mirror("Angebot.docx"), "foreign");
		h.renderer.release({ ok: false, reason: "exit" });
		await h.settle();

		expect(h.readText(h.mirror("Angebot.docx"))).toBe("foreign");
	});

	it("is not written after an unload or a rename during its rasterization", async () => {
		h = createHarness();
		await h.start();
		h.renderer.failWith("exit");
		const harness = h;
		h.renderer.placeholderResult = () => {
			harness.unload();
			return { ok: true, bytes: tinyPng(9) };
		};
		h.createSource("Angebot.docx");
		await h.drain();
		expect(h.exists(h.mirror("Angebot.docx"))).toBe(false);
		h.dispose();

		h = createHarness();
		await h.start();
		h.renderer.failWith("exit");
		const second = h;
		h.renderer.placeholderResult = () => {
			second.renameSource("Angebot.docx", "Neu.docx");
			return { ok: true, bytes: tinyPng(9) };
		};
		h.createSource("Angebot.docx");
		await h.drain();
		expect(h.adapterCalls.filter((c) => c.op === "writeBinary" && c.path === "_previews/Angebot.docx.png")).toEqual([]);
	});

	it("is not reported to render now when its source moved during the write or the write failed", async () => {
		h = createHarness();
		h.addSource("Alt/Angebot.docx", "v1");
		h.renderer.failWith("exit");
		await h.start();
		expect(h.previewMarker("Alt/Angebot.docx")?.placeholder).toBe(true);
		const harness = h;
		pause(h, "exists", "_previews/Alt", { during: () => harness.renameSource("Alt/Angebot.docx", "Neu/Angebot.docx") }).resume();
		await renderNow(h, "Alt/Angebot.docx");
		await h.settle();
		expect(failedNotices(h)).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
		h.dispose();

		h = createHarness();
		h.addSource("Angebot.docx", "v1");
		h.renderer.failWith("exit");
		await h.start();
		app(h).vault.adapter.writeBinary.mockRejectedValueOnce(new Error("ENOSPC"));
		await renderNow(h, "Angebot.docx");
		await h.settle();
		expect(failedNotices(h)).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
	});
});

describe("recheck", () => {
	it("warns and tells a drop when the source cannot be read", async () => {
		h = createHarness();
		await h.start();
		app(h).vault.adapter.readBinary.mockRejectedValueOnce(new Error("EACCES"));
		await dropped(h);

		expect(warnings()).toEqual(["LuKit office previews: a source or its preview could not be read."]);
		expect(failedNotices(h)).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
	});

	it("reports a collision to render now", async () => {
		h = createHarness();
		h.addSource("Angebot.docx", "body");
		h.putFile(h.mirror("Angebot.docx"), "foreign");
		await h.start();
		await renderNow(h, "Angebot.docx");
		await h.settle();

		expect(failedNotices(h)).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx (am Vorschau-Pfad liegt eine fremde Datei)"]);
	});
});

describe("evaluate", () => {
	it("keeps the failure memory for an unchanged source", async () => {
		h = createHarness();
		h.renderer.failWith("exit");
		h.addSource("Angebot.docx", "body");
		await h.start();
		const calls = h.renderer.calls.length;
		h.emit("modify", "Angebot.docx");
		await h.drain();

		expect(h.renderer.calls).toHaveLength(calls);
	});

	it("warns and queues nothing when the source cannot be read", async () => {
		h = await currentSource("Angebot.docx");
		h.changeSource("Angebot.docx", "v2");
		app(h).vault.adapter.readBinary.mockRejectedValueOnce(new Error("EACCES"));
		await h.drain();

		expect(warnings()).toEqual(["LuKit office previews: a source or its preview could not be read."]);
		expect(h.renderer.calls).toHaveLength(0);
	});
});

describe("reconcile", () => {
	async function pausedPass(): Promise<{ harness: Harness; p: Pause }> {
		const harness = createHarness();
		harness.addSource("a.docx", "a");
		harness.addSource("b.docx", "b");
		const p = pause(harness, "readBinary", "a.docx");
		harness.layoutReady();
		await harness.advance(RECONCILE_DELAY_MS);
		await harness.settle();
		expect(p.reached()).toBe(true);
		return { harness, p };
	}

	it("queues nothing once unloaded while a source is read", async () => {
		const { harness, p } = await pausedPass();
		h = harness;
		h.unload();
		p.resume();
		await h.settle();

		expect(vi.getTimerCount()).toBe(0);
	});

	it("queues nothing once disabled while a source is read", async () => {
		const { harness, p } = await pausedPass();
		h = harness;
		h.setEnabled(false);
		p.resume();
		await h.settle();
		h.setEnabled(true);

		expect((await h.status()).queued).toBe(0);
	});

	it("skips a source deleted before its turn silently", async () => {
		h = createHarness();
		h.addSource("a.docx", "a");
		h.addSource("b.docx", "b");
		h.layoutReady();
		await h.advance(RECONCILE_DELAY_MS);
		h.deleteFile("b.docx");
		await h.drain();

		expect(warnings()).toEqual([]);
		expect(h.renderer.renderedPaths()).toEqual(["a.docx"]);
	});

	it("warns about an unreadable source and goes on with the next", async () => {
		h = createHarness();
		h.addSource("a.docx", "a");
		h.addSource("b.docx", "b");
		app(h).vault.adapter.readBinary.mockRejectedValueOnce(new Error("EACCES"));
		await h.start();

		expect(warnings()).toEqual(["LuKit office previews: a source or its preview could not be read."]);
		expect(h.renderer.renderedPaths()).toEqual(["b.docx"]);
	});
});

describe("commands", () => {
	it("render now rejects a missing active file and a preview whose document is gone", async () => {
		h = createHarness();
		h.putFile("_previews/Weg.docx.png", markedPreview("Weg.docx", sha256Of("x")));
		await h.start();
		h.setActiveFile(null);
		await h.runCommand(RENDER_NOW);
		h.setActiveFile("_previews/Weg.docx.png");
		await h.runCommand(RENDER_NOW);

		const notSource = "Die aktive Datei ist kein unterstütztes Office-Dokument.";
		expect(h.notices().filter((n) => n === notSource)).toHaveLength(2);
		expect(h.renderer.calls).toHaveLength(0);
	});

	it("offers render now in the file menu with the image icon", async () => {
		h = createHarness();
		const file = h.addSource("Angebot.docx");
		await h.start();
		const icons: string[] = [];
		const item = { setTitle: () => item, setIcon: (i: string) => { icons.push(i); return item; }, onClick: () => item };
		for (const fn of h.workspaceListeners.get("file-menu") ?? []) fn({ addItem: (cb: (i: typeof item) => unknown) => cb(item) }, file, "file-explorer");

		expect(icons).toEqual(["image"]);
	});

	async function withPreviews(): Promise<Harness> {
		const harness = createHarness();
		for (const name of ["b.docx", "a.docx"]) {
			harness.addSource(name, name);
			harness.putFile(harness.mirror(name), markedPreview(name, sha256Of(name)));
			harness.putFile(`Notizen/${name}.md`, `[[${name}]]\n`);
		}
		harness.putFile("_previews/Logo.png", markedPreview("Logo.docx", sha256Of("logo")));
		await harness.start();
		return harness;
	}

	it("backfills in ascending image order and ignores marked images that are no preview", async () => {
		h = await withPreviews();
		await h.runCommand(EMBED_MISSING);
		await h.settle();

		expect(h.vaultProcess.mock.calls.map((c) => (c[0] as TFile).path)).toEqual(["Notizen/a.docx.md", "Notizen/b.docx.md"]);
		expect(h.notices()).toContain("Einbettungen ergänzt: 2 in 2 Notizen");
		expect(warnings()).toEqual([]);
	});

	it("backfills nothing and reports nothing when disabled while images are read", async () => {
		h = await withPreviews();
		const harness = h;
		pause(h, "exists", h.mirror("a.docx"), { during: () => harness.setEnabled(false) }).resume();
		await h.runCommand(EMBED_MISSING);
		await h.settle();

		expect(h.vaultProcess).not.toHaveBeenCalled();
		expect(h.notices().filter((n) => n.startsWith("Einbettungen ergänzt"))).toEqual([]);
	});

	it("warns about an unreadable image and backfills the others", async () => {
		h = await withPreviews();
		const read = app(h).vault.adapter.readBinary;
		const original = read.getMockImplementation() as (p: string) => Promise<ArrayBuffer>;
		read.mockImplementation(async (p: string) => {
			if (p === h?.mirror("a.docx")) throw new Error("EACCES");
			return original(p);
		});
		await h.runCommand(EMBED_MISSING);
		await h.settle();

		expect(warnings()).toEqual(["LuKit office previews: a preview could not be read."]);
		expect(h.notices()).toContain("Einbettungen ergänzt: 1 in 1 Notizen");
	});
});

describe("settings section", () => {
	it("names its controls, toggles previews and normalises the folder", async () => {
		h = createHarness();
		await h.start();
		Setting.created.length = 0;
		const el = __stubEl();
		h.feature.renderSettings(el as unknown as HTMLElement, h.plugin as unknown as LuKitPlugin);

		expect([el.children[0].tag, el.children[0].texts]).toEqual(["h3", ["Office-Vorschauen"]]);
		expect(Setting.created.map((s) => [s.name, s.desc])).toEqual([
			["Vorschauen erzeugen", "Rendert die erste Seite jedes Office-Dokuments mit Quick Look als Bild in den Vorschau-Ordner."],
			["Vorschau-Ordner", "Ordner im Vault, der die Ordnerstruktur der Dokumente spiegelt. Bestehende Vorschauen werden beim Ändern nicht verschoben."],
		]);

		let toggled: ((v: boolean) => Promise<void>) | null = null;
		const toggle = { setValue: () => toggle, onChange: (fn: (v: boolean) => Promise<void>) => { toggled = fn; return toggle; } };
		Setting.created[0].toggleFn(toggle);
		let typed: ((v: string) => Promise<void>) | null = null;
		let placeholder = "";
		const text = {
			setPlaceholder: (p: string) => { placeholder = p; return text; },
			setValue: () => text,
			onChange: (fn: (v: string) => Promise<void>) => { typed = fn; return text; },
		};
		Setting.created[1].textFn(text);

		await (typed as unknown as (v: string) => Promise<void>)(" /Anhänge//Vorschau/ ");
		expect(h.settings.officePreviews.folder).toBe("Anhänge/Vorschau");
		expect(placeholder).toBe("_previews");
		await (toggled as unknown as (v: boolean) => Promise<void>)(false);
		expect(h.settings.officePreviews.enabled).toBe(false);
		expect(h.plugin.saveSettings).toHaveBeenCalledTimes(2);
		h.createSource("Angebot.docx");
		await (toggled as unknown as (v: boolean) => Promise<void>)(true);
		await h.advance(RECONCILE_DELAY_MS);
		await h.drain();
		expect(h.renderer.renderedPaths()).toEqual(["Angebot.docx"]);
	});
});

describe("settings section on another platform", () => {
	it("shows its hint as a paragraph", () => {
		h = createHarness({ platform: { isDesktopApp: true, isMacOS: false } });
		const el = __stubEl();
		h.feature.renderSettings(el as unknown as HTMLElement, h.plugin as unknown as LuKitPlugin);

		expect(el.children.map((c: { tag: string }) => c.tag)).toEqual(["h3", "p"]);
	});
});

describe("switching off and unloading", () => {
	it("reports no result for a render now that was running when previews were switched off", async () => {
		h = createHarness();
		await h.start();
		h.addSource("Angebot.docx");
		h.renderer.hold();
		await renderNow(h, "Angebot.docx");
		expect(h.renderer.held).toHaveLength(1);
		await h.settle();
		h.setEnabled(false);
		h.renderer.release();
		await h.settle();

		expect(h.notices().filter((n) => n.startsWith("Office-Vorschau erzeugt"))).toEqual([]);
	});

	it("schedules nothing when switched on after an unload or before a load", async () => {
		h = createHarness();
		await h.start();
		h.unload();
		h.setEnabled(true);
		expect(vi.getTimerCount()).toBe(0);
		h.dispose();

		h = createHarness({ load: false });
		h.setEnabled(true);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("drop and modify events", () => {
	it("treat a drop outside a note and a drop without files as no drop", async () => {
		h = createHarness();
		await h.start();
		for (const fn of h.workspaceListeners.get("editor-drop") ?? []) fn({ dataTransfer: { files: [{ name: "Angebot.docx" }] } }, null, { file: null });
		for (const fn of h.workspaceListeners.get("editor-paste") ?? []) fn({ clipboardData: null }, null, { file: { path: "N.md" } });
		h.createSource("Angebot.docx");
		await h.settle();

		expect(h.renderer.calls).toHaveLength(0);
	});

	it("read nothing for a modify while previews are off", async () => {
		h = await currentSource("Angebot.docx");
		h.setEnabled(false);
		const reads = h.adapterCalls.length;
		h.changeSource("Angebot.docx", "v2");
		await h.advance(10_000);

		expect(h.adapterCalls.slice(reads).filter((c) => c.path === "Angebot.docx")).toEqual([]);
	});
});

describe("fisherYates", () => {
	it("swaps each position with one at or below it and leaves the input alone", () => {
		const input = [1, 2, 3, 4, 5];
		expect(fisherYates(input, () => 0)).toEqual([2, 3, 4, 5, 1]);
		expect(fisherYates(input, () => 0.999)).toEqual([1, 2, 3, 4, 5]);
		expect(input).toEqual([1, 2, 3, 4, 5]);
		const shuffled = fisherYates(input, mulberry32(7));
		expect([...shuffled].sort()).toEqual(input);
	});
});
