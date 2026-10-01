import { afterEach, describe, expect, it } from "vitest";
import { createHarness, sha256Of, type Harness } from "../helpers/office-previews-harness";

const FAILURES_KEY = "lukit.officePreviews.failures";
const SOURCE = "Projekte/Angebot.docx";
const CONTENT = "document content that fails to render";

describe("SDD office-previews p2 c24", () => {
	let current: Harness | undefined;

	afterEach(() => {
		current?.dispose();
		current = undefined;
	});

	it("does not render a previously failed source again after unload and a storage reload", async () => {
		const storage = new Map<string, unknown>();

		// First session: the render fails and the failure is recorded.
		const first = createHarness({ storage });
		current = first;
		first.renderer.failWith("exit");
		first.addSource(SOURCE, CONTENT);
		await first.start();

		expect(first.renderer.calls).toHaveLength(1);
		expect((await first.status()).failed).toBe(1);

		first.unload();

		// The failure memory is in device-local storage after unload.
		const stored = storage.get(FAILURES_KEY) as Record<string, { sha256: string }> | undefined;
		expect(stored).toBeDefined();
		expect(stored?.[SOURCE]?.sha256).toBe(sha256Of(CONTENT));

		first.dispose();
		current = undefined;

		// Second session: same device storage, same (unchanged) source, no preview in the vault.
		const second = createHarness({ storage });
		current = second;
		second.addSource(SOURCE, CONTENT);
		await second.start();

		expect(second.renderer.calls).toHaveLength(0);
		expect(second.preview(SOURCE)).toBeUndefined();
		const status = await second.status();
		expect(status.queued).toBe(0);
		expect(status.failed).toBe(1);
	});

	it("renders the source again after reload when its content changed since the failure", async () => {
		const storage = new Map<string, unknown>();

		const first = createHarness({ storage });
		current = first;
		first.renderer.failWith("timeout");
		first.addSource(SOURCE, CONTENT);
		await first.start();
		first.unload();
		first.dispose();
		current = undefined;

		const second = createHarness({ storage });
		current = second;
		second.addSource(SOURCE, `${CONTENT} (edited)`);
		await second.start();

		expect(second.renderer.renderedPaths()).toEqual([SOURCE]);
	});
});
