# Separate Official Checkpoint Script Plan

## Summary

Do not modify `scripts/update_official_results.py`. Add a new script that reads
the current `data/generated/official_results.js`, writes one named checkpoint
JSON file, then rebuilds `OFFICIAL_RESULTS.timelineCheckpoints` from committed
checkpoint files so `apps/score_timeline/index.html` keeps loading only one
browser data file.

## Key Changes

- Add `scripts/create_official_checkpoint.py`.
- Add committed checkpoint storage under `data/checkpoints/official_results/`.
- Require either a checkpoint key or `--rebuild-only`:

```bash
python3 scripts/create_official_checkpoint.py group_md1
python3 scripts/create_official_checkpoint.py --rebuild-only
```

- Support these checkpoint keys:
  - `group_md1`
  - `group_md2`
  - `group_md3`
  - `round_of_32`
  - `round_of_16`
  - `quarterfinal`
  - `semifinal`
  - `third_place_match`
  - `final`
  - `futures`

## Data Flow

- Keep the existing updater as the latest official snapshot tool:

```bash
python3 scripts/update_official_results.py --transport "${OFFICIAL_RESULTS_TRANSPORT:-auto}"
```

- Create a checkpoint explicitly after the latest snapshot is updated:

```bash
python3 scripts/create_official_checkpoint.py group_md1
```

- `create_official_checkpoint.py` should:
  - Parse `data/generated/official_results.js`.
  - Convert the current official snapshot into one checkpoint object.
  - Write `data/checkpoints/official_results/<checkpoint_key>.json`.
  - Read all existing checkpoint files in planned order.
  - Rewrite only the `timelineCheckpoints` field inside
    `data/generated/official_results.js`.
  - Preserve the latest official fields used by the score visualizer, including
    `provisionalGroupStandings`, `groupResults`, `bestThirds`, `futures`, and
    `overallStandings`.

## Makefile Commands

- Keep `make update-official-results` focused on fetching latest official data.
- Add:

```make
create-official-checkpoint:
	python3 scripts/create_official_checkpoint.py "$${CHECKPOINT:?Set CHECKPOINT=group_md1}"

rebuild-official-checkpoints:
	python3 scripts/create_official_checkpoint.py --rebuild-only
```

- Example workflow:

```bash
make update-official-results
make create-official-checkpoint CHECKPOINT=group_md1
```

## Checkpoint Shape

Each checkpoint JSON file should store one browser-ready object:

```json
{
  "key": "group_md1",
  "label": "After group matchday 1",
  "shortLabel": "Group MD1",
  "stage": "group_stage",
  "completedAt": "2026-06-17T00:00:00+00:00",
  "scenario": {
    "groupResults": {},
    "bestThirds": [],
    "futures": {
      "champion": "",
      "runnerUp": "",
      "topScorer": "",
      "teamLastRounds": {}
    }
  },
  "officialMatches": []
}
```

## Test Plan

- Add tests for `scripts/create_official_checkpoint.py` covering:
  - Writes the requested checkpoint filename.
  - Rejects unsupported checkpoint keys.
  - Rebuilds `timelineCheckpoints` in planned order.
  - Preserves non-timeline fields in `official_results.js`.
  - `--rebuild-only` does not require a checkpoint name.

- Run:

```bash
python3 -m unittest discover -s tests
```

## Assumptions

- `scripts/update_official_results.py` remains unchanged.
- Users explicitly decide when a checkpoint is worth preserving by passing the
  checkpoint name.
- The score timeline keeps loading `data/generated/official_results.js`;
  checkpoint JSON files are durable source files for rebuilding the timeline
  manifest.
