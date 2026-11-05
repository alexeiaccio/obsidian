import { Effect } from "effect";
import { AtClient } from "./AtClient";
import { RepoError } from "./Errors";
import { xrpcFor } from "./Xrpc";

/**
 * `com.atproto.repo.*` reads and writes as Effects.
 *
 * Failures are `RepoError` (typed) rather than the `{ ok: false }` unions the
 * vendored code used to get; `lib/atproto.ts` maps them back for the UI seam.
 */

const repoError = (operation: string, collection: string | undefined, cause: unknown) =>
	new RepoError({
		operation,
		...(collection === undefined ? {} : { collection }),
		message: String(cause),
	});

export const listRecords = Effect.fn("Repo.listRecords")(function* (
	repo: string,
	collection: string,
	limit = 100,
	cursor?: string,
) {
	const client = yield* AtClient;
	const params: { repo: string; collection: string; limit: number; cursor?: string } = {
		repo,
		collection,
		limit,
	};
	if (cursor !== undefined) {
		params.cursor = cursor;
	}
	const response = yield* xrpcFor(client)
		.call("com.atproto.repo.listRecords", params)
		.pipe(Effect.mapError((cause) => repoError("listRecords", collection, cause)));
	return response.body as { records: unknown[]; cursor?: string };
});

export const createRecord = Effect.fn("Repo.createRecord")(function* (
	repo: string,
	collection: string,
	record: unknown,
	validate = true,
) {
	const client = yield* AtClient;
	yield* xrpcFor(client)
		.call("com.atproto.repo.createRecord", undefined, { repo, collection, record, validate })
		.pipe(Effect.mapError((cause) => repoError("createRecord", collection, cause)));
});

export const getRecord = <T = unknown>(repo: string, collection: string, rkey: string) =>
	Effect.gen(function* () {
		const client = yield* AtClient;
		const response = yield* xrpcFor(client)
			.call("com.atproto.repo.getRecord", { repo, collection, rkey })
			.pipe(Effect.mapError((cause) => repoError("getRecord", collection, cause)));
		return response.body as { uri?: string; cid: string; value: T };
	});

export const deleteRecord = Effect.fn("Repo.deleteRecord")(function* (
	repo: string,
	collection: string,
	rkey: string,
) {
	const client = yield* AtClient;
	yield* xrpcFor(client)
		.call("com.atproto.repo.deleteRecord", undefined, { repo, collection, rkey })
		.pipe(Effect.mapError((cause) => repoError("deleteRecord", collection, cause)));
});

export const putRecord = <T = unknown>(repo: string, collection: string, rkey: string, record: T) =>
	Effect.gen(function* () {
		const client = yield* AtClient;
		yield* xrpcFor(client)
			.call("com.atproto.repo.putRecord", undefined, { repo, collection, rkey, record })
			.pipe(Effect.mapError((cause) => repoError("putRecord", collection, cause)));
	});
