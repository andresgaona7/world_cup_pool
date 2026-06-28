#!/usr/bin/env python3
"""Extract knockout predictions from an XLSX workbook into browser data."""

from __future__ import annotations

import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "knockout_predictions"
OUTPUT_PATH = ROOT / "data" / "generated" / "knockout_predictions.js"

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"a": MAIN_NS, "r": REL_NS, "pr": PACKAGE_REL_NS}

STAGE_MATCH_IDS = {
    "round_of_32": tuple(str(match_id) for match_id in range(73, 89)),
    "round_of_16": tuple(str(match_id) for match_id in range(89, 97)),
    "quarterfinal": ("97", "98", "99", "100"),
    "semifinal": ("101", "102"),
    "final": ("104",),
}

STAGE_LABELS = {
    "round_of_32": "Round of 32",
    "round_of_16": "Round of 16",
    "quarterfinal": "Quarterfinals",
    "semifinal": "Semifinals",
    "final": "Final",
}

WORKBOOK_PATHS = {
    "round_of_32": RAW_DIR / "round_of_32.xlsx",
    "round_of_16": RAW_DIR / "round_of_16.xlsx",
    "quarterfinal": RAW_DIR / "quarterfinals.xlsx",
    "semifinal": RAW_DIR / "semifinals.xlsx",
    "final": RAW_DIR / "final.xlsx",
}

STAGE_ALIASES = {
    "round of 32": "round_of_32",
    "round 32": "round_of_32",
    "r32": "round_of_32",
    "round of 16": "round_of_16",
    "round 16": "round_of_16",
    "r16": "round_of_16",
    "quarterfinal": "quarterfinal",
    "quarterfinals": "quarterfinal",
    "quarter final": "quarterfinal",
    "quarter finals": "quarterfinal",
    "quaterfinal": "quarterfinal",
    "quaterfinals": "quarterfinal",
    "semifinal": "semifinal",
    "semifinals": "semifinal",
    "semi final": "semifinal",
    "semi finals": "semifinal",
    "final": "final",
}

HEADER_ALIASES = {
    "match_id": {"match", "match id", "match_id", "match number", "match no"},
    "mode": {"mode", "prediction mode"},
    "home_score": {"home score", "home_score", "score home"},
    "away_score": {"away score", "away_score", "score away"},
    "predicted_advancing_team": {
        "advancing team",
        "advancing",
        "predicted advancing team",
        "prediction",
        "winner",
        "predicted winner",
    },
}


def main() -> None:
    data = build_knockout_data(WORKBOOK_PATHS)
    write_browser_data(OUTPUT_PATH, data)
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} with {len(data['players'])} players")


def build_knockout_data(paths: dict[str, Path] | Path) -> dict[str, object]:
    if isinstance(paths, Path):
        paths = {"": paths}

    source_files = source_file_metadata(paths)
    if not any(path.exists() for path in paths.values()):
        return {
            "source_files": source_files,
            "generated_from": [],
            "sourceName": "Generated knockout predictions",
            "stages": stage_metadata(),
            "players": [],
        }

    players_by_name: dict[str, dict[str, object]] = {}
    for stage, path in paths.items():
        if not path.exists():
            continue

        workbook = read_workbook(path)
        for sheet in workbook["sheets"]:
            matches = extract_predictions(sheet["cells"], default_stage=stage)
            if not matches:
                continue

            name = player_name(sheet["cells"], sheet["name"])
            player = players_by_name.setdefault(
                name,
                {
                    "name": name,
                    "sheets": {},
                    "matches": [],
                },
            )
            player["sheets"][stage or "unknown"] = sheet["name"]
            player["matches"].extend(matches)

    players = []
    for player in players_by_name.values():
        matches = sorted(
            player["matches"],
            key=lambda match: match_sort_key(str(match.get("matchId", ""))),
        )
        players.append(
            {
                "name": player["name"],
                "sheets": player["sheets"],
                "matches": matches,
                "validation": validate_predictions(matches),
            }
        )

    return {
        "source_files": source_files,
        "generated_from": [
            display_path(path) for path in paths.values() if path.exists()
        ],
        "sourceName": "Generated knockout predictions",
        "stages": stage_metadata(),
        "players": sorted(players, key=lambda player: str(player["name"]).lower()),
    }


