# profesores

`makeClassSummaries.js` reads canonical month note indexes from `ETH_ARTIFACT_ROOT` and then throttles Anthropic requests in-process so Claude does not get flooded by parallel summary jobs.

Each run now writes two artifacts for the selected month:

- `summaries_YYYY-MM.md` for the readable per-student notes.
- `summaries_YYYY-MM.yaml` for the machine-readable structured export.

Set `ETH_ARTIFACT_ROOT` to the `english-tutor-helper` app-support root. This script reads month indexes from `ETH_ARTIFACT_ROOT/notes/indexes/YYYY-MM.json` and then reads matched note bodies from the `notesPath` files referenced there.

Anthropic tuning env vars:

- `ANTHROPIC_MAX_CONCURRENCY`
  Default: `2`
  Maximum number of simultaneous `/messages` requests from this script.
- `ANTHROPIC_MAX_RETRIES`
  Default: `4`
  Retries for retryable Claude errors such as rate limits or temporary server failures.
- `ANTHROPIC_RETRY_BASE_MS`
  Default: `1500`
  Base delay used for exponential backoff with jitter.
- `ANTHROPIC_TIMEOUT_MS`
  Default: `45000`
  Request timeout for a single Anthropic call.

Recommended starting point if Claude is still rejecting requests:

```bash
ANTHROPIC_MAX_CONCURRENCY=1 node makeClassSummaries.js --month=2026-03
```
