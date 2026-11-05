import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';

const _mainSchema = /*#__PURE__*/ v.record(
	/*#__PURE__*/ v.tidString(),
	/*#__PURE__*/ v.object(
		{
			"$type": /*#__PURE__*/ v.literal("at.margin.apikey"),
			"createdAt": /*#__PURE__*/ v.datetimeString(),
			/**
			 * SHA256 hash of the API key.
			 */
			"keyHash": /*#__PURE__*/ v.string(),
			/**
			 * Human-readable name for the API key.
			 * @maxLength 64
			 */
			"name": /*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.string(),
				[/*#__PURE__*/ v.stringLength(0, 64)]
			),
		}
	)
);
type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}
export const mainSchema = _mainSchema as mainSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}
declare module '@atcute/lexicons/ambient' {
	interface Records {
		"at.margin.apikey": mainSchema;
	}
}
