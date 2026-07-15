#!/usr/bin/env python3
"""Build Quarterfinals consensus data and the legacy consensus page."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "data" / "generated" / "knockout_predictions.js"
GENERATED_DIR = ROOT / "data" / "generated"
APP_DIR = ROOT / "apps" / "quarterfinal_consensus"

CONSENSUS_PATH = GENERATED_DIR / "quarterfinal_consensus.json"
VISUALIZATION_PATH = APP_DIR / "index.html"
STAGE = "quarterfinal"
STAGE_LABEL = "Quarterfinals"
DATA_SCRIPT_ID = "quarterfinal-consensus-data"
ASSET_PREFIX = ""

COUNTRY_ALIASES = {
    "bosnia": "Bosnia-Herzegovina",
    "bosnia and herzegovina": "Bosnia-Herzegovina",
    "bosnia-herzegovina": "Bosnia-Herzegovina",
    "morroco": "Morocco",
    "morocco": "Morocco",
    "nederlands": "Netherlands",
    "netherlands": "Netherlands",
}


def main() -> None:
    knockout_data = load_knockout_data(SOURCE_PATH)
    consensus = build_consensus(knockout_data)

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    APP_DIR.mkdir(parents=True, exist_ok=True)
    write_json(CONSENSUS_PATH, consensus)
    VISUALIZATION_PATH.write_text(render_visualization(consensus), encoding="utf-8")

    print(f"Wrote {CONSENSUS_PATH.relative_to(ROOT)}")
    print(f"Wrote {VISUALIZATION_PATH.relative_to(ROOT)}")


def load_knockout_data(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    match = re.fullmatch(r"\s*window\.KNOCKOUT_PREDICTIONS\s*=\s*(.*);\s*", text, re.S)
    if not match:
        raise ValueError(f"Could not parse {path}")
    return json.loads(match.group(1))


def build_consensus(knockout_data: dict) -> dict:
    players = knockout_data.get("players", [])
    stage_data = next(
        (stage for stage in knockout_data.get("stages", []) if stage.get("stage") == STAGE),
        {},
    )
    match_ids = [str(match_id) for match_id in stage_data.get("matchIds", [])]
    player_count = len(players)

    return {
        "metadata": {
            "source_file": str(SOURCE_PATH.relative_to(ROOT)),
            "generated_from": knockout_data.get("generated_from", []),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "stage": STAGE,
            "stage_label": STAGE_LABEL,
            "player_count": player_count,
            "match_count": len(match_ids),
        },
        "matches": [match_consensus(match_id, players, player_count) for match_id in match_ids],
        "advancing_teams": advancing_team_consensus(players),
        "bonus_questions": bonus_question_consensus(players),
    }


def match_consensus(match_id: str, players: list[dict], player_count: int) -> dict:
    match_picks = [
        match
        for player in players
        for match in player.get("matches", [])
        if match.get("stage") == STAGE and str(match.get("matchId")) == match_id
    ]
    teams = matchup(match_picks)
    advancing_rows = counter_rows(
        Counter(normalize_country(match.get("predictedAdvancingTeam", "")) for match in match_picks),
        include_blank=True,
    )
    score_rows = counter_rows(Counter(score_label(match) for match in match_picks))
    penalty_rows = counter_rows(Counter(penalty_label(match) for match in match_picks if has_penalties(match)))

    return {
        "matchId": match_id,
        "homeTeam": teams["homeTeam"],
        "awayTeam": teams["awayTeam"],
        "picks": len(match_picks),
        "missingPicks": max(player_count - len(match_picks), 0),
        "advancingTeamConsensus": advancing_rows,
        "scoreConsensus": score_rows,
        "penaltyConsensus": penalty_rows,
    }


def matchup(match_picks: list[dict]) -> dict:
    home_counter = Counter(normalize_country(match.get("homeTeam", "")) for match in match_picks)
    away_counter = Counter(normalize_country(match.get("awayTeam", "")) for match in match_picks)
    return {
        "homeTeam": top_label(home_counter),
        "awayTeam": top_label(away_counter),
    }


def advancing_team_consensus(players: list[dict]) -> list[dict]:
    counter = Counter(
        normalize_country(match.get("predictedAdvancingTeam", ""))
        for player in players
        for match in player.get("matches", [])
        if match.get("stage") == STAGE
    )
    return counter_rows(counter)


def bonus_question_consensus(players: list[dict]) -> list[dict]:
    counters: dict[str, Counter] = defaultdict(Counter)
    question_order: list[str] = []
    for player in players:
        for answer in player.get("bonusAnswers", {}).get(STAGE, []):
            question = clean_text(answer.get("question", ""))
            value = normalize_bonus_answer(question, answer.get("answer", ""))
            if question:
                if question not in counters:
                    question_order.append(question)
                counters[question][value or "Blank"] += 1

    return [
        {
            "question": question,
            "answers": counter_rows(counter),
        }
        for question in question_order
        for counter in [counters[question]]
    ]


def score_label(match: dict) -> str:
    home_score = match.get("homeScore")
    away_score = match.get("awayScore")
    if home_score is None or away_score is None:
        return "Blank"
    return f"{home_score}-{away_score}"


def penalty_label(match: dict) -> str:
    home_penalty = match.get("homePenaltyScore")
    away_penalty = match.get("awayPenaltyScore")
    if home_penalty is None or away_penalty is None:
        return "No penalties"
    return f"{home_penalty}-{away_penalty}"


def has_penalties(match: dict) -> bool:
    return match.get("homePenaltyScore") is not None or match.get("awayPenaltyScore") is not None


def normalize_bonus_answer(question: str, answer: object) -> str:
    value = display_value(answer)
    if "Which team" in question or question.startswith("Team with"):
        return normalize_country(value)
    return value


def display_value(value: object) -> str:
    text = clean_text(value)
    if re.fullmatch(r"-?\d+\.0", text):
        return str(int(float(text)))
    return text


def counter_rows(counter: Counter, include_blank: bool = False) -> list[dict]:
    return [
        {"value": value or "Blank", "votes": votes}
        for value, votes in counter.most_common()
        if include_blank or value
    ]


def top_label(counter: Counter) -> str:
    for value, _votes in counter.most_common():
        if value:
            return value
    return "TBD"


def normalize_country(name: str) -> str:
    cleaned = clean_text(name)
    return COUNTRY_ALIASES.get(normalization_key(cleaned), cleaned)


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def normalization_key(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", clean_text(name))
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_name.lower()


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render_visualization(consensus: dict) -> str:
    data_script = json.dumps({"consensus": consensus}, ensure_ascii=False)
    return f"""<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>World Cup Pool {STAGE_LABEL} Consensus</title>
  <script src="../../theme.js"></script>
  <link rel="stylesheet" href="{ASSET_PREFIX}styles.css">
