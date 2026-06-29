# Data Flow

The workbook is the source of truth for submitted pool entries:

```text
data/raw/group_stage_and_future_predictions.xlsx
  -> scripts/build_pool_data.py
  -> data/generated/pool_data.js
  -> apps/player_predictions/index.html
```

Knockout predictions follow the same raw-workbook to generated-browser-data
pattern. Each knockout round is submitted as a separate workbook. Those source
workbooks are not available yet, so the builder currently writes an empty
artifact that keeps the static apps loadable:

```text
data/raw/knockout_predictions/round_of_32.xlsx
data/raw/knockout_predictions/round_of_16.xlsx
data/raw/knockout_predictions/quarterfinals.xlsx
data/raw/knockout_predictions/semifinals.xlsx
data/raw/knockout_predictions/final.xlsx
  -> scripts/build_knockout_predictions.py
  -> data/generated/knockout_predictions.js
  -> index.html
  -> apps/score_timeline/index.html
```

Expected knockout workbook layout:

| Section heading | Matches |
| --- | ---: |
| Round of 32 | 16 |
| Round of 16 | 8 |
| Quarterfinals | 4 |
| Semifinals | 2 |
| Final | 1 |

Each stage workbook should contain one sheet per player, with one row per
match. A stage heading inside the sheet is optional because the stage is already
known from the workbook filename. Within each sheet, use a header row with
`Winner` or `Advancing team`, optional `Mode`, optional `Home Score`, and
optional `Away Score`. A `Match` column is optional; when it is omitted, match
IDs are assigned from the official bracket order for that workbook's stage.

Consensus predictions are generated from the browser-ready pool data:

```text
data/generated/pool_data.js
  -> scripts/build_consensus_predictions.py
  -> data/generated/consensus_predictions.json
  -> apps/consensus_predictions/index.html
```

The knockout prediction screen is a static bracket template based on the
published 2026 knockout-stage match order:

```text
apps/knockout_predictions/index.html
  -> apps/knockout_predictions/app.js

apps/knockout_bracket/index.html
  -> apps/knockout_bracket/app.js
```

Official group-stage results are fetched separately:

```text
Football-Data.org standings API
  -> scripts/update_official_results.py
  -> data/generated/official_results.js
  -> apps/score_visualizer/index.html
  -> apps/score_timeline/index.html
```

Official knockout match results use the Football-Data matches endpoint:

```text
Football-Data.org matches API
  -> scripts/update_official_knockout_results.py
  -> data/raw/official/football_data_wc_matches_2026.json
  -> data/manual/official_knockout_results.json
  -> data/generated/official_results.js
  -> apps/knockout_bracket/index.html
  -> apps/player_predictions/index.html
  -> apps/score_visualizer/index.html
```

The knockout updater preserves the raw API response for later inspection, then
normalizes match IDs, teams, stages, scores, duration, winners, penalty fields
when present, and referee metadata. The Football-Data match endpoint does not
provide cards or fastest/latest goal teams, so those Round of 32 bonus-question
answers remain manual unless another event source is added.

The static apps intentionally load committed generated files directly, so they
can be opened from disk without a package install, dev server, or build step.
