import type { ArcSidebarItem } from "./arc/model";

export interface ContentResponse {
	content: string;
	selectedHtml: string;
	extractedContent: { [key: string]: string };
	schemaOrgData: any;
	fullHtml: string;
	highlights: string[];
	title: string;
	description: string;
	domain: string;
	favicon: string;
	image: string;
	parseTime: number;
	published: string;
	author: string;
	site: string;
	wordCount: number;
	metaTags: {
		name?: string | null;
		property?: string | null;
		content: string | null;
	}[];
}

export interface ScrapedSpace {
	name: string;
	pinnedItems: ArcSidebarItem[];
}

export function formatSpaceNote(space: ScrapedSpace): string {
	const { name, pinnedItems } = space;
	const count = pinnedItems.length;
	const frontmatter = `---
arc_spaces: "${name}"
pinned_count: ${count}
export_date: ${new Date().toISOString().split("T")[0]}
---

# Arc Space: ${name}

Pinned items (${count}) from Arc browser space.

`;

	if (count === 0) {
		return `${frontmatter}No pinned items found.`;
	}

	const itemsSection = pinnedItems
		.map((item) => {
			if (item.children.length) {
				return `## ${item.title}
${item.children.map((child) => formatItem(child)).join("\n")}`;
			}

			return formatItem(item);
		})
		.join("\n\n");

	return frontmatter + itemsSection;
}

function formatItem(item: ArcSidebarItem): string {
	return `### ${item.title}
- **Link**: ${item.url}`;
}
