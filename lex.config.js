// file: lex.config.js
import { defineLexiconConfig } from '@atcute/lex-cli';

export default defineLexiconConfig({
	generate: {
		files: ['lexicons/**/*.json'],
		outdir: 'src/lexicons/',
		// Keep the `.js` suffix the vendored schemas already use, so regenerating does not
		// rewrite every import in the tree.
		modules: { importSuffix: '.js' }
	},
	pull: {
		outdir: 'lexicons/',
		clean: false,
		sources: [
			{
				// Standard lexicons referenced by the records we read. Fetched by NSID; the
				// resolver is occasionally flaky for these, which only means a stale copy stays.
				type: 'atproto',
				mode: 'nsids',
				nsids: [
					'app.bsky.richtext.facet',
					'com.atproto.label.defs',
					'community.lexicon.bookmarks.bookmark',
				],
			},
			{
				// Tangled's feed schemas; `sh.tangled.feed.star` is what the star source reads.
				type: 'git',
				remote: 'https://github.com/ilyagr/tangled-core.git',
				ref: 'master',
				pattern: ['lexicons/feed/star.json'],
			},
			{
				// Semble's cosmik lexicons are FLAT at the lexicons root - the `network/cosmik/`
				// directory in our tree is the NSID path the CLI writes, not the source layout.
				// Listed explicitly: a single-level glob did not match here, and `**/*.json`
				// would also drag in Semble's own (stale) `at/margin/**` copy, which margin owns.
				type: 'git',
				remote: 'https://github.com/cosmik-network/semble.git',
				ref: 'main',
				pattern: [
					'src/modules/atproto/infrastructure/lexicons/card.json',
					'src/modules/atproto/infrastructure/lexicons/collection.json',
					'src/modules/atproto/infrastructure/lexicons/collectionLink.json',
					'src/modules/atproto/infrastructure/lexicons/connection.json',
					'src/modules/atproto/infrastructure/lexicons/defs.json',
				],
			},
			{
				// margin owns `at.margin.*`; its repo is the authority, not the copy Semble ships.
				type: 'git',
				remote: 'https://github.com/margin-at/margin.git',
				ref: 'main',
				pattern: ['lexicons/**/*.json'],
			},
		],
	},
});
