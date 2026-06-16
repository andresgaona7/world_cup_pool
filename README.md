# World Cup Pool Scoring Engine

Framework-free Python scoring engine for a World Cup pool.

It supports:

- Group order predictions.
- Best third-place team predictions. Order does not matter; points are awarded
  only for choosing teams that actually move into the next phase.
- Knockout predictions submitted stage by stage.
- Two knockout prediction modes:
  - Winner-only.
  - Regulation-time score plus advancing team.
- Pre-tournament futures:
  - Champion.
  - Runner-up.
  - Top scorer.
  - Favorite team last round.
  - Ecuador last round.
- Leaderboard scoring with breakdowns.

## Scoring Summary

### Knockout Matches

Base points by round:

| Stage | Base |
| --- | ---: |
| Round of 32 | 4 |
| Round of 16 | 6 |
| Quarterfinal | 10 |
| Semifinal | 16 |
| Third-place match | 14 |
| Final | 20 |

Winner-only mode:

- Correct advancing team: `1x base`
- Wrong advancing team: `0`

Score mode:

- Exact regulation score and correct advancing team: `2.5x base`
- Exact regulation score but wrong advancing team: `1.5x base`
- Correct advancing team but wrong score: `0.5x base`
- Wrong advancing team: `0`

### Futures

| Prediction | Points |
| --- | ---: |
| Champion | 80 |
| Runner-up | 50 |
| Reversed final pairing | 35 |
| Top scorer | 60 |
| Favorite team last round exact | 35 |
| Favorite team last round off by one | 15 |
| Ecuador last round exact | 40 |
| Ecuador last round off by one | 18 |
| Perfect futures card bonus | 75 |

### Bonuses

| Bonus | Points |
| --- | ---: |
| Perfect knockout winners | 50 |
| Perfect knockout scores | 200 |
| Perfect futures card | 75 |

## Example

```python
from world_cup_pool import (
    FuturesPrediction,
    FuturesResult,
    KnockoutMatchResult,
    KnockoutPrediction,
    OfficialResults,
    PlayerEntry,
    PredictionMode,
    Stage,
    compute_leaderboard,
)

results = OfficialResults(
    knockout_results=(
        KnockoutMatchResult(
            match_id="F",
            stage=Stage.FINAL,
            home_team="Brazil",
            away_team="France",
            home_score=2,
            away_score=0,
            advancing_team="Brazil",
        ),
    ),
    futures_result=FuturesResult(
        champion="Brazil",
        runner_up="France",
        top_scorer="Kylian Mbappe",
        team_last_rounds={
            "Brazil": Stage.CHAMPION,
            "France": Stage.RUNNER_UP,
            "Ecuador": Stage.ROUND_OF_16,
        },
    ),
)

entry = PlayerEntry(
    player_name="Ana",
    knockout_predictions=(
        KnockoutPrediction(
            match_id="F",
            mode=PredictionMode.SCORE,
            predicted_home_score=2,
            predicted_away_score=0,
            predicted_advancing_team="Brazil",
        ),
    ),
    futures_prediction=FuturesPrediction(
        champion="Brazil",
        runner_up="France",
        top_scorer="Kylian Mbappe",
        favorite_team="Ecuador",
        favorite_team_last_round=Stage.ROUND_OF_16,
        ecuador_last_round=Stage.ROUND_OF_16,
    ),
)

leaderboard = compute_leaderboard((entry,), results)
print(leaderboard[0].player_name, leaderboard[0].total)
```

## Run Tests

```bash
python3 -m pytest
```
