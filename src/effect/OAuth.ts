import { Effect } from "effect";
import {
	type PrivateKey,
	exportPrivateKey,
	generateES256KeyPair,
	importPrivateKey,
} from "@eoa/crypto";
import {
	type NonceStore,
	type OAuthClient,
	type OAuthSession,
	type SessionStore,
	makeOAuthClient,
} from "@eoa/oauth";
import { isActorIdentifier } from "@atcute/lexicons/syntax";
import { AuthError } from "./Errors";
import { resolveActor } from "./Identity";
import { obsidianFetch } from "../lib/http";

/**
 * The plugin's OAuth client, as an Effect service — the logic; `lib/oauth/oauth.ts`
 * is the thin Promise seam that opens the browser and answers the callback.
 *
 * The client itself is `@eoa/oauth` (the repo's own), so the plugin speaks the
 * atproto OAuth profile without a vendored client: PAR, PKCE, DPoP, refresh, and a
 * DPoP-signed request, all verified against the plan of record in
 * `docs/plans/tier0-4-oauth.md`.
 *
 * The client id is a loopback one — `http://localhost?…`, the atproto exception
 * for native apps — so the plugin publishes no metadata document and answers no
 * one else's domain. The id is a constant: a session is bound to the client id
 * that created it, so a persisted login survives a restart only while this string
 * and the scope below stay put.
 */

/** Everything the clipper may touch. A subset of the client id's declared scope. */
const SCOPE =
	"atproto include:at.margin.authFull repo:site.standard.document repo:network.cosmik.card repo:network.cosmik.collection repo:network.cosmik.collectionLink repo:community.lexicon.bookmarks.bookmark";

/** Declared without a port: a login binds a free port and names it at authorize time. */
const CALLBACK = "http://127.0.0.1/callback";

const CLIENT_ID = `http://localhost?redirect_uri=${encodeURIComponent(CALLBACK)}&scope=${encodeURIComponent(SCOPE)}`;

/** Where the plugin keeps the DPoP key, the sessions, and the nonces. */
export interface OAuthStorage {
	load(key: string): string | null;
	save(key: string, value: string): void;
}

/** Per-vault keys. The key is the login, so it is the one that must not be lost. */
const KEY = "atmosphere-oauth:dpop-key";
const SESSIONS = "atmosphere-oauth:sessions";
const NONCES = "atmosphere-oauth:nonces";

const fail = (action: string, cause: unknown): AuthError =>
	new AuthError({ message: `${action} failed: ${String(cause)}` });

const readRecord = <A>(storage: OAuthStorage, key: string): Record<string, A> => {
	const raw = storage.load(key);
	return raw === null ? {} : (JSON.parse(raw) as Record<string, A>);
};

const writeRecord = (storage: OAuthStorage, key: string, value: unknown): void => {
	storage.save(key, JSON.stringify(value));
};

/**
 * The DPoP key *is* the login: every token is bound to it (`cnf.jkt`), so losing it
 * invalidates every stored session. It is generated once and kept as a JWK.
 */
const loadKey = (storage: OAuthStorage): Effect.Effect<PrivateKey, AuthError> =>
	Effect.gen(function* () {
		const stored = storage.load(KEY);
		if (stored !== null) {
			return yield* importPrivateKey(JSON.parse(stored) as JsonWebKey).pipe(
				Effect.mapError((cause) => fail("Reading the DPoP key", cause)),
			);
		}

		const pair = yield* generateES256KeyPair().pipe(
			Effect.mapError((cause) => fail("Generating the DPoP key", cause)),
		);
		const exported = yield* exportPrivateKey(pair.privateKey).pipe(
			Effect.mapError((cause) => fail("Storing the DPoP key", cause)),
		);
		// write it before using it: a key we cannot find again would strand the login
		writeRecord(storage, KEY, exported);
		return pair.privateKey;
	});

