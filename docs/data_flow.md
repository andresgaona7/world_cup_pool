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
workbooks are merged into one browser artifact. The active visual workbook
paths are:

```text
data/raw/round_of_32.xlsx
data/raw/round_of_16.xlsx
data/raw/quaterfinals.xlsx
data/raw/semifinals.xlsx
data/raw/finals.xlsx
  -> scripts/build_knockout_predictions.py
  -> data/generated/knockout_predictions.js
  -> scripts/build_semifinal_consensus.py
  -> data/generated/semifinal_consensus.json
  -> apps/semifinal_consensus/index.html
  -> apps/player_predictions/index.html
  -> apps/score_visualizer/index.html
  -> apps/score_timeline/index.html
```

Expected knockout workbook layout:

| Section heading | Matches |
| --- | ---: |
| Round of 32 | 16 |
| Round of 16 | 8 |
| Quarterfinals | 4 |
| Semifinals | 2 |
| Third-place match | 1 |
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

The active knockout bracket screen is a static bracket template based on the
published 2026 knockout-stage match order:

```text
apps/knockout_bracket/index.html
  -> apps/knockout_bracket/app.js
```

Older standalone knockout prediction and standings pages are archived under
`archived_apps/` and are not copied into the GitHub Pages artifact by default.

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
  + data/manual/round_of_32_bonus_results.json
  -> data/generated/official_results.js
  -> apps/knockout_bracket/index.html
  -> apps/player_predictions/index.html
  -> apps/score_visualizer/index.html
```

The knockout updater preserves the raw API response for later inspection, then
normalizes match IDs, teams, stages, scores, duration, winners, penalty fields
when present, and referee metadata. The Football-Data match endpoint does not
provide cards or fastest/latest goal teams, so those Round of 32 bonus-question
answers remain in `data/manual/round_of_32_bonus_results.json` unless another
event source is added. The updater overlays that file into
`roundOf32BonusResults` after every refresh.

The static apps intentionally load committed generated files directly, so they
can be opened from disk without a package install, dev server, or build step.
