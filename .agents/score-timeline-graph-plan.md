# Independent Score Timeline Graph Plan

## Summary

Create a standalone score timeline visualization as its own static HTML app, separate from `apps/score_visualizer`. The new app should show how every player's score changes across official World Cup checkpoints using an inline SVG line chart with deterministic emoji markers for players.

## New App

- Add a new static app at `apps/score_timeline/index.html`.
- Add matching files:
  - `apps/score_timeline/app.js`
  - `apps/score_timeline/styles.css`
- Load shared generated data directly:
  - `../../data/generated/pool_data.js`
  - `../../data/generated/official_results.js`
  - `../../data/manual/knockout_predictions.js`
- Keep it openable from disk with no build step, matching the existing app pattern.

## Data Model

- Extend `scripts/update_official_results.py` so `data/generated/official_results.js` includes ordered `timelineCheckpoints`.
- Group-stage checkpoints:
  - After group matchday 1
  - After group matchday 2
  - After group matchday 3
- Knockout checkpoints:
  - Round of 32
  - Round of 16
  - Quarterfinal
  - Semifinal
  - Third-place match
  - Final
- Add separate knockout prediction data in `data/manual/knockout_predictions.js` because current `pool_data.js` does not include knockout picks.

## Visualization Behavior

- Render all players by default.
- Use an inline SVG line chart, not an external chart dependency.
- Assign each player a stable emoji marker from their name.
- Show player name, checkpoint, rank, total score, and score breakdown on hover/focus.
- Include a compact legend so emoji markers can later be replaced with player face images.
- Keep this page independent; it should not depend on the existing leaderboard or comparison panel DOM.

## Scoring

- Reuse the existing group-stage and futures scoring rules from `apps/score_visualizer/app.js`.
- Refactor scoring into reusable helper functions if needed, so both visualizers can share the same behavior without duplicating logic.
- Add knockout scoring based on `docs/scoring_rules.md`.
- Missing official checkpoint data should hide that checkpoint, not show misleading zeroes.
- Missing player knockout predictions score `0` for those matches.

## Testing

- Add updater fixture tests or smoke checks for:
  - Partial group stage
  - Completed group stage
  - Knockout checkpoint generation
- Add JavaScript smoke checks for:
  - Timeline checkpoint ordering
  - Stable emoji assignment
  - One score series per player
  - Correct score totals per checkpoint
- Run `git diff --check`.
- Open `apps/score_timeline/index.html` manually and verify the chart renders from disk.

## Assumptions

- The timeline graph is a separate app, not a new panel inside `apps/score_visualizer`.
- The first version uses emojis only; player face images are a later enhancement.
- Knockout predictions come from a separate checked-in data file, not the current workbook.
