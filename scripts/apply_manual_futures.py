#!/usr/bin/env python3
"""Apply manually entered official data to generated official results."""

from __future__ import annotations

import argparse
import functools
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANUAL_FUTURES_PATH = ROOT / "data" / "manual" / "official_futures.json"
DEFAULT_MANUAL_FAIR_PLAY_PATH = ROOT / "data" / "manual" / "official_fair_play.json"
DEFAULT_OFFICIAL_RESULTS_PATH = ROOT / "data" / "generated" / "official_results.js"
OFFICIAL_RESULTS_RE = re.compile(
    r"^\s*window\.OFFICIAL_RESULTS\s*=\s*(?P<payload>\{.*\})\s*;\s*$",
    re.DOTALL,
)
FUTURES_KEYS = ("champion", "runnerUp", "topScorer")
GROUP_IDS = tuple("ABCDEFGHIJKL")
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
ROUND_KEYS = {
    "",
    "group_stage",
    "round_of_32",
    "round_of_16",
    "quarterfinal",
    "semifinal",
    "third_place_match",
    "runner_up",
    "champion",
}


def main() -> None:
    args = parse_args()
    apply_manual_futures(
        manual_futures_path=args.manual_futures,
        manual_fair_play_path=args.manual_fair_play,
        official_results_path=args.official_results,
        verbose=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Merge manually entered official futures and fair-play data into "
            "data/generated/official_results.js."
        )
    )
    parser.add_argument(
        "--manual-futures",
        type=Path,
        default=DEFAULT_MANUAL_FUTURES_PATH,
        help=(
            "Path to the manual futures JSON file. "
            f"Defaults to {DEFAULT_MANUAL_FUTURES_PATH.relative_to(ROOT)}."
        ),
    )
    parser.add_argument(
        "--manual-fair-play",
        type=Path,
        default=DEFAULT_MANUAL_FAIR_PLAY_PATH,
        help=(
            "Path to the manual fair-play JSON file. "
            f"Defaults to {DEFAULT_MANUAL_FAIR_PLAY_PATH.relative_to(ROOT)}."
        ),
    )
    parser.add_argument(
        "--official-results",
        type=Path,
        default=DEFAULT_OFFICIAL_RESULTS_PATH,
        help=(
            "Path to the generated official results JS file. "
            f"Defaults to {DEFAULT_OFFICIAL_RESULTS_PATH.relative_to(ROOT)}."
        ),
    )
    return parser.parse_args()


def apply_manual_futures(
    *,
    manual_futures_path: Path,
    manual_fair_play_path: Path = DEFAULT_MANUAL_FAIR_PLAY_PATH,
    official_results_path: Path,
    verbose: bool = False,
) -> None:
    manual_futures = read_manual_futures(manual_futures_path)
    manual_fair_play = read_manual_fair_play(manual_fair_play_path)
    official_results = read_official_results(official_results_path)
    current_futures = normalize_futures(official_results.get("futures"))

    merged_futures = {
        **current_futures,
        **{key: manual_futures[key] for key in FUTURES_KEYS},
        "teamLastRounds": {
            **current_futures["teamLastRounds"],
            **manual_futures["teamLastRounds"],
        },
    }
    official_results["futures"] = merged_futures
    apply_manual_fair_play(official_results, manual_fair_play)
    update_best_thirds(official_results)

    for checkpoint in official_results.get("timelineCheckpoints", []):
        if not isinstance(checkpoint, dict):
            continue
        scenario = checkpoint.get("scenario")
        if not isinstance(scenario, dict):
            continue
        scenario["futures"] = merged_futures
        update_scenario_best_thirds(scenario, official_results)

    write_official_results(official_results_path, official_results)
    if verbose:
        print(
            f"Applied {display_path(manual_futures_path)} and "
            f"{display_path(manual_fair_play_path)} to "
            f"{display_path(official_results_path)}"
        )


def read_manual_futures(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"manual futures file not found: {path}") from exc

    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object")

    team_last_rounds = payload.get("teamLastRounds", {})
    if not isinstance(team_last_rounds, dict):
        raise ValueError("teamLastRounds must be a JSON object of team names to round keys")

    futures = {
        key: string_value(payload, key)
        for key in FUTURES_KEYS
    }
    futures["teamLastRounds"] = {
        team: normalize_round(round_key, team)
        for team, round_key in team_last_rounds.items()
        if isinstance(team, str) and team.strip()
    }
    return futures


