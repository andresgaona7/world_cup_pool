import unittest

from world_cup_pool import (
    FuturesPrediction,
    FuturesResult,
    GroupPrediction,
    GroupResult,
    KnockoutMatchResult,
    KnockoutPrediction,
    OfficialResults,
    PlayerEntry,
    PredictionMode,
    Stage,
    compute_leaderboard,
    score_group_predictions,
)


class LeaderboardTests(unittest.TestCase):
    def test_group_scoring_counts_qualifiers_exact_positions_full_order_and_best_thirds(self):
        predictions = (
            GroupPrediction(group_id="A", ordered_teams=("Ecuador", "Qatar", "Senegal", "Netherlands")),
        )
        results = (
            GroupResult(group_id="A", ordered_teams=("Ecuador", "Qatar", "Senegal", "Netherlands")),
        )

        points = score_group_predictions(
            predictions,
            results,
            best_third_predictions=("Senegal", "Japan", "USA"),
            best_third_results=("Senegal", "Morocco", "USA"),
        )

        self.assertEqual(points, 17.0)

    def test_group_scoring_gives_partial_credit_for_swapped_qualifiers(self):
        points = score_group_predictions(
            predictions=(
                GroupPrediction(group_id="A", ordered_teams=("Qatar", "Ecuador", "Senegal")),
            ),
            results=(
                GroupResult(group_id="A", ordered_teams=("Ecuador", "Qatar", "Senegal")),
            ),
            best_third_predictions=("Senegal",),
            best_third_results=("Senegal",),
        )

        self.assertEqual(points, 7.0)

    def test_group_scoring_does_not_score_non_advancing_third_place_slot(self):
        points = score_group_predictions(
            predictions=(
                GroupPrediction(group_id="A", ordered_teams=("Qatar", "Ecuador", "Senegal")),
            ),
            results=(
                GroupResult(group_id="A", ordered_teams=("Ecuador", "Qatar", "Senegal")),
            ),
        )

        self.assertEqual(points, 2.0)

    def test_best_third_scoring_ignores_order(self):
        points = score_group_predictions(
            predictions=(),
            results=(),
            best_third_predictions=("USA", "Senegal", "Japan", "Morocco"),
            best_third_results=("Morocco", "Japan", "Senegal", "USA"),
        )

        self.assertEqual(points, 12.0)

    def test_leaderboard_sorts_by_total_and_includes_breakdown(self):
        official_results = OfficialResults(
            group_results=(
                GroupResult(group_id="A", ordered_teams=("Ecuador", "Qatar", "Senegal", "Netherlands")),
            ),
            best_third_teams=("Senegal",),
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
        leader = PlayerEntry(
            player_name="Ana",
            group_predictions=(
                GroupPrediction(group_id="A", ordered_teams=("Ecuador", "Qatar", "Senegal", "Netherlands")),
            ),
            best_third_predictions=("Senegal",),
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
        chaser = PlayerEntry(
            player_name="Ben",
            knockout_predictions=(
                KnockoutPrediction(
                    match_id="F",
                    mode=PredictionMode.WINNER,
                    predicted_advancing_team="France",
                ),
            ),
            futures_prediction=FuturesPrediction(
                champion="France",
                runner_up="Brazil",
                top_scorer="Lionel Messi",
                favorite_team="Ecuador",
                favorite_team_last_round=Stage.GROUP_STAGE,
                ecuador_last_round=Stage.GROUP_STAGE,
            ),
        )

        leaderboard = compute_leaderboard((chaser, leader), official_results)

        self.assertEqual([score.player_name for score in leaderboard], ["Ana", "Ben"])
        self.assertEqual(leaderboard[0].breakdown.group, 14.0)
        self.assertEqual(leaderboard[0].breakdown.knockout, 50.0)
        self.assertEqual(leaderboard[0].breakdown.futures, 267.0)
        self.assertEqual(leaderboard[0].breakdown.bonuses, 75.0)
        self.assertEqual(leaderboard[0].total, 406.0)


if __name__ == "__main__":
    unittest.main()
