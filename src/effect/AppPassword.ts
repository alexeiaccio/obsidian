import { Effect, Schema } from "effect";
import { isActorIdentifier } from "@atcute/lexicons/syntax";
import { AuthError } from "./Errors";
import { resolveActor } from "./Identity";
import type { OAuthStorage } from "./OAuth";

/**
 * App-password sign-in — the non-browser alternative to the OAuth flow.
 *
 * `com.atproto.server.createSession` trades a handle and an app password for an
 * access/refresh JWT pair; the account's own requests then carry
 * `Authorization: Bearer <access>` against its PDS, rather than the DPoP-signed
 * fetch the OAuth profile uses. There is no key, no callback and no popup: that
 * is the whole appeal when the browser leg is unavailable.
 *
 * This is a *second* mechanism. The OAuth client (`effect/OAuth.ts`) is
 * untouched; `lib/client.ts` chooses between them per session.
 */

/** One account's app-password session. `pds` is resolved from the DID document. */
export interface AppPasswordSession {
	readonly did: string;
	readonly handle: string;
	readonly pds: string;
	readonly accessJwt: string;
	readonly refreshJwt: string;
}

export interface AppPasswordService {
	readonly login: (params: {
		readonly identifier: string;
		readonly password: string;
	}) => Effect.Effect<AppPasswordSession, AuthError>;
	readonly session: (params: {
		readonly did: string;
	}) => Effect.Effect<AppPasswordSession | undefined, AuthError>;
	readonly revoke: (params: { readonly did: string }) => Effect.Effect<void, AuthError>;
	/** A request for the account's own PDS, authorized with its access JWT. */
	readonly signedFetch: (params: {
		readonly did: string;
		readonly pathname: string;
		readonly init: RequestInit;
	}) => Effect.Effect<Response, AuthError>;
}

/** Per-vault storage key; the session record is the credential, so it must survive. */
const SESSIONS = "atmosphere-app-password:sessions";

/** The shape `createSession` and `refreshSession` both answer with. */
const SessionResponse = Schema.Struct({
	did: Schema.String,
	handle: Schema.String,
	accessJwt: Schema.String,
	refreshJwt: Schema.String,
});

const fail = (action: string, cause: unknown): AuthError =>
	new AuthError({ message: `${action} failed: ${String(cause)}` });

/** An XRPC error body is `{"error": "...", "message": "..."}`; surface the message. */
const describe = (detail: string): string => {
	try {
		const parsed = JSON.parse(detail) as { message?: unknown };
		if (typeof parsed.message === "string" && parsed.message.length > 0) {
			return parsed.message;
		}
	} catch {
		// not JSON: fall through to the raw body
	}
	return detail.slice(0, 200);
};

const readSessions = (storage: OAuthStorage): Record<string, AppPasswordSession> => {
	const raw = storage.load(SESSIONS);
	return raw === null ? {} : (JSON.parse(raw) as Record<string, AppPasswordSession>);
};

const writeSessions = (
	storage: OAuthStorage,
	sessions: Record<string, AppPasswordSession>,
): void => {
	storage.save(SESSIONS, JSON.stringify(sessions));
};

/**
 * The app-password service. Pure to build — everything it touches is an Effect —
 * so `lib/client.ts` holds it directly and runs the effects at the seam.
 */
