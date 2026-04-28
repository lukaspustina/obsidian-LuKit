import { describe, it, expect } from "vitest";

// Snapshot test guards against accidentally adding/removing/renaming a feature
// command without updating the corresponding helpEntries() registration.
//
// helpEntries() is a pure method on each feature class. The "obsidian" import
// is aliased to tests/helpers/obsidian-stub.ts in vitest.config.ts so feature
// modules can load under vitest without a real Obsidian runtime.

import { WorkDiaryFeature } from "../../src/features/work-diary/work-diary-feature";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import { MigrationFeature } from "../../src/features/migration/migration-feature";

describe("LuKitFeature.helpEntries() registry", () => {
	it("matches the snapshot", () => {
		const features = [
			new WorkDiaryFeature(),
			new VorgangFeature(),
			new BesprechungFeature(),
			new MigrationFeature(),
		];
		const entries = features.flatMap((f) => f.helpEntries?.() ?? []);
		expect(entries).toMatchSnapshot();
	});
});