def read_official_results(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"official results file not found: {path}") from exc

    match = OFFICIAL_RESULTS_RE.match(text)
    if not match:
        raise ValueError(f"{path} does not contain a window.OFFICIAL_RESULTS assignment")
    payload = json.loads(match.group("payload"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} did not contain a JSON object")
    return payload


def read_manual_fair_play(path: Path) -> dict[str, dict[str, int]]:
    if not path.exists():
        return {}

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{display_path(path)} must contain a JSON object")

    teams = payload.get("teams", payload)
    if not isinstance(teams, dict):
        raise ValueError(f"{display_path(path)} must contain a teams object")

    manual_fair_play = {}
    for team_name, values in teams.items():
        if not isinstance(team_name, str) or not team_name.strip():
            continue
        if not isinstance(values, dict):
            raise ValueError(f"fair-play data for {team_name!r} must be an object")

        normalized_values = {}
        for key in FAIR_PLAY_KEYS:
            if key in values and values[key] not in (None, ""):
                normalized_values[key] = int_value(values[key])
        if normalized_values:
            manual_fair_play[canonical_team_name(team_name.strip())] = normalized_values

    return manual_fair_play


def apply_manual_fair_play(
    official_results: dict[str, Any],
    manual_fair_play: dict[str, dict[str, int]],
) -> None:
    if not manual_fair_play:
        return

    standings = official_results.get("provisionalGroupStandings", {})
    if isinstance(standings, dict):
        for rows in standings.values():
            if isinstance(rows, list):
                apply_manual_fair_play_to_rows(rows, manual_fair_play)

    overall_standings = official_results.get("overallStandings", [])
    if isinstance(overall_standings, list):
        apply_manual_fair_play_to_rows(overall_standings, manual_fair_play)


def apply_manual_fair_play_to_rows(
    rows: list[dict[str, Any]],
    manual_fair_play: dict[str, dict[str, int]],
) -> None:
    for row in rows:
        if isinstance(row, dict):
            row.update(manual_fair_play.get(row.get("team", ""), {}))


def update_best_thirds(official_results: dict[str, Any]) -> None:
    standings = official_results.get("provisionalGroupStandings", {})
    if not isinstance(standings, dict):
        return

    best_thirds = ranked_best_thirds(standings)
    if best_thirds:
        official_results["bestThirds"] = best_thirds


def update_scenario_best_thirds(
    scenario: dict[str, Any],
    official_results: dict[str, Any],
) -> None:
    standings = official_results.get("provisionalGroupStandings", {})
    if not isinstance(standings, dict):
        return

    best_thirds = ranked_best_thirds(standings)
    if best_thirds:
        scenario["bestThirds"] = best_thirds


def ranked_best_thirds(standings: dict[str, Any]) -> list[str]:
    thirds = []
    for group_index, group_id in enumerate(GROUP_IDS):
        rows = normalize_group_rows(standings.get(group_id, []))
        if len(rows) >= 3:
            thirds.append({**rows[2], "_groupIndex": group_index})

    return [
        row["team"]
        for row in sorted(thirds, key=functools.cmp_to_key(compare_third_places))[:8]
    ]


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


def fair_play_points(row: dict[str, Any]) -> int:
    if "fairPlayPoints" in row:
        return int_value(row.get("fairPlayPoints"))
    return (
        -1 * int_value(row.get("yellowCards"))
        -3 * int_value(row.get("indirectRedCards"))
        -4 * int_value(row.get("directRedCards"))
        -5 * int_value(row.get("yellowDirectRedCards"))
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


def write_official_results(path: Path, official_results: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(official_results, ensure_ascii=False, indent=2)
    path.write_text(f"window.OFFICIAL_RESULTS = {payload};\n", encoding="utf-8")


def normalize_futures(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}
    team_last_rounds = value.get("teamLastRounds", {})
    return {
        "champion": string_value(value, "champion"),
        "runnerUp": string_value(value, "runnerUp"),
        "topScorer": string_value(value, "topScorer"),
        "teamLastRounds": (
            {
                team: round_key
                for team, round_key in team_last_rounds.items()
                if isinstance(team, str) and isinstance(round_key, str)
            }
            if isinstance(team_last_rounds, dict)
            else {}
        ),
    }


def normalize_round(value: Any, team: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"round for {team!r} must be a string")
    round_key = value.strip()
    if round_key not in ROUND_KEYS:
        supported = ", ".join(sorted(key for key in ROUND_KEYS if key))
        raise ValueError(
            f"unsupported round {round_key!r} for {team!r}; expected one of: {supported}"
        )
    return round_key


def string_value(source: dict[str, Any], key: str) -> str:
    value = source.get(key, "")
    return value.strip() if isinstance(value, str) else ""


def canonical_team_name(name: str) -> str:
    return TEAM_NAME_ALIASES.get(name, name)


def int_value(value: Any) -> int:
    if value in (None, ""):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    main()