export const makeAppPassword = (storage: OAuthStorage): AppPasswordService => {
	const persist = (session: AppPasswordSession): AppPasswordSession => {
		writeSessions(storage, { ...readSessions(storage), [session.did]: session });
		return session;
	};

	/** POST to an XRPC endpoint; the caller checks the status and decodes. */
	const post = (action: string, url: string, options: { body?: unknown; bearer?: string }) =>
		Effect.tryPromise({
			try: () =>
				fetch(url, {
					method: "POST",
					headers: {
						...(options.body === undefined ? {} : { "content-type": "application/json" }),
						...(options.bearer === undefined ? {} : { authorization: `Bearer ${options.bearer}` }),
					},
					...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
				}),
			catch: (cause) => fail(action, cause),
		});

	/** A response that must be a `200` and a session body. */
	const decodeSession = (action: string, response: Response) =>
		Effect.gen(function*() {
			if (!response.ok) {
				const detail = yield* Effect.tryPromise(() => response.text()).pipe(
					Effect.orElseSucceed(() => ""),
				);
				return yield* fail(action, `${response.status} ${describe(detail)}`);
			}
			const body = yield* Effect.tryPromise(() => response.json()).pipe(
				Effect.mapError((cause) => fail(action, cause)),
			);
			return yield* Schema.decodeUnknownEffect(SessionResponse)(body).pipe(
				Effect.mapError((cause) => fail(action, cause)),
			);
		});

	const requireSession = (did: string) =>
		Effect.gen(function*() {
			const session = readSessions(storage)[did];
			if (session === undefined) {
				return yield* fail("Signed request", `no app-password session for ${did}`);
			}
			return session;
		});

	/** Rotate the pair; the PDS authenticates the refresh token, not the access one. */
	const refresh = (session: AppPasswordSession) =>
		Effect.gen(function*() {
			const response = yield* post(
				"Refreshing the session",
				`${session.pds}/xrpc/com.atproto.server.refreshSession`,
				{ bearer: session.refreshJwt },
			);
			const rotated = yield* decodeSession("Refreshing the session", response);
			return persist({
				did: rotated.did,
				handle: rotated.handle,
				pds: session.pds,
				accessJwt: rotated.accessJwt,
				refreshJwt: rotated.refreshJwt,
			});
		});

	return {
		login: ({ identifier, password }) =>
			Effect.gen(function*() {
				if (!isActorIdentifier(identifier)) {
					return yield* fail("App-password login", `${identifier} is not a handle or DID`);
				}
				const actor = yield* resolveActor(identifier).pipe(
					Effect.mapError((cause) => fail("Resolving the account", cause.message)),
				);
				if (actor.pds === undefined) {
					return yield* fail("Resolving the account", `${identifier} does not advertise a PDS`);
				}
				const response = yield* post(
					"App-password login",
					`${actor.pds}/xrpc/com.atproto.server.createSession`,
					{ body: { identifier, password } },
				);
				const created = yield* decodeSession("App-password login", response);
				return persist({
					did: created.did,
					handle: created.handle,
					pds: actor.pds,
					accessJwt: created.accessJwt,
					refreshJwt: created.refreshJwt,
				});
			}),

		session: ({ did }) => Effect.sync(() => readSessions(storage)[did]),

		revoke: ({ did }) =>
			Effect.gen(function*() {
				const session = readSessions(storage)[did];
				if (session !== undefined) {
					// Best effort: the local record goes either way.
					yield* post(
						"Signing out",
						`${session.pds}/xrpc/com.atproto.server.deleteSession`,
						{ bearer: session.refreshJwt },
					).pipe(Effect.ignore);
				}
				const sessions = readSessions(storage);
				delete sessions[did];
				writeSessions(storage, sessions);
			}),

		signedFetch: ({ did, pathname, init }) =>
			Effect.gen(function*() {
				const session = yield* requireSession(did);
				const send = (accessJwt: string) =>
					Effect.tryPromise({
						try: () => {
							// `Headers` absorbs a record, an array or another `Headers`, so
							// the caller's headers survive whichever shape it passed.
							const headers = new Headers(init.headers);
							headers.set("authorization", `Bearer ${accessJwt}`);
							return fetch(`${session.pds}${pathname}`, { ...init, headers });
						},
						catch: (cause) => fail("Signed request", cause),
					});

				const response = yield* send(session.accessJwt);
				if (response.status !== 401) {
					return response;
				}
				// The access token expired: rotate once and retry. Reusing `init`
				// only works because every caller passes a buffered body.
				const rotated = yield* refresh(session);
				return yield* send(rotated.accessJwt);
			}),
	};
};
