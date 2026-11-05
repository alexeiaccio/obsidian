import { createServer } from "node:http";
import { Effect } from "effect";
import { Notice } from "obsidian";
import type { OAuthSession } from "@eoa/oauth";
import { isDid } from "@atcute/lexicons/syntax";
import { type OAuthService, type OAuthStorage, makeOAuth } from "../../effect/OAuth";

/**
 * The Promise seam onto `effect/OAuth`.
 *
 * The browser leg is the plugin's, not the protocol's: this class binds a loopback
 * listener, opens the authorization URL, and hands the callback parameters to the
 * Effect service. Everything that is actually OAuth lives in the service (and in
 * `@eoa/oauth` below it).
 */

/** The page the browser lands on once the callback has been answered. */
const DONE_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Signed in</title>
<body style="font-family: system-ui, sans-serif; display: grid; place-items: center; height: 100vh; margin: 0">
<p>Signed in. Close this tab and return to Obsidian.</p>
</body>`;

/** How long a login may sit unanswered in the browser. */
const CALLBACK_TIMEOUT = 5 * 60_000;

interface Loopback {
	/** Where this login must come back to, port included. */
	readonly redirectUri: string;
	readonly params: Promise<URLSearchParams>;
	/** Stop listening, whether the callback arrived or not. */
	readonly close: () => void;
}

/**
 * Answers one login on `127.0.0.1`.
 *
 * The client id declares its callback without a port, so the port is picked here,
 * per login: the authorization server matches the path and ignores the port
 * (atproto's localhost exception), and the plugin publishes nothing anywhere.
 */
const listen = async (): Promise<Loopback> => {
	const server = createServer();
	let resolve: (params: URLSearchParams) => void = () => {};
	let reject: (error: Error) => void = () => {};
	const params = new Promise<URLSearchParams>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	let closed = false;
	const close = (): void => {
		if (closed) {
			return;
		}
		closed = true;
		clearTimeout(timer);
		server.close();
	};

	const timer = setTimeout(() => {
		close();
		reject(new Error("OAuth callback timed out after 5 minutes"));
	}, CALLBACK_TIMEOUT);

	server.on("request", (request, response) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (url.pathname !== "/callback") {
			response.writeHead(404, { connection: "close" }).end();
			return;
		}
		response
			.writeHead(200, {
				"content-type": "text/html; charset=utf-8",
				connection: "close",
			})
			.end(DONE_PAGE);
		clearTimeout(timer);
		resolve(url.searchParams);
	});
	server.on("error", reject);

	await new Promise<void>((res, rej) => {
		server.once("error", rej);
		server.listen(0, "127.0.0.1", res);
	});

	const address = server.address();
	if (address === null || typeof address === "string") {
		close();
		throw new Error("The loopback listener has no port");
	}

	return {
		redirectUri: `http://127.0.0.1:${address.port}/callback`,
		params,
		close,
	};
};

export class OAuthHandler {
	private service: Promise<OAuthService> | undefined;

	constructor(private readonly storage: OAuthStorage) {}

	/**
	 * The client is built on first use, because building it may have to generate the
	 * DPoP key — and an account that never logs in should not mint one.
	 */
	private client(): Promise<OAuthService> {
		this.service ??= Effect.runPromise(makeOAuth(this.storage));
		return this.service;
	}

	/** Opens the browser and resolves with the DID that signed in. */
	async authorize(identifier: string): Promise<string> {
		const loopback = await listen();
		try {
			const service = await this.client();
			const { url } = await Effect.runPromise(
				service.authorizeUrl({ identifier, redirectUri: loopback.redirectUri }),
			);

			window.open(url, "_blank");
			new Notice("Continue login in the browser");

			const params = await loopback.params;
			const session = await Effect.runPromise(service.finalize({ params }));
			return session.did;
		} finally {
			loopback.close();
		}
	}

	async restore(did: string): Promise<OAuthSession> {
		if (!isDid(did)) {
			throw new Error("Invalid DID: " + did);
		}
		const service = await this.client();
		const session = await Effect.runPromise(service.session({ did }));
		if (session === undefined) {
			throw new Error("No session found for DID: " + did);
		}
		return session;
	}

	async revoke(did: string): Promise<void> {
		if (!isDid(did)) {
			throw new Error("Invalid DID: " + did);
		}
		const service = await this.client();
		await Effect.runPromise(service.revoke({ did }));
	}

	/** A request for the signed-in account's own PDS. */
	async signedFetch(params: {
		did: string;
		pathname: string;
		init: RequestInit;
	}): Promise<Response> {
		const service = await this.client();
		return await Effect.runPromise(service.signedFetch(params));
	}
}
