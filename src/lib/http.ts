import { requestUrl } from "obsidian";

/** A stalled server must become an error, not an endless "Loading...". */
const REQUEST_TIMEOUT_MS = 30_000;

/** Default statuses that may not carry a body. */
const BODYLESS = new Set([204, 205, 304]);

/**
 * `requestUrl` takes a string or an `ArrayBuffer`; Effect hands its HTTP body
 * over as a stream or a byte view, and dropping it would send an empty request
 * (which the TypeSafe API answers with `422: body: Field required`).
 */
const bodyOf = async (body: BodyInit | null | undefined): Promise<string | ArrayBuffer | undefined> => {
	if (body === null || body === undefined) {
		return undefined;
	}
	if (typeof body === "string" || body instanceof ArrayBuffer) {
		return body;
	}
	// A stream, a byte view, `URLSearchParams`, `FormData`, `Blob`: let the
	// platform read it, exactly as `fetch` would have.
	return await new Response(body).arrayBuffer();
};

/**
 * HTTP for the plugin's own requests, through Obsidian's client.
 *
 * The renderer's `fetch` obeys the browser's cross-origin rules, and a request
 * it does not like fails as a bare `TypeError: Failed to fetch` — no status, no
 * body, nothing a caller can report. `requestUrl` goes through Electron's net
 * stack instead, so what is left is a real network failure, and it carries the
 * system proxy settings with it.
 *
 * `requestUrl` takes no abort signal, so the deadline is a race here.
 */
export const obsidianFetch = async (params: {
	readonly url: string;
	readonly init: RequestInit;
}): Promise<Response> => {
	const headers: Record<string, string> = {};
	new Headers(params.init.headers ?? {}).forEach((value, key) => {
		headers[key] = value;
	});

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new Error(
						`request to ${params.url} timed out after ${REQUEST_TIMEOUT_MS}ms`,
					),
				),
			REQUEST_TIMEOUT_MS,
		);
	});

	const body = await bodyOf(params.init.body);

	try {
		const response = await Promise.race([
			requestUrl({
				url: params.url,
				method: params.init.method ?? "GET",
				headers,
				...(body === undefined ? {} : { body }),
				throw: false,
			}),
			timedOut,
		]);

		return new Response(BODYLESS.has(response.status) ? null : response.arrayBuffer, {
			status: response.status,
			headers: response.headers,
		});
	} finally {
		clearTimeout(timer);
	}
};
