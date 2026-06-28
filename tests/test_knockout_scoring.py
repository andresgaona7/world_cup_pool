import unittest

from world_cup_pool import (
    KnockoutMatchResult,
    KnockoutPrediction,
    PredictionMode,
    Stage,
    score_knockout_prediction,
    score_knockout_predictions,
)
from world_cup_pool.constants import (
    KNOCKOUT_PERFECT_SCORE_BONUS_POINTS,
    KNOCKOUT_PERFECT_WINNER_BONUS_POINTS,
)


class KnockoutScoringTests(unittest.TestCase):
    def test_perfect_knockout_bonus_values_by_stage(self):
        self.assertEqual(
            KNOCKOUT_PERFECT_WINNER_BONUS_POINTS,
            {
                Stage.ROUND_OF_32: 25.0,
                Stage.ROUND_OF_16: 25.0,
                Stage.QUARTERFINAL: 25.0,
                Stage.SEMIFINAL: 25.0,
            },
        )
        self.assertEqual(
            KNOCKOUT_PERFECT_SCORE_BONUS_POINTS,
            {
                Stage.ROUND_OF_32: 40.0,
                Stage.ROUND_OF_16: 25.0,
                Stage.QUARTERFINAL: 15.0,
                Stage.SEMIFINAL: 10.0,
            },
        )

    def test_non_score_mode_is_unsupported(self):
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
            mode="winner",
            predicted_advancing_team="Ecuador",
        )

        with self.assertRaisesRegex(ValueError, "Unsupported prediction mode"):
            score_knockout_prediction(prediction, result)

    def test_score_mode_exact_score_and_winner_scores_two_times_base(self):
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

        self.assertEqual(score_knockout_prediction(prediction, result), 20.0)

    def test_score_mode_penalty_draw_fallback_scores_half_base(self):
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
            predicted_home_score=0,
            predicted_away_score=0,
            predicted_advancing_team="Argentina",
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 8.0)

    def test_score_mode_exact_penalty_shootout_score_adds_base_bonus(self):
        result = KnockoutMatchResult(
            match_id="F",
            stage=Stage.FINAL,
            home_team="Argentina",
            away_team="Spain",
            home_score=1,
            away_score=1,
            advancing_team="Argentina",
            home_penalty_score=5,
            away_penalty_score=4,
        )
        prediction = KnockoutPrediction(
            match_id="F",
            mode=PredictionMode.SCORE,
            predicted_home_score=1,
            predicted_away_score=1,
            predicted_advancing_team="Argentina",
            predicted_home_penalty_score=5,
            predicted_away_penalty_score=4,
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 60.0)

    def test_score_mode_exact_penalty_shootout_score_requires_exact_draw_and_winner(self):
        result = KnockoutMatchResult(
            match_id="F",
            stage=Stage.FINAL,
            home_team="Argentina",
            away_team="Spain",
            home_score=1,
            away_score=1,
            advancing_team="Argentina",
            home_penalty_score=5,
            away_penalty_score=4,
        )
        wrong_regulation_score = KnockoutPrediction(
            match_id="F",
            mode=PredictionMode.SCORE,
            predicted_home_score=0,
            predicted_away_score=0,
            predicted_advancing_team="Argentina",
            predicted_home_penalty_score=5,
            predicted_away_penalty_score=4,
        )
        wrong_winner = KnockoutPrediction(
            match_id="F",
            mode=PredictionMode.SCORE,
            predicted_home_score=1,
            predicted_away_score=1,
            predicted_advancing_team="Spain",
            predicted_home_penalty_score=5,
            predicted_away_penalty_score=4,
        )

        self.assertEqual(score_knockout_prediction(wrong_regulation_score, result), 20.0)
        self.assertEqual(score_knockout_prediction(wrong_winner, result), 10.0)

    def test_score_mode_exact_score_wrong_advancing_team_penalty_draw_scores_half_base(self):
        result = KnockoutMatchResult(
            match_id="SF-2",
            stage=Stage.SEMIFINAL,
            home_team="Argentina",
            away_team="Spain",
            home_score=1,
            away_score=1,
            advancing_team="Spain",
        )
        prediction = KnockoutPrediction(
            match_id="SF-2",
            mode=PredictionMode.SCORE,
            predicted_home_score=1,
            predicted_away_score=1,
            predicted_advancing_team="Argentina",
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 8.0)

    def test_score_mode_exact_score_wrong_advancing_team_non_draw_scores_zero(self):
        result = KnockoutMatchResult(
            match_id="SF-3",
            stage=Stage.SEMIFINAL,
            home_team="Argentina",
            away_team="Spain",
            home_score=2,
            away_score=1,
            advancing_team="Argentina",
        )
        prediction = KnockoutPrediction(
            match_id="SF-3",
            mode=PredictionMode.SCORE,
            predicted_home_score=2,
            predicted_away_score=1,
            predicted_advancing_team="Spain",
        )

        self.assertEqual(score_knockout_prediction(prediction, result), 0.0)

    def test_score_mode_correct_winner_wrong_score_scores_base(self):
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

        self.assertEqual(score_knockout_prediction(prediction, result), 20.0)

    def test_score_mode_wrong_winner_non_draw_scores_zero(self):
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
            mode=PredictionMode.SCORE,
            predicted_home_score=1,
            predicted_away_score=0,
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

    def test_perfect_knockout_winner_and_score_bonuses_apply_per_eligible_stage(self):
        results = (
            KnockoutMatchResult(
                match_id="QF-1",
                stage=Stage.QUARTERFINAL,
                home_team="Brazil",
                away_team="France",
                home_score=2,
                away_score=0,
                advancing_team="Brazil",
            ),
            KnockoutMatchResult(
                match_id="QF-2",
                stage=Stage.QUARTERFINAL,
                home_team="Argentina",
                away_team="Spain",
                home_score=1,
                away_score=0,
                advancing_team="Argentina",
            ),
            KnockoutMatchResult(
                match_id="QF-3",
                stage=Stage.QUARTERFINAL,
                home_team="Germany",
                away_team="England",
                home_score=0,
                away_score=0,
                advancing_team="England",
            ),
            KnockoutMatchResult(
                match_id="QF-4",
                stage=Stage.QUARTERFINAL,
                home_team="Japan",
                away_team="Mexico",
                home_score=3,
                away_score=2,
                advancing_team="Japan",
            ),
        )
        predictions = (
            KnockoutPrediction(
                match_id="QF-1",
                mode=PredictionMode.SCORE,
                predicted_home_score=2,
                predicted_away_score=0,
                predicted_advancing_team="Brazil",
            ),
            KnockoutPrediction(
                match_id="QF-2",
                mode=PredictionMode.SCORE,
                predicted_home_score=1,
                predicted_away_score=0,
                predicted_advancing_team="Argentina",
            ),
            KnockoutPrediction(
                match_id="QF-3",
                mode=PredictionMode.SCORE,
                predicted_home_score=0,
                predicted_away_score=0,
                predicted_advancing_team="England",
            ),
            KnockoutPrediction(
                match_id="QF-4",
                mode=PredictionMode.SCORE,
                predicted_home_score=3,
                predicted_away_score=2,
                predicted_advancing_team="Japan",
            ),
        )

        points, bonuses, details = score_knockout_predictions(predictions, results)

        self.assertEqual(points, 80.0)
        self.assertEqual(bonuses, 40.0)
        self.assertEqual(details["bonus:perfect_knockout_winners:quarterfinal"], 25.0)
        self.assertEqual(details["bonus:perfect_knockout_scores:quarterfinal"], 15.0)

    def test_perfect_knockout_stage_bonus_waits_for_complete_stage(self):
        results = (
            KnockoutMatchResult(
                match_id="QF-1",
                stage=Stage.QUARTERFINAL,
                home_team="Brazil",
                away_team="France",
                home_score=2,
                away_score=0,
                advancing_team="Brazil",
            ),
        )
        predictions = (
            KnockoutPrediction(
                match_id="QF-1",
                mode=PredictionMode.SCORE,
                predicted_home_score=2,
                predicted_away_score=0,
                predicted_advancing_team="Brazil",
            ),
        )

        points, bonuses, details = score_knockout_predictions(predictions, results)

        self.assertEqual(points, 20.0)
        self.assertEqual(bonuses, 0.0)
        self.assertNotIn("bonus:perfect_knockout_winners:quarterfinal", details)
        self.assertNotIn("bonus:perfect_knockout_scores:quarterfinal", details)

    def test_perfect_knockout_bonuses_exclude_final_and_third_place_match(self):
        results = (
            KnockoutMatchResult(
                match_id="3P",
                stage=Stage.THIRD_PLACE_MATCH,
                home_team="Brazil",
                away_team="France",
                home_score=2,
                away_score=0,
                advancing_team="Brazil",
            ),
            KnockoutMatchResult(
                match_id="F",
                stage=Stage.FINAL,
                home_team="Argentina",
                away_team="Spain",
                home_score=1,
                away_score=0,
                advancing_team="Argentina",
            ),
        )
        predictions = (
            KnockoutPrediction(
                match_id="3P",
                mode=PredictionMode.SCORE,
                predicted_home_score=2,
                predicted_away_score=0,
                predicted_advancing_team="Brazil",
            ),
            KnockoutPrediction(
                match_id="F",
                mode=PredictionMode.SCORE,
                predicted_home_score=1,
                predicted_away_score=0,
                predicted_advancing_team="Argentina",
            ),
        )

        points, bonuses, details = score_knockout_predictions(predictions, results)

        self.assertEqual(points, 68.0)
        self.assertEqual(bonuses, 0.0)
        self.assertNotIn("bonus:perfect_knockout_winners:third_place_match", details)
        self.assertNotIn("bonus:perfect_knockout_scores:third_place_match", details)
        self.assertNotIn("bonus:perfect_knockout_winners:final", details)
        self.assertNotIn("bonus:perfect_knockout_scores:final", details)


if __name__ == "__main__":
    unittest.main()
