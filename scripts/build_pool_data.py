#!/usr/bin/env python3
"""Extract World Cup pool entries from the XLSX workbook into browser data."""

from __future__ import annotations

import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK_PATH = ROOT / "data" / "raw" / "group_stage_and_future_predictions.xlsx"
OUTPUT_PATH = ROOT / "data" / "generated" / "pool_data.js"

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"a": MAIN_NS, "r": REL_NS, "pr": PACKAGE_REL_NS}

FUTURE_ROWS = {
    "name": 3,
    "champion": 4,
    "runner_up": 5,
    "favorite_team": 6,
    "favorite_team_round": 7,
    "top_scorer": 8,
    "ecuador_round": 9,
}

FUTURE_LABELS = {
    "name": "Name",
    "champion": "Winner team",
    "runner_up": "Runner-up",
    "favorite_team": "Favorite team",
    "favorite_team_round": "Favorite team last round",
    "top_scorer": "Top scorer",
    "ecuador_round": "Ecuador last round",
}

GRID_COLUMNS = range(2, 9)
GRID_ROWS = range(11, 31)
BEST_THIRD_ROWS = range(28, 31)
BEST_THIRD_PAIRS = ((3, 4), (5, 6), (7, 8))
COUNTRY_ALIASES = {
    "bosnia": "Bosnia-Herzegovina",
    "bosnia and herzegovina": "Bosnia-Herzegovina",
    "bosnia-herzegovina": "Bosnia-Herzegovina",
    "congo dr": "Congo DR",
    "democratic republic of congo": "Congo DR",
    "democratic republic of the congo": "Congo DR",
    "dr congo": "Congo DR",
    "czech republic": "Czechia",
    "czechia": "Czechia",
    "turkey": "Türkiye",
    "turkiye": "Türkiye",
    "türkiye": "Türkiye",
}


def main() -> None:
    workbook = read_workbook(WORKBOOK_PATH)
    players = []

    for sheet in workbook["sheets"]:
        if sheet["name"] == "TemplateResults":
            continue
        futures = extract_futures(sheet["cells"], sheet["name"])
        players.append(
            {
                "sheet": sheet["name"],
                "name": futures["name"]["value"] or sheet["name"],
                "futures": futures,
                "first_round_grid": extract_first_round_grid(sheet["cells"]),
                "best_thirds": extract_best_thirds(sheet["cells"]),
            }
        )

    data = {
        "source_file": str(WORKBOOK_PATH.relative_to(ROOT)),
        "generated_from": WORKBOOK_PATH.name,
        "players": players,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    OUTPUT_PATH.write_text(f"window.POOL_DATA = {payload};\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} with {len(players)} players")


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


def clean_text(value: object) -> str:
    text = str(value).replace("\r", "\n")
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def normalize_country(value: object) -> str:
    text = clean_text(value)
    return COUNTRY_ALIASES.get(text.lower(), text)


def extract_futures(cells: dict[tuple[int, int], str], sheet_name: str) -> dict[str, dict[str, str]]:
    futures = {}
    for key, row in FUTURE_ROWS.items():
        value = cells.get((row, 3), "")
        if key == "name" and not value:
            value = sheet_name
        if key in {"champion", "runner_up", "favorite_team"}:
            value = normalize_country(value)
        futures[key] = {
            "label": FUTURE_LABELS[key],
            "value": value,
        }
    return futures


def extract_first_round_grid(cells: dict[tuple[int, int], str]) -> list[dict[str, object]]:
    rows = []
    for row in GRID_ROWS:
        values = [normalize_country(cells.get((row, column), "")) for column in GRID_COLUMNS]
        if any(values):
            rows.append({"row": row, "cells": values})
    return rows


def extract_best_thirds(cells: dict[tuple[int, int], str]) -> list[dict[str, str]]:
    picks = []
    for row in BEST_THIRD_ROWS:
        for rank_column, team_column in BEST_THIRD_PAIRS:
            rank = cells.get((row, rank_column), "")
            team = normalize_country(cells.get((row, team_column), ""))
            if rank or team:
                picks.append({"rank": rank, "team": team})
    return picks


if __name__ == "__main__":
    main()
