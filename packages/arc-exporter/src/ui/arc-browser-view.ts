import { Defuddle } from "defuddle/node";
import { JSDOM } from "jsdom";
import {
	ItemView,
	Notice,
	type TFile,
	type WorkspaceLeaf,
} from "obsidian";
import { getPinnedItems, getSpaces } from "../arc/fetcher";
import type { ArcSidebarItem, ArcSidebarSpace } from "../arc/model";
import type { ArcExporterSettings } from "../settings";
import { createExportFile, getOutputFolder } from "../utils/file-helper";

export const VIEW_TYPE_ARC_BROWSER = "arc-browser-view";

export class ArcBrowserView extends ItemView {
	private settings: ArcExporterSettings;
	private spaces: ArcSidebarSpace[] = [];
	private selectedSpace: ArcSidebarSpace | null = null;
	private links: ArcSidebarItem[] = [];

	constructor(leaf: WorkspaceLeaf, settings: ArcExporterSettings) {
		super(leaf);
		this.settings = settings;
	}

	getViewType() {
		return VIEW_TYPE_ARC_BROWSER;
	}

	getDisplayText() {
		return "Arc Browser";
	}

	getIcon() {
		return "compass";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("arc-browser-view");

		this.createUI(container);
		await this.loadSpaces();
	}

	async onClose() {
		// Cleanup if needed
	}

	private createUI(container: Element) {
		// Header
		const header = container.createEl("div", { cls: "arc-view-header" });
		header.createEl("h3", { text: "Arc Browser", cls: "arc-view-title" });

		// Refresh button
		const refreshBtn = header.createEl("button", {
			text: "🔄 Refresh",
			cls: "arc-refresh-btn",
		});
		refreshBtn.addEventListener("click", () => {
			this.loadSpaces();
		});

		// Main content area
		const mainContent = container.createEl("div", { cls: "arc-main-content" });

		// Spaces section
		const spacesSection = mainContent.createEl("div", {
			cls: "arc-spaces-section",
		});
		spacesSection.createEl("h4", { text: "Spaces", cls: "arc-section-title" });
		const spacesList = spacesSection.createEl("div", {
			cls: "arc-spaces-list",
		});

		// Links section
		const linksSection = mainContent.createEl("div", {
			cls: "arc-links-section",
		});
		linksSection.createEl("h4", { text: "Links", cls: "arc-section-title" });
		const linksList = linksSection.createEl("div", { cls: "arc-links-list" });

		// Store references for later updates
		(container as any).spacesList = spacesList;
		(container as any).linksList = linksList;
	}

	private async loadSpaces() {
		try {
			const container = this.containerEl.children[1] as HTMLElement;
			const spacesList = (container as any).spacesList;

			spacesList.empty();
			spacesList.createEl("div", {
				text: "Loading spaces...",
				cls: "arc-loading",
			});

			this.spaces = await getSpaces(this.settings.jsonPath);
			this.renderSpaces(spacesList);
		} catch (error) {
			console.error("Failed to load spaces:", error);
			new Notice(`Failed to load spaces: ${error.message}`);

			const container = this.containerEl.children[1] as HTMLElement;
			const spacesList = (container as any).spacesList;
			spacesList.empty();
			spacesList.createEl("div", {
				text: `Error: ${error.message}`,
				cls: "arc-error",
			});
		}
	}

	private renderSpaces(spacesList: HTMLElement) {
		spacesList.empty();

		if (this.spaces.length === 0) {
			spacesList.createEl("div", {
				text: "No spaces found",
				cls: "arc-empty",
			});
			return;
		}

		this.spaces.forEach((space) => {
			const spaceEl = spacesList.createEl("div", {
				cls:
					"arc-space-item" +
					(this.selectedSpace?.id === space.id ? " selected" : ""),
			});

			spaceEl.createEl("div", {
				text: space.title,
				cls: "arc-space-title",
			});

			spaceEl.addEventListener("click", () => {
				this.selectSpace(space);
			});
		});
	}

