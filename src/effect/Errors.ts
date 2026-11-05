import { Schema } from "effect";

/**
 * The plugin's error taxonomy.
 *
 * Logic modules fail with these instead of `throw new Error(...)`, so callers can
 * branch on the failure (`Effect.catchTag("RepoError", ...)`) and the message
 * still carries the detail.
 */

/** Login, session restore, logout or OAuth callback failure. */
export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
	message: Schema.String,
}) {}

/** Handle/DID resolution failure. */
export class ResolveActorError extends Schema.TaggedError<ResolveActorError>()(
	"ResolveActorError",
	{ identifier: Schema.String, message: Schema.String },
) {}

/** A repo record operation (list/get/create/put/delete) failed. */
export class RepoError extends Schema.TaggedError<RepoError>()("RepoError", {
	operation: Schema.String,
	collection: Schema.optional(Schema.String),
	message: Schema.String,
}) {}

/** A data source failed to produce items. */
export class SourceError extends Schema.TaggedError<SourceError>()("SourceError", {
	source: Schema.String,
	message: Schema.String,
}) {}

/** A vault read or write failed. */
export class VaultError extends Schema.TaggedError<VaultError>()("VaultError", {
	path: Schema.String,
	message: Schema.String,
}) {}

/** Fetching or extracting a page's readable content failed. */
export class ReaderError extends Schema.TaggedError<ReaderError>()("ReaderError", {
	url: Schema.String,
	message: Schema.String,
}) {}
