# Prediction Exports

Generated structures and visualization built from `interface/data/pool_data.js`.

## Files

- `group_stage_predictions.json`: normalized group-stage predictions for every player, including each group's ordered top-three picks and best-third selections.
- `futures_predictions.json`: normalized futures picks for every player.
- `prediction_summary.json`: consensus counts for group winners, futures, and best-third selections.
- `prediction_visualization.html`: standalone visualization with embedded data, charts, futures table, and player group cards.
- `build_prediction_exports.py`: exporter used to regenerate these files.

## Regenerate

Run from the project root:

```bash
python3 prediction_exports/build_prediction_exports.py
```
