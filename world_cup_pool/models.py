"""Core models for a framework-free World Cup pool scoring engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Stage(str, Enum):
    GROUP_STAGE = "group_stage"
    ROUND_OF_32 = "round_of_32"
    ROUND_OF_16 = "round_of_16"
    QUARTERFINAL = "quarterfinal"
    SEMIFINAL = "semifinal"
    THIRD_PLACE_MATCH = "third_place_match"
    RUNNER_UP = "runner_up"
    CHAMPION = "champion"
    FINAL = "final"


class PredictionMode(str, Enum):
    SCORE = "score"


@dataclass(frozen=True)
class GroupPrediction:
    """A player's group-stage prediction for one group."""

    group_id: str
    ordered_teams: tuple[str, ...]


@dataclass(frozen=True)
class GroupResult:
    """The official result for one group."""

    group_id: str
    ordered_teams: tuple[str, ...]


@dataclass(frozen=True)
class KnockoutMatchResult:
    """Official knockout result using regulation-time score plus advancing team."""

    match_id: str
    stage: Stage
    home_team: str
    away_team: str
    home_score: int
    away_score: int
    advancing_team: str
    home_penalty_score: int | None = None
    away_penalty_score: int | None = None


@dataclass(frozen=True)
class KnockoutPrediction:
    """A player's prediction for a knockout match."""

    match_id: str
    mode: PredictionMode
    predicted_advancing_team: str
    predicted_home_score: int | None = None
    predicted_away_score: int | None = None
    predicted_home_penalty_score: int | None = None
    predicted_away_penalty_score: int | None = None


@dataclass(frozen=True)
class FuturesPrediction:
    """Pre-tournament long-range picks."""

    champion: str
    runner_up: str
    top_scorer: str
    favorite_team: str
    favorite_team_last_round: Stage
    ecuador_last_round: Stage


@dataclass(frozen=True)
class FuturesResult:
    """Official outcomes for long-range futures scoring."""

    champion: str
    runner_up: str
    top_scorer: str
    team_last_rounds: dict[str, Stage]
    ecuador_team_name: str = "Ecuador"


@dataclass(frozen=True)
class PlayerEntry:
    """All predictions submitted by one player."""

    player_name: str
    group_predictions: tuple[GroupPrediction, ...] = ()
    best_third_predictions: tuple[str, ...] = ()
    knockout_predictions: tuple[KnockoutPrediction, ...] = ()
    futures_prediction: FuturesPrediction | None = None


@dataclass(frozen=True)
class OfficialResults:
    """Official tournament data used to score player entries."""

    group_results: tuple[GroupResult, ...] = ()
    best_third_teams: tuple[str, ...] = ()
    knockout_results: tuple[KnockoutMatchResult, ...] = ()
    futures_result: FuturesResult | None = None


@dataclass(frozen=True)
class ScoreBreakdown:
    group: float = 0.0
    knockout: float = 0.0
    futures: float = 0.0
    bonuses: float = 0.0

    @property
    def total(self) -> float:
        return self.group + self.knockout + self.futures + self.bonuses


@dataclass(frozen=True)
class PlayerScore:
    player_name: str
    breakdown: ScoreBreakdown
    details: dict[str, float] = field(default_factory=dict)

    @property
    def total(self) -> float:
        return self.breakdown.total
