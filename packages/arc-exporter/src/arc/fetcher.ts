import type { ArcSidebarItem, ArcSidebarSpace } from "./model";
import { parseArcJson } from "./parser";

export async function getSpaces(jsonPath: string): Promise<ArcSidebarSpace[]> {
	try {
		const sidebar = await parseArcJson(jsonPath);

		return sidebar.spaces;
	} catch (error) {
		console.error("Failed to get spaces from JSON:", error);
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(
				`Arc sidebar file not found: ${jsonPath}. Ensure Arc is running.`,
			);
		}
		throw error;
	}
}

export async function getPinnedItems(
	spaceNames: string[],
	jsonPath: string,
): Promise<ArcSidebarItem[]> {
	try {
		const spaces = await getSpaces(jsonPath);

		if (!spaces?.[0]) return [];

		const pinnedItems: ArcSidebarItem[] = [];
		for (const space of spaces) {
			if (!spaceNames.includes(space.title)) continue;
			pinnedItems.push(...space.item.children);
		}
		return pinnedItems;
	} catch (error) {
		console.error(
			`Failed to get pinned items for ${spaceNames.join(", ")}:`,
			error,
		);
		throw error;
	}
}
