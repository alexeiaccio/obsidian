# Skill: Enrich Links

LLM-powered enrichment of vault link files. Handles tagging, cross-linking, summaries, and annotations for ALL sources (Arc, GitHub, Tangled, Semble/Margin, daily notes).

## When to Use
- User says "enrich links", "process daily notes", or "sync and enrich"
- After running any sync script, to add tags, cross-links, and annotations
- User wants to batch-process existing Links/ files with empty tags

## Vault Context
- Vault path: ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes
- Links are stored in: Links/ (flat folder, one file per item)
- Tag pages are in: Tags/ (one file per tag, used as graph nodes)
- Daily notes are in: Daily/ (web clipper journal)

## Mode 1: Process daily notes into Links/

1. Read daily note file(s) from `Daily/YYYY-MM-DD.md`
2. Extract link entries (lines matching `- [Title](URL) – description` or similar patterns)
3. For each link:
   - Fetch URL content using WebFetch tool
   - Write a 1-2 sentence annotation summarizing what the page is about
   - Infer 2-5 tags that match existing `Tags/*.md` filenames when possible
   - Create `Links/<Title>.md` with this structure:
     ```yaml
     ---
     source: daily
     url: <original URL>
     tags: [tag1, tag2]
     created: <date from daily note>
     ---
     # <Title>

     <1-2 sentence annotation>

     <optional key points as bullet list>

     > <original description from daily note, as blockquote>
     ```
   - Add `[[wikilinks]]` to tag pages inline in the body text where relevant
4. Present summary: "Processed X links from daily notes. Created Y new files in Links/"
5. Ask user to confirm before deleting daily notes
6. After confirmation, delete processed daily note(s) from `Daily/`

## Mode 2: Enrich existing Links/ files

1. Find files in `Links/` with empty `tags: []` or missing tags field
   - This includes old legacy bookmark files (frontmatter-only, no body content)
   - This includes Arc exports moved during vault cleanup
   - This includes files from any sync script that writes `tags: []`
2. Process in batches (10-20 files at a time to stay in context)
3. For each file:
   - Read existing content and URL from frontmatter
   - Fetch URL content using WebFetch (skip if already has a summary body)
   - Add 1-2 sentence annotation
   - Infer 2-5 tags matching existing Tags/ pages
   - Add `[[wikilinks]]` to tag pages inline
   - Update the file in place (edit frontmatter tags, add body content)
4. Present progress and summary

## Enrichment Rules
- Tags MUST match existing `Tags/*.md` filenames when possible (check with Glob tool)
- If no matching tag page exists, create one with `tags: [TagName]` frontmatter
- Add `[[wikilinks]]` to tag pages inline in the body where contextually relevant
- Keep annotations SHORT: 1-2 sentences max
- Preserve ALL existing frontmatter; only UPDATE the `tags` field
- Preserve any existing body content; APPEND the annotation below it
- Never invent URLs or links that don't exist
- If URL is unreachable/unavailable, create minimal entry with just the description
- Skip files that already have non-empty tags AND body content (already enriched)

## Frontmatter Convention
```yaml
---
source: arc | github | tangled | semble | margin | daily
url: <URL>
tags: [tag1, tag2]
created: YYYY-MM-DD
---
```

## Output Format
After enrichment, each Links/ file should have:
- Complete frontmatter with tags
- Title as H1
- 1-2 sentence annotation
- Optional key points or relevant details
- `[[wikilinks]]` to Tags/ pages
- Original description preserved (as blockquote if from daily notes)
