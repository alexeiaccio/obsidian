import { Effect } from "effect";
import { resolveIdentity } from "@eoa/identity";
import type { ActorIdentifier } from "@atcute/lexicons";
import { ResolveActorError } from "./Errors";

/** The identity fields this plugin uses. */
export interface ResolvedActor {
	readonly did: string;
	readonly handle?: string;
	/** The `#atproto_pds` endpoint, when the document advertises one. */
	readonly pds?: string;
}

/**
 * Actor resolution through `@eoa/identity` — the repo's own resolver, Effect-native and
 * cached, replacing the plugin's atcute composite resolver.
 *
 * The previous implementation tried Slingshot (`blue.microcosm.identity.resolveMiniDoc`) first
 * and fell back to PLC/DNS. That accelerator is deliberately not carried over: it existed to
 * avoid a DID-document fetch, which this resolver's cache covers, and it was the last user of
 * `@atcute/microcosm`.
 */
export const resolveActor = Effect.fn("Identity.resolveActor")(function* (
	identifier: ActorIdentifier,
) {
	const identity = yield* resolveIdentity(
		// atcute brands its identifiers and the resolver brands its own; same shape, one seam.
		identifier as Parameters<typeof resolveIdentity>[0],
	).pipe(
		Effect.mapError((cause) => new ResolveActorError({ identifier, message: String(cause) })),
	);

	return {
		did: identity.did,
		...(identity.handle === undefined ? {} : { handle: identity.handle }),
		...(identity.pds === undefined ? {} : { pds: identity.pds }),
	} satisfies ResolvedActor;
});