const sessionStore = (storage: OAuthStorage): SessionStore => ({
	get: async ({ did }) => readRecord<OAuthSession>(storage, SESSIONS)[did],
	set: async ({ session }) => {
		writeRecord(storage, SESSIONS, {
			...readRecord<OAuthSession>(storage, SESSIONS),
			[session.did]: session,
		});
	},
	delete: async ({ did }) => {
		const sessions = readRecord<OAuthSession>(storage, SESSIONS);
		delete sessions[did];
		writeRecord(storage, SESSIONS, sessions);
	},
});

const nonceStore = (storage: OAuthStorage): NonceStore => ({
	get: async ({ origin }) => readRecord<string>(storage, NONCES)[origin],
	set: async ({ origin, nonce }) => {
		writeRecord(storage, NONCES, {
			...readRecord<string>(storage, NONCES),
			[origin]: nonce,
		});
	},
});

export interface OAuthService {
	readonly authorizeUrl: (params: {
		readonly identifier: string;
		/** The loopback callback this login bound, port included. */
		readonly redirectUri: string;
	}) => Effect.Effect<{ url: string; state: string }, AuthError>;
	readonly finalize: (params: {
		readonly params: URLSearchParams;
	}) => Effect.Effect<OAuthSession, AuthError>;
	readonly session: (params: {
		readonly did: string;
	}) => Effect.Effect<OAuthSession | undefined, AuthError>;
	readonly revoke: (params: { readonly did: string }) => Effect.Effect<void, AuthError>;
	/** A request for the account's own PDS, signed with a proof bound to its token. */
	readonly signedFetch: (params: {
		readonly did: string;
		readonly pathname: string;
		readonly init?: RequestInit;
	}) => Effect.Effect<Response, AuthError>;
}

/** A client failure, as the error this plugin reports. */
const fromClient = <A>(effect: Effect.Effect<A, { readonly message: string }>) =>
	effect.pipe(Effect.mapError((cause) => fail("OAuth", cause.message)));

export const makeOAuth = (
	storage: OAuthStorage,
): Effect.Effect<OAuthService, AuthError> =>
	Effect.gen(function* () {
		const key = yield* loadKey(storage);
		const client: OAuthClient = makeOAuthClient({
			clientId: CLIENT_ID,
			// only a default: every login names the port it actually bound
			redirectUri: CALLBACK,
			scope: SCOPE,
			key,
			fetch: obsidianFetch,
			sessions: sessionStore(storage),
			nonces: nonceStore(storage),
		});

		const requireSession = (did: string) =>
			Effect.gen(function* () {
				const session = yield* fromClient(client.getSession({ did }));
				if (session === undefined) {
					return yield* fail("Signed request", `no session for ${did}`);
				}
				return session;
			});

		return {
			authorizeUrl: ({ identifier, redirectUri }) =>
				Effect.gen(function* () {
					if (!isActorIdentifier(identifier)) {
						return yield* fail("Resolving the account", `${identifier} is not a handle or DID`);
					}
					const actor = yield* resolveActor(identifier).pipe(
						Effect.mapError((cause) => fail("Resolving the account", cause.message)),
					);
					if (actor.pds === undefined) {
						return yield* fail(
							"Resolving the account",
							`${identifier} does not advertise a PDS`,
						);
					}
					return yield* fromClient(
						client.createAuthorizationUrl({ pdsUrl: actor.pds, identifier, redirectUri }),
					);
				}),

			finalize: ({ params }) => fromClient(client.finalizeAuthorization({ params })),

			session: ({ did }) => fromClient(client.getSession({ did })),

			revoke: ({ did }) =>
				Effect.gen(function* () {
					const session = yield* fromClient(client.getSession({ did }));
					if (session !== undefined) {
						yield* fromClient(client.revokeSession({ session }));
					}
				}),

			signedFetch: ({ did, pathname, init }) =>
				Effect.gen(function* () {
					const session = yield* requireSession(did);
					return yield* fromClient(
						client.signedFetch({
							did,
							url: `${session.pdsUrl}${pathname}`,
							...(init === undefined ? {} : { init }),
						}),
					);
				}),
		};
	});
