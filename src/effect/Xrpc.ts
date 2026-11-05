import { Effect, Schema } from "effect";
import { makeXrpcClient, type FetchHandler, type XrpcClient } from "@eoa/xrpc";
import type { ATClient, Handler } from "../lib/client";

/** Transport-level XRPC failure (network, parse). */
export class XrpcTransportError extends Schema.TaggedError<XrpcTransportError>()(
	"XrpcTransportError",
	{ message: Schema.String },
) {}

/**
 * Adapts the plugin's `@atcute` `Handler` (OAuth + per-repo PDS routing + GET
 * cache) to the `@eoa/xrpc` `FetchHandler` shape.
 *
 * atcute's client invokes its handler with a **path** (`/xrpc/<nsid>?...`), so we
 * strip the URL the Effect client builds back down to path + query and let the
 * existing handler do the routing.
 */
export const handlerFetch = (handler: Handler): FetchHandler => (url, options) =>
	Effect.tryPromise({
		try: async () => {
			const parsed = new URL(url);
			const response = await handler.handle(parsed.pathname + parsed.search, {
				method: options.method,
				headers: options.headers,
				body: options.body,
				signal: options.signal,
			});
			return {
				ok: response.ok,
				status: response.status,
				statusText: response.statusText,
				headers: Object.fromEntries(response.headers.entries()),
				text: () =>
					Effect.tryPromise({
						try: () => response.text(),
						catch: (error) => new XrpcTransportError({ message: `Failed to read response text: ${String(error)}` }),
					}),
				json: () =>
					Effect.tryPromise({
						try: () => response.json(),
						catch: (error) => new XrpcTransportError({ message: `Failed to parse response JSON: ${String(error)}` }),
					}),
			};
		},
		catch: (error) => new XrpcTransportError({ message: `XRPC transport failed: ${String(error)}` }),
	});

const clients = new WeakMap<ATClient, XrpcClient>();

/** One Effect XRPC client per plugin client, sharing its OAuth/routing handler. */
export const xrpcFor = (client: ATClient): XrpcClient => {
	const existing = clients.get(client);
	if (existing) {
		return existing;
	}
	const created = makeXrpcClient({
		service: "https://bsky.social",
		fetch: handlerFetch(client.fetchHandler),
	});
	clients.set(client, created);
	return created;
};
