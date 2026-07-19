import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "build_knockout_predictions.py"
SPEC = importlib.util.spec_from_file_location("build_knockout_predictions", MODULE_PATH)
build_knockout_predictions = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(build_knockout_predictions)


class BuildKnockoutPredictionsTests(unittest.TestCase):
    REVIEWED_QUARTERFINAL_PREDICTIONS = {
        "Amal": {
            "matches": [
                ("97", None, None, None),
                ("98", 2, 1, "Spain"),
                ("99", 1, 0, "Norway"),
                ("100", 2, 0, "Argentina"),
            ],
            "bonus_answers": [
                "0",
                "0",
                "Argentina",
                "6 - 8",
                "Norway",
                "Belgium",
                "Argentina",
                "",
                "4",
            ],
        },
        "Irina": {
            "matches": [
                ("97", None, None, None),
                ("98", 2, 1, "Spain"),
                ("99", 3, 2, "Norway"),
                ("100", 2, 1, "Argentina"),
            ],
            "bonus_answers": [
                "2",
                "0",
                "Norway",
                "9 - 10",
                "Norway",
                "England",
                "France",
                "5",
                "1",
            ],
        },
    }

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
            (3, 5): "Home Penalty Score",
            (3, 6): "Away Penalty Score",
            (3, 7): "Winner",
            (4, 1): "104.0",
            (4, 2): "Score",
            (4, 3): "2.0",
            (4, 4): "1.0",
            (4, 5): "5.0",
            (4, 6): "4.0",
            (4, 7): "Ecuador",
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
                    "homePenaltyScore": 5,
                    "awayPenaltyScore": 4,
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
            ("Third-place match", "third_place_match"),
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

        self.assertEqual(len(matches), 32)
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
                "third_place_match": 1,
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

    def test_read_sheet_paths_accepts_absolute_xlsx_relationship_targets(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workbook_path = Path(temp_dir) / "absolute_target.xlsx"
            with ZipFile(workbook_path, "w") as archive:
                archive.writestr(
                    "xl/workbook.xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="jjpro" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>""",
                )
                archive.writestr(
                    "xl/_rels/workbook.xml.rels",
                    """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="/xl/worksheets/sheet1.xml"/>
</Relationships>""",
                )

            with ZipFile(workbook_path) as archive:
                paths = build_knockout_predictions.read_sheet_paths(archive)

        self.assertEqual(paths, [("jjpro", "xl/worksheets/sheet1.xml")])

    def test_extracts_visual_round_of_32_layout_and_ignores_red_cells(self):
        cells = {
            (1, 1): "Name",
            (1, 2): "Ana",
            (9, 3): "Round of 32",
            (10, 3): "Group A",
            (10, 6): "",
            (18, 13): "Round of 32",
            (19, 13): "Germany",
            (19, 14): "2",
            (19, 15): "0",
            (19, 16): "Paraguay",
            (20, 13): "France",
            (20, 14): "1",
            (20, 15): "1",
            (20, 16): "Sweden",
            (20, 17): "5",
            (20, 18): "4",
            (21, 13): "South Africa",
            (21, 14): "1",
            (21, 15): "2",
            (21, 16): "Canada",
        }
        for index in range(3, 16):
            row = 19 + index
            cells[(row, 13)] = f"Home {index + 1}"
            cells[(row, 14)] = "1"
            cells[(row, 15)] = "0"
            cells[(row, 16)] = f"Away {index + 1}"

        matches = build_knockout_predictions.extract_predictions(
            cells,
            default_stage="round_of_32",
            ignored_cells={(21, 14), (21, 15)},
        )

        self.assertEqual(len(matches), 16)
        self.assertEqual(
            matches[0],
            {
                "matchId": "73",
                "stage": "round_of_32",
                "mode": "score",
                "homeTeam": "Germany",
                "awayTeam": "Paraguay",
                "homeScore": 2,
                "awayScore": 0,
                "predictedAdvancingTeam": "Germany",
            },
        )
        self.assertEqual(matches[1]["predictedAdvancingTeam"], "France")
        self.assertEqual(matches[1]["homePenaltyScore"], 5)
        self.assertNotIn("homeScore", matches[2])
        self.assertNotIn("awayScore", matches[2])
        self.assertNotIn("predictedAdvancingTeam", matches[2])
        self.assertEqual(matches[2]["ignoredFields"], ["homeScore", "awayScore"])

    def test_extracts_visual_round_of_16_layout_by_fixture_pair(self):
        cells = {
            (50, 13): "Round of 16",
            (50, 17): "Penalty",
            (51, 13): "Canada",
            (51, 14): "1",
            (51, 15): "2",
            (51, 16): "Morroco",
            (52, 13): "Paraguay",
            (52, 14): "0",
            (52, 15): "3",
            (52, 16): "France",
            (53, 13): "USA",
            (53, 14): "1",
            (53, 15): "1",
            (53, 16): "Belgium",
            (53, 17): "3",
            (53, 18): "4",
            (54, 13): "Portugal",
            (54, 14): "1",
            (54, 15): "0",
            (54, 16): "Spain",
            (55, 13): "Brazil",
            (55, 14): "1",
            (55, 15): "2",
            (55, 16): "Norway",
            (56, 13): "Mexico",
            (56, 14): "1",
            (56, 15): "1",
            (56, 16): "England",
            (56, 17): "4",
            (56, 18): "5",
            (57, 13): "Switzerland",
            (57, 14): "2",
            (57, 15): "0",
            (57, 16): "Colombia",
            (58, 13): "Egypt",
            (58, 14): "1",
            (58, 15): "3",
            (58, 16): "Argentina",
        }

        matches = build_knockout_predictions.extract_predictions(
            cells,
            default_stage="round_of_16",
        )

        self.assertEqual([match["matchId"] for match in matches], [str(match_id) for match_id in range(89, 97)])
        self.assertEqual(matches[0]["homeTeam"], "Paraguay")
        self.assertEqual(matches[0]["awayTeam"], "France")
        self.assertEqual(matches[0]["predictedAdvancingTeam"], "France")
        self.assertEqual(matches[1]["homeTeam"], "Canada")
        self.assertEqual(matches[1]["awayTeam"], "Morroco")
        self.assertEqual(matches[1]["predictedAdvancingTeam"], "Morroco")
        self.assertEqual(matches[5]["matchId"], "94")
        self.assertEqual(matches[5]["predictedAdvancingTeam"], "Belgium")
        self.assertEqual(matches[5]["awayPenaltyScore"], 4)

    def test_extracts_round_of_32_bonus_answers_from_visual_layout(self):
        cells = {
            (36, 13): "Bonus questions",
            (37, 13): "How many matches will go to extra time?",
            (37, 17): "5 - 8",
            (38, 13): "How many matches will be decided by penalties?",
            (38, 17): "0 - 4",
        }

        answers = build_knockout_predictions.extract_bonus_answers(
            cells,
            ignored_cells={(38, 17)},
        )

        self.assertEqual(
            answers,
            {
                "round_of_32": [
                    {
                        "question": "How many matches will go to extra time?",
                        "answer": "5 - 8",
                    },
                    {
                        "question": "How many matches will be decided by penalties?",
                        "answer": "",
                        "ignored": True,
                    },
                ]
            },
        )

    def test_normalizes_latest_goal_bonus_question_label(self):
        cells = {
            (36, 13): "Bonus questions",
            (37, 13): "Which team will score the latest goal (including extra time)?",
            (37, 17): "Ecuador",
        }

        answers = build_knockout_predictions.extract_bonus_answers(cells)

        self.assertEqual(
            answers,
            {
                "round_of_32": [
                    {
                        "question": "Which team will score the latest goal?",
                        "answer": "Ecuador",
                    },
                ]
            },
        )

    def test_extracts_bonus_answers_for_each_visual_stage(self):
        cells = {
            (18, 13): "Round of 32",
            (36, 13): "Bonus questions",
            (37, 13): "How many matches will go to extra time?",
            (37, 17): "5 - 8",
            (63, 13): "Quarter finals",
            (69, 13): "Bonus questions ( ? points each )",
            (70, 13): "How many matches will go to extra time?",
            (70, 17): "2",
            (71, 13): "Which team will score the most goals?",
            (71, 17): "Spain",
        }

        answers = build_knockout_predictions.extract_bonus_answers(cells)

        self.assertEqual(
            answers,
            {
                "round_of_32": [
                    {
                        "question": "How many matches will go to extra time?",
                        "answer": "5 - 8",
                    },
                ],
                "quarterfinal": [
                    {
                        "question": "How many matches will go to extra time?",
                        "answer": "2",
                    },
                    {
                        "question": "Which team will score the most goals?",
                        "answer": "Spain",
                    },
                ],
            },
        )

    def test_extracts_hyphenated_semifinal_layout_and_bonus_answers(self):
        cells = {
            (7, 3): "Semi final",
            (8, 3): "Unrelated future answer",
            (8, 6): "4",
            (9, 3): "Quarter final",
            (9, 6): "4",
            (83, 13): "Semi-finals2",
            (83, 17): "Penalty",
            (84, 13): "France",
            (84, 14): "2",
            (84, 15): "1",
            (84, 16): "Spain",
            (85, 13): "England",
            (85, 14): "1",
            (85, 15): "1",
            (85, 16): "Argentina",
            (85, 17): "4",
            (85, 18): "3",
            (87, 13): "Bonus questions ( ? points each )",
            (88, 13): "How many matches will go to extra time?",
            (88, 17): "1",
            (89, 13): "Total goals scored in the QF (no penalties)",
            (89, 17): "4 - 5",
        }

        matches = build_knockout_predictions.extract_predictions(
            cells,
            default_stage="semifinal",
        )
        answers = build_knockout_predictions.extract_bonus_answers(cells)

        self.assertEqual([match["matchId"] for match in matches], ["101", "102"])
        self.assertEqual(matches[0]["predictedAdvancingTeam"], "France")
        self.assertEqual(matches[1]["predictedAdvancingTeam"], "England")
        self.assertEqual(
            answers["semifinal"],
            [
                {"question": "How many matches will go to extra time?", "answer": "1"},
                {"question": "Total goals scored in the SF (no penalties)", "answer": "4 - 5"},
            ],
        )

    def test_extracts_visual_finals_layout_as_third_place_and_final(self):
        cells = {
            (101, 13): "Finals",
            (101, 17): "Penalty",
            (102, 13): "France",
            (102, 14): "2",
            (102, 15): "1",
            (102, 16): "England",
            (103, 13): "Spain",
            (103, 14): "1",
            (103, 15): "1",
            (103, 16): "Argentina",
            (103, 17): "4",
            (103, 18): "3",
            (105, 13): "How many goals will be scored in the Final?",
            (105, 17): "3",
            (106, 13): "Which player will score the first goal in the Final?",
            (106, 17): "Mbappe",
        }

        matches = build_knockout_predictions.extract_predictions(cells, default_stage="final")

        self.assertEqual([match["matchId"] for match in matches], ["103", "104"])
        self.assertEqual([match["stage"] for match in matches], ["third_place_match", "final"])
        self.assertEqual(matches[0]["homeTeam"], "France")
        self.assertEqual(matches[0]["awayTeam"], "England")
        self.assertEqual(matches[0]["predictedAdvancingTeam"], "France")
        self.assertEqual(matches[1]["homeTeam"], "Spain")
        self.assertEqual(matches[1]["awayTeam"], "Argentina")
        self.assertEqual(matches[1]["predictedAdvancingTeam"], "Spain")
        self.assertEqual(
            build_knockout_predictions.extract_bonus_answers(cells)["final"],
            [
                {"question": "How many goals will be scored in the Final?", "answer": "3"},
                {"question": "Which player will score the first goal in the Final?", "answer": "Mbappe"},
            ],
        )

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

    def test_validation_reports_incomplete_visual_predictions(self):
        matches = [
            {
                "matchId": "73",
                "stage": "round_of_32",
                "mode": "score",
                "homeTeam": "Germany",
                "awayTeam": "Paraguay",
            }
        ]

        validation = build_knockout_predictions.validate_predictions(matches)

        self.assertFalse(validation["complete"])
        self.assertEqual(validation["incompleteMatchIds"], ["73"])

    def test_reviewed_amal_and_irina_quarterfinal_predictions_are_preserved(self):
        workbook_data = build_knockout_predictions.build_knockout_data(
            {"quarterfinal": build_knockout_predictions.QUARTERFINAL_FALLBACK_PATH}
        )
        browser_text = (ROOT / "data/generated/knockout_predictions.js").read_text(
            encoding="utf-8"
        )
        browser_data = json.loads(
            browser_text.removeprefix("window.KNOCKOUT_PREDICTIONS = ").removesuffix(
                ";\n"
            )
        )

        for source_name, data in (
            ("quarterfinal workbook", workbook_data),
            ("generated browser payload", browser_data),
        ):
            players = {player["name"]: player for player in data["players"]}
            for player_name, expected in self.REVIEWED_QUARTERFINAL_PREDICTIONS.items():
                with self.subTest(source=source_name, player=player_name):
                    player = players[player_name]
                    matches = [
                        match
                        for match in player["matches"]
                        if match["stage"] == "quarterfinal"
                    ]
                    actual_matches = [
                        (
                            match["matchId"],
                            match.get("homeScore"),
                            match.get("awayScore"),
                            match.get("predictedAdvancingTeam"),
                        )
                        for match in matches
                    ]
                    actual_bonus_answers = [
                        answer["answer"]
                        for answer in player["bonusAnswers"]["quarterfinal"]
                    ]

                    self.assertEqual(actual_matches, expected["matches"])
                    self.assertEqual(
                        actual_bonus_answers,
                        expected["bonus_answers"],
                    )


if __name__ == "__main__":
    unittest.main()
