# World Cup Pool

Framework-free Python scoring engine plus static tools for a World Cup 2026
pool. The repo keeps core scoring logic, raw workbook input, generated browser
data, helper scripts, and static apps in separate folders.

## Workspace Map

```text
world_cup_pool/             Core scoring package and public Python API.
tests/                      Unit tests for scoring and result parsing.
data/raw/                   Source workbook and Google Sheets link.
data/manual/                Manual reference data used by generated results.
data/generated/             Committed JS/JSON data consumed by static apps.
scripts/                    Data builders and official-results updater.
index.html                  Public dashboard for GitHub Pages.
apps/player_predictions/    Static reader for submitted workbook picks.
apps/knockout_predictions/  Static knockout bracket prediction template.
apps/score_visualizer/      Static leaderboard and scenario scorer.
apps/score_timeline/        Static score-over-time graph.
apps/consensus_predictions/ Standalone generated consensus visualization.
apps/blog/                  Manual comment entries.
public/                     Ignored GitHub Pages artifact from `make build-site`.
docs/                       Scoring rules and data-flow notes.
```

## Common Commands

```bash
make build-pool-data
make build-knockout-predictions
make build-consensus-predictions
make update-official-results
make apply-manual-futures
CHECKPOINT=group_md1 make create-official-checkpoint
make rebuild-official-checkpoints
make build-site
make test
```

Equivalent direct commands:

```bash
python3 scripts/build_pool_data.py
python3 scripts/build_knockout_predictions.py
python3 scripts/build_consensus_predictions.py
python3 scripts/update_official_results.py --transport "${OFFICIAL_RESULTS_TRANSPORT:-auto}"
python3 scripts/apply_manual_futures.py
python3 scripts/create_official_checkpoint.py group_md1
python3 scripts/create_official_checkpoint.py --rebuild-only
make build-site
python3 -m unittest discover -s tests
```

`make update-official-results` reads `FOOTBALL_DATA_API_KEY` when set. The
updater also supports `--api-key`, `--input`, `--output`, `--allow-empty`, and
`--transport`.

## Data Flow

The workbook in `data/raw/group_stage_and_future_predictions.xlsx` is the source of truth for
submitted picks. `scripts/build_pool_data.py` converts it into
`data/generated/pool_data.js`, which is loaded by
`apps/player_predictions/index.html`.

The knockout workbooks in `data/raw/knockout_predictions/` are the source of
truth for knockout picks once those files exist. There is one workbook per
stage: `round_of_32.xlsx`, `round_of_16.xlsx`, `quarterfinals.xlsx`,
`semifinals.xlsx`, and `final.xlsx`. `scripts/build_knockout_predictions.py`
merges them into `data/generated/knockout_predictions.js`, which is loaded by
the dashboard and score timeline. Until the workbooks are available, the
builder writes a valid empty prediction artifact. The expected match counts are
16, 8, 4, 2, and 1, for 31 predicted matches total. Each player sheet needs a
`Winner` or `Advancing team` column; `Mode`, `Home Score`, `Away Score`, and
`Match` columns are optional.

`scripts/build_consensus_predictions.py` reshapes `pool_data.js` into a
consensus JSON export and the standalone `apps/consensus_predictions/index.html`.

`scripts/update_official_results.py` fetches Football-Data standings and writes
`data/generated/official_results.js`, which is loaded by
`apps/score_visualizer/index.html` and `apps/score_timeline/index.html`.
When standings need the final FIFA ranking tie-breaker, the updater reads
manual rankings from `data/manual/fifa_rankings.json`.

Official fair-play tiebreakers and unresolved group-order corrections are
entered manually in `data/manual/official_fair_play.json` because the
Football-Data standings endpoint does not include card data or enough
head-to-head detail to fully resolve every Article 13 tie. `make
update-official-results` merges those values into
`data/generated/official_results.js`. Use team names as keys under `teams`, and
either enter `fairPlayPoints` directly or card counts such as `yellowCards`,
`indirectRedCards`, `directRedCards`, and `yellowDirectRedCards`. If FIFA's
head-to-head/lots procedure changes a tied group order, add the official order
under `groupOrder`, for example:

```json
{
  "teams": {
    "Example Team": {"fairPlayPoints": -3}
  },
  "groupOrder": {
    "A": ["Mexico", "Czechia", "South Korea", "South Africa"]
  }
}
```

Official futures are entered manually in `data/manual/official_futures.json`.
After editing champion, runner-up, top scorer, or team last-round values, run
`python3 scripts/apply_manual_futures.py` to merge those values into
`data/generated/official_results.js`. Valid `teamLastRounds` values are
`group_stage`, `round_of_32`, `round_of_16`, `quarterfinal`, `semifinal`,
`third_place_match`, `runner_up`, and `champion`.

Official score-timeline checkpoints are stored in
`data/checkpoints/official_results/`. After `data/generated/official_results.js`
reflects the current official results, create a checkpoint with:

```bash
CHECKPOINT=group_md1 make create-official-checkpoint
```

Supported checkpoint keys are `group_md1`, `group_md2`, `group_md3`,
`round_of_32`, `round_of_16`, `quarterfinal`, `semifinal`,
`third_place_match`, `final`, and `futures`. To rebuild
`OFFICIAL_RESULTS.timelineCheckpoints` from the committed checkpoint JSON files
without creating a new checkpoint, run:

```bash
make rebuild-official-checkpoints
```

See `docs/data_flow.md` for the full flow and `docs/scoring_rules.md` for point
values.

## Static Apps

Open `index.html` directly in a browser for the pool dashboard. The dashboard
links to the static apps below, and each app can also be opened directly:

- `apps/player_predictions/index.html`
- `apps/knockout_predictions/index.html`
- `apps/score_visualizer/index.html`
- `apps/score_timeline/index.html`
- `apps/consensus_predictions/index.html`
- `apps/blog/index.html`

No package install, dev server, or build step is required as long as generated
files in `data/generated/` are present.

## GitHub Pages

The public project-site URL follows this pattern:

```text
https://<github-user>.github.io/world_cup_pool/
```

The repo deploys as a static site through `.github/workflows/pages.yml`. GitHub
Pages should be configured to use GitHub Actions as the source. Only the `dev`
branch can publish: pushes to `dev` deploy automatically, and manual workflow
runs are ignored unless they run from `dev`. The workflow runs `make build-site`
and uploads the generated `public/` directory, so source-only files such as
`scripts/`, `tests/`, `world_cup_pool/`, `data/raw/`, and `.agents/` are not
part of the public Pages artifact. `.nojekyll` is copied into `public/` so
GitHub Pages serves static paths as-is.

Local preview:

```bash
make build-site
python3 -m http.server 8000 --directory public
```

Then open `http://localhost:8000/`.

Typical update flow:

```bash
make build-pool-data
make build-knockout-predictions
make build-consensus-predictions
make update-official-results
make apply-manual-futures
CHECKPOINT=group_md1 make create-official-checkpoint
make test
make build-site
git add data/generated data/manual/official_futures.json index.html styles.css apps docs scripts .github/workflows/pages.yml Makefile .gitignore README.md
git commit -m "Update public pool dashboard"
git push origin dev
```

`make update-official-results` needs internet access because it fetches
Football-Data standings. The other static website files and tests can be worked
on locally without an internet connection.
