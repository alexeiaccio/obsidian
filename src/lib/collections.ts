import type { CollectionAssociation, SourceFilter } from "../sources/types";

/**
 * Which collections an item belongs to, and which it gained or lost.
 *
 * This is the part of the collection UI worth sharing: the Edit modal and the
 * collections picker both need it, and it is pure, so it has a unit test. The two
 * callers differ only in how they render the states.
 */

export interface CollectionState {
	readonly uri: string;
	readonly name: string;
	readonly description?: string;
	readonly source: "semble" | "margin";
	/** Toggled by the UI. */
	isSelected: boolean;
	/** What the item looked like when the picker opened, for diffing. */
	readonly wasSelected: boolean;
	/** The collection-link record to delete when deselected, if the item is in it. */
	readonly linkUri?: string;
}

/** Build the toggle list from a source's collections and its link records. */
export const buildCollectionStates = (params: {
	readonly itemUri: string;
	readonly source: "semble" | "margin";
	readonly collections: readonly SourceFilter[];
	readonly associations: readonly CollectionAssociation[];
}): CollectionState[] => {
	const linked = new Map<string, string>();
	for (const association of params.associations) {
		if (association.record === params.itemUri) {
			linked.set(association.collection, association.linkUri);
		}
	}

	return params.collections.map((collection) => {
		const linkUri = linked.get(collection.value);
		return {
			uri: collection.value,
			name: collection.label ?? collection.value,
			...(collection.description === undefined ? {} : { description: collection.description }),
			source: params.source,
			isSelected: linkUri !== undefined,
			wasSelected: linkUri !== undefined,
			...(linkUri === undefined ? {} : { linkUri }),
		};
	});
};

export interface CollectionChanges {
	readonly toAdd: readonly CollectionState[];
	readonly toRemove: readonly CollectionState[];
}

/** What the toggles actually changed — nothing is written back otherwise. */
export const planCollectionChanges = (
	states: readonly CollectionState[],
): CollectionChanges => ({
	toAdd: states.filter((state) => state.isSelected && !state.wasSelected),
	toRemove: states.filter((state) => !state.isSelected && state.wasSelected),
});