	private async selectSpace(space: ArcSidebarSpace) {
		this.selectedSpace = space;

		// Update UI selection
		const container = this.containerEl.children[1] as HTMLElement;
		const spacesList = (container as any).spacesList;
		const linksList = (container as any).linksList;

		// Update selected state
		spacesList
			.findAll(".arc-space-item")
			.forEach((el: HTMLElement, index: number) => {
				if (this.spaces[index]?.id === space.id) {
					el.addClass("selected");
				} else {
					el.removeClass("selected");
				}
			});

		// Load links for selected space
		await this.loadLinks(space, linksList);
	}

	private async loadLinks(space: ArcSidebarSpace, linksList: HTMLElement) {
		try {
			linksList.empty();
			linksList.createEl("div", {
				text: "Loading links...",
				cls: "arc-loading",
			});

			this.links = await getPinnedItems([space.title], this.settings.jsonPath);
			this.renderLinks(linksList);
		} catch (error) {
			console.error("Failed to load links:", error);
			new Notice(`Failed to load links: ${error.message}`);

			linksList.empty();
			linksList.createEl("div", {
				text: `Error: ${error.message}`,
				cls: "arc-error",
			});
		}
	}

	private renderLinks(linksList: HTMLElement) {
		linksList.empty();

		if (this.links.length === 0) {
			linksList.createEl("div", {
				text: "No links found",
				cls: "arc-empty",
			});
			return;
		}

		this.links.forEach((link) => {
			const linkEl = linksList.createEl("div", { cls: "arc-link-item" });

			// Link info
			const linkInfo = linkEl.createEl("div", { cls: "arc-link-info" });
			linkInfo.createEl("div", {
				text: link.title,
				cls: "arc-link-title",
			});

			if (link.url) {
				linkInfo.createEl("div", {
					text: link.url,
					cls: "arc-link-url",
				});
			}

			// Actions
			const actions = linkEl.createEl("div", { cls: "arc-link-actions" });

			if (link.url) {
				const grabBtn = actions.createEl("button", {
					text: "📥 Grab Content",
					cls: "arc-grab-btn",
				});

				grabBtn.addEventListener("click", async (e) => {
					e.stopPropagation();
					await this.grabContent(link);
				});
			}
		});
	}

	private async fetchContent(url: string): Promise<string> {
		try {
			// Use JSDOM to fetch the page and defuddle to extract content
			const dom = await JSDOM.fromURL(url);
			const result = await Defuddle(dom, url, {
				markdown: true,
				separateMarkdown: true,
				debug: false,
				removeImages: true,
			});

			// Return the markdown version of the content
			return result.contentMarkdown || result.content;
		} catch (error) {
			throw new Error(`Failed to extract content: ${error.message}`);
		}
	}

	private async createNoteFromContent(
		title: string,
		content: string,
		url: string,
	): Promise<TFile | null> {
		const folder = await getOutputFolder(this.app, this.settings);
		if (!folder) {
			throw new Error("No output folder available");
		}

		const filename = `${title.replace(/[^\w\s-]/g, "").trim() || "Untitled"}`;
		const fullContent = `# ${title}\n\n**Source:** ${url}\n\n---\n\n${content}`;

		const file = await createExportFile(
			this.app,
			folder,
			filename,
			fullContent,
		);
		return file;
	}

	private async grabContent(link: ArcSidebarItem) {
		if (!link.url) {
			new Notice("No URL found for this link");
			return;
		}

		try {
			new Notice("Fetching content...");

			const content = await this.fetchContent(link.url);
			const file = await this.createNoteFromContent(
				link.title,
				content,
				link.url,
			);

			if (file) {
				new Notice(`Content saved to ${file.path}`);
			} else {
				new Notice("Failed to create note");
			}
		} catch (error) {
			console.error("Failed to grab content:", error);
			new Notice(`Failed to grab content: ${error.message}`);
		}
	}
}
