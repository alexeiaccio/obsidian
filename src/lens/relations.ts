import type { ConnectionInfo } from "../sources/types";

/**
 * A lens over a card's Semble relations.
 *
 * Direction is **per item**: in a clip, `outgoing` means "this item points at the
 * other card" and `incoming` means "the other card points at this one". That is why
 * the lens belongs to the clip rather than to the Canvas lens — repo-wide, an entry's
 * direction is relative to whichever card it was collected under, so `fetchConnections`
 * legitimately returns both sides and the canvas draws them all.
 *
 * Pure, so the selection has a unit test.
 */
export interface RelationLens {
	/** Only this direction; omit for both. */
	readonly direction?: "incoming" | "outgoing";
	/** Only these `connectionType`s, case-insensitive; omit or empty for any. */
	readonly types?: readonly string[];
	/** Drop relations whose other endpoint never resolved to a URL. */
	readonly resolvedOnly?: boolean;
	/** Keep at most this many, in the order given. */
	readonly limit?: number;
}

export interface RelationRenderOptions {
	readonly heading?: string;
	/**
	 * The vault link target for a relation whose other endpoint has already been
	 * clipped. When it resolves, the relation renders as a wikilink instead of a
	 * bare URL — which is what closes the loop between the clip inbox and the
	 * relation graph.
	 */
	readonly noteFor?: (relation: ConnectionInfo) => string | undefined;
}

export const applyRelationLens = (
	relations: readonly ConnectionInfo[],
	lens: RelationLens,
): ConnectionInfo[] => {
	const types = lens.types?.map((type) => type.toLowerCase()).filter((type) => type.length > 0);

	const lensed = relations.filter((relation) => {
		if (lens.direction !== undefined && relation.direction !== lens.direction) {
			return false;
		}
		if (types !== undefined && types.length > 0) {
			const type = relation.type?.toLowerCase();
			if (type === undefined || !types.includes(type)) {
				return false;
			}
		}
		if (lens.resolvedOnly === true && relation.url === undefined) {
			return false;
		}
		return true;
	});

	return lens.limit === undefined ? lensed : lensed.slice(0, lens.limit);
};

/** The distinct connection types present, sorted — for a UI that offers them. */
export const relationTypes = (relations: readonly ConnectionInfo[]): string[] =>
	[
		...new Set(
			relations
				.map((relation) => relation.type)
				.filter((type): type is string => typeof type === "string" && type.length > 0),
		),
	].sort();

const relationLine = (relation: ConnectionInfo, options: RelationRenderOptions): string => {
	const arrow = relation.direction === "outgoing" ? "→" : "←";
	const type = relation.type ? `**${relation.type}**` : "related";
	const label = relation.title ?? relation.url ?? "(unresolved)";

	const note = options.noteFor?.(relation);
	let target: string;
	if (note !== undefined && note.length > 0) {
		target =
			relation.title !== undefined && relation.title.length > 0
				? `[[${note}|${relation.title}]]`
				: `[[${note}]]`;
	} else if (relation.url !== undefined) {
		target = `[${label}](${relation.url})`;
	} else {
		target = label;
	}

	const suffix = relation.note ? ` — ${relation.note}` : "";
	return `${arrow} ${type} ${target}${suffix}`;
};

/** Render relations as a Markdown section, or "" when none survive the lens. */
export const renderRelations = (
	relations: readonly ConnectionInfo[],
	options: RelationRenderOptions = {},
): string =>
	relations.length === 0
		? ""
		: [
				`## ${options.heading ?? "Connections"}`,
				"",
				...relations.map((relation) => `- ${relationLine(relation, options)}`),
			].join("\n");
