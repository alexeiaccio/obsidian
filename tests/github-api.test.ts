import { describe, expect, test } from "vitest";
import { GitHubClient, GitHubApiError } from "../src/github-api";

test("GitHubClient constructs with token", () => {
	const client = new GitHubClient("test-token");
	expect(client).toBeDefined();
});

test("GitHubApiError has correct name", () => {
	const err = new GitHubApiError("test", 401);
	expect(err.name).toBe("GitHubApiError");
	expect(err.status).toBe(401);
});

// Integration tests — only run with valid GITHUB_TOKEN
test.skipIf(!process.env.GITHUB_TOKEN)("validateToken returns true for valid token", async () => {
	const client = new GitHubClient(process.env.GITHUB_TOKEN!);
	const valid = await client.validateToken();
	expect(valid).toBe(true);
});

test.skipIf(!process.env.GITHUB_TOKEN)("getStarredRepositories fetches repos", async () => {
	const client = new GitHubClient(process.env.GITHUB_TOKEN!);
	const result = await client.getStarredRepositories(5);
	expect(result.repositories.length).toBeGreaterThan(0);
	expect(result.repositories.length).toBeLessThanOrEqual(5);
	expect(result.repositories[0].name).toBeDefined();
	expect(result.repositories[0].starred_at).toBeDefined();
});

test.skipIf(!process.env.GITHUB_TOKEN)("getStarredRepositories supports incremental sync", async () => {
	const client = new GitHubClient(process.env.GITHUB_TOKEN!);
	// Use a far future timestamp to get 0 results
	const result = await client.getStarredRepositories(100, Date.now() + 100000);
	expect(result.repositories).toHaveLength(0);
});
