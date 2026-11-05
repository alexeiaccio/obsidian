import { Effect } from "effect";
import { readArcTabs, type ArcTab } from "../lib/arc";
import type ClipperPlugin from "../main";
import type { ATBookmarkItem, DataSource } from "./types";

function hostnameOf(url: string): string | undefined {
	try {
		return new URL(url).hostname;
	} catch {
		return undefined;
	}
}

class ArcItem implements ATBookmarkItem {
	private tab: ArcTab;

	constructor(tab: ArcTab) {
		this.tab = tab;
	}

	getUri(): string {
		return `arc://tab/${this.tab.id}`;
	}

	getCid(): string {
		return "";
	}

	getCreatedAt(): string {
		const ms = (this.tab.lastActiveAt ?? 0) * 1000;
		return ms ? new Date(ms).toISOString() : new Date().toISOString();
	}

	getSource(): "arc" {
		return "arc";
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
		return this.tab.title;
	}

	getDescription(): string | undefined {
		return undefined;
	}

	async getImageUrl(): Promise<string | undefined> {
		return undefined;
	}

	getUrl(): string | undefined {
		return this.tab.url;
	}

	getSiteName(): string | undefined {
		return hostnameOf(this.tab.url) ?? "Arc";
	}

	getTags(): string[] {
		return [];
	}

	getCollections(): Array<{ uri: string; name: string; source: string }> {
		return [];
	}

	setCollections(): void {}

	getRecord() {
		return this.tab;
	}
}

const loadTabs = Effect.fn("ArcSource.load")(function* (limit: number) {
	return yield* readArcTabs(limit);
});

export class ArcSource implements DataSource {
	readonly name = "arc" as const;

	async fetchItems(plugin: ClipperPlugin): Promise<ATBookmarkItem[]> {
		const tabs = await Effect.runPromise(loadTabs(plugin.settings.arc?.maxItems ?? 200));
		return tabs.map((tab) => new ArcItem(tab));
	}
}
