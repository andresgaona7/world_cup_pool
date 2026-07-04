#!/usr/bin/env python3
"""Fetch World Cup 2026 group standings and write browser data."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from os import environ
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import official_rankings


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "generated" / "official_results.js"
RATE_STATE_PATH = ROOT / "data" / ".cache" / "football_data_rate_limit.json"
FIFA_RANKINGS_PATH = ROOT / "data" / "manual" / "fifa_rankings.json"
MANUAL_ADJUSTMENTS_PATH = ROOT / "data" / "manual" / "official_fair_play.json"
OFFICIAL_RESULTS_RE = re.compile(
    r"^\s*window\.OFFICIAL_RESULTS\s*=\s*(?P<payload>\{.*\})\s*;\s*$",
    re.DOTALL,
)
SOURCE_URL = "https://api.football-data.org/v4/competitions/WC/standings?season=2026"
API_KEY_ENV = "FOOTBALL_DATA_API_KEY"
DEFAULT_API_KEY = "9a022f9d132d4a5d9d01116e0f99ab6f"
GROUP_IDS = tuple("ABCDEFGHIJKL")
GROUP_TEAMS = {
    "A": ("Mexico", "South Africa", "South Korea", "Czechia"),
    "B": ("Canada", "Bosnia-Herzegovina", "Qatar", "Switzerland"),
    "C": ("Brazil", "Morocco", "Haiti", "Scotland"),
    "D": ("United States", "Paraguay", "Australia", "Türkiye"),
    "E": ("Germany", "Cura\u00e7ao", "Ivory Coast", "Ecuador"),
    "F": ("Netherlands", "Japan", "Sweden", "Tunisia"),
    "G": ("Belgium", "Egypt", "Iran", "New Zealand"),
    "H": ("Spain", "Cape Verde Islands", "Saudi Arabia", "Uruguay"),
    "I": ("France", "Senegal", "Iraq", "Norway"),
    "J": ("Argentina", "Algeria", "Austria", "Jordan"),
    "K": ("Portugal", "Congo DR", "Uzbekistan", "Colombia"),
    "L": ("England", "Croatia", "Ghana", "Panama"),
}
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
GROUP_SIZE = 4
GROUP_STAGE_GAMES = 3
DEFAULT_MIN_REQUESTS_AVAILABLE = 1
DEFAULT_MAX_RETRIES = 2
DEFAULT_TRANSPORT = "auto"
PRESERVED_GROUP_STAGE_FIELDS = (
    "lastCompletedMatchDate",
    "groupResults",
    "bestThirds",
    "futures",
    "provisionalGroupStandings",
    "timelineCheckpoints",
    "overallStandings",
)
PRESERVED_KNOCKOUT_FIELDS = (
    "matches",
    "officialMatches",
    "roundOf32BonusResults",
    "knockoutSource",
)


class FetchHTTPError(RuntimeError):
    def __init__(self, status_code: int, headers: Any, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.headers = headers


def main() -> None:
    args = parse_args()
    raw_data = read_source(args)
    group_standings = extract_group_standings(raw_data)
    overall_standings = extract_overall_standings(raw_data)
    manual_adjustments = official_rankings.read_manual_adjustments(args.manual_adjustments)
    official_rankings.apply_manual_adjustments(
        {
            "provisionalGroupStandings": group_standings,
            "overallStandings": overall_standings,
        },
        manual_adjustments,
    )
    completed_groups = {
        group_id: rows[:3]
        for group_id, rows in group_standings.items()
        if is_complete_group(rows)
    }

    data = {
        "sourceName": "Football-Data.org",
        "sourceUrl": SOURCE_URL,
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "lastCompletedMatchDate": "",
        "matches": [],
        "groupResults": {
            group_id: [row["team"] for row in completed_groups.get(group_id, [])]
            for group_id in GROUP_IDS
        },
        "bestThirds": best_thirds(completed_groups),
        "futures": {
            "champion": "",
            "runnerUp": "",
            "topScorer": "",
            "topScorers": [],
            "teamLastRounds": eliminated_group_stage_teams(group_standings, completed_groups),
        },
        "provisionalGroupStandings": {
            group_id: group_standings.get(group_id, []) for group_id in GROUP_IDS
        },
        "timelineCheckpoints": timeline_checkpoints(
            group_standings,
            completed_groups,
            {
                "champion": "",
                "runnerUp": "",
                "topScorer": "",
                "topScorers": [],
                "teamLastRounds": eliminated_group_stage_teams(
                    group_standings,
                    completed_groups,
                ),
            },
        ),
        "overallStandings": overall_standings,
    }
    preserved_fields = preserve_existing_group_stage_results(
        data,
        args.output,
        refresh_group_stage_results=args.refresh_group_stage_results,
    )

    if not any(group_standings.values()) and not overall_standings and not args.allow_empty:
        raise RuntimeError(
            "Football-Data returned no per-group standings or overall rows. Use "
            "--allow-empty to write metadata anyway."
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    args.output.write_text(f"window.OFFICIAL_RESULTS = {payload};\n", encoding="utf-8")
    completed_count = sum(1 for rows in group_standings.values() if is_complete_group(rows))
    print(
        f"Wrote {display_path(args.output)} with "
        f"{len(group_standings)} groups ({completed_count} complete), "
        f"{len(overall_standings)} overall rows"
    )
    if preserved_fields:
        print(
            "Preserved existing group-stage result fields: "
            + ", ".join(preserved_fields)
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Football-Data World Cup 2026 group standings."
    )
    parser.add_argument(
        "--api-key",
        help=f"Football-Data API key. Defaults to ${API_KEY_ENV}, then the checked-in default key.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Read a saved Football-Data standings JSON response instead of fetching.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help=f"Output JS file. Defaults to {OUTPUT_PATH.relative_to(ROOT)}.",
    )
    parser.add_argument(
        "--allow-empty",
        action="store_true",
        help="Write a valid empty results file if no standings or overall rows are found.",
    )
    parser.add_argument(
        "--rate-state",
        type=Path,
        default=RATE_STATE_PATH,
        help=f"Persistent rate-limit state file. Defaults to {RATE_STATE_PATH.relative_to(ROOT)}.",
    )
    parser.add_argument(
        "--min-requests-available",
        type=int,
        default=DEFAULT_MIN_REQUESTS_AVAILABLE,
        help="Wait for reset before fetching when cached remaining requests are at or below this value.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=DEFAULT_MAX_RETRIES,
        help="Maximum retries after HTTP 429 responses.",
    )
    parser.add_argument(
        "--transport",
        choices=("auto", "requests", "curl", "urllib"),
        default=DEFAULT_TRANSPORT,
        help=(
            "HTTP client to use. auto prefers requests when installed, then curl, "
            "then urllib."
        ),
    )
    parser.add_argument(
        "--manual-adjustments",
        type=Path,
        default=MANUAL_ADJUSTMENTS_PATH,
        help=(
            "Manual fair-play and group-order adjustments. "
            f"Defaults to {MANUAL_ADJUSTMENTS_PATH.relative_to(ROOT)}."
        ),
    )
    parser.add_argument(
        "--refresh-group-stage-results",
        action="store_true",
        help=(
            "Replace group-stage scoring fields from Football-Data. By default, "
            "existing group-stage fields in the output file are preserved."
        ),
    )
    return parser.parse_args()


def read_existing_official_results(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None

    text = path.read_text(encoding="utf-8")
    match = OFFICIAL_RESULTS_RE.match(text)
    if not match:
        raise ValueError(f"{path} does not contain a window.OFFICIAL_RESULTS assignment")

    payload = json.loads(match.group("payload"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} did not contain a JSON object")
    return payload


def preserve_existing_group_stage_results(
    data: dict[str, Any],
    output_path: Path,
    *,
    refresh_group_stage_results: bool,
) -> list[str]:
    existing_data = read_existing_official_results(output_path)
    if existing_data is None:
        return []

    preserved_fields = []
    fields = list(PRESERVED_KNOCKOUT_FIELDS)
    if not refresh_group_stage_results:
        fields.extend(PRESERVED_GROUP_STAGE_FIELDS)

    for field in fields:
        if field in existing_data:
            data[field] = existing_data[field]
            preserved_fields.append(field)
    return preserved_fields


def read_source(args: argparse.Namespace) -> dict[str, Any]:
    if args.input is not None:
        return json.loads(args.input.read_text(encoding="utf-8"))

    api_key = args.api_key or environ.get(API_KEY_ENV) or DEFAULT_API_KEY
    if not api_key:
        raise RuntimeError(
            f"Missing Football-Data API key. Set {API_KEY_ENV} or pass --api-key."
        )

    return fetch_json_with_throttle(
        api_key=api_key,
        rate_state_path=args.rate_state,
        min_requests_available=args.min_requests_available,
        max_retries=args.max_retries,
        transport=args.transport,
    )


def fetch_json_with_throttle(
    api_key: str,
    rate_state_path: Path,
    min_requests_available: int,
    max_retries: int,
    transport: str,
) -> dict[str, Any]:
    attempts = 0
    selected_transport = select_transport(transport)
    while True:
        wait_for_cached_rate_limit(rate_state_path, min_requests_available)

        try:
            return fetch_json_once(api_key, rate_state_path, selected_transport)
        except FetchHTTPError as exc:
            update_rate_state(rate_state_path, exc.headers)
            if exc.status_code != 429 or attempts >= max_retries:
                raise
            attempts += 1
            sleep_seconds = reset_seconds_from_headers(exc.headers) or 60
            print(
                f"Football-Data rate limit reached; waiting {sleep_seconds}s before retry {attempts}.",
                file=sys.stderr,
            )
            time.sleep(sleep_seconds)


def select_transport(transport: str) -> str:
    if transport != "auto":
        return transport
    if requests_is_available():
        return "requests"
    if shutil.which("curl"):
        return "curl"
    return "urllib"


def requests_is_available() -> bool:
    try:
        import requests  # noqa: F401
    except ImportError:
        return False
    return True


def fetch_json_once(
    api_key: str,
    rate_state_path: Path,
    transport: str,
) -> dict[str, Any]:
    if transport == "requests":
        return fetch_json_once_requests(api_key, rate_state_path)
    if transport == "curl":
        return fetch_json_once_curl(api_key, rate_state_path)
    if transport == "urllib":
        return fetch_json_once_urllib(api_key, rate_state_path)
    raise ValueError(f"Unsupported transport: {transport}")


def request_headers(api_key: str) -> dict[str, str]:
    return {
        "Accept": "application/json",
        "X-Auth-Token": api_key,
        "User-Agent": "world-cup-pool-results-updater/1.0",
    }


def fetch_json_once_requests(api_key: str, rate_state_path: Path) -> dict[str, Any]:
    try:
        import requests
    except ImportError as exc:
        raise RuntimeError(
            "The requests package is not installed. Use --transport urllib or "
            "--transport curl, or install requests."
        ) from exc

    response = requests.get(SOURCE_URL, headers=request_headers(api_key), timeout=30)
    update_rate_state(rate_state_path, response.headers)
    if response.status_code >= 400:
        raise FetchHTTPError(response.status_code, response.headers, response.text)
    return response.json()


def fetch_json_once_curl(api_key: str, rate_state_path: Path) -> dict[str, Any]:
    command = [
        "curl",
        "--silent",
        "--show-error",
        "--include",
        "--location",
        "-H",
        f"X-Auth-Token: {api_key}",
        "-H",
        "Accept: application/json",
        "-H",
        "User-Agent: world-cup-pool-results-updater/1.0",
        SOURCE_URL,
    ]
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "curl request failed")

    status_code, headers, body = parse_curl_response(completed.stdout)
    update_rate_state(rate_state_path, headers)
    if status_code >= 400:
        raise FetchHTTPError(status_code, headers, body)
    return json.loads(body)


def parse_curl_response(output: str) -> tuple[int, dict[str, str], str]:
    parts = output.split("\r\n\r\n")
    if len(parts) == 1:
        parts = output.split("\n\n")

    header_blocks = [part for part in parts[:-1] if part.strip()]
    body = parts[-1]
    if not header_blocks:
        raise RuntimeError("curl response did not include HTTP headers")

    header_lines = header_blocks[-1].splitlines()
    status_line = header_lines[0]
    try:
        status_code = int(status_line.split()[1])
    except (IndexError, ValueError) as exc:
        raise RuntimeError(f"Could not parse curl status line: {status_line}") from exc

    headers: dict[str, str] = {}
    for line in header_lines[1:]:
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        headers[name.strip().lower()] = value.strip()
    return status_code, headers, body


def fetch_json_once_urllib(api_key: str, rate_state_path: Path) -> dict[str, Any]:
    request = urllib.request.Request(SOURCE_URL, headers=request_headers(api_key))

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            update_rate_state(rate_state_path, response.headers)
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise FetchHTTPError(exc.code, exc.headers, body) from exc


def wait_for_cached_rate_limit(rate_state_path: Path, min_requests_available: int) -> None:
    state = read_rate_state(rate_state_path)
    if not state:
        return

    available = state.get("requestsAvailableMinute")
    reset_at = state.get("resetAtEpoch")
    now = time.time()
    if available is None or reset_at is None:
        return
    if available > min_requests_available or reset_at <= now:
        return

    sleep_seconds = max(0, int(reset_at - now) + 1)
    if sleep_seconds:
        print(
            f"Waiting {sleep_seconds}s for Football-Data rate limit reset before fetching.",
            file=sys.stderr,
        )
        time.sleep(sleep_seconds)


def read_rate_state(rate_state_path: Path) -> dict[str, Any]:
    if not rate_state_path.exists():
        return {}
    try:
        return json.loads(rate_state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def update_rate_state(rate_state_path: Path, headers: Any) -> None:
    available = header_int(headers, "x-requests-available-minute")
    reset_seconds = reset_seconds_from_headers(headers)
    if available is None and reset_seconds is None:
        return

    state = {
        "updatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "requestsAvailableMinute": available,
        "requestCounterResetSeconds": reset_seconds,
        "resetAtEpoch": time.time() + reset_seconds if reset_seconds is not None else None,
    }
    rate_state_path.parent.mkdir(parents=True, exist_ok=True)
    rate_state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def reset_seconds_from_headers(headers: Any) -> int | None:
    return header_int(headers, "x-requestcounter-reset")


def header_int(headers: Any, name: str) -> int | None:
    value = None
    if headers is not None:
        value = headers.get(name) or headers.get(name.title())
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def extract_group_standings(raw_data: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    standings = {}
    for standing in raw_data.get("standings", []):
        if standing.get("stage") != "GROUP_STAGE" or standing.get("type") != "TOTAL":
            continue
        group_id = parse_group_id(standing.get("group", ""))
        if not group_id:
            continue

        rows = [normalize_row(row) for row in standing.get("table", [])]
        standings[group_id] = sorted(
            rows,
            key=lambda row: (
                row["position"] or 999,
                -row["points"],
                -row["goalDifference"],
                -row["goalsFor"],
                row["team"],
            ),
        )

    if any(standings.values()):
        return standings
    return extract_group_standings_from_overall(raw_data)


def extract_group_standings_from_overall(
    raw_data: dict[str, Any]
) -> dict[str, list[dict[str, Any]]]:
    overall_table = find_overall_group_stage_table(raw_data)
    if not overall_table:
        return {}

    team_lookup = {}
    for row in overall_table:
        team_name = (row.get("team") or {}).get("name") or ""
        team_lookup[canonical_team_name(team_name)] = row
    grouped_standings = {}
    for group_id, team_names in GROUP_TEAMS.items():
        rows = [
            normalize_row(team_lookup[team_name])
            for team_name in team_names
            if team_name in team_lookup
        ]
        rows.sort(key=group_sort_key)
        for position, row in enumerate(rows, start=1):
            row["position"] = position
        grouped_standings[group_id] = rows
    return grouped_standings


def extract_overall_standings(raw_data: dict[str, Any]) -> list[dict[str, Any]]:
    overall_table = find_overall_group_stage_table(raw_data)
    if overall_table:
        return [normalize_row(row) for row in overall_table]
    return []


def find_overall_group_stage_table(raw_data: dict[str, Any]) -> list[dict[str, Any]]:
    for standing in raw_data.get("standings", []):
        if (
            standing.get("stage") == "GROUP_STAGE"
            and standing.get("type") == "TOTAL"
            and not standing.get("group")
        ):
            return standing.get("table", [])
    return []


def group_sort_key(row: dict[str, Any]) -> tuple[int, int, int, int, int, str]:
    return official_rankings.group_sort_key(row, fifa_ranking)


def fifa_ranking(team_name: str) -> int:
    return load_fifa_rankings(FIFA_RANKINGS_PATH).get(canonical_team_name(team_name), 9999)


def load_fifa_rankings(path: Path | None = None) -> dict[str, int]:
    if path is None:
        path = FIFA_RANKINGS_PATH
    if not path.exists():
        return {}

    payload = json.loads(path.read_text(encoding="utf-8"))
    rankings = payload.get("rankings", payload)
    if not isinstance(rankings, dict):
        raise ValueError(f"Invalid FIFA rankings file: {display_path(path)}")

    normalized_rankings = {}
    for team_name, value in rankings.items():
        if value in (None, ""):
            continue
        try:
            ranking = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Invalid FIFA ranking for {team_name!r} in {display_path(path)}"
            ) from exc
        if ranking <= 0:
            raise ValueError(
                f"Invalid FIFA ranking for {team_name!r} in {display_path(path)}"
            )
        normalized_rankings[canonical_team_name(str(team_name))] = ranking
    return normalized_rankings


def parse_group_id(value: str) -> str:
    text = str(value or "").strip().upper()
    if text.startswith("GROUP_") and len(text) >= 7:
        return text[-1]
    if text.startswith("GROUP ") and len(text) >= 7:
        return text[-1]
    if len(text) == 1 and text in GROUP_IDS:
        return text
    return ""


def normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    team = row.get("team") or {}
    goals_for = int_value(row.get("goalsFor"))
    goals_against = int_value(row.get("goalsAgainst"))
    goal_difference = row.get("goalDifference")
    if goal_difference is None:
        goal_difference = goals_for - goals_against

    return {
        "team": canonical_team_name(
            team.get("name") or team.get("shortName") or team.get("tla") or ""
        ),
        "teamCode": team.get("tla") or "",
        "position": int_value(row.get("position")),
        "played": int_value(row.get("playedGames")),
        "won": int_value(row.get("won")),
        "drawn": int_value(row.get("draw")),
        "lost": int_value(row.get("lost")),
        "goalsFor": goals_for,
        "goalsAgainst": goals_against,
        "goalDifference": int_value(goal_difference),
        "points": int_value(row.get("points")),
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


def is_complete_group(rows: list[dict[str, Any]]) -> bool:
    return (
        len(rows) >= GROUP_SIZE
        and all(row["played"] >= GROUP_STAGE_GAMES for row in rows[:GROUP_SIZE])
    )


def best_thirds(completed_groups: dict[str, list[dict[str, Any]]]) -> list[str]:
    if len(completed_groups) != len(GROUP_IDS):
        return []

    return official_rankings.ranked_best_thirds(completed_groups)


def timeline_checkpoints(
    group_standings: dict[str, list[dict[str, Any]]],
    completed_groups: dict[str, list[dict[str, Any]]],
    futures: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build browser-ready score timeline checkpoints from available results."""

    matchday = current_group_matchday(group_standings)
    if matchday is None:
        return []

    return [
        {
            "key": f"group_md{matchday}",
            "label": f"After group matchday {matchday}",
            "stage": "group_stage",
            "completedAt": "",
            "scenario": {
                "groupResults": provisional_group_results(group_standings),
                "bestThirds": provisional_best_thirds(
                    group_standings,
                    best_thirds(completed_groups),
                ),
                "futures": futures,
            },
            "officialMatches": [],
        }
    ]


