import * as os from "node:os";

export interface ArcExporterSettings {
	defaultOutputFolder: string;
	jsonPath: string;
}

export const DEFAULT_SETTINGS: ArcExporterSettings = {
	defaultOutputFolder: "",
	jsonPath:
		`${os.homedir()}/Library/Application Support/Arc/StorableSidebar.json`,
};
