import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';
import * as AppBskyRichtextFacet from "../../app/bsky/richtext/facet.js";
import * as ComAtprotoLabelDefs from "../../com/atproto/label/defs.js";

const _bodySchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("at.margin.note#body")),
		/**
		 * MIME type of the body content
		 * @default "text/plain"
		 */
		"format": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string(), "text/plain"),
		/**
		 * Reference to external body content
		 */
		"uri": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
		/**
		 * Text content of the annotation. For bookmarks, this is the description.
		 * @maxLength 10000
		 * @maxGraphemes 3000
		 */
		"value": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[
				/*#__PURE__*/ v.stringLength(0, 10000),
				/*#__PURE__*/ v.stringGraphemes(0, 3000)
			]
		)),
	}
);
const _generatorSchema = /*#__PURE__*/ v.object({
	"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("at.margin.note#generator")),
	"homepage": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
	"id": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
	"name": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
});
const _mainSchema = /*#__PURE__*/ v.record(
	/*#__PURE__*/ v.tidString(),
	/*#__PURE__*/ v.object(
		{
			"$type": /*#__PURE__*/ v.literal("at.margin.note"),
			/**
			 * The annotation content (text or reference). For bookmarks, use body.value for the description.
			 */
			get "body"() {
				return /*#__PURE__*/ v.optional(bodySchema)
			},
			/**
			 * Highlight color tint
			 * @maxLength 20
			 */
			"color": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.string(),
				[/*#__PURE__*/ v.stringLength(0, 20)]
			)),
			"createdAt": /*#__PURE__*/ v.datetimeString(),
			/**
			 * Rich text facets (e.g. mentions, links)
			 */
			get "facets"() {
				return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(AppBskyRichtextFacet.mainSchema))
			},
			/**
			 * The client/agent that created this record
			 */
			get "generator"() {
				return /*#__PURE__*/ v.optional(generatorSchema)
			},
			/**
			 * Self-applied content labels for this annotation
			 */
			get "labels"() {
				return /*#__PURE__*/ v.optional(ComAtprotoLabelDefs.selfLabelsSchema)
			},
			/**
			 * When this record was last modified
			 */
			"modifiedAt": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
			/**
			 * W3C motivation for the annotation
			 */
			"motivation": /*#__PURE__*/ v.string<"assessing" | "bookmarking" | "commenting" | "describing" | "editing" | "highlighting" | "linking" | "questioning" | "replying" | "tagging" | (string & {})>(),
			/**
			 * License URI (e.g., https://creativecommons.org/licenses/by/4.0/)
			 */
			"rights": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
			/**
			 * Tags for categorization
			 * @maxLength 10
			 */
			"tags": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.array(/*#__PURE__*/ v.constrain(
					/*#__PURE__*/ v.string(),
					[
						/*#__PURE__*/ v.stringLength(0, 64),
						/*#__PURE__*/ v.stringGraphemes(0, 32)
					]
				)),
				[/*#__PURE__*/ v.arrayLength(0, 10)]
			)),
			/**
			 * The resource being annotated with optional selector
			 */
			get "target"() {
				return targetSchema
			},
		}
	)
);
const _selectorSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("at.margin.note#selector")),
		/**
		 * FragmentSelector: URI of the specification the fragment conforms to
		 */
		"conformsTo": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
		/**
		 * TextPositionSelector: end character offset (exclusive)
		 * @minimum 0
		 */
		"end": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
		/**
		 * TextQuoteSelector: the exact text being selected
		 * @maxLength 5000
		 * @maxGraphemes 1500
		 */
		"exact": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[
				/*#__PURE__*/ v.stringLength(0, 5000),
				/*#__PURE__*/ v.stringGraphemes(0, 1500)
			]
		)),
		/**
		 * TextQuoteSelector: text immediately before the selection, for disambiguation
		 * @maxLength 500
		 * @maxGraphemes 150
		 */
		"prefix": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[
				/*#__PURE__*/ v.stringLength(0, 500),
				/*#__PURE__*/ v.stringGraphemes(0, 150)
			]
		)),
		/**
		 * W3C refinement: a further selector applied within the region this selector identifies (e.g. a FragmentSelector locating a page or CFI range inside a TextQuoteSelector match).
		 */
		get "refinedBy"() {
			return /*#__PURE__*/ v.optional(selectorSchema)
		},
		/**
		 * TextPositionSelector: start character offset (inclusive)
		 * @minimum 0
		 */
		"start": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
		/**
		 * TextQuoteSelector: text immediately after the selection, for disambiguation
		 * @maxLength 500
		 * @maxGraphemes 150
		 */
		"suffix": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[
				/*#__PURE__*/ v.stringLength(0, 500),
				/*#__PURE__*/ v.stringGraphemes(0, 150)
			]
		)),
		/**
		 * W3C selector type identifier
		 */
		"type": /*#__PURE__*/ v.string<"CssSelector" | "FragmentSelector" | "TextPositionSelector" | "TextQuoteSelector" | "XPathSelector" | (string & {})>(),
		/**
		 * CssSelector/XPathSelector/FragmentSelector: the selector expression or fragment value
		 * @maxLength 2000
		 */
		"value": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[/*#__PURE__*/ v.stringLength(0, 2000)]
		)),
	}
);
const _targetSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("at.margin.note#target")),
		/**
		 * W3C Selector to identify the annotated segment. Uses W3C 'type' field (not ATProto $type) per the Web Annotation Data Model.
		 */
		get "selector"() {
			return /*#__PURE__*/ v.optional(selectorSchema)
		},
		/**
		 * The URL being annotated
		 */
		"source": /*#__PURE__*/ v.genericUriString(),
		/**
		 * SHA256 hash of normalized URL for indexing
		 */
		"sourceHash": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
		/**
		 * State of the resource at annotation time
		 */
		get "state"() {
			return /*#__PURE__*/ v.optional(timeStateSchema)
		},
		/**
		 * Page title at time of annotation
		 * @maxLength 500
		 */
		"title": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[/*#__PURE__*/ v.stringLength(0, 500)]
		)),
	}
);
const _timeStateSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("at.margin.note#timeState")),
		/**
		 * URL to cached/archived version
		 */
		"cached": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
		/**
		 * When the source was accessed
		 */
		"sourceDate": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
	}
);
type body$schematype = typeof _bodySchema;
type generator$schematype = typeof _generatorSchema;
type main$schematype = typeof _mainSchema;
type selector$schematype = typeof _selectorSchema;
type target$schematype = typeof _targetSchema;
type timeState$schematype = typeof _timeStateSchema;

export interface bodySchema extends body$schematype {}

export interface generatorSchema extends generator$schematype {}

export interface mainSchema extends main$schematype {}

export interface selectorSchema extends selector$schematype {}

export interface targetSchema extends target$schematype {}

export interface timeStateSchema extends timeState$schematype {}
export const bodySchema = _bodySchema as bodySchema;
export const generatorSchema = _generatorSchema as generatorSchema;
export const mainSchema = _mainSchema as mainSchema;
export const selectorSchema = _selectorSchema as selectorSchema;
export const targetSchema = _targetSchema as targetSchema;
export const timeStateSchema = _timeStateSchema as timeStateSchema;

export interface Body extends v.InferInput<typeof bodySchema> {}

export interface Generator extends v.InferInput<typeof generatorSchema> {}

export interface Main extends v.InferInput<typeof mainSchema> {}

export interface Selector extends v.InferInput<typeof selectorSchema> {}

export interface Target extends v.InferInput<typeof targetSchema> {}

export interface TimeState extends v.InferInput<typeof timeStateSchema> {}
declare module '@atcute/lexicons/ambient' {
	interface Records {
		"at.margin.note": mainSchema;
	}
}
