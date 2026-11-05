import { describe, expect, it, vi, afterEach } from "vitest";
import { Effect } from "effect";
import { makeAppPassword, type AppPasswordSession } from "./AppPassword";
import type { OAuthStorage } from "./OAuth";

/**
 * The app-password service, offline: `signedFetch` and `revoke` never resolve an
 * identity, so stubbing `fetch` is enough. `login` is deliberately not covered —
 * it resolves the handle through the network; that leg is exercised live (a real
 * handle and app password) rather than here.
 */

/** The stored shape the service reads back; seeded directly so `login` stays out of this. */
const ALICE: AppPasswordSession = {
	did: "did:plc:alice",
	handle: "alice.test",
	pds: "https://pds.test",
	accessJwt: "access-1",
	refreshJwt: "refresh-1",
};

const storageWith = () => {
	let saved: string | null = JSON.stringify({ [ALICE.did]: ALICE });
	const storage: OAuthStorage = {
		load: () => saved,
		save: (_key, value) => {
			saved = value;
		},
	};
	return {
		storage,
		read: (): Record<string, AppPasswordSession> =>
			saved === null ? {} : (JSON.parse(saved) as Record<string, AppPasswordSession>),
	};
};

const authOf = (init: RequestInit | undefined): string | undefined => {
	const headers = init?.headers;
	if (headers === undefined) {
		return undefined;
	}
	if (headers instanceof Headers) {
		return headers.get("authorization") ?? undefined;
	}
	if (Array.isArray(headers)) {
		return headers.find(([name]) => name.toLowerCase() === "authorization")?.[1];
	}
	return (headers as Record<string, string>)["authorization"];
};

const json = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("makeAppPassword", () => {
	it("signs a request with the access token against the account's PDS", async () => {
		const { storage } = storageWith();
		const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				calls.push({ url, init });
				return new Response("{}", { status: 200 });
			}),
		);

		const service = makeAppPassword(storage);
		const response = await Effect.runPromise(
			service.signedFetch({
				did: ALICE.did,
				pathname: "/xrpc/app.bsky.actor.getProfile?actor=alice.test",
				init: { method: "GET" },
			}),
		);

		expect(response.status).toBe(200);
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe("https://pds.test/xrpc/app.bsky.actor.getProfile?actor=alice.test");
		expect(authOf(calls[0]!.init)).toBe("Bearer access-1");
	});

	it("rotates the session on a 401 and retries once with the new access token", async () => {
		const { storage, read } = storageWith();
		const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				calls.push({ url, init });
				if (url.endsWith("/com.atproto.server.refreshSession")) {
					expect(authOf(init)).toBe("Bearer refresh-1");
					return json({ did: ALICE.did, handle: ALICE.handle, accessJwt: "access-2", refreshJwt: "refresh-2" });
				}
				if (authOf(init) === "Bearer access-1") {
					return new Response('{"error":"ExpiredToken"}', { status: 401 });
				}
				return new Response("{}", { status: 200 });
			}),
		);

		const service = makeAppPassword(storage);
		const response = await Effect.runPromise(
			service.signedFetch({ did: ALICE.did, pathname: "/xrpc/com.atproto.repo.createRecord", init: { method: "POST", body: "{}" } }),
		);

		expect(response.status).toBe(200);
		// profile call (401) -> refresh -> retry (200)
		expect(calls.map((call) => call.url)).toEqual([
			"https://pds.test/xrpc/com.atproto.repo.createRecord",
			"https://pds.test/xrpc/com.atproto.server.refreshSession",
			"https://pds.test/xrpc/com.atproto.repo.createRecord",
		]);
		expect(authOf(calls[2]!.init)).toBe("Bearer access-2");
		expect(read()[ALICE.did]?.refreshJwt).toBe("refresh-2");
	});

	it("forgets the session on revoke, best-effort ending it at the PDS", async () => {
		const { storage, read } = storageWith();
		const calls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calls.push(url);
				return new Response(null, { status: 200 });
			}),
		);

		const service = makeAppPassword(storage);
		await Effect.runPromise(service.revoke({ did: ALICE.did }));

		expect(calls).toEqual(["https://pds.test/xrpc/com.atproto.server.deleteSession"]);
		expect(read()).toEqual({});
		expect(await Effect.runPromise(service.session({ did: ALICE.did }))).toBeUndefined();
	});

	it("reports the PDS's message when a session has no stored credential", async () => {
		const { storage } = storageWith();
		const service = makeAppPassword(storage);

		const error = await Effect.runPromise(
			Effect.flip(service.signedFetch({ did: "did:plc:bob", pathname: "/xrpc/x", init: { method: "GET" } })),
		);

		expect(error._tag).toBe("AuthError");
		expect(error.message).toContain("no app-password session");
	});
});
