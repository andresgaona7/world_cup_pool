"""Scoring functions for the World Cup pool."""

from __future__ import annotations

from collections.abc import Iterable

from .constants import (
    CHAMPION_POINTS,
    ECUADOR_LAST_ROUND_EXACT_POINTS,
    ECUADOR_LAST_ROUND_OFF_BY_ONE_POINTS,
    FAVORITE_LAST_ROUND_EXACT_POINTS,
    FAVORITE_LAST_ROUND_OFF_BY_ONE_POINTS,
    KNOCKOUT_BASE_POINTS,
    PERFECT_FUTURES_BONUS,
    PERFECT_KNOCKOUT_SCORES_BONUS,
    PERFECT_KNOCKOUT_WINNERS_BONUS,
    REVERSED_FINAL_PAIRING_POINTS,
    RUNNER_UP_POINTS,
    STAGE_ORDER,
    TOP_SCORER_POINTS,
)
from .models import (
    FuturesPrediction,
    FuturesResult,
    GroupPrediction,
    GroupResult,
    KnockoutMatchResult,
    KnockoutPrediction,
    OfficialResults,
    PlayerEntry,
    PlayerScore,
    PredictionMode,
    ScoreBreakdown,
    Stage,
)


GROUP_QUALIFIER_POINTS = 1.0
GROUP_EXACT_ADVANCING_POSITION_BONUS = 1.0
GROUP_FULL_ORDER_BONUS = 5.0
BEST_THIRD_TEAM_POINTS = 3.0


def score_group_predictions(
    predictions: Iterable[GroupPrediction],
    results: Iterable[GroupResult],
    best_third_predictions: Iterable[str] = (),
    best_third_results: Iterable[str] = (),
) -> float:
    """Score group order and best-third predictions.

    Group scoring is intentionally simple for v1:
    - 1 point for each correctly predicted group-stage qualifier.
    - 1 bonus point when a correctly predicted qualifier also finishes in the
      exact predicted advancing position.
    - 5 bonus points for a fully correct group order.
    - 3 points for each correctly selected best-third team.
    - Best-third predictions are scored as qualifiers only; order is ignored.
    """

    result_by_group = {result.group_id: result for result in results}
    actual_best_thirds = set(best_third_results)
    predicted_best_thirds = set(best_third_predictions)
    total = 0.0

    for prediction in predictions:
        result = result_by_group.get(prediction.group_id)
        if result is None:
            continue

        predicted_qualifiers = _advancing_teams(
            prediction.ordered_teams,
            predicted_best_thirds,
        )
        actual_qualifiers = _advancing_teams(result.ordered_teams, actual_best_thirds)
        qualifier_matches = len(predicted_qualifiers & actual_qualifiers)
        total += qualifier_matches * GROUP_QUALIFIER_POINTS

        exact_advancing_positions = sum(
            1
            for predicted_team, actual_team in zip(
                prediction.ordered_teams, result.ordered_teams, strict=False
            )
            if (
                predicted_team
                and predicted_team == actual_team
                and predicted_team in predicted_qualifiers
                and actual_team in actual_qualifiers
            )
        )
        total += exact_advancing_positions * GROUP_EXACT_ADVANCING_POSITION_BONUS

        if prediction.ordered_teams == result.ordered_teams:
            total += GROUP_FULL_ORDER_BONUS

    total += len(predicted_best_thirds & actual_best_thirds) * BEST_THIRD_TEAM_POINTS
    return total


def _advancing_teams(ordered_teams: tuple[str, ...], best_thirds: set[str]) -> set[str]:
    direct_qualifiers = {team for team in ordered_teams[:2] if team}
    selected_best_thirds = {team for team in ordered_teams if team and team in best_thirds}
    return direct_qualifiers | selected_best_thirds


def score_knockout_prediction(
    prediction: KnockoutPrediction,
    result: KnockoutMatchResult,
) -> float:
    """Score one knockout prediction."""

    base_points = KNOCKOUT_BASE_POINTS[result.stage]
    correct_advancing_team = prediction.predicted_advancing_team == result.advancing_team

    if prediction.mode == PredictionMode.WINNER:
        return base_points if correct_advancing_team else 0.0

    if prediction.mode != PredictionMode.SCORE:
        raise ValueError(f"Unsupported prediction mode: {prediction.mode}")

    if prediction.predicted_home_score is None or prediction.predicted_away_score is None:
        raise ValueError("Score-mode predictions require both home and away scores.")

    exact_score = (
        prediction.predicted_home_score == result.home_score
        and prediction.predicted_away_score == result.away_score
    )

    if exact_score and correct_advancing_team:
        return base_points * 2.5
    if exact_score:
        return base_points * 1.5
    if correct_advancing_team:
        return base_points * 0.5
    return 0.0


