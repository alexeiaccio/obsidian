import { isActorIdentifier } from "@atcute/lexicons/syntax";
import { Effect } from "effect";
import { makeAppPassword, type AppPasswordService } from "../effect/AppPassword";
import type { OAuthStorage } from "../effect/OAuth";
import type { ResolvedActor } from "../effect/Identity";
import { obsidianFetch } from "./http";
import { OAuthHandler } from "./oauth/oauth";
import { resolveActor } from "./identity";

/**
 * The plugin's atproto client.
 *
 * Public shape is unchanged from the `@atcute` version — `login` / `restoreSession` /
 * `logout` / `getActor` / `fetchHandler` — so nothing above it moves. What changed is
 * underneath: the OAuth transport is now `@eoa/oauth` (`lib/oauth/oauth.ts` over
 * `effect/OAuth.ts`), and a request that needs the signed-in account is a DPoP-signed
 * fetch rather than an atcute `OAuthUserAgent`.
 *
 * A second mechanism sits beside it: `loginWithAppPassword` mints an access/refresh
 * JWT pair with `com.atproto.server.createSession` (`effect/AppPassword.ts`) and
 * signs the account's requests with a Bearer token instead. `restoreSession` picks
 * whichever mechanism the stored session belongs to.
 */
export class ATClient {
	private hh: Handler;
	private oauth: OAuthHandler;
	private appPassword: AppPasswordService;
	actor?: ResolvedActor;

	constructor(storage: OAuthStorage) {
		this.oauth = new OAuthHandler(storage);
		this.appPassword = makeAppPassword(storage);
		this.hh = new Handler(this.oauth, this.appPassword);
	}

	get loggedIn(): boolean {
		return this.hh.did !== undefined && this.actor !== undefined;
	}

	async login(identifier: string): Promise<void> {
		const did = await this.oauth.authorize(identifier);
		this.hh.did = did;
		this.hh.auth = "oauth";
		this.actor = await this.hh.getActor(did);
	}

	async loginWithAppPassword(identifier: string, password: string): Promise<void> {
		const session = await Effect.runPromise(this.appPassword.login({ identifier, password }));
		this.hh.did = session.did;
		this.hh.auth = "appPassword";
		this.actor = await this.hh.getActor(session.did);
	}

	async restoreSession(did: string): Promise<void> {
		const appPasswordSession = await Effect.runPromise(this.appPassword.session({ did }));
		if (appPasswordSession !== undefined) {
			this.hh.did = appPasswordSession.did;
			this.hh.auth = "appPassword";
			this.actor = await this.hh.getActor(appPasswordSession.did);
			return;
		}
		const session = await this.oauth.restore(did);
		this.hh.did = session.did;
		this.hh.auth = "oauth";
		this.actor = await this.hh.getActor(session.did);
	}

	async logout(identifier: string): Promise<void> {
		await Effect.runPromise(this.appPassword.revoke({ did: identifier }));
		await this.oauth.revoke(identifier);
		this.hh.did = undefined;
		this.hh.auth = "oauth";
		this.actor = undefined;
	}

	async getActor(identifier: string): Promise<ResolvedActor> {
		return this.hh.getActor(identifier);
	}

	clearCache(): void {
		this.hh.clearCache();
	}

	get fetchHandler(): Handler {
		return this.hh;
	}
}

/** The entryway every public repository read can go through. */
const PUBLIC_READER = "https://bsky.social";

/**
 * A read of repository records is public data: any entryway serves it, and it
 * needs no DPoP proof. The plugin reads through bsky.social because the account's
 * PDS is not always reachable from the app — a corporate proxy can allow
 * bsky.social and time out on `*.bsky.network` — and a read is the same bytes
 * either way. Writes still go to the PDS: they need the account's own signature.
 */
const isPublicRepositoryRead = (params: {
	readonly pathname: string;
	readonly method: string;
	/** Whose repo the call names, once decoded; `undefined` when it names none. */
	readonly repo: string | undefined;
	/** The signed-in account, or `undefined` when nobody is. */
	readonly did: string | undefined;
}): boolean => {
	if (params.method !== "get") {
		return false;
	}
	const { pathname } = new URL(params.pathname, "https://placeholder");
	if (
		!pathname.endsWith("/com.atproto.repo.listRecords") &&
		!pathname.endsWith("/com.atproto.repo.getRecord")
	) {
		return false;
	}
	// Another account's repo is theirs to serve; ours is the one this shortcut is for.
	return params.repo === undefined || params.did === undefined || params.repo === params.did;
};

