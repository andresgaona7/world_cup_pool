import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "apply_manual_futures.py"
SPEC = importlib.util.spec_from_file_location("apply_manual_futures", MODULE_PATH)
apply_manual_futures = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(apply_manual_futures)


class ApplyManualFuturesTests(unittest.TestCase):
    def test_merges_manual_futures_into_official_results(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            manual_path, official_path = self.write_fixture(temp_dir)

            apply_manual_futures.apply_manual_futures(
                manual_futures_path=manual_path,
                manual_fair_play_path=temp_dir_path(temp_dir) / "official_fair_play.json",
                official_results_path=official_path,
            )

            official_results = apply_manual_futures.read_official_results(official_path)
            expected_futures = {
                "champion": "Spain",
                "runnerUp": "Argentina",
                "topScorer": "Kylian Mbappe",
                "teamLastRounds": {
                    "Mexico": "group_stage",
                    "Ecuador": "quarterfinal",
                    "Spain": "champion",
                    "Argentina": "runner_up",
                },
            }
            self.assertEqual(official_results["futures"], expected_futures)
            self.assertEqual(
                official_results["timelineCheckpoints"][0]["scenario"]["futures"],
                expected_futures,
            )

    def test_rejects_unknown_round_keys(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            manual_path, official_path = self.write_fixture(temp_dir)
            manual = json.loads(manual_path.read_text(encoding="utf-8"))
            manual["teamLastRounds"]["Ecuador"] = "quarter_final"
            manual_path.write_text(json.dumps(manual), encoding="utf-8")

            with self.assertRaises(ValueError):
                apply_manual_futures.apply_manual_futures(
                    manual_futures_path=manual_path,
                    manual_fair_play_path=temp_dir_path(temp_dir) / "official_fair_play.json",
                    official_results_path=official_path,
                )

    def test_merges_manual_fair_play_and_updates_best_thirds(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            manual_path, official_path = self.write_fixture(temp_dir)
            fair_play_path = Path(temp_dir) / "official_fair_play.json"
            fair_play_path.write_text(
                json.dumps(
                    {
                        "teams": {
                            "Czechia": {"fairPlayPoints": -3},
                            "Qatar": {"fairPlayPoints": -1},
                        }
                    }
                ),
                encoding="utf-8",
            )

            apply_manual_futures.apply_manual_futures(
                manual_futures_path=manual_path,
                manual_fair_play_path=fair_play_path,
                official_results_path=official_path,
            )

            official_results = apply_manual_futures.read_official_results(official_path)

        self.assertEqual(
            official_results["provisionalGroupStandings"]["A"][2]["fairPlayPoints"],
            -3,
        )
        self.assertEqual(
            official_results["provisionalGroupStandings"]["B"][2]["fairPlayPoints"],
            -1,
        )
        self.assertEqual(official_results["bestThirds"], ["Qatar", "Czechia"])
        self.assertEqual(
            official_results["timelineCheckpoints"][0]["scenario"]["bestThirds"],
            ["Qatar", "Czechia"],
        )

    def test_reads_manual_fair_play_by_canonical_team_name(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            fair_play_path = Path(temp_dir) / "official_fair_play.json"
            fair_play_path.write_text(
                json.dumps(
                    {
                        "teams": {
                            "Turkiye": {
                                "yellowCards": 2,
                                "indirectRedCards": 1,
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            fair_play = apply_manual_futures.read_manual_fair_play(fair_play_path)

        self.assertEqual(
            fair_play,
            {"Türkiye": {"yellowCards": 2, "indirectRedCards": 1}},
        )
        self.assertEqual(apply_manual_futures.fair_play_points(fair_play["Türkiye"]), -5)

    def write_fixture(self, temp_dir):
        temp_path = Path(temp_dir)
        manual_path = temp_path / "official_futures.json"
        official_path = temp_path / "official_results.js"
        manual_path.write_text(
            json.dumps(
                {
                    "champion": "Spain",
                    "runnerUp": "Argentina",
                    "topScorer": "Kylian Mbappe",
                    "teamLastRounds": {
                        "Ecuador": "quarterfinal",
                        "Spain": "champion",
                        "Argentina": "runner_up",
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        official_results = {
            "sourceName": "Football-Data.org",
            "futures": {
                "champion": "",
                "runnerUp": "",
                "topScorer": "",
                "teamLastRounds": {"Mexico": "group_stage"},
            },
            "bestThirds": ["Czechia", "Qatar"],
            "provisionalGroupStandings": {
                "A": [
                    self.result_row("Mexico", 6, 4, 5, 1),
                    self.result_row("South Korea", 3, 1, 2, 2),
                    self.result_row("Czechia", 1, 0, 1, 3),
                ],
                "B": [
                    self.result_row("Canada", 6, 4, 5, 1),
                    self.result_row("Switzerland", 3, 1, 2, 2),
                    self.result_row("Qatar", 1, 0, 1, 3),
                ],
            },
            "overallStandings": [
                self.result_row("Czechia", 1, 0, 1, 15),
                self.result_row("Qatar", 1, 0, 1, 16),
            ],
            "timelineCheckpoints": [
                {
                    "key": "group_md1",
                    "scenario": {
                        "futures": {
                            "champion": "",
                            "runnerUp": "",
                            "topScorer": "",
                            "teamLastRounds": {},
                        },
                        "bestThirds": ["Czechia", "Qatar"],
                    },
                }
            ],
        }
        official_path.write_text(
            f"window.OFFICIAL_RESULTS = {json.dumps(official_results, indent=2)};\n",
            encoding="utf-8",
        )
        return manual_path, official_path

    def result_row(self, team, points, goal_difference, goals_for, position):
        return {
            "team": team,
            "position": position,
            "played": 1,
            "points": points,
            "goalDifference": goal_difference,
            "goalsFor": goals_for,
        }


def temp_dir_path(temp_dir):
    return Path(temp_dir)


if __name__ == "__main__":
    unittest.main()