</head>

<body>
  <header class="topbar">
    <div class="title-row">
      <div>
        <p class="eyebrow">World Cup 2026 Pool</p>
        <h1>{STAGE_LABEL} Consensus</h1>
      </div>
      <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false"><span data-theme-toggle-label>Dark mode</span></button>
    </div>
    <nav class="site-nav" aria-label="Visualization navigation">
      <a href="../../index.html">Home</a>
      <a href="../rules/index.html">Rules</a>
      <a href="../player_predictions/index.html">Player Picks</a>
      <a href="../knockout_bracket/index.html">Bracket</a>
      <a href="../score_visualizer/index.html">Scores</a>
      <a href="../score_timeline/index.html">Official results</a>
      <a href="../blog/index.html">Blog</a>
      <a class="active" href="../legacy/index.html" aria-current="page">Legacy</a>
    </nav>
  </header>

  <main class="page">
    <section class="summary-grid" id="metrics" aria-label="{STAGE_LABEL} consensus metrics"></section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Predicted winners</p>
          <h2>Match Consensus</h2>
        </div>
      </div>
      <div class="match-grid" id="matchGrid"></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Overall picks</p>
          <h2>Advancing Teams</h2>
        </div>
      </div>
      <div class="chart-list" id="advancingTeams"></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Bonus questions</p>
          <h2>{STAGE_LABEL} Bonus Consensus</h2>
        </div>
      </div>
      <div class="bonus-grid" id="bonusQuestions"></div>
    </section>
  </main>

  <script id="{DATA_SCRIPT_ID}" type="application/json">{data_script}</script>
  <script src="{ASSET_PREFIX}app.js"></script>
</body>

</html>
"""


if __name__ == "__main__":
    main()
