const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_PER_PAGE = 100;

export interface StarredRepository {
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	homepage: string | null;
	topics: string[];
	created_at: string;
	updated_at: string;
	starred_at: string;
	owner: { login: string; type: string };
}

export class GitHubApiError extends Error {
	constructor(
		message: string,
		public status?: number,
	) {
		super(message);
		this.name = "GitHubApiError";
	}
}

export class GitHubClient {
	constructor(private token: string) {}

	private async makeRequest<T>(
		url: string,
	): Promise<{ data: T; headers: [string, string][] }> {
		const headers: HeadersInit = {
			Accept: "application/vnd.github.v3.star+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "vault-sync-cli",
		};

		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		const response = await fetch(url, { headers });

		if (!response.ok) {
			throw new GitHubApiError(
				`HTTP ${response.status}: ${response.statusText}`,
				response.status,
			);
		}

		return {
			headers: [...response.headers.entries()],
			data: await response.json(),
		};
	}

	async me(): Promise<{ login: string }> {
		const result = await this.makeRequest<{ login: string }>(
			`${GITHUB_API_BASE}/user`,
		);
		return result.data;
	}

	async validateToken(): Promise<boolean> {
		try {
			await this.me();
			return true;
		} catch {
			return false;
		}
	}

	async getStarredRepositories(
		maxStars: number = 1000,
		since?: number,
		onProgress?: (fetched: number, total: number) => void,
	): Promise<{ repositories: StarredRepository[]; totalCount: number }> {
		const repositories: StarredRepository[] = [];
		let page = 1;
		let totalCount = 0;

		const firstResponse = await this.makeRequest<StarredRepository[]>(
			`${GITHUB_API_BASE}/user/starred?per_page=1&page=1`,
		);

		const linkHeader = firstResponse.headers.find(
			([key]) => key === "link",
		)?.[1];
		const match = linkHeader?.match(/page=(\d+)>; rel="last"/);
		if (match) {
			totalCount = Number(match[1]);
		}

		do {
			const url = `${GITHUB_API_BASE}/user/starred?per_page=${Math.min(DEFAULT_PER_PAGE, maxStars)}&page=${page}`;
			const pageData = await this.makeRequest<StarredRepository[]>(url);

			for (const repo of pageData.data) {
				if (since && new Date(repo.starred_at).getTime() < since) {
					return { repositories, totalCount };
				}
				repositories.push(repo);
			}

			if (onProgress) {
				onProgress(repositories.length, totalCount || repositories.length);
			}

			if (
				repositories.length >= maxStars ||
				pageData.data.length < DEFAULT_PER_PAGE
			) {
				break;
			}

			page++;
		} while (repositories.length < maxStars);

		return { repositories, totalCount };
	}

	async getReadmeContent(owner: string, repo: string): Promise<string | null> {
		try {
			const readmeData = await this.makeRequest<{ content: string }>(
				`${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`,
			);
			return atob(readmeData.data.content);
		} catch {
			return null;
		}
	}
}