def write_browser_data(path: Path, data: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(f"window.KNOCKOUT_PREDICTIONS = {payload};\n", encoding="utf-8")


def read_workbook(path: Path) -> dict[str, object]:
    with ZipFile(path) as archive:
        shared_strings = read_shared_strings(archive)
        sheet_paths = read_sheet_paths(archive)
        sheets = []
        for sheet_name, sheet_path in sheet_paths:
            cells = read_cells(archive, sheet_path, shared_strings)
            sheets.append({"name": sheet_name, "cells": cells})
    return {"sheets": sheets}


def read_shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings = []
    for item in root.findall("a:si", NS):
        text = "".join(part.text or "" for part in item.findall(".//a:t", NS))
        strings.append(text)
    return strings


def read_sheet_paths(archive: ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    relation_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("pr:Relationship", NS)
    }

    paths = []
    for sheet in workbook.findall("a:sheets/a:sheet", NS):
        rel_id = sheet.attrib[f"{{{REL_NS}}}id"]
        target = relation_targets[rel_id]
        if not target.startswith("xl/"):
            target = f"xl/{target.lstrip('/')}"
        paths.append((sheet.attrib["name"], target))
    return paths


def read_cells(
    archive: ZipFile, sheet_path: str, shared_strings: list[str]
) -> dict[tuple[int, int], str]:
    root = ET.fromstring(archive.read(sheet_path))
    cells = {}
    for row in root.findall("a:sheetData/a:row", NS):
        row_number = int(row.attrib["r"])
        for cell in row.findall("a:c", NS):
            column_number = column_index(cell.attrib["r"])
            value = cell_value(cell, shared_strings)
            if value != "":
                cells[(row_number, column_number)] = value
    return cells


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return clean_text("".join(part.text or "" for part in cell.findall(".//a:t", NS)))

    value_node = cell.find("a:v", NS)
    if value_node is None or value_node.text is None:
        return ""

    raw_value = value_node.text
    if cell_type == "s" and raw_value.isdigit():
        index = int(raw_value)
        if index < len(shared_strings):
            return clean_text(shared_strings[index])
    return clean_text(raw_value)


def column_index(cell_reference: str) -> int:
    letters = re.sub(r"[^A-Za-z]", "", cell_reference)
    index = 0
    for letter in letters.upper():
        index = index * 26 + ord(letter) - ord("A") + 1
    return index


def player_name(cells: dict[tuple[int, int], str], sheet_name: str) -> str:
    for row in range(1, 8):
        for column in range(1, 5):
            label = normalize_header(cells.get((row, column), ""))
            if label == "name":
                return clean_text(cells.get((row, column + 1), "")) or sheet_name
    return sheet_name


def extract_predictions(
    cells: dict[tuple[int, int], str],
    default_stage: str = "",
) -> list[dict[str, object]]:
    sections = find_prediction_sections(cells, default_stage)
    if not sections:
        return []

    predictions = []
    for section in sections:
        predictions.extend(extract_section_predictions(cells, section))

    return predictions


def extract_section_predictions(
    cells: dict[tuple[int, int], str],
    section: dict[str, object],
) -> list[dict[str, object]]:
    columns = section["columns"]
    stage = section["stage"]
    start_row = int(section["header_row"]) + 1
    end_row = int(section["end_row"])
    fallback_match_ids = list(STAGE_MATCH_IDS.get(stage, ()))
    fallback_index = 0
    predictions = []

    for row in range(start_row, end_row + 1):
        row_values = {
            key: clean_text(cells.get((row, column), ""))
            for key, column in columns.items()
        }
        if not any(row_values.values()):
            continue

        advancing_team = row_values.get("predicted_advancing_team", "")
        if not advancing_team:
            continue

        match_id = match_identifier(row_values.get("match_id", ""))
        if not match_id and fallback_index < len(fallback_match_ids):
            match_id = fallback_match_ids[fallback_index]
        fallback_index += 1

        if not match_id:
            continue

        prediction = {
            "matchId": match_id,
            "stage": stage,
            "mode": normalize_mode(row_values.get("mode", "")),
            "predictedAdvancingTeam": advancing_team,
        }
        home_score = optional_int(row_values.get("home_score", ""))
        away_score = optional_int(row_values.get("away_score", ""))
        if home_score is not None:
            prediction["homeScore"] = home_score
        if away_score is not None:
            prediction["awayScore"] = away_score
        predictions.append(prediction)

    return predictions


def find_prediction_sections(
    cells: dict[tuple[int, int], str],
    default_stage: str = "",
) -> list[dict[str, object]]:
    max_row = max((row for row, _column in cells), default=0)
    max_column = max((column for _row, column in cells), default=0)
    stage_by_row = stage_headings(cells, max_row, max_column)
    sections = []

    for row in range(1, max_row + 1):
        columns = {}
        for column in range(1, max_column + 1):
            key = canonical_header(cells.get((row, column), ""))
            if key:
                columns[key] = column
        if "predicted_advancing_team" not in columns:
            continue

        stage = (
            nearest_stage(row, stage_by_row)
            or stage_from_match_column(cells, row, columns)
            or default_stage
        )
        if not stage:
            continue

        sections.append(
            {
                "stage": stage,
                "header_row": row,
                "end_row": next_section_start(row, max_row, stage_by_row) - 1,
                "columns": columns,
            }
        )
    return sections


def stage_headings(
    cells: dict[tuple[int, int], str],
    max_row: int,
    max_column: int,
) -> dict[int, str]:
    headings = {}
    for row in range(1, max_row + 1):
        for column in range(1, max_column + 1):
            stage = normalize_stage(cells.get((row, column), ""))
            if stage:
                headings[row] = stage
                break
    return headings


def nearest_stage(row: int, stage_by_row: dict[int, str]) -> str:
    previous_rows = [stage_row for stage_row in stage_by_row if stage_row < row]
    if not previous_rows:
        return ""
    return stage_by_row[max(previous_rows)]


def next_section_start(row: int, max_row: int, stage_by_row: dict[int, str]) -> int:
    later_stage_rows = [stage_row for stage_row in stage_by_row if stage_row > row]
    if not later_stage_rows:
        return max_row + 1
    return min(later_stage_rows)


def stage_from_match_column(
    cells: dict[tuple[int, int], str],
    header_row: int,
    columns: dict[str, int],
) -> str:
    match_column = columns.get("match_id")
    if not match_column:
        return ""

    for row in range(header_row + 1, header_row + 8):
        stage = stage_for_match_id(match_identifier(cells.get((row, match_column), "")))
        if stage:
            return stage
    return ""


def stage_for_match_id(match_id: str) -> str:
    for stage, match_ids in STAGE_MATCH_IDS.items():
        if match_id in match_ids:
            return stage
    return ""


def validate_predictions(matches: list[dict[str, object]]) -> dict[str, object]:
    counts = {stage: 0 for stage in STAGE_MATCH_IDS}
    duplicate_match_ids = []
    seen_match_ids = set()

    for match in matches:
        stage = str(match.get("stage", ""))
        if stage in counts:
            counts[stage] += 1
        match_id = str(match.get("matchId", ""))
        if match_id in seen_match_ids:
            duplicate_match_ids.append(match_id)
        seen_match_ids.add(match_id)

    expected_counts = {
        stage: len(match_ids) for stage, match_ids in STAGE_MATCH_IDS.items()
    }
    missing_counts = {
        stage: expected_counts[stage] - counts.get(stage, 0)
        for stage in expected_counts
        if counts.get(stage, 0) != expected_counts[stage]
    }

    return {
        "complete": not missing_counts and not duplicate_match_ids,
        "expectedMatchCount": sum(expected_counts.values()),
        "matchCount": len(matches),
        "stageCounts": counts,
        "missingOrExtraByStage": missing_counts,
        "duplicateMatchIds": duplicate_match_ids,
    }


def stage_metadata() -> list[dict[str, object]]:
    return [
        {
            "stage": stage,
            "label": STAGE_LABELS[stage],
            "matchIds": list(match_ids),
            "expectedMatchCount": len(match_ids),
        }
        for stage, match_ids in STAGE_MATCH_IDS.items()
    ]


def source_file_metadata(paths: dict[str, Path]) -> list[dict[str, object]]:
    return [
        {
            "stage": stage,
            "label": STAGE_LABELS.get(stage, "Knockout"),
            "path": display_path(path),
            "available": path.exists(),
        }
        for stage, path in paths.items()
    ]


def match_sort_key(match_id: str) -> tuple[int, str]:
    if re.fullmatch(r"\d+", match_id):
        return int(match_id), match_id
    return 9999, match_id


def canonical_header(value: object) -> str:
    header = normalize_header(value)
    for key, aliases in HEADER_ALIASES.items():
        if header in aliases:
            return key
    return ""


def normalize_header(value: object) -> str:
    return re.sub(r"\s+", " ", clean_text(value).replace("_", " ")).lower()


def normalize_stage(value: object) -> str:
    text = normalize_header(value)
    return STAGE_ALIASES.get(text, "")


def normalize_mode(value: object) -> str:
    return "score"


def match_identifier(value: object) -> str:
    text = clean_text(value)
    if re.fullmatch(r"\d+(?:\.0)?", text):
        return str(int(float(text)))
    return text


def optional_int(value: object) -> int | None:
    text = clean_text(value)
    if not text:
        return None
    if re.fullmatch(r"-?\d+(?:\.0)?", text):
        return int(float(text))
    return None


def clean_text(value: object) -> str:
    text = str(value).replace("\r", "\n")
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    main()
