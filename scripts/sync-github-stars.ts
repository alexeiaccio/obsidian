#!/usr/bin/env bun
// scripts/sync-github-stars.ts
import { GitHubClient } from "../src/github-api";
import { config, loadState, saveState } from "./config";
import {
	writeFileToVault,
	sanitizeFileName,
	stringifyFrontmatter,
} from "./vault";

async function syncGitHubStars(incremental = true) {
	if (!config.githubToken) {
		console.error("GITHUB_TOKEN environment variable not set");
		process.exit(1);
	}

	const client = new GitHubClient(config.githubToken);
	const state = loadState();
	const since = incremental ? state.lastGithubSync : 0;

	console.log(
		since
			? `Fetching stars since ${new Date(since).toISOString()}...`
			: "Fetching all starred repos...",
	);

	const { repositories } = await client.getStarredRepositories(
		1000,
		since || undefined,
		(fetched, total) => {
			process.stdout.write(`\rFetched ${fetched}/${total} repos...`);
		},
	);

	console.log(`\nProcessing ${repositories.length} repositories...`);

	for (const repo of repositories) {
		const fileName = `${sanitizeFileName(repo.full_name)}.md`;
		const content = stringifyFrontmatter(
			{
				source: "github",
				url: repo.html_url,
				tags: repo.topics,
				created: repo.starred_at.split("T")[0],
			},
			`# ${repo.full_name}\n\n${repo.description || "No description"}\n\n` +
				`[View on GitHub](${repo.html_url})`,
		);

		await writeFileToVault(`Links/${fileName}`, content);
	}

	state.lastGithubSync = Date.now();
	saveState(state);

	console.log(`Synced ${repositories.length} GitHub stars.`);
}

if (import.meta.main) {
	syncGitHubStars().catch(console.error);
}

export { syncGitHubStars };
