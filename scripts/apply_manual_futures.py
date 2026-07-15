#!/usr/bin/env python3
"""Apply manually entered official data to generated official results."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import official_rankings


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
PLAYER_NAME_ALIASES = {
    "k mbappe": "Kylian Mbappe",
    "kylian mbappe": "Kylian Mbappe",
    "kylian mbappe lottin": "Kylian Mbappe",
    "mbappe": "Kylian Mbappe",
    "lionel messi": "Lionel Messi",
    "leo messi": "Lionel Messi",
    "messi": "Lionel Messi",
}
ROUND_KEYS = {
    "",
    "group_stage",
    "round_of_32",
    "round_of_16",
    "quarterfinal",
    "semifinal",
    "final",
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
    manual_adjustments = official_rankings.read_manual_adjustments(manual_fair_play_path)
    official_results = read_official_results(official_results_path)
    current_futures = normalize_futures(official_results.get("futures"))

    merged_futures = {
        **current_futures,
        **{key: manual_futures[key] for key in FUTURES_KEYS},
        "topScorers": manual_futures["topScorers"],
        "teamLastRounds": {
            **current_futures["teamLastRounds"],
            **manual_futures["teamLastRounds"],
        },
    }
    official_results["futures"] = merged_futures
    official_rankings.apply_manual_adjustments(official_results, manual_adjustments)
    has_group_order_overrides = bool(manual_adjustments.get("groupOrder"))
    if has_group_order_overrides:
        update_group_results(official_results)
    update_best_thirds(official_results)

    for checkpoint in official_results.get("timelineCheckpoints", []):
        if not isinstance(checkpoint, dict):
            continue
        scenario = checkpoint.get("scenario")
        if not isinstance(scenario, dict):
            continue
        scenario["futures"] = merged_futures
        if has_group_order_overrides:
            update_scenario_group_results(scenario, official_results)
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
    futures["champion"] = canonical_team_name(futures["champion"])
    futures["runnerUp"] = canonical_team_name(futures["runnerUp"])
    futures["topScorer"] = normalize_player_name(futures["topScorer"])
    futures["topScorers"] = top_scorers(payload)
    if not futures["topScorer"] and futures["topScorers"]:
        futures["topScorer"] = futures["topScorers"][0]
    futures["teamLastRounds"] = {
        canonical_team_name(team): normalize_round(round_key, team)
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
    return official_rankings.read_manual_adjustments(path)["teams"]


def apply_manual_fair_play(
    official_results: dict[str, Any],
    manual_fair_play: dict[str, dict[str, int]],
) -> None:
    official_rankings.apply_manual_adjustments(
        official_results,
        {"teams": manual_fair_play, "groupOrder": {}},
    )


def apply_manual_fair_play_to_rows(
    rows: list[dict[str, Any]],
    manual_fair_play: dict[str, dict[str, int]],
) -> None:
    official_rankings.apply_manual_team_values_to_rows(rows, manual_fair_play)


def update_best_thirds(official_results: dict[str, Any]) -> None:
    standings = official_results.get("provisionalGroupStandings", {})
    if not isinstance(standings, dict):
        return

    best_thirds = ranked_best_thirds(standings)
    if best_thirds:
        official_results["bestThirds"] = best_thirds


def update_group_results(official_results: dict[str, Any]) -> None:
    standings = official_results.get("provisionalGroupStandings", {})
    if not isinstance(standings, dict):
        return

    official_results["groupResults"] = group_results_from_standings(standings)


def update_scenario_group_results(
    scenario: dict[str, Any],
    official_results: dict[str, Any],
) -> None:
    standings = official_results.get("provisionalGroupStandings", {})
    if not isinstance(standings, dict):
        return

    scenario["groupResults"] = group_results_from_standings(standings)


def group_results_from_standings(standings: dict[str, Any]) -> dict[str, list[str]]:
    return {
        group_id: [
            row["team"]
            for row in official_rankings.normalize_group_rows(standings.get(group_id, []))[:3]
        ]
        for group_id in GROUP_IDS
    }


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
    return official_rankings.ranked_best_thirds(standings)


def normalize_group_rows(rows: Any) -> list[dict[str, Any]]:
    return official_rankings.normalize_group_rows(rows)


def fair_play_points(row: dict[str, Any]) -> int:
    return official_rankings.fair_play_points(row)


def compare_third_places(left: dict[str, Any], right: dict[str, Any]) -> int:
    return official_rankings.compare_third_places(left, right)


def compare_lots(left: dict[str, Any], right: dict[str, Any]) -> int:
    return official_rankings.compare_lots(left, right)


def lots_order(row: dict[str, Any]) -> int | None:
    return official_rankings.lots_order(row)


def write_official_results(path: Path, official_results: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(official_results, ensure_ascii=False, indent=2)
    path.write_text(f"window.OFFICIAL_RESULTS = {payload};\n", encoding="utf-8")


def normalize_futures(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}
    team_last_rounds = value.get("teamLastRounds", {})
    futures = {
        "champion": canonical_team_name(string_value(value, "champion")),
        "runnerUp": canonical_team_name(string_value(value, "runnerUp")),
        "topScorer": normalize_player_name(string_value(value, "topScorer")),
        "topScorers": top_scorers(value),
        "teamLastRounds": (
            {
                canonical_team_name(team): round_key
                for team, round_key in team_last_rounds.items()
                if isinstance(team, str) and isinstance(round_key, str)
            }
            if isinstance(team_last_rounds, dict)
            else {}
        ),
    }
    if not futures["topScorer"] and futures["topScorers"]:
        futures["topScorer"] = futures["topScorers"][0]
    return futures


def top_scorers(source: dict[str, Any]) -> list[str]:
    value = source.get("topScorers")
    if isinstance(value, list):
        scorers = [
            normalize_player_name(scorer)
            for scorer in value
            if normalize_player_name(scorer)
        ]
    else:
        scorers = []
    fallback = normalize_player_name(string_value(source, "topScorer"))
    if fallback and fallback not in scorers:
        scorers.insert(0, fallback)
    return scorers


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
    name = clean_name(name)
    if not name:
        return ""
    aliases = {normalization_key(alias): canonical for alias, canonical in TEAM_NAME_ALIASES.items()}
    return aliases.get(normalization_key(name), TEAM_NAME_ALIASES.get(name, name))


def normalize_player_name(name: Any) -> str:
    cleaned = player_name_text(name)
    if not cleaned:
        return ""
    return PLAYER_NAME_ALIASES.get(normalization_key(cleaned), cleaned)


def player_name_text(name: Any) -> str:
    return re.sub(r"\s*[-–—]?\s*\d+\s*$", "", clean_name(name)).strip()


def clean_name(name: Any) -> str:
    return re.sub(r"\s+", " ", str(name)).strip() if isinstance(name, str) else ""


def normalization_key(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", clean_name(name))
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", ascii_name.lower()).strip()


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
