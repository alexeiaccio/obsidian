import type {
	GitHubApiErrorResponse,
	StarredRepository,
} from "./types";

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_PER_PAGE = 100;

export class GitHubApiError extends Error {
	constructor(
		message: string,
		public status?: number,
		public response?: GitHubApiErrorResponse,
	) {
		super(message);
		this.name = "GitHubApiError";
	}
}

export class GitHubClient {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	private async makeRequest<T>(
		url: string,
		options: RequestInit = {},
	): Promise<T> {
		const headers: HeadersInit = {
			Accept: "application/vnd.github.v3.star+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "Obsidian-GitHub-Stars-Exporter",
		};

		if (this.token) {
			(headers as Record<string, string>)["Authorization"] =
				`Bearer ${this.token}`;
		}

		const response = await fetch(url, {
			...options,
			headers,
		});

		if (!response.ok) {
			let errorData: GitHubApiErrorResponse | undefined;
			try {
				errorData = await response.json();
			} catch {
				// Ignore JSON parse errors
			}

			throw new GitHubApiError(
				errorData?.message || `HTTP ${response.status}: ${response.statusText}`,
				response.status,
				errorData,
			);
		}

		return response.json();
	}

	async validateToken(): Promise<boolean> {
		try {
			await this.makeRequest(`${GITHUB_API_BASE}/user`);
			return true;
		} catch (error) {
			console.error("Token validation failed:", error);
			return false;
		}
	}

	async getStarredRepositories(
		maxStars: number = 1000,
		onProgress?: (fetched: number, total: number) => void,
	): Promise<StarredRepository[]> {
		const repositories: StarredRepository[] = [];
		let page = 1;
		let totalCount = 0;

		try {
			// First, get the total count
			const firstResponse: StarredRepository[] = await this.makeRequest(
				`${GITHUB_API_BASE}/user/starred?per_page=1&page=1`,
			);

			// Extract total count from Link header
			const linkHeader = "";
			const match = linkHeader.match(/page=(\d+)>; rel="last"/);
			if (match) {
				totalCount = Math.min(parseInt(match[1]) * DEFAULT_PER_PAGE, maxStars);
			}

			do {
				const url = `${GITHUB_API_BASE}/user/starred?per_page=${DEFAULT_PER_PAGE}&page=${page}`;
				const pageData: StarredRepository[] = await this.makeRequest(url);

				repositories.push(...pageData);

				if (onProgress) {
					onProgress(repositories.length, totalCount || repositories.length);
				}

				// Stop if we've reached maxStars or there are no more results
				if (
					repositories.length >= maxStars ||
					pageData.length < DEFAULT_PER_PAGE
				) {
					break;
				}

				page++;
			} while (repositories.length < maxStars);

			return repositories.slice(0, maxStars);
		} catch (error) {
			console.error("Failed to fetch starred repositories:", error);
			throw error;
		}
	}

	async getReadmeContent(owner: string, repo: string): Promise<string | null> {
		try {
			const readmeData = await this.makeRequest(
				`${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`,
			);

			if (
				readmeData &&
				typeof readmeData === "object" &&
				"content" in readmeData
			) {
				// GitHub API returns base64 encoded content
				const content = (readmeData as any).content;
				return atob(content);
			}

			return null;
		} catch (error) {
			console.warn(`Failed to fetch README for ${owner}/${repo}:`, error);
			return null;
		}
	}

	getRateLimitInfo(): Promise<any> {
		return this.makeRequest(`${GITHUB_API_BASE}/rate_limit`);
	}
}
