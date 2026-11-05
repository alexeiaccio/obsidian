import { Effect } from "effect";
import { requestUrl } from "obsidian";
import { SourceError } from "../effect/Errors";

/**
 * The authenticated user's starred repos, as an Effect.
 *
 * ponytail: first page only (100). Add `Link`-header paging if a profile ever
 * needs more; a token raises the rate limit but is not required for public stars.
 */
export interface GithubStar {
	starred_at?: string;
	repo: {
		full_name: string;
		html_url: string;
		description?: string | null;
		owner?: { avatar_url?: string };
	};
}

export const getGithubStars = Effect.fn("Github.stars")(function* (
	login: string,
	token?: string,
) {
	const headers: Record<string, string> = {
		// Returns `{ starred_at, repo }` instead of a bare repo array.
		Accept: "application/vnd.github.star+json",
		"User-Agent": "obsidian-clipper",
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	const res = yield* Effect.tryPromise({
		try: () =>
			requestUrl({
				url: `https://api.github.com/users/${encodeURIComponent(
					login,
				)}/starred?per_page=100&sort=created`,
				headers,
			}),
		catch: (cause) =>
			new SourceError({ source: "github", message: `stars for ${login}: ${String(cause)}` }),
	});
	if (res.status >= 400) {
		return yield* new SourceError({
			source: "github",
			message: `GitHub API returned ${res.status}`,
		});
	}

	return JSON.parse(res.text) as GithubStar[];
});
