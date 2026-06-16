# Score Visualization

Static scenario visualizer for the submitted World Cup pool picks.

It loads `../interface/data/pool_data.js`, normalizes the submitted first-round
and futures picks in the browser, and scores the editable official-result
scenario with the same point values used by `world_cup_pool/scoring.py`.

## Open

Open `score_visualization/index.html` in a browser. No package install or build
step is required.

## Scope

The current workbook export contains group-stage, best-third, and futures picks.
It does not contain knockout bracket predictions, so this visualization scores
only the sections available in `pool_data.js`.

Use **Use consensus scenario** to reset the editable official results to the
pool's current consensus picks. Use **Clear official results** to start from a
blank scenario.
