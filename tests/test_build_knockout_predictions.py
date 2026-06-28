import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "build_knockout_predictions.py"
SPEC = importlib.util.spec_from_file_location("build_knockout_predictions", MODULE_PATH)
build_knockout_predictions = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(build_knockout_predictions)


class BuildKnockoutPredictionsTests(unittest.TestCase):
    def test_missing_workbook_writes_empty_generated_artifact(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workbook_path = Path(temp_dir) / "missing.xlsx"
            output_path = Path(temp_dir) / "knockout_predictions.js"

            data = build_knockout_predictions.build_knockout_data(workbook_path)
            build_knockout_predictions.write_browser_data(output_path, data)

            text = output_path.read_text(encoding="utf-8")
            payload = text.removeprefix("window.KNOCKOUT_PREDICTIONS = ").removesuffix(";\n")
            parsed = json.loads(payload)

        self.assertEqual(parsed["players"], [])
        self.assertEqual(parsed["generated_from"], [])
        self.assertEqual(parsed["sourceName"], "Generated knockout predictions")
        self.assertEqual(parsed["source_files"][0]["available"], False)

    def test_extract_predictions_from_table_headers(self):
        cells = {
            (1, 1): "Name",
            (1, 2): "Ana",
            (3, 1): "Match",
            (3, 2): "Mode",
            (3, 3): "Home Score",
            (3, 4): "Away Score",
            (3, 5): "Winner",
            (4, 1): "104.0",
            (4, 2): "Score",
            (4, 3): "2.0",
            (4, 4): "1.0",
            (4, 5): "Ecuador",
        }

        predictions = build_knockout_predictions.extract_predictions(cells)

        self.assertEqual(
            predictions,
            [
                {
                    "matchId": "104",
                    "stage": "final",
                    "mode": "score",
                    "predictedAdvancingTeam": "Ecuador",
                    "homeScore": 2,
                    "awayScore": 1,
                }
            ],
        )
        self.assertEqual(build_knockout_predictions.player_name(cells, "Sheet1"), "Ana")

    def test_extracts_complete_round_section_card_without_match_column(self):
        cells = {
            (1, 1): "Name",
            (1, 2): "Ana",
        }
        row = 3
        for heading, stage in (
            ("Round of 32", "round_of_32"),
            ("Round of 16", "round_of_16"),
            ("Quaterfinals", "quarterfinal"),
            ("Semifinals", "semifinal"),
            ("Final", "final"),
        ):
            cells[(row, 1)] = heading
            row += 1
            cells[(row, 1)] = "Winner"
            cells[(row, 2)] = "Mode"
            cells[(row, 3)] = "Home Score"
            cells[(row, 4)] = "Away Score"
            row += 1
            for index, _match_id in enumerate(build_knockout_predictions.STAGE_MATCH_IDS[stage], start=1):
                cells[(row, 1)] = f"{stage} Winner {index}"
                cells[(row, 2)] = "Score"
                cells[(row, 3)] = "1"
                cells[(row, 4)] = "0"
                row += 1
            row += 1

        matches = build_knockout_predictions.extract_predictions(cells)
        validation = build_knockout_predictions.validate_predictions(matches)

        self.assertEqual(len(matches), 31)
        self.assertEqual(matches[0]["matchId"], "73")
        self.assertEqual(matches[0]["stage"], "round_of_32")
        self.assertEqual(matches[-1]["matchId"], "104")
        self.assertEqual(matches[-1]["stage"], "final")
        self.assertTrue(validation["complete"])
        self.assertEqual(
            validation["stageCounts"],
            {
                "round_of_32": 16,
                "round_of_16": 8,
                "quarterfinal": 4,
                "semifinal": 2,
                "final": 1,
            },
        )

    def test_extracts_single_stage_workbook_without_stage_heading(self):
        cells = {
            (1, 1): "Name",
            (1, 2): "Ana",
            (3, 1): "Winner",
            (3, 2): "Mode",
            (3, 3): "Home Score",
            (3, 4): "Away Score",
        }
        for index in range(16):
            row = 4 + index
            cells[(row, 1)] = f"Winner {index + 1}"
            cells[(row, 2)] = "Score"
            cells[(row, 3)] = "1"
            cells[(row, 4)] = "0"

        matches = build_knockout_predictions.extract_predictions(
            cells,
            default_stage="round_of_32",
        )

        self.assertEqual(len(matches), 16)
        self.assertEqual(matches[0]["matchId"], "73")
        self.assertEqual(matches[-1]["matchId"], "88")
        self.assertEqual({match["stage"] for match in matches}, {"round_of_32"})

    def test_merges_player_predictions_across_stage_workbooks(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            paths = {
                "round_of_32": temp_path / "round_of_32.xlsx",
                "final": temp_path / "final.xlsx",
            }
            for path in paths.values():
                path.touch()

            def workbook_for_path(path):
                if path.name == "round_of_32.xlsx":
                    return {
                        "sheets": [
                            {
                                "name": "Ana",
                                "cells": {
                                    (1, 1): "Name",
                                    (1, 2): "Ana",
                                    (3, 1): "Winner",
                                    (4, 1): "Ecuador",
                                    (3, 2): "Home Score",
                                    (3, 3): "Away Score",
                                    (4, 2): "1",
                                    (4, 3): "0",
                                },
                            }
                        ]
                    }
                return {
                    "sheets": [
                        {
                            "name": "Ana",
                            "cells": {
                                (1, 1): "Name",
                                (1, 2): "Ana",
                                (3, 1): "Winner",
                                (4, 1): "Brazil",
                                (3, 2): "Home Score",
                                (3, 3): "Away Score",
                                (4, 2): "2",
                                (4, 3): "1",
                            },
                        }
                    ]
                }

            with patch.object(
                build_knockout_predictions,
                "read_workbook",
                side_effect=workbook_for_path,
            ):
                data = build_knockout_predictions.build_knockout_data(paths)

        self.assertEqual(len(data["players"]), 1)
        self.assertEqual(data["players"][0]["name"], "Ana")
        self.assertEqual(
            [match["matchId"] for match in data["players"][0]["matches"]],
            ["73", "104"],
        )
        self.assertEqual(
            {match["stage"] for match in data["players"][0]["matches"]},
            {"round_of_32", "final"},
        )

    def test_validation_reports_missing_stage_matches(self):
        matches = [
            {
                "matchId": "104",
                "stage": "final",
                "mode": "score",
                "predictedAdvancingTeam": "Ecuador",
                "homeScore": 1,
                "awayScore": 0,
            }
        ]

        validation = build_knockout_predictions.validate_predictions(matches)

        self.assertFalse(validation["complete"])
        self.assertEqual(validation["matchCount"], 1)
        self.assertEqual(validation["missingOrExtraByStage"]["round_of_32"], 16)
        self.assertNotIn("final", validation["missingOrExtraByStage"])


if __name__ == "__main__":
    unittest.main()
