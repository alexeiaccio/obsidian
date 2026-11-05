import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';

const _mainSchema = /*#__PURE__*/ v.record(
	/*#__PURE__*/ v.tidString(),
	/*#__PURE__*/ v.object(
		{
			"$type": /*#__PURE__*/ v.literal("network.cosmik.connection"),
			/**
			 * Optional type of connection
			 */
			"connectionType": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
			/**
			 * Timestamp when this connection was created.
			 */
			"createdAt": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
			/**
			 * Optional note about the connection
			 * @maxLength 1000
			 */
			"note": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.string(),
				[/*#__PURE__*/ v.stringLength(0, 1000)]
			)),
			/**
			 * Source entity (URL string or AT URI)
			 */
			"source": /*#__PURE__*/ v.string(),
			/**
			 * Target entity (URL string or AT URI)
			 */
			"target": /*#__PURE__*/ v.string(),
			/**
			 * Timestamp when this connection was last updated.
			 */
			"updatedAt": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
		}
	)
);
type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}
export const mainSchema = _mainSchema as mainSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}
declare module '@atcute/lexicons/ambient' {
	interface Records {
		"network.cosmik.connection": mainSchema;
	}
}
