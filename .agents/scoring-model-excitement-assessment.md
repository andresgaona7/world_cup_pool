# Scoring Model Excitement Assessment

Date: 2026-06-17

## Scope

Reviewed the core scoring engine in `world_cup_pool/` and the `unittest` coverage in `tests/` to assess whether the model is strong enough to keep the pool competitive through the final match.

## Verdict

Yes, the model is good enough to keep excitement alive until the last match, with one important caveat: it keeps the overall pool structurally alive, but it cannot guarantee every player remains mathematically alive if one player builds a very large lead.

The point distribution is late-weighted in a useful way. A perfect group-stage result is worth `148` points, while knockout scoring plus futures can still contribute up to `1135` additional points. The final match can directly swing roughly `180` points before rare perfect-card bonuses:

- Final exact score plus correct advancing team: `50`.
- Champion: `80`.
- Runner-up: `50`.
- Potential perfect knockout/futures bonuses can make the final-day ceiling much larger, but those are unlikely and should be treated as exceptional upside rather than the normal drama mechanism.

## Why The Model Works

The group stage matters, but it should not decide the pool. `score_group_predictions()` gives modest points for correct qualifiers, exact advancing positions, full group order, and best-third picks. With 12 groups and 8 best-third qualifiers, the documented perfect first-round maximum is `148` points.

Knockout rounds are correctly more valuable as the tournament progresses. The base values rise from `4` in the round of 32 to `20` in the final, and score-mode predictions can multiply those base values. This means late games can still reshape the leaderboard.

Futures add a strong final-match lever. Champion, runner-up, top scorer, favorite-team last round, and Ecuador last round combine for substantial late-stage movement. Champion and runner-up alone can swing `130` points, and that aligns well with the goal of keeping the final meaningful.

Best-third scoring is healthy for engagement because order is ignored. Players are rewarded for selecting the advancing teams, not for a low-signal ordering detail. This reduces frustration while keeping the group-stage prediction meaningful.

## Risks

The model is high variance late. Futures are large enough that a player with poor match-by-match predictions can still jump late if their finalist or champion picks land. That helps excitement, but it can feel swingy.

Perfect bonuses are very large: `50` for all knockout winners, `200` for all knockout scores, and `75` for perfect futures. These bonuses are probably too rare to dominate normal play, but if they hit, they can overwhelm the leaderboard. Keep them only if the pool wants jackpot-style drama.

The final is meaningful, but not always decisive. If the leader is ahead by more than the realistic final-day swing between two specific players, the winner may be known before the last match. That is normal for any cumulative scoring pool unless final points are made artificially huge.

## Test Coverage Assessment

The tests cover the main scoring behaviors well:

- Group scoring includes qualifier credit, exact-position bonus, full-order bonus, partial swapped qualifiers, non-advancing third-place slots, and best-third order independence.
- Knockout scoring covers winner-only mode, exact score with correct winner, exact draw with wrong advancing team, correct winner with wrong score, wrong winner, required score fields, and perfect knockout bonuses.
- Futures scoring covers a perfect futures card, reversed final pairing, and off-by-one last-round partial credit.
- Leaderboard scoring confirms sorting and full breakdown totals.
- Data/update tests cover country normalization, official-results grouping, FIFA ranking tie-break loading, timeline checkpoints, official checkpoints, and manual futures merging.

Current verification result:

```text
python3 -m unittest discover -s tests
Ran 31 tests
FAILED (failures=1)
```

The failure is in `tests/test_official_results_update.py::test_groups_overall_table_using_known_world_cup_groups`. The implementation now sorts tied Group B teams using the manual FIFA ranking file, producing `Canada, Bosnia-Herzegovina`, while that test still expects `Bosnia-Herzegovina, Canada`. This looks like a stale expectation because the same test file also has `test_group_sort_uses_fifa_ranking_before_team_name`, which expects ranking-based ordering.

## Recommendation

Keep the scoring model. It has the right overall shape for sustained excitement:

- Early stage: meaningful but bounded.
- Middle and late knockout rounds: increasingly valuable.
- Final match: still capable of large leaderboard movement.
- Futures: strong enough to keep long-range predictions alive.

Before treating the repository as green, fix or confirm the stale Group B test expectation so the suite matches the current FIFA-ranking tie-break rule.
