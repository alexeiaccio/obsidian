import { describe, expect, it } from "vitest";
import { buildCollectionStates, planCollectionChanges, type CollectionState } from "./collections";

describe("buildCollectionStates", () => {
	it("marks the collections the item is already linked to", () => {
		const states = buildCollectionStates({
			itemUri: "at://did/card/1",
			source: "semble",
			collections: [
				{ value: "at://did/collection/1", label: "One" },
				{ value: "at://did/collection/2", label: "Two", description: "Second" },
			],
			associations: [
				{
					record: "at://did/card/1",
					collection: "at://did/collection/2",
					linkUri: "at://did/link/9",
				},
			],
		});

		expect(states.map((state) => [state.name, state.isSelected, state.wasSelected, state.linkUri])).toEqual([
			["One", false, false, undefined],
			["Two", true, true, "at://did/link/9"],
		]);
		expect(states[1]?.description).toBe("Second");
	});

	it("ignores links recorded against a different item", () => {
		const states = buildCollectionStates({
			itemUri: "at://did/card/1",
			source: "semble",
			collections: [{ value: "at://did/collection/1", label: "One" }],
			associations: [
				{
					record: "at://did/card/OTHER",
					collection: "at://did/collection/1",
					linkUri: "at://did/link/1",
				},
			],
		});

		expect(states[0]?.isSelected).toBe(false);
		expect(states[0]?.linkUri).toBeUndefined();
	});

	it("falls back to the uri when a collection has no label", () => {
		const states = buildCollectionStates({
			itemUri: "at://did/card/1",
			source: "margin",
			collections: [{ value: "at://did/collection/7" }],
			associations: [],
		});

		expect(states[0]?.name).toBe("at://did/collection/7");
		expect(states[0]?.source).toBe("margin");
	});
});

describe("planCollectionChanges", () => {
	const state = (over: Partial<CollectionState>): CollectionState => ({
		uri: "u",
		name: "n",
		source: "semble",
		isSelected: false,
		wasSelected: false,
		...over,
	});

	it("adds only newly selected and removes only newly deselected", () => {
		const changes = planCollectionChanges([
			state({ uri: "added", isSelected: true, wasSelected: false }),
			state({ uri: "removed", isSelected: false, wasSelected: true, linkUri: "link" }),
			state({ uri: "kept", isSelected: true, wasSelected: true, linkUri: "link" }),
			state({ uri: "untouched", isSelected: false, wasSelected: false }),
		]);

		expect(changes.toAdd.map((entry) => entry.uri)).toEqual(["added"]);
		expect(changes.toRemove.map((entry) => entry.uri)).toEqual(["removed"]);
	});

	it("returns nothing when nothing changed", () => {
		const changes = planCollectionChanges([
			state({ isSelected: true, wasSelected: true }),
			state({ isSelected: false, wasSelected: false }),
		]);

		expect(changes.toAdd).toHaveLength(0);
		expect(changes.toRemove).toHaveLength(0);
	});
});
