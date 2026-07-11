#!/usr/bin/env python3
"""Create durable official-results checkpoints for the score timeline."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import update_official_results


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OFFICIAL_RESULTS_PATH = ROOT / "data" / "generated" / "official_results.js"
DEFAULT_CHECKPOINT_DIR = ROOT / "data" / "checkpoints" / "official_results"
GROUP_IDS = update_official_results.GROUP_IDS

CHECKPOINTS: tuple[dict[str, Any], ...] = (
    {
        "key": "group_md1",
        "label": "After group matchday 1",
        "shortLabel": "Group MD1",
        "stage": "group_stage",
    },
    {
        "key": "group_md2",
        "label": "After group matchday 2",
        "shortLabel": "Group MD2",
        "stage": "group_stage",
    },
    {
        "key": "group_md3",
        "label": "After group matchday 3",
        "shortLabel": "Group MD3",
        "stage": "group_stage",
    },
    {
        "key": "round_of_32",
        "label": "After round of 32",
        "shortLabel": "R32",
        "stage": "round_of_32",
    },
    {
        "key": "round_of_16",
        "label": "After round of 16",
        "shortLabel": "R16",
        "stage": "round_of_16",
    },
    {
        "key": "quarterfinal",
        "label": "After quarterfinals",
        "shortLabel": "QF",
        "stage": "quarterfinal",
    },
    {
        "key": "semifinal",
        "label": "After semifinals",
        "shortLabel": "SF",
        "stage": "semifinal",
    },
    {
        "key": "third_place_match",
        "label": "After 3rd place",
        "shortLabel": "3rd",
        "stage": "third_place_match",
    },
    {
        "key": "final",
        "label": "After final",
        "shortLabel": "Final",
        "stage": "final",
    },
    {
        "key": "futures",
        "label": "Futures results",
        "shortLabel": "Futures",
        "stage": "futures",
        "includeFutures": True,
    },
)
CHECKPOINTS_BY_KEY = {checkpoint["key"]: checkpoint for checkpoint in CHECKPOINTS}
CHECKPOINT_ORDER = tuple(checkpoint["key"] for checkpoint in CHECKPOINTS)
KNOCKOUT_STAGE_ORDER = {
    "round_of_32": 1,
    "round_of_16": 2,
    "quarterfinal": 3,
    "semifinal": 4,
    "third_place_match": 5,
    "final": 6,
    "futures": 6,
}
OFFICIAL_RESULTS_RE = re.compile(
    r"^\s*window\.OFFICIAL_RESULTS\s*=\s*(?P<payload>\{.*\})\s*;\s*$",
    re.DOTALL,
)


def main() -> None:
    args = parse_args()
    create_or_rebuild_checkpoint(
        checkpoint_key=args.checkpoint_key,
        rebuild_only=args.rebuild_only,
        official_results_path=args.official_results,
        checkpoint_dir=args.checkpoint_dir,
        verbose=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Write a named official-results checkpoint and rebuild "
            "OFFICIAL_RESULTS.timelineCheckpoints."
        )
    )
    parser.add_argument(
        "checkpoint_key",
        nargs="?",
        choices=CHECKPOINT_ORDER,
        help="Checkpoint key to write before rebuilding the browser manifest.",
    )
    parser.add_argument(
        "--rebuild-only",
        action="store_true",
        help="Rebuild timelineCheckpoints from committed checkpoint JSON files only.",
    )
    parser.add_argument(
        "--official-results",
        type=Path,
        default=DEFAULT_OFFICIAL_RESULTS_PATH,
        help=(
            "Path to data/generated/official_results.js. "
            f"Defaults to {DEFAULT_OFFICIAL_RESULTS_PATH.relative_to(ROOT)}."
        ),
    )
    parser.add_argument(
        "--checkpoint-dir",
        type=Path,
        default=DEFAULT_CHECKPOINT_DIR,
        help=(
            "Directory for official checkpoint JSON files. "
            f"Defaults to {DEFAULT_CHECKPOINT_DIR.relative_to(ROOT)}."
        ),
    )
    args = parser.parse_args()

    if args.rebuild_only and args.checkpoint_key:
        parser.error("pass either a checkpoint key or --rebuild-only, not both")
    if not args.rebuild_only and not args.checkpoint_key:
        parser.error("pass a checkpoint key or --rebuild-only")

    return args


def create_or_rebuild_checkpoint(
    *,
    checkpoint_key: str | None,
    rebuild_only: bool,
    official_results_path: Path,
    checkpoint_dir: Path,
    verbose: bool = False,
) -> None:
    official_results = read_official_results(official_results_path)

    if not rebuild_only:
        if checkpoint_key not in CHECKPOINTS_BY_KEY:
            supported = ", ".join(CHECKPOINT_ORDER)
            raise ValueError(
                f"unsupported checkpoint key {checkpoint_key!r}; expected one of: {supported}"
            )
        checkpoint = build_checkpoint(checkpoint_key, official_results)
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        checkpoint_path = checkpoint_dir / f"{checkpoint_key}.json"
        write_checkpoint(checkpoint_path, checkpoint)
        if verbose:
            print(f"Wrote {display_path(checkpoint_path)}")

    checkpoints = read_checkpoints(checkpoint_dir)
    official_results["timelineCheckpoints"] = checkpoints
    write_official_results(official_results_path, official_results)
    if verbose:
        print(
            f"Rebuilt {display_path(official_results_path)} with "
            f"{len(checkpoints)} timeline checkpoint(s)"
        )


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


def build_checkpoint(checkpoint_key: str, official_results: dict[str, Any]) -> dict[str, Any]:
    metadata = CHECKPOINTS_BY_KEY[checkpoint_key]
    group_standings = normalize_group_standings(
        official_results.get("provisionalGroupStandings", {})
    )
    completed_groups = {
        group_id: rows[: update_official_results.GROUP_SIZE]
        for group_id, rows in group_standings.items()
        if update_official_results.is_complete_group(rows)
    }
    fallback_best_thirds = official_results.get("bestThirds", [])

    if isinstance(fallback_best_thirds, list) and fallback_best_thirds:
        best_thirds = [team for team in fallback_best_thirds if isinstance(team, str)]
    else:
        best_thirds = update_official_results.provisional_best_thirds(
            group_standings,
            update_official_results.best_thirds(completed_groups),
        )

    checkpoint = {
        "key": metadata["key"],
        "label": metadata["label"],
        "shortLabel": metadata["shortLabel"],
        "stage": metadata["stage"],
        "completedAt": completed_at(official_results),
        "scenario": {
            "groupResults": update_official_results.provisional_group_results(
                group_standings
            ),
            "bestThirds": best_thirds,
            "futures": normalize_futures(official_results.get("futures")),
        },
        "officialMatches": checkpoint_matches(
            official_results.get("matches"),
            metadata["stage"],
        ),
    }
    if includes_round_of_32_results(metadata["stage"]):
        checkpoint["roundOf32BonusResults"] = normalize_round_of_32_bonus_results(
            official_results.get("roundOf32BonusResults")
        )
    if includes_quarterfinal_results(metadata["stage"]):
        checkpoint["quarterfinalBonusResults"] = normalize_bonus_results(
            official_results.get("quarterfinalBonusResults")
        )
    if metadata.get("includeFutures"):
        checkpoint["includeFutures"] = True
    return checkpoint


def normalize_group_standings(value: Any) -> dict[str, list[dict[str, Any]]]:
    if not isinstance(value, dict):
        value = {}
    return {
        group_id: rows if isinstance(rows := value.get(group_id), list) else []
        for group_id in GROUP_IDS
    }


def normalize_futures(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}
    team_last_rounds = value.get("teamLastRounds", {})
    futures = {
        "champion": string_value(value, "champion"),
        "runnerUp": string_value(value, "runnerUp"),
        "topScorer": string_value(value, "topScorer"),
        "topScorers": top_scorers(value),
        "teamLastRounds": team_last_rounds if isinstance(team_last_rounds, dict) else {},
    }
    if not futures["topScorer"] and futures["topScorers"]:
        futures["topScorer"] = futures["topScorers"][0]
    return futures


def top_scorers(source: dict[str, Any]) -> list[str]:
    value = source.get("topScorers")
    if isinstance(value, list):
        scorers = [
            scorer.strip()
            for scorer in value
            if isinstance(scorer, str) and scorer.strip()
        ]
    else:
        scorers = []
    fallback = string_value(source, "topScorer")
    if fallback and fallback not in scorers:
        scorers.insert(0, fallback)
    return scorers


def string_value(source: dict[str, Any], key: str) -> str:
    value = source.get(key, "")
    return value if isinstance(value, str) else ""


def normalize_matches(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def checkpoint_matches(value: Any, checkpoint_stage: str) -> list[Any]:
    matches = normalize_matches(value)
    cutoff = KNOCKOUT_STAGE_ORDER.get(checkpoint_stage)
    if cutoff is None:
        return []
    return [
        match
        for match in matches
        if isinstance(match, dict)
        and KNOCKOUT_STAGE_ORDER.get(match.get("stage"), 0) <= cutoff
    ]


def includes_round_of_32_results(checkpoint_stage: str) -> bool:
    return KNOCKOUT_STAGE_ORDER.get(checkpoint_stage, 0) >= KNOCKOUT_STAGE_ORDER["round_of_32"]


def normalize_round_of_32_bonus_results(value: Any) -> dict[str, Any]:
    return normalize_bonus_results(value)


def includes_quarterfinal_results(checkpoint_stage: str) -> bool:
    return KNOCKOUT_STAGE_ORDER.get(checkpoint_stage, 0) >= KNOCKOUT_STAGE_ORDER["quarterfinal"]


def normalize_bonus_results(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def completed_at(official_results: dict[str, Any]) -> str:
    for key in ("lastCompletedMatchDate", "generatedAt"):
        value = official_results.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def write_checkpoint(path: Path, checkpoint: dict[str, Any]) -> None:
    payload = json.dumps(checkpoint, ensure_ascii=False, indent=2)
    path.write_text(f"{payload}\n", encoding="utf-8")


def read_checkpoints(checkpoint_dir: Path) -> list[dict[str, Any]]:
    checkpoints: list[dict[str, Any]] = []
    for checkpoint_key in CHECKPOINT_ORDER:
        path = checkpoint_dir / f"{checkpoint_key}.json"
        if not path.exists():
            continue
        checkpoint = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(checkpoint, dict):
            raise ValueError(f"{path} must contain a JSON object")
        if checkpoint.get("key") != checkpoint_key:
            raise ValueError(f"{path} must have key {checkpoint_key!r}")
        checkpoints.append(checkpoint)
    return checkpoints


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"official checkpoint failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
