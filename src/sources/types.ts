import type ClipperPlugin from "../main";

export interface ConnectionInfo {
	/** e.g. SUPPORTS / OPPOSES / RELATED; absent means a generic association. */
	type?: string;
	direction: "outgoing" | "incoming";
	url?: string;
	title?: string;
	note?: string;
}

export interface ATBookmarkItem {
	canAddNotes(): boolean;
	canAddTags(): boolean;
	canAddToCollections(): boolean;
	canEdit(): boolean;
	getUri(): string;
	getCid(): string;
	getCreatedAt(): string;
	getSource(): "semble" | "bookmark" | "margin" | "tangled" | "github" | "arc";
	getTitle(): string | undefined;
	getDescription(): string | undefined;
	getImageUrl(): Promise<string | undefined>;
	getUrl(): string | undefined;
	getSiteName(): string | undefined;
	getTags(): string[];
	getCollections(): Array<{ uri: string; name: string; source: string }>;
	setCollections(collections: Array<{ uri: string; name: string; source: string }>): void;
	getAttachedNotes?(): Array<{ uri: string; text: string }>;
	getConnections?(): ConnectionInfo[];
}

export interface SourceFilter {
	value: string;
	label?: string;
	description?: string;
}

export interface CollectionAssociation {
	record: string;
	collection: string;
	linkUri: string;
}

export interface DataSource {
	readonly name: "semble" | "bookmark" | "margin" | "tangled" | "github" | "arc";
	fetchItems(plugin: ClipperPlugin, filteredCollections: Set<string>, filteredTags: Set<string>, force?: boolean): Promise<ATBookmarkItem[]>;
	getAvailableCollections?(): Promise<SourceFilter[]>;
	getAvilableTags?(): Promise<SourceFilter[]>;
	getCollectionAssociations?(): Promise<CollectionAssociation[]>;
	deleteItem?(itemUri: string): Promise<void>;
	addToCollection?(itemUri: string, itemCid: string, collectionUri: string): Promise<void>;
	removeFromCollection?(linkUri: string): Promise<void>;
	updateTags?(itemUri: string, tags: string[]): Promise<void>;
}
