"""Shared official-results ranking helpers."""

from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Any, Callable


GROUP_IDS = tuple("ABCDEFGHIJKL")
QUALIFYING_THIRD_PLACE_COUNT = 8
FAIR_PLAY_KEYS = (
    "fairPlayPoints",
    "yellowCards",
    "indirectRedCards",
    "directRedCards",
    "yellowDirectRedCards",
)
TEAM_NAME_ALIASES = {
    "Bosnia": "Bosnia-Herzegovina",
    "Bosnia and Herzegovina": "Bosnia-Herzegovina",
    "Democratic Republic of Congo": "Congo DR",
    "Democratic Republic of the Congo": "Congo DR",
    "DR Congo": "Congo DR",
    "Czech Republic": "Czechia",
    "Turkey": "Türkiye",
    "Turkiye": "Türkiye",
    "Tutkey": "Türkiye",
}


def canonical_team_name(name: str) -> str:
    return TEAM_NAME_ALIASES.get(name, name)


def int_value(value: Any) -> int:
    if value in (None, ""):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def read_manual_adjustments(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"teams": {}, "groupOrder": {}}

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object")

    teams = payload.get("teams", {})
    if not isinstance(teams, dict):
        raise ValueError(f"{path} must contain a teams object")

    group_order = payload.get("groupOrder", payload.get("group_order", {}))
    if not isinstance(group_order, dict):
        raise ValueError(f"{path} groupOrder must be an object")

    return {
        "teams": normalize_manual_team_values(teams),
        "groupOrder": normalize_group_order(group_order),
    }


def normalize_manual_team_values(teams: dict[str, Any]) -> dict[str, dict[str, int]]:
    manual_values = {}
    for team_name, values in teams.items():
        if not isinstance(team_name, str) or not team_name.strip():
            continue
        if not isinstance(values, dict):
            raise ValueError(f"manual data for {team_name!r} must be an object")

        normalized_values = {}
        for key in FAIR_PLAY_KEYS:
            if key in values and values[key] not in (None, ""):
                normalized_values[key] = int_value(values[key])
        if normalized_values:
            manual_values[canonical_team_name(team_name.strip())] = normalized_values
    return manual_values


def normalize_group_order(group_order: dict[str, Any]) -> dict[str, list[str]]:
    normalized = {}
    for group_id, teams in group_order.items():
        group_key = str(group_id).strip().upper()
        if group_key.startswith("GROUP ") and len(group_key) >= 7:
            group_key = group_key[-1]
        if group_key not in GROUP_IDS:
            raise ValueError(f"unsupported groupOrder key {group_id!r}")
        if not isinstance(teams, list):
            raise ValueError(f"groupOrder for group {group_key} must be a list")
        normalized[group_key] = [
            canonical_team_name(team.strip())
            for team in teams
            if isinstance(team, str) and team.strip()
        ]
    return normalized


def apply_manual_adjustments(
    official_results: dict[str, Any],
    manual_adjustments: dict[str, Any],
) -> None:
    manual_team_values = manual_adjustments.get("teams", {})
    manual_group_order = manual_adjustments.get("groupOrder", {})
    if not manual_team_values and not manual_group_order:
        return

    standings = official_results.get("provisionalGroupStandings", {})
    if isinstance(standings, dict):
        for group_id, rows in standings.items():
            if isinstance(rows, list):
                apply_manual_team_values_to_rows(rows, manual_team_values)
                apply_manual_group_order_to_rows(rows, manual_group_order.get(group_id, []))

    overall_standings = official_results.get("overallStandings", [])
    if isinstance(overall_standings, list):
        apply_manual_team_values_to_rows(overall_standings, manual_team_values)


def apply_manual_team_values_to_rows(
    rows: list[dict[str, Any]],
    manual_team_values: dict[str, dict[str, int]],
) -> None:
    if not manual_team_values:
        return
    for row in rows:
        if isinstance(row, dict):
            row.update(manual_team_values.get(row.get("team", ""), {}))


def apply_manual_group_order_to_rows(rows: list[dict[str, Any]], order: list[str]) -> None:
    if not order:
        return

    order_lookup = {team: index for index, team in enumerate(order)}
    rows.sort(
        key=lambda row: (
            order_lookup.get(row.get("team", ""), len(order_lookup)),
            int_value(row.get("position")) or 999,
            -int_value(row.get("points")),
            -int_value(row.get("goalDifference")),
            -int_value(row.get("goalsFor")),
            row.get("team", ""),
        )
    )
    for position, row in enumerate(rows, start=1):
        row["position"] = position


def normalize_group_rows(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    return sorted(
        [row for row in rows if isinstance(row, dict) and row.get("team")],
        key=lambda row: (
            int_value(row.get("position")) or 999,
            -int_value(row.get("points")),
            -int_value(row.get("goalDifference")),
            -int_value(row.get("goalsFor")),
            row.get("team", ""),
        ),
    )


def ranked_best_thirds(
    standings: dict[str, Any],
    *,
    qualifying_count: int = QUALIFYING_THIRD_PLACE_COUNT,
) -> list[str]:
    thirds = []
    for group_index, group_id in enumerate(GROUP_IDS):
        rows = normalize_group_rows(standings.get(group_id, []))
        if len(rows) >= 3:
            thirds.append({**rows[2], "_groupIndex": group_index})

    return [
        row["team"]
        for row in sorted(thirds, key=functools.cmp_to_key(compare_third_places))[
            :qualifying_count
        ]
    ]


def fair_play_points(row: dict[str, Any]) -> int:
    if "fairPlayPoints" in row:
        return int_value(row.get("fairPlayPoints"))
    return (
        -1 * int_value(row.get("yellowCards"))
        -3
        * int_value(
            row.get("indirectRedCards")
            if row.get("indirectRedCards") is not None
            else row.get("secondYellowRedCards", row.get("secondYellowCards"))
        )
        -4 * int_value(row.get("directRedCards", row.get("redCards")))
        -5 * int_value(row.get("yellowDirectRedCards", row.get("yellowRedCards")))
    )


def compare_third_places(left: dict[str, Any], right: dict[str, Any]) -> int:
    return (
        int_value(right.get("points")) - int_value(left.get("points"))
        or int_value(right.get("goalDifference")) - int_value(left.get("goalDifference"))
        or int_value(right.get("goalsFor")) - int_value(left.get("goalsFor"))
        or fair_play_points(right) - fair_play_points(left)
        or compare_lots(left, right)
        or int_value(left.get("_groupIndex")) - int_value(right.get("_groupIndex"))
    )


def compare_lots(left: dict[str, Any], right: dict[str, Any]) -> int:
    left_lots = lots_order(left)
    right_lots = lots_order(right)
    if left_lots is None or right_lots is None:
        return 0
    return left_lots - right_lots


def lots_order(row: dict[str, Any]) -> int | None:
    for key in ("lotsOrder", "lotOrder", "drawingLotsOrder", "lotsRank", "lotRank"):
        value = row.get(key)
        if value not in (None, ""):
            return int_value(value)
    return None


def group_sort_key(
    row: dict[str, Any],
    fifa_ranking: Callable[[str], int],
) -> tuple[int, int, int, int, int, str]:
    return (
        -int_value(row.get("points")),
        -int_value(row.get("goalDifference")),
        -int_value(row.get("goalsFor")),
        -fair_play_points(row),
        fifa_ranking(row.get("team", "")),
        row.get("team", ""),
    )
