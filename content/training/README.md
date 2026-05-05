# Training Data

`ftm_headline_training.jsonl` is the historical headline corpus used to build the prompt profile.

## Format (JSONL)
Each line is a JSON object. Minimum expected fields:
- `id` (string)
- `headline` (string)

Optional fields (if available):
- `lead` (string)
- `body` (string)
- `tags` (string[])
- `published_at` (string)

## Updating
- Prefer appending new validated records.
- Keep the file UTF-8.
- One JSON object per line.

## Corpus Insights Workflow (GPT-5.5)
We do **not** feed the full JSONL into the prompt builder by default. Instead:
1. Run `node scripts/summarize_historical_corpus.mjs propose`:
   - Produces `historical-corpus-insights.proposed.md` and `historical-corpus-insights.proposed.json` for review.
2. After you approve the proposed 20 representative examples, run `node scripts/summarize_historical_corpus.mjs approve`:
   - Writes `historical-corpus-insights.md` which becomes a canonical training input.
