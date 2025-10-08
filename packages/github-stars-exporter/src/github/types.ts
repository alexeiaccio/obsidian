export interface GitHubRepository {
	id: number;
	name: string;
	full_name: string;
	owner: {
		login: string;
		id: number;
		type: string;
	};
	description: string | null;
	html_url: string;
	homepage: string | null;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	topics: string[];
	created_at: string;
	updated_at: string;
	pushed_at: string;
	readme_content?: string;
}

export interface StarredRepository extends GitHubRepository {
	starred_at: string;
}

export interface GitHubApiResponse<T> {
	items: T[];
	total_count: number;
	incomplete_results: boolean;
}

export interface GitHubApiErrorResponse {
	message: string;
	documentation_url?: string;
	errors?: Array<{
		resource: string;
		field: string;
		code: string;
	}>;
}