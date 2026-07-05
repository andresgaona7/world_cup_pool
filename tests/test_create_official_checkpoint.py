import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "create_official_checkpoint.py"
)
SPEC = importlib.util.spec_from_file_location("create_official_checkpoint", MODULE_PATH)
create_official_checkpoint = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(create_official_checkpoint)


class CreateOfficialCheckpointTests(unittest.TestCase):
    def test_writes_requested_checkpoint_filename(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            official_path, checkpoint_dir = self.write_fixture(temp_dir)

            create_official_checkpoint.create_or_rebuild_checkpoint(
                checkpoint_key="group_md1",
                rebuild_only=False,
                official_results_path=official_path,
                checkpoint_dir=checkpoint_dir,
            )

            checkpoint_path = checkpoint_dir / "group_md1.json"
            checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
            official_results = create_official_checkpoint.read_official_results(official_path)

            self.assertTrue(checkpoint_path.exists())
            self.assertEqual(checkpoint["key"], "group_md1")
            self.assertEqual(checkpoint["shortLabel"], "Group MD1")
            self.assertEqual(checkpoint["completedAt"], "2026-06-17T00:00:00+00:00")
            self.assertEqual(
                checkpoint["scenario"]["groupResults"]["A"],
                ["Mexico", "South Korea", "Czechia"],
            )
            self.assertEqual(official_results["timelineCheckpoints"], [checkpoint])

    def test_rejects_unsupported_checkpoint_keys(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            official_path, checkpoint_dir = self.write_fixture(temp_dir)

            with self.assertRaises(ValueError):
                create_official_checkpoint.create_or_rebuild_checkpoint(
                    checkpoint_key="not_a_checkpoint",
                    rebuild_only=False,
                    official_results_path=official_path,
                    checkpoint_dir=checkpoint_dir,
                )

    def test_rebuilds_timeline_checkpoints_in_planned_order(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            official_path, checkpoint_dir = self.write_fixture(temp_dir)
            checkpoint_dir.mkdir(parents=True)
            self.write_checkpoint(checkpoint_dir, "final")
            self.write_checkpoint(checkpoint_dir, "group_md2")
            self.write_checkpoint(checkpoint_dir, "quarterfinal")

            create_official_checkpoint.create_or_rebuild_checkpoint(
                checkpoint_key=None,
                rebuild_only=True,
                official_results_path=official_path,
                checkpoint_dir=checkpoint_dir,
            )

            official_results = create_official_checkpoint.read_official_results(official_path)
            self.assertEqual(
                [checkpoint["key"] for checkpoint in official_results["timelineCheckpoints"]],
                ["group_md2", "quarterfinal", "final"],
            )

    def test_preserves_non_timeline_fields_in_official_results_js(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            official_path, checkpoint_dir = self.write_fixture(temp_dir)
            before = create_official_checkpoint.read_official_results(official_path)

            create_official_checkpoint.create_or_rebuild_checkpoint(
                checkpoint_key="group_md1",
                rebuild_only=False,
                official_results_path=official_path,
                checkpoint_dir=checkpoint_dir,
            )

            after = create_official_checkpoint.read_official_results(official_path)
            before.pop("timelineCheckpoints", None)
            after.pop("timelineCheckpoints", None)
            self.assertEqual(after, before)

    def test_rebuild_only_does_not_require_checkpoint_name(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            official_path, checkpoint_dir = self.write_fixture(temp_dir)

            create_official_checkpoint.create_or_rebuild_checkpoint(
                checkpoint_key=None,
                rebuild_only=True,
                official_results_path=official_path,
                checkpoint_dir=checkpoint_dir,
            )

            official_results = create_official_checkpoint.read_official_results(official_path)
            self.assertEqual(official_results["timelineCheckpoints"], [])

    def test_round_of_32_checkpoint_preserves_bonus_results(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            official_path, checkpoint_dir = self.write_fixture(temp_dir)

            create_official_checkpoint.create_or_rebuild_checkpoint(
                checkpoint_key="round_of_32",
                rebuild_only=False,
                official_results_path=official_path,
                checkpoint_dir=checkpoint_dir,
            )

            checkpoint_path = checkpoint_dir / "round_of_32.json"
            checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
            official_results = create_official_checkpoint.read_official_results(official_path)

            self.assertEqual(
                checkpoint["roundOf32BonusResults"],
                {
                    "extraTimeMatches": 0,
                    "penaltyMatches": 0,
                    "totalGoals": 4,
                },
            )
            self.assertEqual(
                official_results["timelineCheckpoints"][0]["roundOf32BonusResults"],
                checkpoint["roundOf32BonusResults"],
            )

    def test_round_of_32_checkpoint_excludes_later_knockout_matches(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            official_path, checkpoint_dir = self.write_fixture(temp_dir)

            create_official_checkpoint.create_or_rebuild_checkpoint(
                checkpoint_key="round_of_32",
                rebuild_only=False,
                official_results_path=official_path,
                checkpoint_dir=checkpoint_dir,
            )

            checkpoint_path = checkpoint_dir / "round_of_32.json"
            checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))

            self.assertEqual(
                [match["matchId"] for match in checkpoint["officialMatches"]],
                ["73"],
            )

    def test_round_of_16_checkpoint_includes_round_of_32_and_round_of_16_matches(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            official_path, checkpoint_dir = self.write_fixture(temp_dir)

            create_official_checkpoint.create_or_rebuild_checkpoint(
                checkpoint_key="round_of_16",
                rebuild_only=False,
                official_results_path=official_path,
                checkpoint_dir=checkpoint_dir,
            )

            checkpoint_path = checkpoint_dir / "round_of_16.json"
            checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))

            self.assertEqual(
                [match["matchId"] for match in checkpoint["officialMatches"]],
                ["73", "89"],
            )
            self.assertEqual(
                checkpoint["roundOf32BonusResults"],
                {
                    "extraTimeMatches": 0,
                    "penaltyMatches": 0,
                    "totalGoals": 4,
                },
            )

    def write_fixture(self, temp_dir):
        temp_path = Path(temp_dir)
        official_path = temp_path / "official_results.js"
        checkpoint_dir = temp_path / "checkpoints"
        data = {
            "sourceName": "Football-Data.org",
            "generatedAt": "2026-06-17T00:00:00+00:00",
            "lastCompletedMatchDate": "",
            "matches": [
                {
                    "matchId": "73",
                    "stage": "round_of_32",
                    "homeTeam": "South Africa",
                    "awayTeam": "Canada",
                    "homeScore": 0,
                    "awayScore": 1,
                    "advancingTeam": "Canada",
                },
                {
                    "matchId": "89",
                    "stage": "round_of_16",
                    "homeTeam": "Paraguay",
                    "awayTeam": "France",
                    "homeScore": 0,
                    "awayScore": 1,
                    "advancingTeam": "France",
                },
                {
                    "matchId": "97",
                    "stage": "quarterfinal",
                    "homeTeam": "Canada",
                    "awayTeam": "Brazil",
                    "homeScore": None,
                    "awayScore": None,
                    "advancingTeam": "",
                },
            ],
            "groupResults": {"A": [], "B": []},
            "bestThirds": [],
            "futures": {
                "champion": "",
                "runnerUp": "",
                "topScorer": "",
                "teamLastRounds": {},
            },
            "provisionalGroupStandings": {
                "A": [
                    self.row("Mexico", 3, 2, 0),
                    self.row("South Korea", 3, 2, 1),
                    self.row("Czechia", 0, 1, 2),
                    self.row("South Africa", 0, 0, 2),
                ],
            },
            "timelineCheckpoints": [{"key": "old"}],
            "overallStandings": [{"team": "Mexico"}],
            "roundOf32BonusResults": {
                "extraTimeMatches": 0,
                "penaltyMatches": 0,
                "totalGoals": 4,
            },
        }
        payload = json.dumps(data, ensure_ascii=False, indent=2)
        official_path.write_text(
            f"window.OFFICIAL_RESULTS = {payload};\n",
            encoding="utf-8",
        )
        return official_path, checkpoint_dir

    def write_checkpoint(self, checkpoint_dir, key):
        metadata = create_official_checkpoint.CHECKPOINTS_BY_KEY[key]
        payload = {
            "key": key,
            "label": metadata["label"],
            "shortLabel": metadata["shortLabel"],
            "stage": metadata["stage"],
            "completedAt": "2026-06-17T00:00:00+00:00",
            "scenario": {
                "groupResults": {},
                "bestThirds": [],
                "futures": {
                    "champion": "",
                    "runnerUp": "",
                    "topScorer": "",
                    "teamLastRounds": {},
                },
            },
            "officialMatches": [],
        }
        (checkpoint_dir / f"{key}.json").write_text(
            f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n",
            encoding="utf-8",
        )

    def row(self, team, points, goals_for, goals_against):
        return {
            "team": team,
            "teamCode": team[:3].upper(),
            "position": 1,
            "played": 1,
            "won": 1 if points == 3 else 0,
            "drawn": 0,
            "lost": 0 if points == 3 else 1,
            "goalsFor": goals_for,
            "goalsAgainst": goals_against,
            "goalDifference": goals_for - goals_against,
            "points": points,
        }


if __name__ == "__main__":
    unittest.main()
