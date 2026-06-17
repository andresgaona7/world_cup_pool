# Static GitHub Pages Website for World Cup Pool Visualizations

## Summary

Build a framework-free static website hosted on GitHub Pages. The site should make `apps/score_visualizer/` the primary experience, with a small homepage/dashboard that links to the existing player predictions and consensus prediction views.

Recommended hosting: GitHub Pages, because this repo already uses static HTML/CSS/JS and committed generated data files. No React/Vite app is needed for this version.

## Key Changes

- Add a root-level `index.html` and `styles.css` as the public website entrypoint.
- Present the first screen as a usable pool dashboard, not a marketing page:
  - prominent link/card for Score Visualizer
  - secondary links for Player Predictions and Consensus Predictions
  - brief status area showing data freshness from generated files where available
- Keep existing static apps in place:
  - `apps/score_visualizer/index.html`
  - `apps/player_predictions/index.html`
  - `apps/consensus_predictions/index.html`
- Add GitHub Pages support:
  - create `.github/workflows/pages.yml`
  - deploy the repository contents as a static site
  - add `.nojekyll` so paths under `apps/` and `data/` are served directly
- Update `README.md` with:
  - public site URL pattern: `https://<github-user>.github.io/world_cup_pool/`
  - local preview instructions
  - deployment/update flow after regenerating data

## Website Recommendation

Use a static project site on GitHub Pages.

This is the best fit because the visualizations already run without a dev server, package install, or build step. It keeps maintenance low and lets the pool members open one clean URL while preserving the existing data flow.

Avoid a framework app for now unless the project later needs accounts, server-side data fetching, private access, or complex shared state across all views.

## Test Plan

- Open root `index.html` locally and verify all navigation links work.
- Open `apps/score_visualizer/index.html` from the new homepage and confirm:
  - official/consensus scenario selector still works
  - leaderboard updates
  - comparison panel follows the selected scenario
- Run existing tests:
  - `make test`
- After adding GitHub Pages workflow, verify the deployed URL loads:
  - homepage
  - score visualizer
  - generated data files under `data/generated/`

## Assumptions

- Primary audience is pool members.
- GitHub Pages is the target host.
- The first version should stay static and framework-free.
- Existing generated files remain committed and are deployed with the site.
- Official-results updates will continue through the existing updater script before deployment.
