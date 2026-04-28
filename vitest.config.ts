import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(__dirname, "tests/helpers/obsidian-stub.ts"),
		},
	},
	test: {
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 70,
			},
		},
	},
});
