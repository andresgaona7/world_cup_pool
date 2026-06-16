# Data Flow

The workbook is the source of truth for submitted pool entries:

```text
data/raw/group_stage_and_future_predictions.xlsx
  -> scripts/build_pool_data.py
  -> data/generated/pool_data.js
  -> apps/player_predictions/index.html
```

Consensus predictions are generated from the browser-ready pool data:

```text
data/generated/pool_data.js
  -> scripts/build_consensus_predictions.py
  -> data/generated/consensus_predictions.json
  -> apps/consensus_predictions/index.html
```

Official group-stage results are fetched separately:

```text
Football-Data.org standings API
  -> scripts/update_official_results.py
  -> data/generated/official_results.js
  -> apps/score_visualizer/index.html
```

The static apps intentionally load committed generated files directly, so they
can be opened from disk without a package install, dev server, or build step.
