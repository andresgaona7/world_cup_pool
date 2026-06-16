import unittest

from world_cup_pool import (
    KnockoutMatchResult,
    KnockoutPrediction,
    PredictionMode,
    Stage,
    score_knockout_prediction,
    score_knockout_predictions,
)


class KnockoutScoringTests(unittest.TestCase):
    def test_winner_only_correct_scores_base_points(self):
        result = KnockoutMatchResult(
            match_id="R32-1",
            stage=Stage.ROUND_OF_32,
            home_team="Ecuador",
            away_team="Japan",
            home_score=1,
            away_score=0,
            advancing_team="Ecuador",
        )
        prediction = KnockoutPrediction(
            match_id="R32-1",
            mode=PredictionMode.WINNER,
            predicted_advancing_team="Ecuador",
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 4.0)

    def test_score_mode_exact_score_and_winner_scores_two_and_half_base(self):
        result = KnockoutMatchResult(
            match_id="QF-1",
            stage=Stage.QUARTERFINAL,
            home_team="Brazil",
            away_team="France",
            home_score=2,
            away_score=1,
            advancing_team="Brazil",
        )
        prediction = KnockoutPrediction(
            match_id="QF-1",
            mode=PredictionMode.SCORE,
            predicted_home_score=2,
            predicted_away_score=1,
            predicted_advancing_team="Brazil",
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 25.0)

    def test_score_mode_exact_draw_but_wrong_advancing_team_scores_one_and_half_base(self):
        result = KnockoutMatchResult(
            match_id="SF-1",
            stage=Stage.SEMIFINAL,
            home_team="Argentina",
            away_team="Spain",
            home_score=1,
            away_score=1,
            advancing_team="Spain",
        )
        prediction = KnockoutPrediction(
            match_id="SF-1",
            mode=PredictionMode.SCORE,
            predicted_home_score=1,
            predicted_away_score=1,
            predicted_advancing_team="Argentina",
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 24.0)

    def test_score_mode_correct_winner_wrong_score_scores_half_base(self):
        result = KnockoutMatchResult(
            match_id="F",
            stage=Stage.FINAL,
            home_team="Brazil",
            away_team="Germany",
            home_score=3,
            away_score=2,
            advancing_team="Germany",
        )
        prediction = KnockoutPrediction(
            match_id="F",
            mode=PredictionMode.SCORE,
            predicted_home_score=0,
            predicted_away_score=1,
            predicted_advancing_team="Germany",
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 10.0)

    def test_wrong_winner_scores_zero(self):
        result = KnockoutMatchResult(
            match_id="R16-1",
            stage=Stage.ROUND_OF_16,
            home_team="Mexico",
            away_team="USA",
            home_score=2,
            away_score=0,
            advancing_team="Mexico",
        )
        prediction = KnockoutPrediction(
            match_id="R16-1",
            mode=PredictionMode.WINNER,
            predicted_advancing_team="USA",
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 0.0)

    def test_score_mode_requires_scores(self):
        result = KnockoutMatchResult(
            match_id="R16-2",
            stage=Stage.ROUND_OF_16,
            home_team="England",
            away_team="Senegal",
            home_score=1,
            away_score=0,
            advancing_team="England",
        )
        prediction = KnockoutPrediction(
            match_id="R16-2",
            mode=PredictionMode.SCORE,
            predicted_advancing_team="England",
        )

        with self.assertRaisesRegex(ValueError, "require both home and away scores"):
            score_knockout_prediction(prediction, result)

    def test_perfect_knockout_winner_and_score_bonuses(self):
        results = (
            KnockoutMatchResult(
                match_id="F",
                stage=Stage.FINAL,
                home_team="Brazil",
                away_team="France",
                home_score=2,
                away_score=0,
                advancing_team="Brazil",
            ),
        )
        predictions = (
            KnockoutPrediction(
                match_id="F",
                mode=PredictionMode.SCORE,
                predicted_home_score=2,
                predicted_away_score=0,
                predicted_advancing_team="Brazil",
            ),
        )

        points, bonuses, details = score_knockout_predictions(predictions, results)

        self.assertEqual(points, 50.0)
        self.assertEqual(bonuses, 250.0)
        self.assertEqual(details["bonus:perfect_knockout_winners"], 50.0)
        self.assertEqual(details["bonus:perfect_knockout_scores"], 200.0)


if __name__ == "__main__":
    unittest.main()
