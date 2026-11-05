import { Effect } from "effect";
import type { GenericUri, ResourceUri } from "@atcute/lexicons";
import { parseResourceUri } from "@atcute/lexicons";
import {
	decodeDocument,
	decodePublication,
	decodeSubscription,
	type Blob,
	type Document,
	type Publication,
	type Subscription,
} from "./schemas";

import { ATRecord } from "lib";
import { xrpcFor } from "../../effect/Xrpc";
import type { ATClient } from "../client";

/**
 * standard.site reads and writes.
 *
 * The transport is `@eoa/xrpc` — the same client the record layer uses — and the
 * three record schemas live next door in `./schemas`: they follow the lexicons,
 * keep undeclared fields, and decode with Effect.
 */

type ListBody = {
	records: Array<{ uri: string; cid: string; value: unknown }>;
	cursor?: string;
};

const list = async <A>(
	client: ATClient,
	nsid: string,
	params: Record<string, string | number>,
	parseValue: (value: unknown) => A,
): Promise<{ records: ATRecord<A>[]; cursor?: string }> => {
	// `call`'s type parameter is the request *input*; the response body is `unknown`.
	const response = await Effect.runPromise(xrpcFor(client).call(nsid, params));
	const body = response.body as ListBody;
	return {
		records: body.records.map((record) => ({
			uri: record.uri,
			cid: record.cid,
			value: parseValue(record.value),
		})) as ATRecord<A>[],
		...(body.cursor === undefined ? {} : { cursor: body.cursor }),
	};
};

export function buildDocumentUrl(pubUrl: string, docUri: string, record: Document): string {
	const baseUrl = pubUrl.replace(/\/$/, '');

	// leaflet does not use path, url just uses rkey
	if (record.path === undefined || record.path === '') {
		const parsed = parseResourceUri(docUri)
		if (parsed !== undefined) {
			return `${baseUrl}/${parsed.rkey}`;
		}
		return ""
	}

	const normalizedPath = record.path.replace(/^\/+/, "");
	return `${baseUrl}/${normalizedPath}`
}


export async function getPublicationDocuments(client: ATClient, repo: string, pubUri: ResourceUri) {
	const response = await list(
		client,
		"com.atproto.repo.listRecords",
		{ repo, collection: "site.standard.document", limit: 100 },
		(value) => decodeDocument(value),
	);

	const pubDocs = response.records.filter((record) => record.value.site === pubUri);

	return { ...response, records: pubDocs as ATRecord<Document>[] };
};

export async function createDocument(
	client: ATClient,
	repo: string,
	record: Document
): Promise<ResourceUri> {
	const now = new Date().toISOString();
	if (!record.publishedAt) {
		record.publishedAt = now;
	}
	record.updatedAt = now;

	const response = await Effect.runPromise(
		xrpcFor(client).call("com.atproto.repo.createRecord", undefined, {
			repo,
			collection: "site.standard.document",
			validate: false,
			record,
		}),
	);
	return ((response.body as { uri?: string }).uri ?? "") as ResourceUri;
}

export async function putDocument(
	client: ATClient,
	repo: string,
	uri: ResourceUri,
	record: Document,
): Promise<ResourceUri> {
	const now = new Date().toISOString();
	record.updatedAt = now;

	if (!record.publishedAt) {
		record.publishedAt = now;
	}

	const parsed = parseResourceUri(uri);
	if (parsed === undefined) {
		throw new Error(`Invalid URI: ${uri}`);
	}
	const rkey = parsed.rkey;
	if (!rkey) {
		throw new Error(`URI does not contain rkey: ${uri}`);
	}

	const response = await Effect.runPromise(
		xrpcFor(client).call("com.atproto.repo.putRecord", undefined, {
			repo,
			collection: "site.standard.document",
			validate: false,
			record,
			rkey,
		}),
	);
	return ((response.body as { uri?: string }).uri ?? uri) as ResourceUri;
}

export async function getPublications(client: ATClient, repo: string) {
	return await list(
		client,
		"com.atproto.repo.listRecords",
		{ repo, collection: "site.standard.publication", limit: 100 },
		(value) => decodePublication(value),
	);
}


export async function getPublication(client: ATClient, uri: string): Promise<ATRecord<Publication>> {
	const parsed = parseResourceUri(uri);
	if (parsed === undefined) {
		throw new Error(`Invalid URI: ${uri}`);
	}

	const response = await Effect.runPromise(
		xrpcFor(client).call("com.atproto.repo.getRecord", {
			repo: parsed.repo,
			collection: parsed.collection,
			rkey: parsed.rkey ?? "",
		}),
	);
	const body = response.body as { uri?: string; cid?: string; value: unknown };

	return {
		uri: (body.uri ?? uri) as ResourceUri,
		cid: body.cid ?? "",
		value: decodePublication(body.value),
	};
}


export async function createPublication(
	client: ATClient,
	repo: string,
	name: string,
	url: GenericUri,
	options?: {
		description?: string;
		icon?: Blob;
		showInDiscover?: boolean;
	}
) {
	const record: Publication = {
		$type: "site.standard.publication",
		name,
		url,
		description: options?.description,
		// icon: options?.icon,
		preferences: options?.showInDiscover !== undefined
			? {
				$type: "site.standard.publication#preferences",
				showInDiscover: options.showInDiscover,
			}
			: undefined,
	};

	await Effect.runPromise(
		xrpcFor(client).call("com.atproto.repo.createRecord", undefined, {
			repo,
			collection: "site.standard.publication",
			validate: false,
			record,
		}),
	);
}

export async function getSubscriptions(client: ATClient, repo: string) {
	return await list(
		client,
		"com.atproto.repo.listRecords",
		{ repo, collection: "site.standard.graph.subscription", limit: 100 },
		(value) => decodeSubscription(value),
	);
}

export async function getSubscribedPublications(client: ATClient, repo: string): Promise<ATRecord<Publication>[]> {
	const subsResp = await getSubscriptions(client, repo);
	const pubUris = subsResp.records.map(sub => sub.value.publication);

	const pubs: ATRecord<Publication>[] = [];
	for (const uri of pubUris) {
		try {
			const pubResp = await getPublication(client, uri);
			pubs.push(pubResp);
		} catch (e) {
			console.warn(`Failed to fetch publication at ${uri}:`, e);
		}
	}
	return pubs;
}