def current_group_matchday(group_standings: dict[str, list[dict[str, Any]]]) -> int | None:
    played_values = [
        row["played"]
        for rows in group_standings.values()
        for row in rows[:GROUP_SIZE]
        if row["played"] > 0
    ]
    if not played_values:
        return None
    return max(1, min(GROUP_STAGE_GAMES, min(played_values)))


def provisional_group_results(
    group_standings: dict[str, list[dict[str, Any]]]
) -> dict[str, list[str]]:
    return {
        group_id: [row["team"] for row in group_standings.get(group_id, [])[:3]]
        for group_id in GROUP_IDS
    }


def provisional_best_thirds(
    group_standings: dict[str, list[dict[str, Any]]],
    fallback_best_thirds: list[str],
) -> list[str]:
    thirds = [
        rows[2]
        for rows in group_standings.values()
        if len(rows) >= 3 and rows[2]["team"]
    ]
    if not thirds:
        return fallback_best_thirds
    return official_rankings.ranked_best_thirds(group_standings)


def eliminated_group_stage_teams(
    group_standings: dict[str, list[dict[str, Any]]],
    completed_groups: dict[str, list[dict[str, Any]]],
) -> dict[str, str]:
    if len(completed_groups) != len(GROUP_IDS):
        return {}

    qualified = {
        row["team"]
        for rows in completed_groups.values()
        for row in rows[:2]
    }
    qualified.update(best_thirds(completed_groups))

    return {
        row["team"]: "group_stage"
        for rows in group_standings.values()
        for row in rows
        if row["team"] and row["team"] not in qualified
    }


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"official results update failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
