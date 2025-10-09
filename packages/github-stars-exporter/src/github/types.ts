export interface GitHubRepository {
	allow_forking: boolean;
	archive_url: string;
	archived: boolean;
	assignees_url: string;
	blobs_url: string;
	branches_url: string;
	clone_url: string;
	collaborators_url: string;
	comments_url: string;
	commits_url: string;
	compare_url: string;
	contents_url: string;
	contributors_url: string;
	created_at: string;
	default_branch: string;
	deployments_url: string;
	description: string | null;
	disabled: boolean;
	downloads_url: string;
	events_url: string;
	fork: boolean;
	forks: number;
	forks_count: number;
	forks_url: string;
	full_name: string;
	git_commits_url: string;
	git_refs_url: string;
	git_tags_url: string;
	git_url: string;
	has_discussions: boolean;
	has_downloads: boolean;
	has_issues: boolean;
	has_pages: boolean;
	has_projects: boolean;
	has_wiki: boolean;
	homepage: string | null;
	hooks_url: string;
	html_url: string;
	id: number;
	is_template: boolean;
	issue_comment_url: string;
	issue_events_url: string;
	issues_url: string;
	keys_url: string;
	labels_url: string;
	languages_url: string;
	license: {
		key: string;
		name: string;
		node_id: string;
		spdx_id: string;
		url: string;
	} | null;
	merges_url: string;
	milestones_url: string;
	mirror_url: string | null;
	name: string;
	node_id: string;
	notifications_url: string;
	open_issues: number;
	open_issues_count: number;
	owner: GitHubUser | GitHubOrganization;
	permissions: {
		admin: boolean;
		maintain: boolean;
		pull: boolean;
		push: boolean;
		triage: boolean;
	} | null;
	private: boolean;
	pulls_url: string;
	pushed_at: string;
	releases_url: string;
	size: number;
	ssh_url: string;
	stargazers_count: number;
	stargazers_url: string;
	statuses_url: string;
	subscribers_url: string;
	subscription_url: string;
	svn_url: string;
	tags_url: string;
	teams_url: string;
	topics: string[];
	trees_url: string;
	updated_at: string;
	url: string;
	visibility: 'public' | 'private' | 'internal';
	watchers: number;
	watchers_count: number;
	web_commit_signoff_required: boolean;
	readme_content?: string;
}

export interface StarredRepository extends GitHubRepository {
	starred_at: string;
	tags?: string[];
}

export interface GitHubStarsList {
	name: string;
	repos:string[];
}

export interface RepositoryListMembership {
	list_id: string;
	list_name: string;
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

export interface GitHubUser {
	login: string;
	id: number;
	node_id: string;
	avatar_url: string;
	gravatar_id: string;
	url: string;
	html_url: string;
	followers_url: string;
	following_url: string;
	gists_url: string;
	starred_url: string;
	subscriptions_url: string;
	organizations_url: string;
	repos_url: string;
	events_url: string;
	received_events_url: string;
	type: 'User' | 'Organization';
	site_admin: boolean;
	user_view_type?: string;
}

export interface GitHubOrganization extends GitHubUser {
	type: 'Organization';
	description?: string;
	blog?: string;
	location?: string;
	email?: string;
	twitter_username?: string;
	company?: string;
	public_repos: number;
	public_gists: number;
	followers: number;
	following: number;
	created_at: string;
	updated_at: string;
}
