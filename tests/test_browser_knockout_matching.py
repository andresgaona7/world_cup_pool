import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_browser_payload(path: str, assignment: str) -> dict:
    text = (ROOT / path).read_text(encoding="utf-8")
    payload = text.removeprefix(f"window.{assignment} = ").removesuffix(";\n")
    return json.loads(payload)


def knockout_team_aliases(path: str) -> dict[str, str]:
    text = (ROOT / path).read_text(encoding="utf-8")
    match = re.search(r"const KNOCKOUT_TEAM_ALIASES = \{(?P<body>.*?)\};", text, re.S)
    if not match:
        raise AssertionError(f"KNOCKOUT_TEAM_ALIASES not found in {path}")

    aliases = {}
    for quoted_alias, bare_alias, canonical in re.findall(r'(?:"([^"]+)"|([a-zA-Z_]+)):\s*"([^"]+)"', match.group("body")):
        aliases[quoted_alias or bare_alias] = canonical
    return aliases


def canonical_team(name: str, aliases: dict[str, str]) -> str:
    normalized = name.strip().lower()
    return aliases.get(normalized, normalized)


def fixture_key(match: dict, aliases: dict[str, str]) -> tuple[str, str, str]:
    return (
        match["stage"],
        canonical_team(match["homeTeam"], aliases),
        canonical_team(match["awayTeam"], aliases),
    )


class BrowserKnockoutMatchingTests(unittest.TestCase):
    def test_score_visualizer_aliases_match_round_of_32_predictions_to_official_fixtures(self):
        official = load_browser_payload("data/generated/official_results.js", "OFFICIAL_RESULTS")
        predictions = load_browser_payload("data/generated/knockout_predictions.js", "KNOCKOUT_PREDICTIONS")
        aliases = knockout_team_aliases("apps/score_visualizer/app.js")

        official_by_match_id = {
            match["matchId"]: match
            for match in official["matches"]
            if match.get("stage") == "round_of_32"
        }
        player_predictions = predictions["players"][0]["matches"]
        prediction_keys = {fixture_key(match, aliases) for match in player_predictions}

        for match_id in ("80", "86"):
            with self.subTest(match_id=match_id):
                self.assertIn(fixture_key(official_by_match_id[match_id], aliases), prediction_keys)

    def test_public_knockout_alias_tables_match_source_apps(self):
        for app in ("score_visualizer", "score_timeline"):
            with self.subTest(app=app):
                source_aliases = knockout_team_aliases(f"apps/{app}/app.js")
                public_aliases = knockout_team_aliases(f"public/apps/{app}/app.js")
                self.assertEqual(public_aliases, source_aliases)
