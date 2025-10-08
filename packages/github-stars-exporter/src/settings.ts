export interface GitHubStarsExporterSettings {
	githubToken: string;
	defaultOutputFolder: string;
	autoSyncEnabled: boolean;
	syncInterval: "daily" | "weekly" | "monthly";
	lastSyncTimestamp: number;
	template: string;
	includeReadme: boolean;
	maxStarsToFetch: number;
}

export const DEFAULT_SETTINGS: GitHubStarsExporterSettings = {
	githubToken: "",
	defaultOutputFolder: "GitHub Stars",
	autoSyncEnabled: false,
	syncInterval: "weekly",
	lastSyncTimestamp: 0,
	template: `# {name}

**Owner:** {owner}
**Language:** {language}
**Stars:** ⭐ {stars}
**Forks:** 🍴 {forks}
**Last Updated:** {updated_at}

## Description
{description}

## Topics
{topics}

## Links
- **Repository:** [{full_name}]({html_url})
- **Homepage:** {homepage}

---
*Starred on: {starred_at}*`,
	includeReadme: false,
	maxStarsToFetch: 1000,
};