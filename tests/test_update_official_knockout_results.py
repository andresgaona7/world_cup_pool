import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "update_official_knockout_results.py"
)
SPEC = importlib.util.spec_from_file_location("update_official_knockout_results", MODULE_PATH)
update_official_knockout_results = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(update_official_knockout_results)


class UpdateOfficialKnockoutResultsTests(unittest.TestCase):
    def test_normalizes_football_data_knockout_matches_to_pool_match_ids(self):
        raw_data = {
            "matches": [
                self.match(
                    source_id=537423,
                    stage="LAST_32",
                    home="Brazil",
                    away="Japan",
                    winner="HOME_TEAM",
                    full_time=(3, 1),
                    utc_date="2026-06-29T17:00:00Z",
                ),
                self.match(
                    source_id=537418,
                    stage="LAST_32",
                    home="Germany",
                    away="Paraguay",
                    winner="HOME_TEAM",
                    full_time=(2, 0),
                    utc_date="2026-06-29T19:00:00Z",
                ),
                self.match(
                    source_id=537417,
                    stage="LAST_32",
                    home="South Africa",
                    away="Canada",
                    winner="AWAY_TEAM",
                    full_time=(0, 1),
                    utc_date="2026-06-28T19:00:00Z",
                ),
                self.match(
                    source_id=537433,
                    stage="LAST_16",
                    home="Canada",
                    away="Germany",
                    winner="HOME_TEAM",
                    full_time=(1, 1),
                    regular_time=(1, 1),
                    penalties=(5, 4),
                    duration="PENALTY_SHOOTOUT",
                    utc_date="2026-07-04T19:00:00Z",
                ),
            ]
        }

        normalized = update_official_knockout_results.build_normalized_data(raw_data)
        matches = normalized["matches"]

        self.assertEqual([match["matchId"] for match in matches], ["73", "74", "76", "89"])
        self.assertEqual(matches[0]["stage"], "round_of_32")
        self.assertEqual(matches[0]["homeTeam"], "South Africa")
        self.assertEqual(matches[0]["advancingTeam"], "Canada")
        self.assertEqual(matches[2]["homeTeam"], "Brazil")
        self.assertEqual(matches[2]["matchId"], "76")
        self.assertEqual(matches[3]["stage"], "round_of_16")
        self.assertEqual(matches[3]["homeScore"], 1)
        self.assertEqual(matches[3]["awayScore"], 1)
        self.assertEqual(matches[3]["homePenaltyScore"], 5)
        self.assertEqual(matches[3]["awayPenaltyScore"], 4)

    def test_derives_shootout_winner_from_full_time_when_upstream_winner_is_missing(self):
        raw_data = {
            "matches": [
                self.match(
                    source_id=537415,
                    stage="LAST_32",
                    home="Germany",
                    away="Paraguay",
                    winner=None,
                    full_time=(4, 5),
                    regular_time=(1, 1),
                    extra_time=(0, 0),
                    penalties=(4, 4),
                    duration="PENALTY_SHOOTOUT",
                    utc_date="2026-06-29T20:30:00Z",
                )
            ]
        }

        normalized = update_official_knockout_results.build_normalized_data(raw_data)
        match = normalized["matches"][0]

        self.assertEqual(match["matchId"], "74")
        self.assertEqual(match["homeScore"], 1)
        self.assertEqual(match["awayScore"], 1)
        self.assertEqual(match["homePenaltyScore"], 3)
        self.assertEqual(match["awayPenaltyScore"], 4)
        self.assertEqual(match["advancingTeam"], "Paraguay")

    def test_applies_manual_override_when_upstream_shootout_data_is_tied(self):
        raw_data = {
            "matches": [
                self.match(
                    source_id=537418,
                    stage="LAST_32",
                    home="Netherlands",
                    away="Morocco",
                    winner=None,
                    full_time=(4, 4),
                    regular_time=(1, 1),
                    extra_time=(0, 0),
                    penalties=(3, 3),
                    duration="PENALTY_SHOOTOUT",
                    utc_date="2026-06-30T01:00:00Z",
                )
            ]
        }
        normalized = update_official_knockout_results.build_normalized_data(raw_data)

        update_official_knockout_results.apply_manual_overrides(
            normalized,
            {
                "matches": {
                    "75": {
                        "advancingTeam": "Morocco",
                        "homePenaltyScore": 2,
                        "awayPenaltyScore": 3,
                    }
                }
            },
        )
        match = normalized["matches"][0]

        self.assertEqual(match["matchId"], "75")
        self.assertEqual(match["homeScore"], 1)
        self.assertEqual(match["awayScore"], 1)
        self.assertEqual(match["homePenaltyScore"], 2)
        self.assertEqual(match["awayPenaltyScore"], 3)
        self.assertEqual(match["advancingTeam"], "Morocco")

    def test_computes_reviewable_round_of_32_bonus_values_when_possible(self):
        raw_data = {
            "matches": [
                self.match(
                    source_id=1,
                    stage="LAST_32",
                    home="South Africa",
                    away="Canada",
                    winner="AWAY_TEAM",
                    full_time=(0, 1),
                    utc_date="2026-06-28T19:00:00Z",
                ),
                self.match(
                    source_id=2,
                    stage="LAST_32",
                    home="Germany",
                    away="Paraguay",
                    winner="HOME_TEAM",
                    full_time=(3, 0),
                    utc_date="2026-06-29T19:00:00Z",
                ),
                self.match(
                    source_id=3,
                    stage="LAST_32",
                    home="Netherlands",
                    away="Morocco",
                    winner="HOME_TEAM",
                    full_time=(1, 1),
                    penalties=(4, 2),
                    duration="PENALTY_SHOOTOUT",
                    utc_date="2026-06-30T19:00:00Z",
                ),
            ]
        }

        normalized = update_official_knockout_results.build_normalized_data(raw_data)
        bonus = normalized["roundOf32BonusResults"]

        self.assertEqual(bonus["extraTimeMatches"], 1)
        self.assertEqual(bonus["penaltyMatches"], 1)
        self.assertEqual(bonus["totalGoals"], 6)
        self.assertEqual(bonus["mostGoalsTeam"], "Germany")
        self.assertEqual(bonus["biggestWinningMarginTeam"], "Germany")
        self.assertIsNone(bonus["yellowCards"])
        self.assertEqual(bonus["fastestGoalTeam"], "")

    def test_writes_raw_normalized_and_merges_official_results(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "matches.json"
            raw_output_path = temp_path / "raw.json"
            normalized_output_path = temp_path / "normalized.json"
            official_results_path = temp_path / "official_results.js"

            input_path.write_text(
                json.dumps(
                    {
                        "matches": [
                            self.match(
                                source_id=537417,
                                stage="LAST_32",
                                home="South Africa",
                                away="Canada",
                                winner="AWAY_TEAM",
                                full_time=(0, 1),
                                utc_date="2026-06-28T19:00:00Z",
                            )
                        ]
                    }
                ),
                encoding="utf-8",
            )
            self.write_official_results(official_results_path)

            normalized = update_official_knockout_results.update_official_knockout_results(
                input_path=input_path,
                raw_output_path=raw_output_path,
                normalized_output_path=normalized_output_path,
                overrides_path=None,
                official_results_path=official_results_path,
                api_key="unused",
            )

            merged = update_official_knockout_results.read_official_results(
                official_results_path
            )
            self.assertTrue(raw_output_path.exists())
            self.assertTrue(normalized_output_path.exists())
            self.assertEqual(normalized["matches"][0]["matchId"], "73")
            self.assertEqual(merged["groupResults"], {"A": ["Mexico"]})
            self.assertEqual(merged["officialMatches"], normalized["matches"])
            self.assertEqual(merged["matches"], normalized["matches"])
            self.assertIn("roundOf32BonusResults", merged)
            self.assertEqual(merged["knockoutSource"]["normalizedPath"], str(normalized_output_path))

    def match(
        self,
        *,
        source_id,
        stage,
        home,
        away,
        winner,
        full_time,
        utc_date,
        regular_time=None,
        extra_time=None,
        penalties=None,
        duration="REGULAR",
    ):
        score = {
            "winner": winner,
            "duration": duration,
            "fullTime": {"home": full_time[0], "away": full_time[1]},
            "halfTime": {"home": 0, "away": 0},
        }
        if regular_time:
            score["regularTime"] = {"home": regular_time[0], "away": regular_time[1]}
        if extra_time:
            score["extraTime"] = {"home": extra_time[0], "away": extra_time[1]}
        if penalties:
            score["penalties"] = {"home": penalties[0], "away": penalties[1]}
        return {
            "id": source_id,
            "utcDate": utc_date,
            "status": "FINISHED",
            "stage": stage,
            "lastUpdated": "2026-06-29T03:25:00Z",
            "homeTeam": {"name": home, "shortName": home, "tla": home[:3].upper()},
            "awayTeam": {"name": away, "shortName": away, "tla": away[:3].upper()},
            "score": score,
            "referees": [
                {"name": "Example Referee", "type": "REFEREE", "nationality": "Test"}
            ],
        }

    def write_official_results(self, path):
        data = {
            "sourceName": "Football-Data.org",
            "generatedAt": "2026-06-17T00:00:00+00:00",
            "groupResults": {"A": ["Mexico"]},
            "bestThirds": [],
            "futures": {},
            "timelineCheckpoints": [],
        }
        path.write_text(
            f"window.OFFICIAL_RESULTS = {json.dumps(data, indent=2)};\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    unittest.main()