/**
 * The fetch handler every XRPC call goes through: another actor's PDS when it
 * names someone else's repo, bsky.social for public repository reads, the
 * account's own PDS when the request needs the signed-in user, and bsky.social
 * when nobody is signed in.
 */
export class Handler {
	cache: Cache;
	/** The signed-in account, or `undefined` when nobody is. */
	did: string | undefined;
	/** Which mechanism signs the account's own requests. */
	auth: "oauth" | "appPassword";

	constructor(
		private readonly oauth: OAuthHandler,
		private readonly appPassword: AppPasswordService,
	) {
		this.cache = new Cache(5 * 60 * 1000); // 5 minutes TTL
		this.did = undefined;
		this.auth = "oauth";
	}

	async getActor(identifier: string): Promise<ResolvedActor> {
		const key = `actor:${identifier}`;
		const cached = this.cache.get<ResolvedActor>(key);
		if (cached) {
			return cached;
		}
		if (isActorIdentifier(identifier)) {
			try {
				const res = await resolveActor(identifier);
				this.cache.set(key, res);
				return res;
			} catch (e) {
				throw new Error(`Failed to resolve actor ${identifier}:` + JSON.stringify(e));
			}
		} else {
			throw new Error("Invalid actor identifier: " + identifier);
		}
	}

	/** Another actor's PDS, when the request is for their repo rather than ours. */
	async getPDS(pathname: string): Promise<string | null> {
		const url = new URL(pathname, "https://placeholder");
		const repo = url.searchParams.get("repo");
		if (!repo || repo === this.did) {
			return null;
		}
		const actor = await this.getActor(repo);
		return actor.pds ?? null;
	}

	clearCache(): void {
		this.cache.clear();
	}

	async handle(pathname: string, init: RequestInit): Promise<Response> {
		const method = (init?.method ?? "GET").toLowerCase();
		const cacheKey = `${method}:${pathname}`;
		if (method === "get") {
			const cached = this.cache.get<Response>(cacheKey);
			if (cached) {
				return cached.clone();
			}
		}

		// Before the PDS: a read of our own records must never depend on a host the
		// app cannot reach, and the entryway serves the same bytes.
		const read = isPublicRepositoryRead({
			pathname,
			method,
			repo: new URL(pathname, "https://placeholder").searchParams.get("repo") ?? undefined,
			did: this.did,
		});
		const pds = read ? null : await this.getPDS(pathname);

		let resp: Response;
		if (read) {
			resp = await obsidianFetch({ url: `${PUBLIC_READER}${pathname}`, init });
		} else if (pds !== null) {
			// public data on somebody else's PDS
			resp = await obsidianFetch({ url: `${pds}${pathname}`, init });
		} else if (this.did !== undefined) {
			resp = this.auth === "appPassword"
				? await Effect.runPromise(
					this.appPassword.signedFetch({ did: this.did, pathname, init }),
				)
				: await this.oauth.signedFetch({ did: this.did, pathname, init });
		} else {
			// no session: read bsky.social as an anonymous reader
			resp = await obsidianFetch({ url: `https://bsky.social${pathname}`, init });
		}

		if (method === "get" && resp.ok) {
			this.cache.set(cacheKey, resp.clone());
		}
		return resp;
	}
}

class CacheEntry<T> {
	value: T;
	timestamp: number;
	constructor(value: T) {
		this.value = value;
		this.timestamp = Date.now();
	}
}

class Cache {
	#store = new Map<string, CacheEntry<unknown>>();
	#ttl: number;

	constructor(ttlMillis: number) {
		this.#ttl = ttlMillis;
	}

	get<T>(key: string): T | undefined {
		const entry = this.#store.get(key);
		if (entry) {
			if (Date.now() - entry.timestamp < this.#ttl) {
				return entry.value as T;
			} else {
				this.#store.delete(key);
			}
		}
		return undefined;
	}

	set<T>(key: string, value: T): void {
		this.#store.set(key, new CacheEntry(value));
	}

	clear(): void {
		this.#store.clear();
	}
}
