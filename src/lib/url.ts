/**
 * A URL reduced to the parts that identify the page.
 *
 * Two features match a stored record to a page by URL — `{{highlights}}` (a margin note's
 * `target.source`) and the relation→wikilink lookup (a clip's `url` frontmatter) — and both
 * missed whenever the URL differed by a fragment or a tracking parameter. One normalisation
 * fixes both, so it lives here, pure and tested.
 *
 * Deliberately conservative, because it only ever affects *matching*: the original URL is
 * still what gets stored, displayed and written to records.
 */

/** Parameters that identify a campaign, not a page. */
const TRACKING_PARAMETERS = [
	/^utm_/,
	/^mc_(cid|eid)$/,
	/^(fbclid|gclid|dclid|igshid|ref_src|ref_url|s|si)$/,
];

const isTracking = (name: string): boolean => {
	const lower = name.toLowerCase();
	return TRACKING_PARAMETERS.some((pattern) => pattern.test(lower));
};

export const normalizeUrl = (url: string): string => {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		// Not a URL we can reason about; match it as written.
		return url.trim();
	}

	parsed.hash = "";

	const kept: Array<[string, string]> = [];
	for (const [name, value] of parsed.searchParams) {
		if (!isTracking(name)) {
			kept.push([name, value]);
		}
	}
	kept.sort(([a], [b]) => a.localeCompare(b));
	parsed.search = "";
	for (const [name, value] of kept) {
		parsed.searchParams.append(name, value);
	}

	// A trailing slash is not part of the page's identity; `/a/` and `/a` are one page.
	if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
		parsed.pathname = parsed.pathname.replace(/\/+$/, "");
	}

	return parsed.toString();
};

/** Whether two URLs point at the same page. */
export const sameUrl = (a: string | undefined, b: string | undefined): boolean =>
	a !== undefined && b !== undefined && normalizeUrl(a) === normalizeUrl(b);
