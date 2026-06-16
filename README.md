# World Cup Pool

Framework-free Python scoring engine plus static tools for a World Cup 2026
pool. The repo keeps core scoring logic, raw workbook input, generated browser
data, helper scripts, and static apps in separate folders.

## Workspace Map

```text
world_cup_pool/             Core scoring package and public Python API.
tests/                      Unit tests for scoring and result parsing.
data/raw/                   Source workbook and Google Sheets link.
data/generated/             Committed JS/JSON data consumed by static apps.
scripts/                    Data builders and official-results updater.
apps/player_predictions/    Static reader for submitted workbook picks.
apps/score_visualizer/      Static leaderboard and scenario scorer.
apps/prediction_exports/    Standalone generated prediction visualization.
docs/                       Scoring rules and data-flow notes.
```

## Common Commands

```bash
make build-pool-data
make build-prediction-exports
make update-official-results
make test
```

Equivalent direct commands:

```bash
python3 scripts/build_pool_data.py
python3 scripts/build_prediction_exports.py
python3 scripts/update_official_results.py --transport "${OFFICIAL_RESULTS_TRANSPORT:-auto}"
python3 -m unittest discover -s tests
```

`make update-official-results` reads `FOOTBALL_DATA_API_KEY` when set. The
updater also supports `--api-key`, `--input`, `--output`, `--allow-empty`, and
`--transport`.

## Data Flow

The workbook in `data/raw/Polla_Mundial_2026.xlsx` is the source of truth for
submitted picks. `scripts/build_pool_data.py` converts it into
`data/generated/pool_data.js`, which is loaded by
`apps/player_predictions/index.html`.

`scripts/build_prediction_exports.py` reshapes `pool_data.js` into normalized
JSON exports and the standalone `apps/prediction_exports/index.html`.

`scripts/update_official_results.py` fetches Football-Data standings and writes
`data/generated/official_results.js`, which is loaded by
`apps/score_visualizer/index.html`.

See `docs/data_flow.md` for the full flow and `docs/scoring_rules.md` for point
values.

## Static Apps

Open these files directly in a browser:

- `apps/player_predictions/index.html`
- `apps/score_visualizer/index.html`
- `apps/prediction_exports/index.html`

No package install, dev server, or build step is required as long as generated
files in `data/generated/` are present.

## Compatibility

Two old entrypoints are retained temporarily:

- `python3 interface/build_data.py`
- `official_results/run_update_official_results.sh`

New scripts should use `scripts/` directly.