def score_knockout_predictions(
    predictions: Iterable[KnockoutPrediction],
    results: Iterable[KnockoutMatchResult],
) -> tuple[float, float, dict[str, float]]:
    """Return knockout points, knockout bonuses, and per-match details."""

    result_by_match = {result.match_id: result for result in results}
    prediction_by_match = {prediction.match_id: prediction for prediction in predictions}
    total = 0.0
    details: dict[str, float] = {}

    perfect_winners_possible = bool(result_by_match)
    perfect_scores_possible = bool(result_by_match)

    for match_id, result in result_by_match.items():
        prediction = prediction_by_match.get(match_id)
        if prediction is None:
            perfect_winners_possible = False
            perfect_scores_possible = False
            continue

        points = score_knockout_prediction(prediction, result)
        details[f"knockout:{match_id}"] = points
        total += points

        if prediction.predicted_advancing_team != result.advancing_team:
            perfect_winners_possible = False

        exact_score = (
            prediction.mode == PredictionMode.SCORE
            and prediction.predicted_home_score == result.home_score
            and prediction.predicted_away_score == result.away_score
            and prediction.predicted_advancing_team == result.advancing_team
        )
        if not exact_score:
            perfect_scores_possible = False

    bonuses = 0.0
    if perfect_winners_possible:
        bonuses += PERFECT_KNOCKOUT_WINNERS_BONUS
        details["bonus:perfect_knockout_winners"] = PERFECT_KNOCKOUT_WINNERS_BONUS
    if perfect_scores_possible:
        bonuses += PERFECT_KNOCKOUT_SCORES_BONUS
        details["bonus:perfect_knockout_scores"] = PERFECT_KNOCKOUT_SCORES_BONUS

    return total, bonuses, details


def score_futures_prediction(
    prediction: FuturesPrediction | None,
    result: FuturesResult | None,
) -> tuple[float, float, dict[str, float]]:
    """Return futures points, futures bonuses, and details."""

    if prediction is None or result is None:
        return 0.0, 0.0, {}

    total = 0.0
    details: dict[str, float] = {}

    champion_correct = prediction.champion == result.champion
    runner_up_correct = prediction.runner_up == result.runner_up
    top_scorer_correct = prediction.top_scorer == result.top_scorer

    if champion_correct:
        total += CHAMPION_POINTS
        details["futures:champion"] = CHAMPION_POINTS

    if runner_up_correct:
        total += RUNNER_UP_POINTS
        details["futures:runner_up"] = RUNNER_UP_POINTS

    if (
        not champion_correct
        and not runner_up_correct
        and prediction.champion == result.runner_up
        and prediction.runner_up == result.champion
    ):
        total += REVERSED_FINAL_PAIRING_POINTS
        details["futures:reversed_final_pairing"] = REVERSED_FINAL_PAIRING_POINTS

    if top_scorer_correct:
        total += TOP_SCORER_POINTS
        details["futures:top_scorer"] = TOP_SCORER_POINTS

    favorite_actual_stage = result.team_last_rounds.get(prediction.favorite_team)
    favorite_correct = favorite_actual_stage == prediction.favorite_team_last_round
    if favorite_actual_stage is not None:
        points = _last_round_points(
            prediction.favorite_team_last_round,
            favorite_actual_stage,
            exact_points=FAVORITE_LAST_ROUND_EXACT_POINTS,
            off_by_one_points=FAVORITE_LAST_ROUND_OFF_BY_ONE_POINTS,
        )
        if points:
            total += points
            details["futures:favorite_team_last_round"] = points

    ecuador_actual_stage = result.team_last_rounds.get(result.ecuador_team_name)
    ecuador_correct = ecuador_actual_stage == prediction.ecuador_last_round
    if ecuador_actual_stage is not None:
        points = _last_round_points(
            prediction.ecuador_last_round,
            ecuador_actual_stage,
            exact_points=ECUADOR_LAST_ROUND_EXACT_POINTS,
            off_by_one_points=ECUADOR_LAST_ROUND_OFF_BY_ONE_POINTS,
        )
        if points:
            total += points
            details["futures:ecuador_last_round"] = points

    bonuses = 0.0
    if (
        champion_correct
        and runner_up_correct
        and top_scorer_correct
        and favorite_correct
        and ecuador_correct
    ):
        bonuses += PERFECT_FUTURES_BONUS
        details["bonus:perfect_futures"] = PERFECT_FUTURES_BONUS

    return total, bonuses, details


def score_player(entry: PlayerEntry, results: OfficialResults) -> PlayerScore:
    """Score one player entry against official results."""

    group_points = score_group_predictions(
        entry.group_predictions,
        results.group_results,
        entry.best_third_predictions,
        results.best_third_teams,
    )
    knockout_points, knockout_bonuses, knockout_details = score_knockout_predictions(
        entry.knockout_predictions,
        results.knockout_results,
    )
    futures_points, futures_bonuses, futures_details = score_futures_prediction(
        entry.futures_prediction,
        results.futures_result,
    )

    breakdown = ScoreBreakdown(
        group=group_points,
        knockout=knockout_points,
        futures=futures_points,
        bonuses=knockout_bonuses + futures_bonuses,
    )
    details = {
        "group": group_points,
        **knockout_details,
        **futures_details,
    }

    return PlayerScore(entry.player_name, breakdown, details)


def compute_leaderboard(
    entries: Iterable[PlayerEntry],
    results: OfficialResults,
) -> list[PlayerScore]:
    """Score and sort players descending by total points."""

    return sorted(
        (score_player(entry, results) for entry in entries),
        key=lambda player_score: (-player_score.total, player_score.player_name),
    )


def _last_round_points(
    predicted: Stage,
    actual: Stage,
    *,
    exact_points: float,
    off_by_one_points: float,
) -> float:
    predicted_order = STAGE_ORDER[predicted]
    actual_order = STAGE_ORDER[actual]

    if predicted_order == actual_order:
        return exact_points
    if abs(predicted_order - actual_order) == 1:
        return off_by_one_points
    return 0.0
