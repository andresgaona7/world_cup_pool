#!/usr/bin/env python3
"""Fetch official World Cup knockout results and merge browser data."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime
from os import environ
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import update_official_results


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://api.football-data.org/v4/competitions/WC/matches?season=2026"
API_KEY_ENV = update_official_results.API_KEY_ENV
DEFAULT_API_KEY = update_official_results.DEFAULT_API_KEY
DEFAULT_RAW_OUTPUT_PATH = (
    ROOT / "data" / "raw" / "official" / "football_data_wc_matches_2026.json"
)
DEFAULT_NORMALIZED_OUTPUT_PATH = ROOT / "data" / "manual" / "official_knockout_results.json"
DEFAULT_OVERRIDES_PATH = ROOT / "data" / "manual" / "official_knockout_overrides.json"
DEFAULT_ROUND_OF_32_BONUS_PATH = ROOT / "data" / "manual" / "round_of_32_bonus_results.json"
DEFAULT_QUARTERFINAL_BONUS_PATH = ROOT / "data" / "manual" / "quarterfinal_bonus_results.json"
DEFAULT_SEMIFINAL_BONUS_PATH = ROOT / "data" / "manual" / "semifinal_bonus_results.json"
DEFAULT_OFFICIAL_RESULTS_PATH = ROOT / "data" / "generated" / "official_results.js"
OFFICIAL_RESULTS_RE = re.compile(
    r"^\s*window\.OFFICIAL_RESULTS\s*=\s*(?P<payload>\{.*\})\s*;\s*$",
    re.DOTALL,
)
FOOTBALL_DATA_STAGE_MAP = {
    "LAST_32": "round_of_32",
    "LAST_16": "round_of_16",
    "QUARTER_FINALS": "quarterfinal",
    "SEMI_FINALS": "semifinal",
    "THIRD_PLACE": "third_place_match",
    "FINAL": "final",
}
STAGE_ORDER = (
    "round_of_32",
    "round_of_16",
    "quarterfinal",
    "semifinal",
    "third_place_match",
    "final",
)
STAGE_MATCH_IDS = {
    "round_of_32": tuple(str(match_id) for match_id in range(73, 89)),
    "round_of_16": tuple(str(match_id) for match_id in range(89, 97)),
    "quarterfinal": ("97", "98", "99", "100"),
    "semifinal": ("101", "102"),
    "third_place_match": ("103",),
    "final": ("104",),
}
ROUND_OF_32_MATCH_PAIRS = {
    "73": ("South Africa", "Canada"),
    "74": ("Germany", "Paraguay"),
    "75": ("Netherlands", "Morocco"),
    "76": ("Brazil", "Japan"),
    "77": ("France", "Sweden"),
    "78": ("Ivory Coast", "Norway"),
    "79": ("Mexico", "Ecuador"),
    "80": ("England", "Congo DR"),
    "81": ("United States", "Bosnia-Herzegovina"),
    "82": ("Belgium", "Senegal"),
    "83": ("Portugal", "Croatia"),
    "84": ("Spain", "Austria"),
    "85": ("Switzerland", "Algeria"),
    "86": ("Argentina", "Cape Verde Islands"),
    "87": ("Colombia", "Ghana"),
    "88": ("Australia", "Egypt"),
}
ROUND_OF_32_PAIR_LOOKUP = {
    frozenset(pair): match_id for match_id, pair in ROUND_OF_32_MATCH_PAIRS.items()
}
ROUND_OF_16_PATHS = {
    "89": ("74", "77"),
    "90": ("73", "75"),
    "91": ("76", "78"),
    "92": ("79", "80"),
    "93": ("83", "84"),
    "94": ("81", "82"),
    "95": ("86", "88"),
    "96": ("85", "87"),
}
ROUND_OF_32_BONUS_DEFAULTS = {
    "extraTimeMatches": None,
    "penaltyMatches": None,
    "mostGoalsTeam": "",
    "totalGoals": None,
    "fastestGoalTeam": "",
    "latestGoalTeam": "",
    "biggestWinningMarginTeam": "",
    "yellowCards": None,
    "redCards": None,
}
QUARTERFINAL_BONUS_DEFAULTS = dict(ROUND_OF_32_BONUS_DEFAULTS)
SEMIFINAL_BONUS_DEFAULTS = dict(ROUND_OF_32_BONUS_DEFAULTS)


class FetchHTTPError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


def main() -> None:
    args = parse_args()
    data = update_official_knockout_results(
        input_path=args.input,
        raw_output_path=args.raw_output,
        normalized_output_path=args.normalized_output,
        overrides_path=args.overrides,
        round_of_32_bonus_path=args.round_of_32_bonus,
        quarterfinal_bonus_path=args.quarterfinal_bonus,
        semifinal_bonus_path=args.semifinal_bonus,
        official_results_path=args.official_results,
        api_key=args.api_key or environ.get(API_KEY_ENV) or DEFAULT_API_KEY,
        merge_official_results=not args.no_merge,
    )
    print(
        f"Wrote {display_path(args.raw_output)} and "
        f"{display_path(args.normalized_output)} with {len(data['matches'])} knockout match(es)"
    )
    if not args.no_merge:
        print(f"Merged official knockout matches into {display_path(args.official_results)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch Football-Data World Cup 2026 matches, save the raw response, "
            "normalize knockout results, and merge them into official_results.js."
        )
    )
    parser.add_argument(
        "--api-key",
        help=f"Football-Data API key. Defaults to ${API_KEY_ENV}, then the checked-in default key.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Read a saved Football-Data matches JSON response instead of fetching.",
    )
    parser.add_argument(
        "--raw-output",
        type=Path,
        default=DEFAULT_RAW_OUTPUT_PATH,
        help=f"Raw API response output. Defaults to {DEFAULT_RAW_OUTPUT_PATH.relative_to(ROOT)}.",
    )
    parser.add_argument(
        "--normalized-output",
        type=Path,
        default=DEFAULT_NORMALIZED_OUTPUT_PATH,
        help=(
            "Reviewable normalized knockout JSON output. "
            f"Defaults to {DEFAULT_NORMALIZED_OUTPUT_PATH.relative_to(ROOT)}."
        ),
    )
    parser.add_argument(
        "--overrides",
        type=Path,
        default=DEFAULT_OVERRIDES_PATH,
        help=(
            "Manual knockout result corrections for upstream API gaps. "
            f"Defaults to {DEFAULT_OVERRIDES_PATH.relative_to(ROOT)} if present."
        ),
    )
    parser.add_argument(
        "--round-of-32-bonus",
        type=Path,
        default=DEFAULT_ROUND_OF_32_BONUS_PATH,
        help=(
            "Manual Round of 32 bonus-question answers that should survive "
            "Football-Data refreshes. "
            f"Defaults to {DEFAULT_ROUND_OF_32_BONUS_PATH.relative_to(ROOT)} if present."
        ),
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
        "--quarterfinal-bonus",
        type=Path,
        default=DEFAULT_QUARTERFINAL_BONUS_PATH,
        help=(
            "Manual quarterfinal bonus-question answers that should survive "
            "Football-Data refreshes. "
            f"Defaults to {DEFAULT_QUARTERFINAL_BONUS_PATH.relative_to(ROOT)} if present."
        ),
    )
    parser.add_argument(
        "--semifinal-bonus",
        type=Path,
        default=DEFAULT_SEMIFINAL_BONUS_PATH,
        help=(
            "Manual semifinal bonus-question answers that should survive "
            "Football-Data refreshes. "
            f"Defaults to {DEFAULT_SEMIFINAL_BONUS_PATH.relative_to(ROOT)} if present."
        ),
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="Save raw and normalized JSON without updating data/generated/official_results.js.",
    )
    return parser.parse_args()


def update_official_knockout_results(
    *,
    input_path: Path | None,
    raw_output_path: Path,
    normalized_output_path: Path,
    overrides_path: Path | None,
    official_results_path: Path,
    api_key: str,
    round_of_32_bonus_path: Path | None = None,
    quarterfinal_bonus_path: Path | None = None,
    semifinal_bonus_path: Path | None = None,
    merge_official_results: bool = True,
) -> dict[str, Any]:
    raw_data = read_source(input_path, api_key)
    write_json(raw_output_path, raw_data)

    normalized = build_normalized_data(raw_data)
    apply_manual_overrides(normalized, read_manual_overrides(overrides_path))
    apply_round_of_32_bonus_results(
        normalized,
        read_round_of_32_bonus_results(round_of_32_bonus_path),
        round_of_32_bonus_path,
    )
    apply_stage_bonus_results(
        normalized,
        "quarterfinalBonusResults",
        QUARTERFINAL_BONUS_DEFAULTS,
        read_bonus_results(quarterfinal_bonus_path),
        quarterfinal_bonus_path,
        "quarterfinal",
    )
    apply_stage_bonus_results(
        normalized,
        "semifinalBonusResults",
        SEMIFINAL_BONUS_DEFAULTS,
        read_bonus_results(semifinal_bonus_path),
        semifinal_bonus_path,
        "semifinal",
    )
    write_json(normalized_output_path, normalized)

    if merge_official_results:
        official_results = read_official_results(official_results_path)
        official_results["officialMatches"] = normalized["matches"]
        official_results["matches"] = normalized["matches"]
        official_results["roundOf32BonusResults"] = normalized["roundOf32BonusResults"]
        official_results["quarterfinalBonusResults"] = normalized["quarterfinalBonusResults"]
        official_results["semifinalBonusResults"] = normalized["semifinalBonusResults"]
        official_results["knockoutSource"] = {
            "sourceName": normalized["sourceName"],
            "sourceUrl": normalized["sourceUrl"],
            "generatedAt": normalized["generatedAt"],
            "rawPath": display_path(raw_output_path),
            "normalizedPath": display_path(normalized_output_path),
        }
        write_official_results(official_results_path, official_results)

    return normalized


def read_manual_overrides(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


def read_round_of_32_bonus_results(path: Path | None) -> dict[str, Any]:
    return read_bonus_results(path)


def read_bonus_results(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


def apply_round_of_32_bonus_results(
    normalized: dict[str, Any],
    bonus_results: dict[str, Any],
    source_path: Path | None,
) -> None:
    if not bonus_results:
        return

    current = normalized.setdefault(
        "roundOf32BonusResults",
        dict(ROUND_OF_32_BONUS_DEFAULTS),
    )
    if not isinstance(current, dict):
        current = dict(ROUND_OF_32_BONUS_DEFAULTS)
        normalized["roundOf32BonusResults"] = current

    allowed_keys = set(ROUND_OF_32_BONUS_DEFAULTS)
    reviewed = {
        key: value
        for key, value in bonus_results.items()
        if key in allowed_keys
    }
    current.update(reviewed)
    if reviewed:
        source_label = (
            display_path(source_path) if source_path is not None else "manual bonus file"
        )
        normalized.setdefault("notes", []).append(
            "Applied reviewed Round of 32 bonus-question answer(s) from "
            f"{source_label}."
        )


def apply_stage_bonus_results(
    normalized: dict[str, Any],
    result_key: str,
    defaults: dict[str, Any],
    bonus_results: dict[str, Any],
    source_path: Path | None,
    stage_label: str,
) -> None:
    current = normalized.setdefault(result_key, dict(defaults))
    if not isinstance(current, dict):
        current = dict(defaults)
        normalized[result_key] = current
    reviewed = {key: value for key, value in bonus_results.items() if key in defaults}
    current.update(reviewed)
    if reviewed:
        source_label = display_path(source_path) if source_path is not None else "manual bonus file"
        normalized.setdefault("notes", []).append(
            f"Applied reviewed {stage_label} bonus-question answer(s) from {source_label}."
        )


def apply_manual_overrides(
    normalized: dict[str, Any],
    overrides: dict[str, Any],
) -> None:
    matches_by_id = {
        str(match.get("matchId")): match
        for match in normalized.get("matches", [])
        if isinstance(match, dict) and match.get("matchId") is not None
    }
    overrides_by_id = overrides.get("matches", {})
    if not isinstance(overrides_by_id, dict):
        return

    applied: list[str] = []
    for match_id, override in overrides_by_id.items():
        match = matches_by_id.get(str(match_id))
        if not match or not isinstance(override, dict):
            continue
        apply_match_override(match, override)
        applied.append(str(match_id))

    if applied:
        normalized["roundOf32BonusResults"] = compute_round_of_32_bonus_results(
            normalized.get("matches", [])
        )
        normalized.setdefault("notes", []).append(
            f"Applied manual knockout override(s) for match ID(s): {', '.join(sorted(applied))}."
        )


def apply_match_override(match: dict[str, Any], override: dict[str, Any]) -> None:
    int_fields = (
        "homeScore",
        "awayScore",
        "homePenaltyScore",
        "awayPenaltyScore",
        "homeFullTimeScore",
        "awayFullTimeScore",
        "homeRegularTimeScore",
        "awayRegularTimeScore",
        "homeExtraTimeScore",
        "awayExtraTimeScore",
    )
    string_fields = ("homeTeam", "awayTeam", "advancingTeam", "duration", "status")
    for field in int_fields:
        if field in override:
            match[field] = optional_int(override.get(field))
    for field in string_fields:
        if field in override:
            match[field] = string_value(override.get(field))


def read_source(input_path: Path | None, api_key: str) -> dict[str, Any]:
    if input_path is not None:
        return json.loads(input_path.read_text(encoding="utf-8"))
    if not api_key:
        raise RuntimeError(f"Missing Football-Data API key. Set {API_KEY_ENV} or pass --api-key.")
    return fetch_json(api_key)


def fetch_json(api_key: str) -> dict[str, Any]:
    request = urllib.request.Request(
        SOURCE_URL,
        headers=update_official_results.request_headers(api_key),
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise FetchHTTPError(exc.code, body) from exc


def build_normalized_data(raw_data: dict[str, Any]) -> dict[str, Any]:
    knockout_matches = normalize_knockout_matches(raw_data.get("matches", []))
    round_of_32_bonus = compute_round_of_32_bonus_results(knockout_matches)
    return {
        "sourceName": "Football-Data.org matches",
        "sourceUrl": SOURCE_URL,
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "matches": knockout_matches,
        "roundOf32BonusResults": round_of_32_bonus,
        "quarterfinalBonusResults": dict(QUARTERFINAL_BONUS_DEFAULTS),
        "semifinalBonusResults": dict(SEMIFINAL_BONUS_DEFAULTS),
        "notes": [
            "Football-Data supplies teams, score, winner, stage, status, duration, and referee metadata.",
            "Penalty, extra-time, and regular-time sub-scores are included only when the upstream score object exposes them.",
            "Cards and fastest/latest goal teams are not present in this endpoint and should be reviewed manually.",
        ],
    }


def normalize_knockout_matches(matches: Any) -> list[dict[str, Any]]:
    if not isinstance(matches, list):
        return []

    by_stage: dict[str, list[dict[str, Any]]] = {stage: [] for stage in STAGE_ORDER}
    for match in matches:
        if not isinstance(match, dict):
            continue
        stage = FOOTBALL_DATA_STAGE_MAP.get(str(match.get("stage") or ""))
        if not stage:
            continue
        by_stage[stage].append(match)

    normalized_matches: list[dict[str, Any]] = []
    advancing_by_match_id: dict[str, str] = {}
    for stage in STAGE_ORDER:
        stage_matches = sorted(
            by_stage.get(stage, []),
            key=lambda match: (
                str(match.get("utcDate") or ""),
                int_value(match.get("id")),
            ),
        )
        assigned_match_ids: set[str] = set()
        for index, match in enumerate(stage_matches):
            pool_match_id = pool_match_id_for_match(
                match,
                stage=stage,
                fallback_index=index,
                assigned_match_ids=assigned_match_ids,
                advancing_by_match_id=advancing_by_match_id,
            )
            if pool_match_id:
                assigned_match_ids.add(pool_match_id)
            normalized = normalize_match(match, stage, pool_match_id)
            if normalized:
                normalized_matches.append(normalized)
                if normalized.get("advancingTeam"):
                    advancing_by_match_id[str(normalized["matchId"])] = str(
                        normalized["advancingTeam"]
                    )
    return sorted(
        normalized_matches,
        key=lambda match: (
            STAGE_ORDER.index(match["stage"]) if match.get("stage") in STAGE_ORDER else 999,
            int_value(match.get("matchId")),
        ),
    )


def pool_match_id_for_match(
    match: dict[str, Any],
    *,
    stage: str,
    fallback_index: int,
    assigned_match_ids: set[str],
    advancing_by_match_id: dict[str, str],
) -> str:
    if stage == "round_of_32":
        pair = frozenset((normalize_team(match.get("homeTeam")), normalize_team(match.get("awayTeam"))))
        pair_match_id = ROUND_OF_32_PAIR_LOOKUP.get(pair)
        if pair_match_id:
            return pair_match_id
    if stage == "round_of_16":
        path_match_id = round_of_16_match_id_for_match(
            match,
            advancing_by_match_id=advancing_by_match_id,
            assigned_match_ids=assigned_match_ids,
        )
        if path_match_id:
            return path_match_id

    match_ids = STAGE_MATCH_IDS[stage]
    if stage == "round_of_16":
        for match_id in match_ids:
            if match_id not in assigned_match_ids:
                return match_id
    for match_id in match_ids[fallback_index:]:
        if match_id not in assigned_match_ids:
            return match_id
    for match_id in match_ids:
        if match_id not in assigned_match_ids:
            return match_id
    return ""


def round_of_16_match_id_for_match(
    match: dict[str, Any],
    *,
    advancing_by_match_id: dict[str, str],
    assigned_match_ids: set[str],
) -> str:
    fixture_teams = {
        team
        for team in (normalize_team(match.get("homeTeam")), normalize_team(match.get("awayTeam")))
        if team
    }
    if not fixture_teams:
        return ""

    candidates: list[str] = []
    for match_id, feeder_match_ids in ROUND_OF_16_PATHS.items():
        if match_id in assigned_match_ids:
            continue
        expected_teams = {
            advancing_by_match_id[feeder_id]
            for feeder_id in feeder_match_ids
            if advancing_by_match_id.get(feeder_id)
        }
        if fixture_teams and fixture_teams.issubset(expected_teams):
            candidates.append(match_id)
    return candidates[0] if len(candidates) == 1 else ""


def normalize_match(match: dict[str, Any], stage: str, pool_match_id: str) -> dict[str, Any]:
    home_team = normalize_team(match.get("homeTeam"))
    away_team = normalize_team(match.get("awayTeam"))
    score = match.get("score") if isinstance(match.get("score"), dict) else {}
    regular_time = score_value(score, "regularTime")
    full_time = score_value(score, "fullTime")
    extra_time = score_value(score, "extraTime")
    penalties = penalty_score(score, regular_time, extra_time, full_time)
    scoring_score = official_score(regular_time, extra_time, full_time)

    if not pool_match_id or not home_team or not away_team:
        return {}

    home_score = scoring_score.get("home") if scoring_score else None
    away_score = scoring_score.get("away") if scoring_score else None
    normalized = {
        "matchId": pool_match_id,
        "sourceMatchId": match.get("id"),
        "stage": stage,
        "status": string_value(match.get("status")),
        "utcDate": string_value(match.get("utcDate")),
        "sourceUpdatedAt": string_value(match.get("lastUpdated")),
        "homeTeam": home_team,
        "awayTeam": away_team,
        "homeScore": home_score,
        "awayScore": away_score,
        "advancingTeam": advancing_team(match, score, home_team, away_team, penalties),
        "duration": string_value(score.get("duration")),
        "homePenaltyScore": penalties.get("home") if penalties else None,
        "awayPenaltyScore": penalties.get("away") if penalties else None,
        "homeFullTimeScore": full_time.get("home") if full_time else None,
        "awayFullTimeScore": full_time.get("away") if full_time else None,
        "homeRegularTimeScore": regular_time.get("home") if regular_time else None,
        "awayRegularTimeScore": regular_time.get("away") if regular_time else None,
        "homeExtraTimeScore": extra_time.get("home") if extra_time else None,
        "awayExtraTimeScore": extra_time.get("away") if extra_time else None,
        "referees": normalize_referees(match.get("referees")),
    }
    return normalized


def official_score(
    regular_time: dict[str, int | None] | None,
    extra_time: dict[str, int | None] | None,
    full_time: dict[str, int | None] | None,
) -> dict[str, int | None] | None:
    if regular_time:
        home = optional_int(regular_time.get("home"))
        away = optional_int(regular_time.get("away"))
        if home is not None and away is not None:
            extra_home = optional_int(extra_time.get("home") if extra_time else None) or 0
            extra_away = optional_int(extra_time.get("away") if extra_time else None) or 0
            return {"home": home + extra_home, "away": away + extra_away}
    return full_time


def normalize_team(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    name = value.get("name") or value.get("shortName") or value.get("tla") or ""
    return update_official_results.canonical_team_name(str(name))


def score_value(score: dict[str, Any], key: str) -> dict[str, int | None]:
    value = score.get(key)
    if not isinstance(value, dict):
        return {}
    return {
        "home": optional_int(value.get("home")),
        "away": optional_int(value.get("away")),
    }


def penalty_score(
    score: dict[str, Any],
    regular_time: dict[str, int | None],
    extra_time: dict[str, int | None],
    full_time: dict[str, int | None],
) -> dict[str, int | None]:
    penalties = score_value(score, "penalties")
    if (
        penalties
        and penalties.get("home") is not None
        and penalties.get("away") is not None
        and penalties.get("home") != penalties.get("away")
    ):
        return penalties

    duration = string_value(score.get("duration")).upper()
    if duration not in {"PENALTY_SHOOTOUT", "PENALTIES"}:
        return penalties

    if not full_time or full_time.get("home") is None or full_time.get("away") is None:
        return penalties

    base_home = optional_int(regular_time.get("home") if regular_time else None) or 0
    base_away = optional_int(regular_time.get("away") if regular_time else None) or 0
    extra_home = optional_int(extra_time.get("home") if extra_time else None) or 0
    extra_away = optional_int(extra_time.get("away") if extra_time else None) or 0
    derived = {
        "home": optional_int(full_time.get("home")) - base_home - extra_home,
        "away": optional_int(full_time.get("away")) - base_away - extra_away,
    }
    if derived["home"] is not None and derived["away"] is not None and (
        derived["home"] > 0 or derived["away"] > 0
    ):
        return derived
    return penalties


def advancing_team(
    match: dict[str, Any],
    score: dict[str, Any],
    home_team: str,
    away_team: str,
    penalties: dict[str, int | None],
) -> str:
    winner = str(score.get("winner") or "").upper()
    if winner == "HOME_TEAM":
        return home_team
    if winner == "AWAY_TEAM":
        return away_team
    if winner == "DRAW":
        return ""
    winner_team = match.get("winner")
    if isinstance(winner_team, dict):
        return normalize_team(winner_team)
    if penalties.get("home") is not None and penalties.get("away") is not None:
        if penalties["home"] > penalties["away"]:
            return home_team
        if penalties["away"] > penalties["home"]:
            return away_team
    return ""


def normalize_referees(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    referees = []
    for referee in value:
        if not isinstance(referee, dict):
            continue
        referees.append(
            {
                "name": string_value(referee.get("name")),
                "type": string_value(referee.get("type")),
                "nationality": string_value(referee.get("nationality")),
            }
        )
    return referees


def compute_round_of_32_bonus_results(matches: list[dict[str, Any]]) -> dict[str, Any]:
    round_matches = [
        match for match in matches if match.get("stage") == "round_of_32" and is_finished(match)
    ]
    results = dict(ROUND_OF_32_BONUS_DEFAULTS)
    if not round_matches:
        return results

    results["extraTimeMatches"] = sum(
        1 for match in round_matches if match.get("duration") in {"EXTRA_TIME", "PENALTY_SHOOTOUT", "PENALTIES"}
    )
    results["penaltyMatches"] = sum(1 for match in round_matches if has_penalty_score(match))
    results["totalGoals"] = sum(
        int_value(match.get("homeScore")) + int_value(match.get("awayScore"))
        for match in round_matches
    )
    results["mostGoalsTeam"] = most_goals_team(round_matches)
    results["biggestWinningMarginTeam"] = biggest_winning_margin_team(round_matches)
    return results


def most_goals_team(matches: list[dict[str, Any]]) -> str | list[str]:
    totals: dict[str, int] = {}
    for match in matches:
        if match.get("homeTeam"):
            totals[str(match["homeTeam"])] = totals.get(str(match["homeTeam"]), 0) + int_value(
                match.get("homeScore")
            )
        if match.get("awayTeam"):
            totals[str(match["awayTeam"])] = totals.get(str(match["awayTeam"]), 0) + int_value(
                match.get("awayScore")
            )
    if not totals:
        return ""
    best_score = max(totals.values())
    winners = sorted(team for team, total in totals.items() if total == best_score)
    return winners[0] if len(winners) == 1 else winners


def biggest_winning_margin_team(matches: list[dict[str, Any]]) -> str:
    margins: list[tuple[int, str]] = []
    for match in matches:
        home_score = optional_int(match.get("homeScore"))
        away_score = optional_int(match.get("awayScore"))
        if home_score is None or away_score is None or home_score == away_score:
            continue
        winner = str(match.get("homeTeam") if home_score > away_score else match.get("awayTeam"))
        margins.append((abs(home_score - away_score), winner))
    if not margins:
        return ""
    best_margin = max(margin for margin, _winner in margins)
    winners = sorted(winner for margin, winner in margins if margin == best_margin)
    return winners[0] if len(winners) == 1 else ""


def is_finished(match: dict[str, Any]) -> bool:
    return match.get("status") == "FINISHED" and match.get("homeScore") is not None and match.get("awayScore") is not None


def has_penalty_score(match: dict[str, Any]) -> bool:
    return match.get("homePenaltyScore") is not None and match.get("awayPenaltyScore") is not None


def read_official_results(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
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


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def int_value(value: Any) -> int:
    return optional_int(value) or 0


def string_value(value: Any) -> str:
    return value if isinstance(value, str) else ""


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"official knockout update failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
