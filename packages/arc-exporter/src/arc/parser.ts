import { createReadStream } from "node:fs";
import { access, constants } from "node:fs/promises";
import { normalize } from "node:path";
import type {
	ArcJSONItem,
	ArcJSONSpace,
	ArcJSONWrapper,
	ArcSidebarItem,
	ArcSidebarModel,
	ArcSidebarSpace,
} from "./model";

export async function parseArcJson(jsonPath: string): Promise<ArcSidebarModel> {
	try {
		const stream = createReadStream(jsonPath, { flags: "r", encoding: "utf8" });
		let buffer = "";
		const spaces: ArcSidebarSpace[] = [];

		for await (const chunk of stream) {
			buffer += chunk;
		}

		const wrapper: ArcJSONWrapper = JSON.parse(buffer);

		for (const space of wrapper.sidebar.containers[1].spaces) {
			const spaceJson = space as ArcJSONSpace;
			const pinnedId =
				spaceJson?.containerIDs?.[
					spaceJson.containerIDs?.indexOf("pinned") + 1
				];
			const spaceItemJson = wrapper.sidebar.containers[1].items.find(
				(value) => (value as ArcJSONItem).id === pinnedId,
			) as ArcJSONItem;
			if (spaceItemJson && typeof spaceItemJson === "object") {
				spaceItemJson.title = spaceJson.title;

				spaces.push({
					id: spaceJson.id,
					title: spaceJson.title,
					item: createItem(
						spaceItemJson,
						wrapper.sidebar.containers[1].items as ArcJSONItem[],
						null,
					),
				});
			}
		}

		return { spaces };
	} catch (err) {
		console.log("error parsing json", err);
		return { spaces: [] };
	}
}

function createItem(
	itemJson: ArcJSONItem,
	allItemsJson: ArcJSONItem[],
	parentItem: ArcSidebarItem | null,
): ArcSidebarItem {
	let itemTitle = itemJson.title;
	let itemUrl: string | null = null;
	if (itemJson.data?.tab) {
		itemUrl = itemJson.data.tab.savedURL;
		if (!itemTitle) itemTitle = itemJson.data.tab.savedTitle;
	}
	const tag: string = (itemTitle || "").toLowerCase().replace(/\W+/g, "");

	const newItem = {
		id: itemJson.id,
		parent: parentItem,
		children: <ArcSidebarItem[]>[],
		title: itemTitle,
		tag: `${parentItem?.tag || "arc"}-${tag}`,
		url: itemUrl,
	};

	newItem.children = itemJson.childrenIds.reduce(
		(acc: ArcSidebarItem[], childId: string) => {
			const childItemJson = allItemsJson.find((item) => item.id === childId);
			if (childItemJson != null) {
				acc.push(createItem(childItemJson, allItemsJson, newItem));
			}
			return acc;
		},
		[],
	);

	return newItem;
}

export function filterItems(
	items: ArcSidebarItem[],
	key: keyof ArcSidebarItem,
	query: string | string[],
	exact = true,
) {
	const matchingItems = (result: ArcSidebarItem[], item: ArcSidebarItem) => {
		const queries: string[] = Array.isArray(query) ? query : [query];

		if (exact) {
			const isMatching = (query: string) => item[key] === query;
			if (queries.some(isMatching)) {
				result.push(item);
				return result;
			}
		} else {
			const isMatching = (query: string) =>
				item[key]?.toString().includes(query);
			if (queries.some(isMatching)) {
				result.push(item);
				return result;
			}
		}

		const childItems = item.children.reduce(matchingItems, []);
		if (childItems.length) {
			item.children = childItems;
			result.push(item);
		}

		return result;
	};

	return items.reduce(matchingItems, []);
}

export async function validatePath(path: string): Promise<boolean> {
	const normalizedPath = normalize(path);
	try {
		await access(normalizedPath, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}
