import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';

const _mainSchema = /*#__PURE__*/ v.record(
	/*#__PURE__*/ v.literal("self"),
	/*#__PURE__*/ v.object(
		{
			"$type": /*#__PURE__*/ v.literal("at.margin.readingRoom"),
			"createdAt": /*#__PURE__*/ v.datetimeString(),
			/**
			 * Longer description of what the room collects.
			 * @maxLength 2000
			 * @maxGraphemes 600
			 */
			"description": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.string(),
				[
					/*#__PURE__*/ v.stringLength(0, 2000),
					/*#__PURE__*/ v.stringGraphemes(0, 600)
				]
			)),
			/**
			 * AT URIs of annotations pinned to the top of the room.
			 * @maxLength 12
			 */
			"featuredUris": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.array(/*#__PURE__*/ v.resourceUriString()),
				[/*#__PURE__*/ v.arrayLength(0, 12)]
			)),
			/**
			 * Whether bookmarks from external services (Semble, Lichen, etc.) are shown in the room.
			 * @default true
			 */
			"showExternalBookmarks": /*#__PURE__*/ v.optional(
				/*#__PURE__*/ v.boolean(),
				true
			),
			/**
			 * Tagline shown beneath the title.
			 * @maxLength 300
			 * @maxGraphemes 150
			 */
			"subtitle": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.string(),
				[
					/*#__PURE__*/ v.stringLength(0, 300),
					/*#__PURE__*/ v.stringGraphemes(0, 150)
				]
			)),
			/**
			 * Visual theme for the room.
			 */
			get "theme"() {
				return /*#__PURE__*/ v.optional(themeSchema)
			},
			/**
			 * Title shown at the top of the reading room.
			 * @maxLength 200
			 * @maxGraphemes 100
			 */
			"title": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.string(),
				[
					/*#__PURE__*/ v.stringLength(0, 200),
					/*#__PURE__*/ v.stringGraphemes(0, 100)
				]
			)),
		}
	)
);
const _themeSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("at.margin.readingRoom#theme")),
		/**
		 * Accent color as a hex string (e.g. #3b82f6).
		 * @maxLength 20
		 */
		"accentColor": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[/*#__PURE__*/ v.stringLength(0, 20)]
		)),
		/**
		 * Page background color as a hex string (e.g. #fcfcfc).
		 * @maxLength 20
		 */
		"backgroundColor": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[/*#__PURE__*/ v.stringLength(0, 20)]
		)),
		/**
		 * CSS font family identifier for body text.
		 * @maxLength 100
		 */
		"fontFamily": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
			/*#__PURE__*/ v.string(),
			[/*#__PURE__*/ v.stringLength(0, 100)]
		)),
		/**
		 * Arrangement of notes on the room page.
		 * @default "masonry"
		 */
		"layout": /*#__PURE__*/ v.optional(
			/*#__PURE__*/ v.string<"grid" | "list" | "masonry" | (string & {})>(),
			"masonry"
		),
	}
);
type main$schematype = typeof _mainSchema;
type theme$schematype = typeof _themeSchema;

export interface mainSchema extends main$schematype {}

export interface themeSchema extends theme$schematype {}
export const mainSchema = _mainSchema as mainSchema;
export const themeSchema = _themeSchema as themeSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}

export interface Theme extends v.InferInput<typeof themeSchema> {}
declare module '@atcute/lexicons/ambient' {
	interface Records {
		"at.margin.readingRoom": mainSchema;
	}
}
