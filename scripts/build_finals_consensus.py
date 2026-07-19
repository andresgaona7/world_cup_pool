#!/usr/bin/env python3
"""Build combined third-place and final consensus data and legacy page."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone

import build_quarterfinal_consensus as builder


STAGES = ("third_place_match", "final")


def build_consensus(knockout_data: dict) -> dict:
    players = knockout_data.get("players", [])
    stage_metadata = {
        stage.get("stage"): stage for stage in knockout_data.get("stages", [])
    }
    match_ids = [
        str(match_id)
        for stage in STAGES
        for match_id in stage_metadata.get(stage, {}).get("matchIds", [])
    ]
    player_count = len(players)
    matches = []
    advancing_counter = Counter()
    bonus_counters: dict[str, Counter] = defaultdict(Counter)
    question_order = []

    for stage, match_id in zip(STAGES, match_ids, strict=True):
        builder.STAGE = stage
        matches.append(builder.match_consensus(match_id, players, player_count))
        for player in players:
            for match in player.get("matches", []):
                if match.get("stage") == stage:
                    advancing_counter[builder.normalize_country(match.get("predictedAdvancingTeam", ""))] += 1

    for player in players:
        for answer in player.get("bonusAnswers", {}).get("final", []):
            question = builder.clean_text(answer.get("question", ""))
            if not question:
                continue
            if question not in bonus_counters:
                question_order.append(question)
            bonus_counters[question][builder.normalize_bonus_answer(question, answer.get("answer", "")) or "Blank"] += 1

    return {
        "metadata": {
            "source_file": str(builder.SOURCE_PATH.relative_to(builder.ROOT)),
            "generated_from": knockout_data.get("generated_from", []),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "stage": "finals",
            "stage_label": "Finals",
            "player_count": player_count,
            "match_count": len(matches),
        },
        "matches": matches,
        "advancing_teams": builder.counter_rows(advancing_counter),
        "bonus_questions": [
            {"question": question, "answers": builder.counter_rows(bonus_counters[question])}
            for question in question_order
        ],
    }


def main() -> None:
    builder.APP_DIR = builder.ROOT / "apps" / "finals_consensus"
    builder.CONSENSUS_PATH = builder.GENERATED_DIR / "finals_consensus.json"
    builder.VISUALIZATION_PATH = builder.APP_DIR / "index.html"
    builder.STAGE = "finals"
    builder.STAGE_LABEL = "Finals"
    builder.DATA_SCRIPT_ID = "finals-consensus-data"
    builder.ASSET_PREFIX = "../quarterfinal_consensus/"

    knockout_data = builder.load_knockout_data(builder.SOURCE_PATH)
    consensus = build_consensus(knockout_data)
    builder.GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    builder.APP_DIR.mkdir(parents=True, exist_ok=True)
    builder.write_json(builder.CONSENSUS_PATH, consensus)
    builder.VISUALIZATION_PATH.write_text(builder.render_visualization(consensus), encoding="utf-8")
    print(f"Wrote {builder.CONSENSUS_PATH.relative_to(builder.ROOT)}")
    print(f"Wrote {builder.VISUALIZATION_PATH.relative_to(builder.ROOT)}")


if __name__ == "__main__":
    main()
