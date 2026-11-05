import { builtinModules } from "node:module";
import { defineConfig } from "vite-plus";

/**
 * Builds the Obsidian plugin bundle.
 *
 * Obsidian loads a single CommonJS `main.js` at the plugin root, so we emit CJS
 * to `.` (not `dist/`), inline dynamic imports into one file, and keep only what
 * Obsidian/Electron provide at runtime external. `clean: false` is essential —
 * the output directory is the package.
 */
export default defineConfig({
	pack: {
		entry: ["src/main.ts"],
		format: ["cjs"],
		outDir: ".",
		clean: false,
		dts: false,
		sourcemap: false,
		minify: true,
		platform: "browser",
		target: "es2022",
		outputOptions: {
			inlineDynamicImports: true,
		},
		deps: {
			// Everything Obsidian/Electron provides at runtime stays external.
			neverBundle: [
				"obsidian",
				"electron",
				"@codemirror/autocomplete",
				"@codemirror/collab",
				"@codemirror/commands",
				"@codemirror/language",
				"@codemirror/lint",
				"@codemirror/search",
				"@codemirror/state",
				"@codemirror/view",
				"@lezer/common",
				"@lezer/highlight",
				"@lezer/lr",
				"fs/promises",
				...builtinModules,
				...builtinModules.map((name) => `node:${name}`),
			],
			// Obsidian cannot resolve node_modules, so every other dependency is bundled.
			alwaysBundle: [/.*/],
		},
	},
});
