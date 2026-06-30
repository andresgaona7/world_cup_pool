import unittest

from world_cup_pool import (
    FuturesPrediction,
    FuturesResult,
    Stage,
    score_futures_prediction,
)


class FuturesScoringTests(unittest.TestCase):
    def test_exact_futures_card_scores_all_points_and_perfect_bonus(self):
        prediction = FuturesPrediction(
            champion="Brazil",
            runner_up="France",
            top_scorer="Kylian Mbappe",
            favorite_team="Ecuador",
            favorite_team_last_round=Stage.QUARTERFINAL,
            ecuador_last_round=Stage.QUARTERFINAL,
        )
        result = FuturesResult(
            champion="Brazil",
            runner_up="France",
            top_scorer="Kylian Mbappe",
            team_last_rounds={
                "Brazil": Stage.CHAMPION,
                "France": Stage.RUNNER_UP,
                "Ecuador": Stage.QUARTERFINAL,
            },
        )

        points, bonuses, details = score_futures_prediction(prediction, result)

        self.assertEqual(points, 267.0)
        self.assertEqual(bonuses, 75.0)
        self.assertEqual(details["futures:champion"], 80.0)
        self.assertEqual(details["bonus:perfect_futures"], 75.0)

    def test_reversed_final_pairing_scores_partial_bonus_only_for_finalists(self):
        prediction = FuturesPrediction(
            champion="France",
            runner_up="Brazil",
            top_scorer="Lionel Messi",
            favorite_team="Ecuador",
            favorite_team_last_round=Stage.ROUND_OF_16,
            ecuador_last_round=Stage.ROUND_OF_16,
        )
        result = FuturesResult(
            champion="Brazil",
            runner_up="France",
            top_scorer="Kylian Mbappe",
            team_last_rounds={"Ecuador": Stage.GROUP_STAGE},
        )

        points, bonuses, details = score_futures_prediction(prediction, result)

        self.assertEqual(points, 35.0)
        self.assertEqual(bonuses, 0.0)
        self.assertEqual(details["futures:reversed_final_pairing"], 35.0)

    def test_last_round_off_by_one_scores_partial_points(self):
        prediction = FuturesPrediction(
            champion="Brazil",
            runner_up="France",
            top_scorer="Kylian Mbappe",
            favorite_team="Japan",
            favorite_team_last_round=Stage.ROUND_OF_16,
            ecuador_last_round=Stage.ROUND_OF_32,
        )
        result = FuturesResult(
            champion="Argentina",
            runner_up="Spain",
            top_scorer="Erling Haaland",
            team_last_rounds={"Japan": Stage.QUARTERFINAL, "Ecuador": Stage.ROUND_OF_16},
        )

        points, bonuses, details = score_futures_prediction(prediction, result)

        self.assertEqual(points, 11.0)
        self.assertEqual(bonuses, 0.0)
        self.assertEqual(details["futures:favorite_team_last_round"], 5.0)
        self.assertEqual(details["futures:ecuador_last_round"], 6.0)

    def test_tied_top_scorers_all_score_as_correct(self):
        prediction = FuturesPrediction(
            champion="Argentina",
            runner_up="Spain",
            top_scorer="Lionel Messi",
            favorite_team="Ecuador",
            favorite_team_last_round=Stage.GROUP_STAGE,
            ecuador_last_round=Stage.GROUP_STAGE,
        )
        result = FuturesResult(
            champion="Brazil",
            runner_up="France",
            top_scorer="Kylian Mbappe",
            top_scorers=("Kylian Mbappe", "Lionel Messi"),
            team_last_rounds={},
        )

        points, bonuses, details = score_futures_prediction(prediction, result)

        self.assertEqual(points, 60.0)
        self.assertEqual(bonuses, 0.0)
        self.assertEqual(details["futures:top_scorer"], 60.0)

    def test_normalizes_top_scorer_and_favorite_team_names(self):
        prediction = FuturesPrediction(
            champion="Argentina",
            runner_up="Spain",
            top_scorer="Kylian Mbappe",
            favorite_team="DR Congo",
            favorite_team_last_round=Stage.ROUND_OF_16,
            ecuador_last_round=Stage.GROUP_STAGE,
        )
        result = FuturesResult(
            champion="Brazil",
            runner_up="France",
            top_scorer="Kylian Mbappé",
            team_last_rounds={"Congo DR": Stage.ROUND_OF_16},
        )

        points, bonuses, details = score_futures_prediction(prediction, result)

        self.assertEqual(points, 95.0)
        self.assertEqual(bonuses, 0.0)
        self.assertEqual(details["futures:top_scorer"], 60.0)
        self.assertEqual(details["futures:favorite_team_last_round"], 35.0)


if __name__ == "__main__":
    unittest.main()
