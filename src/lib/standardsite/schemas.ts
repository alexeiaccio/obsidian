import { Schema } from 'effect';

/**
 * `site.standard.*` records, as Effect schemas.
 *
 * Field sets and required/optional status follow the lexicons. atproto objects
 * are open, so every record keeps fields it does not declare — the clipper reads
 * a record, edits two timestamps and writes it back, and dropping the rest would
 * silently truncate it. `content`/`links`/`labels` are open unions in the
 * lexicon, so they stay `unknown` and are narrowed by their own `is` checks.
 *
 * The interfaces next to the schemas are the mutable view: a decoded struct is
 * readonly, and `createDocument`/`putDocument` stamp `publishedAt`/`updatedAt`
 * on the record they were handed.
 */

export interface Blob {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface StrongRef {
  uri: string;
  cid: string;
}

export interface Contributor {
  $type?: 'site.standard.document#contributor';
  did: string;
  displayName?: string;
  role?: string;
}

export interface Document {
  [key: string]: unknown;
  $type: 'site.standard.document';
  site: string;
  title: string;
  publishedAt: string;
  path?: string;
  description?: string;
  textContent?: string;
  updatedAt?: string;
  tags?: ReadonlyArray<string>;
  contributors?: ReadonlyArray<Contributor>;
  coverImage?: Blob;
  bskyPostRef?: StrongRef;
  content?: unknown;
  links?: unknown;
  labels?: unknown;
}

export interface PublicationPreferences {
  $type?: 'site.standard.publication#preferences';
  showInDiscover?: boolean;
}

export interface Publication {
  [key: string]: unknown;
  $type: 'site.standard.publication';
  name: string;
  url: string;
  description?: string;
  icon?: Blob;
  basicTheme?: unknown;
  labels?: unknown;
  preferences?: PublicationPreferences;
}

export interface Subscription {
  [key: string]: unknown;
  $type: 'site.standard.graph.subscription';
  publication: string;
  createdAt?: string;
}

const BlobSchema = Schema.Struct({
  $type: Schema.Literal('blob'),
  ref: Schema.Struct({ $link: Schema.String }),
  mimeType: Schema.String,
  size: Schema.Number,
});

const StrongRefSchema = Schema.Struct({ uri: Schema.String, cid: Schema.String });

/** Known properties are checked; the rest is kept, because atproto objects are open. */
const openObject = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [
    Schema.Record(Schema.String, Schema.Unknown),
  ]);

const ContributorSchema = openObject({
  $type: Schema.optionalKey(
    Schema.Literal('site.standard.document#contributor'),
  ),
  did: Schema.String,
  displayName: Schema.optionalKey(Schema.String),
  role: Schema.optionalKey(Schema.String),
});

export const DocumentSchema = openObject({
  $type: Schema.Literal('site.standard.document'),
  site: Schema.String,
  title: Schema.String,
  publishedAt: Schema.String,
  path: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  textContent: Schema.optionalKey(Schema.String),
  updatedAt: Schema.optionalKey(Schema.String),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  contributors: Schema.optionalKey(Schema.Array(ContributorSchema)),
  coverImage: Schema.optionalKey(BlobSchema),
  bskyPostRef: Schema.optionalKey(StrongRefSchema),
  content: Schema.optionalKey(Schema.Unknown),
  links: Schema.optionalKey(Schema.Unknown),
  labels: Schema.optionalKey(Schema.Unknown),
});

export const PublicationPreferencesSchema = openObject({
  $type: Schema.optionalKey(
    Schema.Literal('site.standard.publication#preferences'),
  ),
  showInDiscover: Schema.optionalKey(Schema.Boolean),
});

export const PublicationSchema = openObject({
  $type: Schema.Literal('site.standard.publication'),
  name: Schema.String,
  url: Schema.String,
  description: Schema.optionalKey(Schema.String),
  icon: Schema.optionalKey(BlobSchema),
  basicTheme: Schema.optionalKey(Schema.Unknown),
  labels: Schema.optionalKey(Schema.Unknown),
  preferences: Schema.optionalKey(PublicationPreferencesSchema),
});

export const SubscriptionSchema = openObject({
  $type: Schema.Literal('site.standard.graph.subscription'),
  publication: Schema.String,
  createdAt: Schema.optionalKey(Schema.String),
});

// A record that does not match its lexicon is a failure the caller reports, so
// decoding throws — the same contract `@atcute/lexicons`' `parse` had.
export const decodeDocument = (value: unknown): Document =>
  Schema.decodeUnknownSync(DocumentSchema)(value);

export const decodePublication = (value: unknown): Publication =>
  Schema.decodeUnknownSync(PublicationSchema)(value);

export const decodeSubscription = (value: unknown): Subscription =>
  Schema.decodeUnknownSync(SubscriptionSchema)(value);
