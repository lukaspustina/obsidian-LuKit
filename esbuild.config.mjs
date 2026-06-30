import esbuild from "esbuild";
import process from "process";
import { readFileSync } from "node:fs";

const mode = process.argv[2];
const prod = mode === "production";
const cli = mode === "cli";

const version = JSON.parse(readFileSync("./manifest.json", "utf8")).version;

if (cli) {
	await esbuild.build({
		entryPoints: ["src/cli.ts"],
		bundle: true,
		platform: "node",
		format: "cjs",
		target: "es2022",
		logLevel: "info",
		treeShaking: true,
		outfile: "cli.js",
		banner: { js: "#!/usr/bin/env node" },
		define: { "__CLI_VERSION__": JSON.stringify(version) },
	});
	process.exit(0);
}

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", "child_process", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands", "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view", "@lezer/common", "@lezer/highlight", "@lezer/lr"],
	format: "cjs",
	target: "es2022",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
