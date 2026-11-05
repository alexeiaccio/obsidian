import { Effect } from "effect";
import type { ActorIdentifier } from "@atcute/lexicons";
import { requestUrl } from "obsidian";
import { SourceError } from "../../effect/Errors";
import { resolveActor } from "../../effect/Identity";
import * as Repo from "../../effect/Repo";

/**
 * Tangled stars and the repo subjects they point at, as Effects.
 *
 * A star carries only the repo AT-URI (owner DID + record key), but Tangled
 * addresses repos by name (`tangled.org/<handle>/<repo>`), so resolving a subject
 * takes one identity lookup and one PDS read.
 */

export const TANGLED_STAR = "sh.tangled.feed.star";
export const TANGLED_REPO = "sh.tangled.repo";

const fail = (cause: { message: string }) =>
	new SourceError({ source: "tangled", message: `${TANGLED_STAR}: ${cause.message}` });

export const getTangledStars = (repo: string) =>
	Repo.listRecords(repo, TANGLED_STAR).pipe(Effect.mapError(fail));

export interface ResolvedTangledSubject {
	url?: string;
	title?: string;
	description?: string;
}

const REPO_AT_URI = /^at:\/\/([^/]+)\/sh\.tangled\.repo\/([^/]+)$/;
const cache = new Map<string, ResolvedTangledSubject>();

/**
 * Turn a star subject into something clickable.
 *
 * ponytail: one identity + one PDS read per star, no batching. Fine for the
 * handful of repos a person stars; batch behind the owner DID if a profile ever
 * carries hundreds.
 */
const resolveSubject = Effect.fn("Tangled.resolveSubject")(function* (subject: string) {
	if (!subject.startsWith("at://")) {
		return { url: subject };
	}

	const cached = cache.get(subject);
	if (cached) {
		return cached;
	}

	const match = subject.match(REPO_AT_URI);
	if (!match) {
		return { url: subject };
	}

	const [, owner, rkey] = match;
	if (!owner || !rkey) {
		return { url: subject };
	}

	const actor = yield* resolveActor(owner as ActorIdentifier);
	if (!actor.pds) {
		return { url: subject };
	}

	const res = yield* Effect.tryPromise({
		try: () =>
			requestUrl({
				url: `${actor.pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(
					actor.did,
				)}&collection=${TANGLED_REPO}&rkey=${encodeURIComponent(rkey)}`,
			}),
		catch: (cause) =>
			new SourceError({ source: "tangled", message: `read ${subject}: ${String(cause)}` }),
	});
	const value = (JSON.parse(res.text) as { value?: { name?: string; description?: string } })
		.value;
	const name = value?.name ?? rkey;
	const resolved: ResolvedTangledSubject = {
		url: `https://tangled.org/${actor.handle ?? actor.did}/${name}`,
		title: name,
		description: value?.description,
	};
	cache.set(subject, resolved);
	return resolved;
});

/** A subject that will not resolve leaves the star unlinked rather than failing the list. */
export const resolveTangledSubject = (subject: string) =>
	resolveSubject(subject).pipe(
		Effect.catchTags({
			ResolveActorError: () => Effect.succeed<ResolvedTangledSubject>({}),
			SourceError: () => Effect.succeed<ResolvedTangledSubject>({}),
		}),
	);
