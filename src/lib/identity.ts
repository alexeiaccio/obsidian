import { Effect } from "effect";
import type { ActorIdentifier } from "@atcute/lexicons";
import { type ResolvedActor, resolveActor as resolveActorEffect } from "../effect/Identity";

/**
 * The Promise seam onto `effect/Identity`, for the plain-TS callers (`util.ts`,
 * `lib/markdown/leaflet.ts`) that need a handle resolved to a DID and a PDS.
 *
 * The atcute-shaped `ActorResolver` this file used to export existed only for the
 * atcute OAuth client, which T5 removed — so the adapter is gone with it and the
 * resolver is the repo's own everywhere.
 */
export async function resolveActor(identifier: ActorIdentifier): Promise<ResolvedActor> {
	return await Effect.runPromise(resolveActorEffect(identifier));
}
