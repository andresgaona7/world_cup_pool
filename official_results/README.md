# Official Results

Football-Data based group-stage updater for `score_visualization/index.html`.

## Regenerate

Run from the project root:

```bash
export FOOTBALL_DATA_API_KEY="your_api_key"
official_results/run_update_official_results.sh
```

The runner calls `python3 official_results/update_official_results.py` and writes
`official_results/data/official_results.js`, which is loaded by
`score_visualization/index.html`.

## Notes

This intentionally does not call FIFA APIs. It fetches the Football-Data World
Cup 2026 standings endpoint:

```bash
curl -H "X-Auth-Token: YOUR_API_KEY" \
"https://api.football-data.org/v4/competitions/WC/standings?season=2026"
```

The updater reads the API key from `FOOTBALL_DATA_API_KEY`, or from `--api-key`.
It uses current group standings as provisional results and only writes
`groupResults` for a group once all four teams have played three group-stage
matches.

The HTTP transport defaults to `auto`, which tries `requests` when it is
installed, then `curl`, then Python's standard-library `urllib`. To force the
same style as the manual curl check:

```bash
official_results/run_update_official_results.sh --transport curl
```

The shell runner also accepts `OFFICIAL_RESULTS_TRANSPORT`:

```bash
OFFICIAL_RESULTS_TRANSPORT=curl official_results/run_update_official_results.sh
```

The updater uses Football-Data response headers for automatic throttling:

- `x-requests-available-minute`
- `x-requestcounter-reset`

It stores local rate-limit state in `official_results/.cache/`, which is ignored
by git. If the cached remaining request count is low, it waits for the reset
before calling the API again. If the API still returns HTTP 429, it waits for the
reset header and retries.

As of the current API response, the endpoint may return one overall
`GROUP_STAGE` table with `group: null` instead of separate Group A-L tables. In
that case, the updater keeps the rows in `overallStandings` and leaves
`groupResults` empty, because group scoring needs per-group order. If the API
returns no group standings and no overall rows, the updater fails by default. To
write metadata anyway:

```bash
official_results/run_update_official_results.sh --allow-empty
```

For debugging or a saved Football-Data JSON response:

```bash
official_results/run_update_official_results.sh --input path/to/standings.json
```
