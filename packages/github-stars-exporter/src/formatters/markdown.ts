import type { StarredRepository } from "../github/types";

export function formatRepositoryMarkdown(
	repo: StarredRepository,
	template: string,
	includeReadme: boolean = false,
): string {
	let content = template;

	// Basic repository information
	content = content.replace(/{name}/g, repo.name);
	content = content.replace(/{full_name}/g, repo.full_name);
	content = content.replace(/{owner}/g, repo.owner.login);
	content = content.replace(/{description}/g, repo.description || "No description available");
	content = content.replace(/{language}/g, repo.language || "Unknown");
	content = content.replace(/{stars}/g, repo.stargazers_count.toString());
	content = content.replace(/{forks}/g, repo.forks_count.toString());
	content = content.replace(/{html_url}/g, repo.html_url);
	content = content.replace(/{homepage}/g, repo.homepage || "No homepage");

	// Dates
	content = content.replace(/{created_at}/g, new Date(repo.created_at).toLocaleDateString());
	content = content.replace(/{updated_at}/g, new Date(repo.updated_at).toLocaleDateString());
	content = content.replace(/{pushed_at}/g, new Date(repo.pushed_at).toLocaleDateString());
	content = content.replace(/{starred_at}/g, new Date(repo.starred_at).toLocaleDateString());

	// Topics
	const topicsList = repo.topics.length > 0
		? repo.topics.map(topic => `\`${topic}\``).join(", ")
		: "No topics";
	content = content.replace(/{topics}/g, topicsList);

	// README content
	if (includeReadme && repo.readme_content) {
		content = content.replace(/{readme}/g, `\n\n## README\n\n${repo.readme_content}`);
	} else {
		content = content.replace(/{readme}/g, "");
	}

	// Handle conditional blocks
	content = content.replace(/{{#if homepage}}([\s\S]*?){{\/if}}/g,
		repo.homepage ? "$1" : "");
	content = content.replace(/{{#if language}}([\s\S]*?){{\/if}}/g,
		repo.language ? "$1" : "");
	content = content.replace(/{{#if topics}}([\s\S]*?){{\/if}}/g,
		repo.topics.length > 0 ? "$1" : "");

	return content;
}

export function generateDefaultFileName(repo: StarredRepository): string {
	// Sanitize the repository name for file system
	const sanitizedName = repo.full_name.replace(/[<>:"/\\|?*]/g, "-");
	return `${sanitizedName}.md`;
}

export function createBacklinkIndex(repositories: StarredRepository[]): string {
	const indexContent = [
		"# GitHub Stars Index",
		"",
		`*Total repositories: ${repositories.length}*`,
		"",
		"## By Language",
		"",
	];

	// Group by language
	const byLanguage = new Map<string, StarredRepository[]>();
	repositories.forEach(repo => {
		const lang = repo.language || "Unknown";
		if (!byLanguage.has(lang)) {
			byLanguage.set(lang, []);
		}
		byLanguage.get(lang)!.push(repo);
	});

	// Sort languages alphabetically
	const sortedLanguages = Array.from(byLanguage.keys()).sort();

	sortedLanguages.forEach(lang => {
		indexContent.push(`### ${lang}`);
		const repos = byLanguage.get(lang)!;
		repos.forEach(repo => {
			const fileName = generateDefaultFileName(repo);
			indexContent.push(`- [${repo.full_name}](${fileName}) - ${repo.description || "No description"}`);
		});
		indexContent.push("");
	});

	// Add by starred date section
	indexContent.push("## By Starred Date");
	indexContent.push("");
	const sortedByDate = [...repositories].sort((a, b) =>
		new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime()
	);

	sortedByDate.forEach(repo => {
		const fileName = generateDefaultFileName(repo);
		const starredDate = new Date(repo.starred_at).toLocaleDateString();
		indexContent.push(`- [${repo.full_name}](${fileName}) - Starred on ${starredDate}`);
	});

	return indexContent.join("\n");
}