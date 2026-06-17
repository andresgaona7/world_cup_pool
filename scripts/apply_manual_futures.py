#!/usr/bin/env python3
"""Apply manually entered official futures to generated official results."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANUAL_FUTURES_PATH = ROOT / "data" / "manual" / "official_futures.json"
DEFAULT_OFFICIAL_RESULTS_PATH = ROOT / "data" / "generated" / "official_results.js"
OFFICIAL_RESULTS_RE = re.compile(
    r"^\s*window\.OFFICIAL_RESULTS\s*=\s*(?P<payload>\{.*\})\s*;\s*$",
    re.DOTALL,
)
FUTURES_KEYS = ("champion", "runnerUp", "topScorer")
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
        official_results_path=args.official_results,
        verbose=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Merge manually entered official futures from "
            "data/manual/official_futures.json into data/generated/official_results.js."
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
    official_results_path: Path,
    verbose: bool = False,
) -> None:
    manual_futures = read_manual_futures(manual_futures_path)
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

    for checkpoint in official_results.get("timelineCheckpoints", []):
        if not isinstance(checkpoint, dict):
            continue
        scenario = checkpoint.get("scenario")
        if not isinstance(scenario, dict):
            continue
        scenario["futures"] = merged_futures

    write_official_results(official_results_path, official_results)
    if verbose:
        print(
            f"Applied {display_path(manual_futures_path)} to "
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


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    main()
