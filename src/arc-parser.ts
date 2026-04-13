import { createReadStream } from "node:fs";
import type {
	ArcJSONItem,
	ArcJSONSpace,
	ArcJSONWrapper,
	ArcSidebarItem,
	ArcSidebarModel,
	ArcSidebarSpace,
} from "./arc-model";

export async function parseArcJson(jsonPath: string): Promise<ArcSidebarModel> {
	const stream = createReadStream(jsonPath, { flags: "r", encoding: "utf8" });
	let buffer = "";

	for await (const chunk of stream) {
		buffer += chunk;
	}

	const wrapper: ArcJSONWrapper = JSON.parse(buffer);
	const spaces: ArcSidebarSpace[] = [];

	for (const space of wrapper.sidebar.containers[1].spaces) {
		const spaceJson = space as ArcJSONSpace;
		const pinnedId =
			(spaceJson.containerIDs || [])[
				(spaceJson.containerIDs || []).indexOf("pinned") + 1
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

	const newItem: ArcSidebarItem = {
		id: itemJson.id,
		parent: parentItem,
		children: [],
		title: itemTitle,
		tag: `${parentItem?.tag || "arc"}-${tag}`,
		url: itemUrl,
	};

	newItem.children = (itemJson.childrenIds || []).reduce(
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

export function flattenItems(item: ArcSidebarItem): ArcSidebarItem[] {
	const result: ArcSidebarItem[] = [];
	if (item.url) result.push(item);
	for (const child of item.children) {
		result.push(...flattenItems(child));
	}
	return result;
}
