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
apps/knockout_bracket/      Static Wikipedia-style knockout bracket board.
apps/score_visualizer/      Static leaderboard and scenario scorer.
apps/score_timeline/        Static score-over-time graph.
apps/consensus_predictions/ Standalone generated consensus visualization.
apps/rules/                 Static scoring-rules page.
apps/blog/                  Manual comment entries.
apps/legacy/                Launcher for archived/support views.
apps/round_of_32_consensus/ Generated Round of 32 consensus view.
apps/round_of_16_consensus/ Generated Round of 16 consensus view.
apps/third_places/          Legacy/support third-place standings view.
archived_apps/              Older standalone app surfaces not published by default.
public/                     Ignored GitHub Pages artifact from `make build-site`.
docs/                       Scoring rules and data-flow notes.
```

## Common Commands

```bash
make build-pool-data
make build-knockout-predictions
make build-consensus-predictions
make build-round-of-32-consensus
make build-round-of-16-consensus
make update-official-results
make update-official-knockout-results
make apply-manual-futures
CHECKPOINT=round_of_16 make create-official-checkpoint
make rebuild-official-checkpoints
make build-site
make test
```

Equivalent direct commands:

```bash
python3 scripts/build_pool_data.py
python3 scripts/build_knockout_predictions.py
python3 scripts/build_consensus_predictions.py
python3 scripts/build_round_of_32_consensus.py
python3 scripts/build_round_of_16_consensus.py
python3 scripts/update_official_results.py --transport "${OFFICIAL_RESULTS_TRANSPORT:-auto}"
python3 scripts/update_official_knockout_results.py
python3 scripts/apply_manual_futures.py
python3 scripts/create_official_checkpoint.py round_of_16
python3 scripts/create_official_checkpoint.py --rebuild-only
make build-site
python3 -m unittest discover -s tests
```

`make update-official-results` reads `FOOTBALL_DATA_API_KEY` when set. The
updater also supports `--api-key`, `--input`, `--output`, `--allow-empty`, and
`--transport`. By default, the updater preserves the completed scoring fields
already in `data/generated/official_results.js`, including group results, best
thirds, provisional standings, timeline checkpoints, overall standings, futures,
completed knockout matches, source metadata, and Round of 32 bonus answers.
Use `--refresh-group-stage-results` only when you intend to replace the
group-stage fields from Football-Data again; knockout match data remains
preserved by this command.

`make update-official-knockout-results` reads `FOOTBALL_DATA_API_KEY` when set.
It uses the Football-Data matches endpoint, not the standings endpoint, because
knockout scores live in match records. The command writes three artifacts:

- `data/raw/official/football_data_wc_matches_2026.json`: untouched API
  response for review and debugging.
- `data/manual/official_knockout_results.json`: normalized, readable knockout
  match data that can be inspected before committing.
- `data/generated/official_results.js`: browser data consumed by the static
  apps.

The generated file receives knockout-specific fields such as `officialMatches`,
`matches`, `roundOf32BonusResults`, and `knockoutSource`. Existing frozen
group-stage scoring fields are preserved. The match endpoint supplies teams,
score, stage, status, duration, winner, penalty details when present, and
referee metadata. Cards and fastest/latest goal teams are not present in that
endpoint and must be reviewed manually unless another event source is added.
Store reviewed Round of 32 bonus-question answers in
`data/manual/round_of_32_bonus_results.json`; the knockout updater overlays
that file after every Football-Data refresh so manual answers are not lost when
`data/manual/official_knockout_results.json` is regenerated.
If Football-Data reports a penalty shootout with a missing winner or tied
`score.penalties` value, the updater derives the shootout score from
`fullTime - regularTime - extraTime` and uses that derived penalty result to
set the advancing team.

For scoring and official-result comparisons, knockout `homeScore` and
`awayScore` are regular time plus extra time when those fields are available.
Penalty shootout goals stay in `homePenaltyScore` and `awayPenaltyScore`; they
are not added to `homeScore` or `awayScore`.

When Football-Data still cannot identify a knockout winner or shootout score,
store the reviewed correction in
`data/manual/official_knockout_overrides.json`. Overrides are keyed by pool
match ID and are applied during `make update-official-knockout-results`.

Use the knockout updater after official knockout match records change, then run
`make apply-manual-futures` if `data/manual/official_futures.json` has changed.
If the update should become part of the score timeline, create or rebuild the
matching checkpoint afterward, for example
`CHECKPOINT=round_of_16 make create-official-checkpoint`. Run
`make build-site` afterward when the ignored `public/` copy needs to match the
committed files under `data/generated/`.

For knockout-score updates, use this review loop:

```bash
make update-official-knockout-results
```

Review `data/raw/official/football_data_wc_matches_2026.json` for any finished
matches where Football-Data leaves `score.winner` empty or reports tied penalty
fields. If the raw payload does not contain enough information to infer the
winner or shootout score, add the reviewed correction to
`data/manual/official_knockout_overrides.json`, then rerun:

```bash
make update-official-knockout-results
CHECKPOINT=round_of_16 make create-official-checkpoint
make build-site
```

Then verify the affected match in `data/manual/official_knockout_results.json`,
`data/generated/official_results.js`, and
`data/checkpoints/official_results/round_of_16.json`.

## Data Flow

The workbook in `data/raw/group_stage_and_future_predictions.xlsx` is the source of truth for
submitted picks. `scripts/build_pool_data.py` converts it into
`data/generated/pool_data.js`, which is loaded by
`apps/player_predictions/index.html`.

The knockout workbooks are the source of truth for knockout picks once those
files exist. `scripts/build_knockout_predictions.py` currently accepts the
visual Round of 32 workbook at `data/raw/round_of_32.xlsx`, the visual Round of
16 workbook at `data/raw/round_of_16.xlsx`, and optional remaining-stage files
in `data/raw/knockout_predictions/`: `quarterfinals.xlsx`,
`semifinals.xlsx`, and `final.xlsx`. It merges the workbooks that exist into
`data/generated/knockout_predictions.js`, which is loaded by the player picks
and score pages. The current active prediction workflow has moved from Round
of 32 to Round of 16, so refresh `data/raw/round_of_16.xlsx` and run
`make build-knockout-predictions` before scoring new Round of 16 picks. Until
any workbook is available, the builder writes a valid empty prediction
artifact. The expected match counts are 16, 8, 4, 2, and 1, for 31 predicted
matches total. Standard player sheets need a `Winner` or `Advancing team`
column; `Mode`, `Home Score`, `Away Score`, and `Match` columns are optional.
For the visual Round of 32 and Round of 16 workbooks, red result cells are
treated as blank/NaN and the score/points column is ignored.

`scripts/build_consensus_predictions.py` reshapes `pool_data.js` into a
consensus JSON export and the standalone `apps/consensus_predictions/index.html`.
`scripts/build_round_of_32_consensus.py` generates
`data/generated/round_of_32_consensus.json` and the standalone
`apps/round_of_32_consensus/index.html` support view from the completed
Round of 32 workbook data.
`scripts/build_round_of_16_consensus.py` generates
`data/generated/round_of_16_consensus.json` and the standalone
`apps/round_of_16_consensus/index.html` support view from the current
Round of 16 workbook data.

`scripts/update_official_results.py` fetches Football-Data standings and writes
`data/generated/official_results.js`, which is loaded by
`apps/score_visualizer/index.html` and `apps/score_timeline/index.html`.
When standings need the final FIFA ranking tie-breaker, the updater reads
manual rankings from `data/manual/fifa_rankings.json`. Existing group-stage
score inputs are preserved on normal updater runs so settled group-stage
scores and the legacy third-place table do not change accidentally.

`scripts/update_official_knockout_results.py` fetches Football-Data match
records and updates official knockout match data in
`data/generated/official_results.js`. The same official match data is loaded by
`apps/knockout_bracket/index.html`, `apps/player_predictions/index.html`, and
`apps/score_visualizer/index.html`.

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
CHECKPOINT=round_of_16 make create-official-checkpoint
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
- `apps/knockout_bracket/index.html`
- `apps/score_visualizer/index.html`
- `apps/score_timeline/index.html`
- `apps/consensus_predictions/index.html`
- `apps/rules/index.html`
- `apps/blog/index.html`

Support and legacy views are linked from the Legacy page:

- `apps/legacy/index.html`
- `apps/round_of_32_consensus/index.html`
- `apps/round_of_16_consensus/index.html`
- `apps/third_places/index.html`

Older standalone knockout reference pages live in `archived_apps/` so they do
not appear as active app routes or get copied into `public/` by default.

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
make build-round-of-32-consensus
make build-round-of-16-consensus
make update-official-results
make update-official-knockout-results
# Review raw knockout data; if overrides changed, rerun the knockout updater.
make update-official-knockout-results
make apply-manual-futures
CHECKPOINT=round_of_16 make create-official-checkpoint
make test
make build-site
git add data/generated data/checkpoints data/manual index.html styles.css apps docs scripts .github/workflows/pages.yml Makefile .gitignore README.md
git commit -m "Update public pool dashboard"
git push origin dev
```

`make update-official-results` and `make update-official-knockout-results` need
internet access because they fetch Football-Data standings and match records.
The other static website files and tests can be worked on locally without an
internet connection.
