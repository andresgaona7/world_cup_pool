"""Point values and stage ordering for the World Cup pool."""

from __future__ import annotations

from .models import Stage


KNOCKOUT_BASE_POINTS: dict[Stage, float] = {
    Stage.ROUND_OF_32: 4.0,
    Stage.ROUND_OF_16: 6.0,
    Stage.QUARTERFINAL: 10.0,
    Stage.SEMIFINAL: 16.0,
    Stage.THIRD_PLACE_MATCH: 14.0,
    Stage.FINAL: 20.0,
}

KNOCKOUT_PERFECT_BONUS_STAGES: tuple[Stage, ...] = (
    Stage.ROUND_OF_32,
    Stage.ROUND_OF_16,
    Stage.QUARTERFINAL,
    Stage.SEMIFINAL,
)
KNOCKOUT_STAGE_MATCH_COUNTS: dict[Stage, int] = {
    Stage.ROUND_OF_32: 16,
    Stage.ROUND_OF_16: 8,
    Stage.QUARTERFINAL: 4,
    Stage.SEMIFINAL: 2,
}
KNOCKOUT_PERFECT_WINNER_BONUS_POINTS: dict[Stage, float] = {
    Stage.ROUND_OF_32: 10.0,
    Stage.ROUND_OF_16: 15.0,
    Stage.QUARTERFINAL: 25.0,
    Stage.SEMIFINAL: 40.0,
}
KNOCKOUT_PERFECT_SCORE_BONUS_POINTS: dict[Stage, float] = {
    Stage.ROUND_OF_32: 30.0,
    Stage.ROUND_OF_16: 45.0,
    Stage.QUARTERFINAL: 75.0,
    Stage.SEMIFINAL: 120.0,
}

CHAMPION_POINTS = 80.0
RUNNER_UP_POINTS = 50.0
REVERSED_FINAL_PAIRING_POINTS = 35.0
TOP_SCORER_POINTS = 60.0
FAVORITE_LAST_ROUND_EXACT_POINTS = 35.0
FAVORITE_LAST_ROUND_OFF_BY_ONE_POINTS = 5.0
ECUADOR_LAST_ROUND_EXACT_POINTS = 40.0
ECUADOR_LAST_ROUND_OFF_BY_ONE_POINTS = 18.0

PERFECT_FUTURES_BONUS = 75.0

STAGE_ORDER: dict[Stage, int] = {
    Stage.GROUP_STAGE: 0,
    Stage.ROUND_OF_32: 1,
    Stage.ROUND_OF_16: 2,
    Stage.QUARTERFINAL: 3,
    Stage.SEMIFINAL: 4,
    Stage.THIRD_PLACE_MATCH: 5,
    Stage.RUNNER_UP: 6,
    Stage.CHAMPION: 7,
}
