import { Context, Effect } from "effect";
import type { ATClient } from "../lib/client";
import { AuthError, ResolveActorError } from "./Errors";

/**
 * The plugin's authenticated atproto client, as an Effect service.
 *
 * The value is still the `@atcute`-backed `ATClient`; it is a service now so
 * logic can `yield* AtClient` instead of threading the instance through every
 * constructor. The class internals move off `@atcute` under the
 * "Replace @atcute with @eoa" bean (the OAuth leg is blocked on Tier 0.4).
 */
export class AtClient extends Context.Service<AtClient, ATClient>()("obsidian-clipper/AtClient") {}

const authError = (action: string, cause: unknown) =>
	new AuthError({ message: `${action} failed: ${String(cause)}` });

export const login = Effect.fn("AtClient.login")(function* (identifier: string) {
	const client = yield* AtClient;
	yield* Effect.tryPromise({
		try: () => client.login(identifier),
		catch: (cause) => authError("Login", cause),
	});
});

/** Sign in with a handle and an app password — no browser, no OAuth callback. */
export const loginWithAppPassword = Effect.fn("AtClient.loginWithAppPassword")(
	function* (params: { readonly identifier: string; readonly password: string }) {
		const client = yield* AtClient;
		yield* Effect.tryPromise({
			try: () => client.loginWithAppPassword(params.identifier, params.password),
			catch: (cause) => authError("App-password login", cause),
		});
	},
);

export const restoreSession = Effect.fn("AtClient.restoreSession")(function* (did: string) {
	const client = yield* AtClient;
	yield* Effect.tryPromise({
		try: () => client.restoreSession(did),
		catch: (cause) => authError("Session restore", cause),
	});
});

export const logout = Effect.fn("AtClient.logout")(function* (identifier: string) {
	const client = yield* AtClient;
	yield* Effect.tryPromise({
		try: () => client.logout(identifier),
		catch: (cause) => authError("Logout", cause),
	});
});

export const getActor = Effect.fn("AtClient.getActor")(function* (identifier: string) {
	const client = yield* AtClient;
	return yield* Effect.tryPromise({
		try: () => client.getActor(identifier),
		catch: (cause) => new ResolveActorError({ identifier, message: String(cause) }),
	});
});
