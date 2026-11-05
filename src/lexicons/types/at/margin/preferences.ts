import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';

const _labelPreferenceSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("at.margin.preferences#labelPreference")),
		/**
		 * The label identifier (e.g. sexual, violence, spam).
		 */
		"label": /*#__PURE__*/ v.string(),
		/**
		 * DID of the labeler service.
		 */
		"labelerDid": /*#__PURE__*/ v.string(),
		/**
		 * How to handle content with this label: hide, warn, or ignore.
		 */
		"visibility": /*#__PURE__*/ v.string<"hide" | "ignore" | "warn" | (string & {})>(),
	}
);
const _labelerSubscriptionSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("at.margin.preferences#labelerSubscription")),
		/**
		 * DID of the labeler service.
		 */
		"did": /*#__PURE__*/ v.string(),
	}
);
const _mainSchema = /*#__PURE__*/ v.record(
	/*#__PURE__*/ v.literal("self"),
	/*#__PURE__*/ v.object(
		{
			"$type": /*#__PURE__*/ v.literal("at.margin.preferences"),
			"createdAt": /*#__PURE__*/ v.datetimeString(),
			/**
			 * If true, do not show the confirmation modal when opening external links.
			 */
			"disableExternalLinkWarning": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.boolean()),
			/**
			 * If true, dual-write bookmarks to the standard for ATProto interop.
			 * @default false
			 */
			"enableCommunityBookmarks": /*#__PURE__*/ v.optional(
				/*#__PURE__*/ v.boolean(),
				false
			),
			/**
			 * List of hostnames to skip the external link warning modal for.
			 * @maxLength 100
			 */
			"externalLinkSkippedHostnames": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.array(/*#__PURE__*/ v.constrain(
					/*#__PURE__*/ v.string(),
					[/*#__PURE__*/ v.stringLength(0, 255)]
				)),
				[/*#__PURE__*/ v.arrayLength(0, 100)]
			)),
			/**
			 * Per-label visibility preferences for subscribed labelers.
			 * @maxLength 500
			 */
			get "labelPreferences"() {
				return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
					/*#__PURE__*/ v.array(labelPreferenceSchema),
					[/*#__PURE__*/ v.arrayLength(0, 500)]
				))
			},
			/**
			 * List of labeler services the user subscribes to for content moderation.
			 * @maxLength 50
			 */
			get "subscribedLabelers"() {
				return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
					/*#__PURE__*/ v.array(labelerSubscriptionSchema),
					[/*#__PURE__*/ v.arrayLength(0, 50)]
				))
			},
		}
	)
);
type labelPreference$schematype = typeof _labelPreferenceSchema;
type labelerSubscription$schematype = typeof _labelerSubscriptionSchema;
type main$schematype = typeof _mainSchema;

export interface labelPreferenceSchema extends labelPreference$schematype {}

export interface labelerSubscriptionSchema extends labelerSubscription$schematype {}

export interface mainSchema extends main$schematype {}
export const labelPreferenceSchema = _labelPreferenceSchema as labelPreferenceSchema;
export const labelerSubscriptionSchema = _labelerSubscriptionSchema as labelerSubscriptionSchema;
export const mainSchema = _mainSchema as mainSchema;

export interface LabelPreference extends v.InferInput<typeof labelPreferenceSchema> {}

export interface LabelerSubscription extends v.InferInput<typeof labelerSubscriptionSchema> {}

export interface Main extends v.InferInput<typeof mainSchema> {}
declare module '@atcute/lexicons/ambient' {
	interface Records {
		"at.margin.preferences": mainSchema;
	}
}
