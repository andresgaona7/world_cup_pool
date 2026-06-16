# Score Visualization

Static scenario visualizer for the submitted World Cup pool picks.

It loads `../interface/data/pool_data.js` and
`../official_results/data/official_results.js`, normalizes the submitted
first-round and futures picks in the browser, and scores the official-result
scenario with the same point values used by `world_cup_pool/scoring.py`.

## Open

Open `score_visualization/index.html` in a browser. No package install or build
step is required.

## Scope

The current workbook export contains group-stage, best-third, and futures picks.
It does not contain knockout bracket predictions, so this visualization scores
only the sections available in `pool_data.js`.

Official results are generated from Football-Data group-stage standings by:

```bash
export FOOTBALL_DATA_API_KEY="your_api_key"
official_results/run_update_official_results.sh
```

If the generated results file has no completed scoring data, the page falls back
to the pool's current consensus picks.
