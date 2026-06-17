import importlib.util
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
            ["Bosnia-Herzegovina", "Canada"],
        )
        self.assertEqual([row["team"] for row in grouped["D"]], ["Türkiye"])
        self.assertEqual(
            [row["team"] for row in grouped["F"]],
            ["Netherlands"],
        )

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


if __name__ == "__main__":
    unittest.main()
