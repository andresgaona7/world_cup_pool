import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "update_official_results.py"
SPEC = importlib.util.spec_from_file_location("update_official_results", MODULE_PATH)
update_official_results = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(update_official_results)


class OfficialResultsUpdateTests(unittest.TestCase):
    def test_normalize_row_uses_official_congo_dr_name(self):
        row = update_official_results.normalize_row(
            self.row("DR Congo", "COD", 0, 0, 0, 0)
        )

        self.assertEqual(row["team"], "Congo DR")

    def test_groups_overall_table_using_known_world_cup_groups(self):
        raw_data = {
            "standings": [
                {
                    "stage": "GROUP_STAGE",
                    "type": "TOTAL",
                    "group": None,
                    "table": [
                        self.row("Mexico", "MEX", 3, 2, 0, 1),
                        self.row("South Africa", "RSA", 0, 0, 2, 0),
                        self.row("South Korea", "KOR", 3, 2, 1, 1),
                        self.row("Czech Republic", "CZE", 0, 1, 2, 0),
                        self.row("Canada", "CAN", 1, 1, 1, 0),
                        self.row("Bosnia and Herzegovina", "BIH", 1, 1, 1, 0),
                        self.row("Turkiye", "TUR", 3, 1, 0, 1),
                        self.row("Netherlands", "NED", 3, 2, 0, 1),
                    ],
                }
            ]
        }

        grouped = update_official_results.extract_group_standings(raw_data)

        self.assertEqual(
            [row["team"] for row in grouped["A"]],
            ["Mexico", "South Korea", "Czechia", "South Africa"],
        )
        self.assertEqual([row["position"] for row in grouped["A"]], [1, 2, 3, 4])
        self.assertEqual(
            [row["team"] for row in grouped["B"]],
            ["Canada", "Bosnia-Herzegovina"],
        )
        self.assertEqual([row["team"] for row in grouped["D"]], ["Türkiye"])
        self.assertEqual(
            [row["team"] for row in grouped["F"]],
            ["Netherlands"],
        )

    def test_group_sort_uses_fifa_ranking_before_team_name(self):
        raw_data = {
            "standings": [
                {
                    "stage": "GROUP_STAGE",
                    "type": "TOTAL",
                    "group": None,
                    "table": [
                        self.row("Canada", "CAN", 1, 1, 1, 0),
                        self.row("Bosnia and Herzegovina", "BIH", 1, 1, 1, 0),
                    ],
                }
            ]
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            rankings_path = Path(temp_dir) / "fifa_rankings.json"
            rankings_path.write_text(
                json.dumps(
                    {
                        "rankings": {
                            "Canada": 30,
                            "Bosnia-Herzegovina": 75,
                        }
                    }
                ),
                encoding="utf-8",
            )
            original_rankings_path = update_official_results.FIFA_RANKINGS_PATH
            update_official_results.FIFA_RANKINGS_PATH = rankings_path
            try:
                grouped = update_official_results.extract_group_standings(raw_data)
            finally:
                update_official_results.FIFA_RANKINGS_PATH = original_rankings_path

        self.assertEqual(
            [row["team"] for row in grouped["B"]],
            ["Canada", "Bosnia-Herzegovina"],
        )

    def test_load_fifa_rankings_ignores_blank_values_and_aliases_names(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            rankings_path = Path(temp_dir) / "fifa_rankings.json"
            rankings_path.write_text(
                json.dumps(
                    {
                        "rankings": {
                            "Turkiye": 25,
                            "Mexico": None,
                            "Canada": "",
                        }
                    }
                ),
                encoding="utf-8",
            )

            rankings = update_official_results.load_fifa_rankings(rankings_path)

        self.assertEqual(rankings, {"Türkiye": 25})

    def test_best_thirds_uses_fair_play_and_lots_after_goals_scored(self):
        completed_groups = {}
        for index, group_id in enumerate(update_official_results.GROUP_IDS):
            third_row = self.official_row(
                f"Third {group_id}",
                points=1,
                goal_difference=-index - 1,
                goals_for=0,
            )
            completed_groups[group_id] = [
                self.official_row(f"Winner {group_id}", 9, 5, 6),
                self.official_row(f"Runner {group_id}", 6, 2, 4),
                third_row,
                self.official_row(f"Fourth {group_id}", 0, -7, 0),
            ]

        completed_groups["A"][2].update(
            {
                "team": "Fair Play Loser",
                "points": 3,
                "goalDifference": 0,
                "goalsFor": 2,
                "fairPlayPoints": -5,
            }
        )
        completed_groups["B"][2].update(
            {
                "team": "Fair Play Winner",
                "points": 3,
                "goalDifference": 0,
                "goalsFor": 2,
                "fairPlayPoints": -1,
            }
        )
        completed_groups["C"][2].update(
            {
                "team": "Lots Winner",
                "points": 3,
                "goalDifference": 0,
                "goalsFor": 1,
                "fairPlayPoints": -2,
                "lotsOrder": 1,
            }
        )
        completed_groups["D"][2].update(
            {
                "team": "Lots Loser",
                "points": 3,
                "goalDifference": 0,
                "goalsFor": 1,
                "fairPlayPoints": -2,
                "lotsOrder": 2,
            }
        )

        best_thirds = update_official_results.best_thirds(completed_groups)

        self.assertEqual(best_thirds[:4], [
            "Fair Play Winner",
            "Fair Play Loser",
            "Lots Winner",
            "Lots Loser",
        ])

    def test_timeline_checkpoint_uses_current_group_matchday(self):
        group_standings = {
            "A": [
                update_official_results.normalize_row(self.row("Mexico", "MEX", 3, 2, 0, 1)),
                update_official_results.normalize_row(self.row("South Korea", "KOR", 3, 2, 1, 1)),
                update_official_results.normalize_row(self.row("Czech Republic", "CZE", 0, 1, 2, 0)),
                update_official_results.normalize_row(self.row("South Africa", "RSA", 0, 0, 2, 0)),
            ],
        }

        checkpoints = update_official_results.timeline_checkpoints(
            group_standings,
            {},
            {
                "champion": "",
                "runnerUp": "",
                "topScorer": "",
                "teamLastRounds": {},
            },
        )

        self.assertEqual(len(checkpoints), 1)
        self.assertEqual(checkpoints[0]["key"], "group_md1")
        self.assertEqual(checkpoints[0]["label"], "After group matchday 1")
        self.assertEqual(
            checkpoints[0]["scenario"]["groupResults"]["A"],
            ["Mexico", "South Korea", "Czechia"],
        )
        self.assertEqual(
            checkpoints[0]["scenario"]["bestThirds"],
            ["Czechia"],
        )

    def test_preserves_existing_group_stage_results_by_default(self):
        existing_results = {
            "sourceName": "Football-Data.org",
            "matches": [
                {
                    "matchId": "73",
                    "stage": "round_of_32",
                    "homeTeam": "South Africa",
                    "awayTeam": "Canada",
                    "homeScore": 0,
                    "awayScore": 1,
                }
            ],
            "officialMatches": [
                {
                    "matchId": "73",
                    "stage": "round_of_32",
                    "homeTeam": "South Africa",
                    "awayTeam": "Canada",
                    "homeScore": 0,
                    "awayScore": 1,
                }
            ],
            "roundOf32BonusResults": {
                "extraTimeMatches": 3,
                "penaltyMatches": 2,
                "mostGoalsTeam": "Canada",
                "totalGoals": 48,
            },
            "knockoutSource": {
                "sourceName": "Football-Data.org matches",
                "normalizedPath": "data/manual/official_knockout_results.json",
            },
            "groupResults": {"A": ["Mexico", "South Korea", "Czechia"]},
            "bestThirds": ["Czechia"],
            "futures": {
                "champion": "",
                "runnerUp": "",
                "topScorer": "Lionel Messi",
                "teamLastRounds": {"Ecuador": "round_of_32"},
            },
            "provisionalGroupStandings": {
                "A": [
                    self.official_row("Mexico", 3, 1, 2),
                    self.official_row("South Korea", 3, 1, 2),
                    self.official_row("Czechia", 0, -1, 1),
                ]
            },
            "timelineCheckpoints": [
                {
                    "key": "group_md1",
                    "scenario": {
                        "groupResults": {"A": ["Mexico", "South Korea", "Czechia"]},
                        "bestThirds": ["Czechia"],
                    },
                }
            ],
            "overallStandings": [self.official_row("Mexico", 3, 1, 2)],
        }
        new_results = {
            "sourceName": "Football-Data.org",
            "matches": [],
            "groupResults": {"A": ["Canada", "Qatar", "Switzerland"]},
            "bestThirds": ["Switzerland"],
            "futures": {
                "champion": "",
                "runnerUp": "",
                "topScorer": "",
                "teamLastRounds": {},
            },
            "provisionalGroupStandings": {
                "A": [
                    self.official_row("Canada", 6, 3, 4),
                    self.official_row("Qatar", 3, 0, 2),
                    self.official_row("Switzerland", 1, -1, 1),
                ]
            },
            "timelineCheckpoints": [],
            "overallStandings": [self.official_row("Canada", 6, 3, 4)],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "official_results.js"
            output_path.write_text(
                f"window.OFFICIAL_RESULTS = {json.dumps(existing_results)};\n",
                encoding="utf-8",
            )

            preserved = update_official_results.preserve_existing_group_stage_results(
                new_results,
                output_path,
                refresh_group_stage_results=False,
            )

        self.assertIn("groupResults", preserved)
        self.assertIn("matches", preserved)
        self.assertIn("officialMatches", preserved)
        self.assertIn("roundOf32BonusResults", preserved)
        self.assertIn("knockoutSource", preserved)
        self.assertIn("provisionalGroupStandings", preserved)
        self.assertIn("timelineCheckpoints", preserved)
        self.assertEqual(new_results["matches"], existing_results["matches"])
        self.assertEqual(
            new_results["officialMatches"],
            existing_results["officialMatches"],
        )
        self.assertEqual(
            new_results["roundOf32BonusResults"],
            existing_results["roundOf32BonusResults"],
        )
        self.assertEqual(
            new_results["knockoutSource"],
            existing_results["knockoutSource"],
        )
        self.assertEqual(new_results["groupResults"], existing_results["groupResults"])
        self.assertEqual(new_results["bestThirds"], existing_results["bestThirds"])
        self.assertEqual(new_results["futures"], existing_results["futures"])
        self.assertEqual(
            new_results["provisionalGroupStandings"],
            existing_results["provisionalGroupStandings"],
        )
        self.assertEqual(
            new_results["timelineCheckpoints"],
            existing_results["timelineCheckpoints"],
        )

    def test_refresh_group_stage_results_preserves_knockout_results(self):
        existing_results = {
            "groupResults": {"A": ["Mexico"]},
            "matches": [
                {
                    "matchId": "73",
                    "stage": "round_of_32",
                    "homeTeam": "South Africa",
                    "awayTeam": "Canada",
                    "homeScore": 0,
                    "awayScore": 1,
                }
            ],
            "officialMatches": [
                {
                    "matchId": "73",
                    "stage": "round_of_32",
                    "homeTeam": "South Africa",
                    "awayTeam": "Canada",
                    "homeScore": 0,
                    "awayScore": 1,
                }
            ],
            "roundOf32BonusResults": {"totalGoals": 48},
            "knockoutSource": {
                "normalizedPath": "data/manual/official_knockout_results.json"
            },
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "official_results.js"
            output_path.write_text(
                f"window.OFFICIAL_RESULTS = {json.dumps(existing_results)};\n",
                encoding="utf-8",
            )
            new_results = {"groupResults": {"A": ["Canada"]}, "matches": []}

            preserved = update_official_results.preserve_existing_group_stage_results(
                new_results,
                output_path,
                refresh_group_stage_results=True,
            )

        self.assertEqual(
            preserved,
            ["matches", "officialMatches", "roundOf32BonusResults", "knockoutSource"],
        )
        self.assertEqual(new_results["groupResults"], {"A": ["Canada"]})
        self.assertEqual(new_results["matches"], existing_results["matches"])
        self.assertEqual(
            new_results["officialMatches"],
            existing_results["officialMatches"],
        )
        self.assertEqual(
            new_results["roundOf32BonusResults"],
            existing_results["roundOf32BonusResults"],
        )
        self.assertEqual(
            new_results["knockoutSource"],
            existing_results["knockoutSource"],
        )

    def row(
        self,
        name,
        tla,
        points,
        goals_for,
        goals_against,
        won,
    ):
        return {
            "team": {"name": name, "tla": tla},
            "playedGames": 1,
            "won": won,
            "draw": 0,
            "lost": 1 - won,
            "goalsFor": goals_for,
            "goalsAgainst": goals_against,
            "goalDifference": goals_for - goals_against,
            "points": points,
        }

    def official_row(self, team, points, goal_difference, goals_for):
        return {
            "team": team,
            "teamCode": team[:3].upper(),
            "position": 1,
            "played": 3,
            "won": 0,
            "drawn": 0,
            "lost": 0,
            "goalsFor": goals_for,
            "goalsAgainst": goals_for - goal_difference,
            "goalDifference": goal_difference,
            "points": points,
        }


if __name__ == "__main__":
    unittest.main()
