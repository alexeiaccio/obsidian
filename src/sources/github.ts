import { Effect } from "effect";
import { getGithubStars, type GithubStar } from "../lib/github";
import type ClipperPlugin from "../main";
import type { ATBookmarkItem, DataSource } from "./types";

class GithubItem implements ATBookmarkItem {
	private star: GithubStar;

	constructor(star: GithubStar) {
		this.star = star;
	}

	getUri(): string {
		return this.star.repo.html_url;
	}

	getCid(): string {
		return "";
	}

	getCreatedAt(): string {
		return this.star.starred_at ?? new Date().toISOString();
	}

	getSource(): "github" {
		return "github";
	}

	canAddNotes(): boolean {
		return false;
	}

	canAddTags(): boolean {
		return false;
	}

	canAddToCollections(): boolean {
		return false;
	}

	canEdit(): boolean {
		return false;
	}

	getTitle(): string | undefined {
		return this.star.repo.full_name;
	}

	getDescription(): string | undefined {
		return this.star.repo.description ?? undefined;
	}

	async getImageUrl(): Promise<string | undefined> {
		return this.star.repo.owner?.avatar_url;
	}

	getUrl(): string | undefined {
		return this.star.repo.html_url;
	}

	getSiteName(): string | undefined {
		return "GitHub";
	}

	getTags(): string[] {
		return [];
	}

	getCollections(): Array<{ uri: string; name: string; source: string }> {
		return [];
	}

	setCollections(): void {}

	getRecord() {
		return this.star;
	}
}

const loadStars = Effect.fn("GithubSource.load")(function* (
	login: string,
	token: string | undefined,
	max: number,
) {
	const stars = yield* getGithubStars(login, token);
	return stars.slice(0, max);
});

export class GithubSource implements DataSource {
	readonly name = "github" as const;

	async fetchItems(plugin: ClipperPlugin): Promise<ATBookmarkItem[]> {
		const login = plugin.settings.github?.login;
		if (!login) {
			return [];
		}

		const stars = await Effect.runPromise(
			loadStars(login, plugin.settings.github?.token, plugin.settings.github?.maxItems ?? 100),
		);
		return stars.map((star) => new GithubItem(star));
	}
}
