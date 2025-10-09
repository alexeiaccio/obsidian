import { defineConfig } from "vitest/config";

export default defineConfig(() => {
	return {
		test: {
			includeSource: ["src/**/*.{js,ts}"],
			env: {
				GITHUB_TOKEN: process.env.GITHUB_TOKEN,
			},
		},
	};
});
