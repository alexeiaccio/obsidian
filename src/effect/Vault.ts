import { Context, Effect, Layer } from "effect";
import { TFile, type App } from "obsidian";
import { VaultError } from "./Errors";

/**
 * The vault, as an Effect.
 *
 * Every call into Obsidian's vault is one `VaultError`-producing effect, so
 * callers stop hand-rolling `Effect.tryPromise` around `vault.create` /
 * `processFrontMatter` (and stop losing failures to un-awaited promises).
 *
 * What this deliberately does *not* model: Obsidian's `vault.on(...)` events and
 * its per-file frontmatter locking are Obsidian's business. Fibers writing one
 * file are serialized by Obsidian, not by Effect, so this buys no atomicity.
 */
export interface VaultShape {
	/** The file at `path`, or `undefined` when it is missing or a folder. */
	readonly file: (path: string) => TFile | undefined;
	/** Whether anything (file or folder) exists at `path`. */
	readonly exists: (path: string) => boolean;
	readonly ensureFolder: (dir: string) => Effect.Effect<void, VaultError>;
	readonly create: (path: string, content: string) => Effect.Effect<TFile, VaultError>;
	readonly read: (file: TFile) => Effect.Effect<string, VaultError>;
	readonly append: (file: TFile, text: string) => Effect.Effect<void, VaultError>;
	readonly modify: (file: TFile, content: string) => Effect.Effect<void, VaultError>;
	readonly frontmatter: (
		file: TFile,
		update: (frontmatter: Record<string, unknown>) => void,
	) => Effect.Effect<void, VaultError>;
	/** Open the file in a leaf. */
	readonly open: (file: TFile) => Effect.Effect<void, VaultError>;
}

export class Vault extends Context.Service<Vault, VaultShape>()("obsidian-clipper/Vault") {
	/** The vault for an Obsidian app. */
	static readonly layer = (app: App): Layer.Layer<Vault> => Layer.succeed(Vault)(makeVault(app));
}

const vaultError = (path: string, cause: unknown) =>
	new VaultError({ path, message: String(cause) });

const attempt = <A>(path: string, run: () => Promise<A>): Effect.Effect<A, VaultError> =>
	Effect.tryPromise({ try: run, catch: (cause) => vaultError(path, cause) });

const makeVault = (app: App): VaultShape => {
	const vault = app.vault;

	const ensureFolder = (dir: string): Effect.Effect<void, VaultError> =>
		Effect.gen(function* () {
			if (vault.getAbstractFileByPath(dir)) {
				return;
			}
			yield* attempt(dir, () => vault.createFolder(dir));
		});

	return {
		file: (path) => {
			const found = vault.getAbstractFileByPath(path);
			return found instanceof TFile ? found : undefined;
		},
		exists: (path) => vault.getAbstractFileByPath(path) !== null,
		ensureFolder,
		create: (path, content) => attempt(path, () => vault.create(path, content)),
		read: (file) => attempt(file.path, () => vault.read(file)),
		append: (file, text) => attempt(file.path, () => vault.append(file, text)),
		modify: (file, content) => attempt(file.path, () => vault.modify(file, content)),
		frontmatter: (file, update) =>
			attempt(file.path, () => app.fileManager.processFrontMatter(file, update)),
		open: (file) => attempt(file.path, () => app.workspace.getLeaf(false).openFile(file)),
	};
};
