#!/usr/bin/env python3
"""Build normalized prediction exports and a standalone visualization.

The source file is the browser-ready `data/generated/pool_data.js` export. This
script keeps the workbook extraction as the source of truth and only reshapes it
into easier-to-use group-stage and futures structures.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "data" / "generated" / "pool_data.js"
GENERATED_DIR = ROOT / "data" / "generated"
APP_DIR = ROOT / "apps" / "prediction_exports"

GROUP_STAGE_PATH = GENERATED_DIR / "group_stage_predictions.json"
FUTURES_PATH = GENERATED_DIR / "futures_predictions.json"
SUMMARY_PATH = GENERATED_DIR / "prediction_summary.json"
VISUALIZATION_PATH = APP_DIR / "index.html"

GROUP_HEADER_PATTERN = re.compile(r"^Group ([A-L])$")
RANK_PATTERN = re.compile(r"^\d+(?:\.0)?$")
STAGE_NORMALIZATION = {
    "group stage": "group_stage",
    "round of 32": "round_of_32",
    "round of 16": "round_of_16",
    "quarter final": "quarterfinal",
    "quarterfinal": "quarterfinal",
    "semi final": "semifinal",
    "semifinal": "semifinal",
    "runner-up": "runner_up",
    "runner up": "runner_up",
    "champion": "champion",
    "winner": "champion",
}


def main() -> None:
    pool_data = load_pool_data(SOURCE_PATH)
    generated_at = datetime.now(timezone.utc).isoformat()

    group_stage = {
        "metadata": metadata(pool_data, generated_at),
        "players": [group_stage_entry(player) for player in pool_data["players"]],
    }
    futures = {
        "metadata": metadata(pool_data, generated_at),
        "players": [futures_entry(player) for player in pool_data["players"]],
    }
    summary = {
        "metadata": metadata(pool_data, generated_at),
        "group_winner_consensus": group_winner_consensus(group_stage["players"]),
        "futures_consensus": futures_consensus(futures["players"]),
        "best_third_consensus": best_third_consensus(group_stage["players"]),
    }

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    APP_DIR.mkdir(parents=True, exist_ok=True)
    write_json(GROUP_STAGE_PATH, group_stage)
    write_json(FUTURES_PATH, futures)
    write_json(SUMMARY_PATH, summary)
    VISUALIZATION_PATH.write_text(render_visualization(group_stage, futures, summary), encoding="utf-8")

    print(f"Wrote {GROUP_STAGE_PATH.relative_to(ROOT)}")
    print(f"Wrote {FUTURES_PATH.relative_to(ROOT)}")
    print(f"Wrote {SUMMARY_PATH.relative_to(ROOT)}")
    print(f"Wrote {VISUALIZATION_PATH.relative_to(ROOT)}")


def load_pool_data(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    match = re.fullmatch(r"\s*window\.POOL_DATA\s*=\s*(.*);\s*", text, re.S)
    if not match:
        raise ValueError(f"Could not parse {path}")
    return json.loads(match.group(1))


def metadata(pool_data: dict, generated_at: str) -> dict:
    return {
        "source_file": str(SOURCE_PATH.relative_to(ROOT)),
        "workbook_source": pool_data.get("source_file", ""),
        "generated_from": pool_data.get("generated_from", ""),
        "generated_at": generated_at,
        "player_count": len(pool_data.get("players", [])),
    }


def group_stage_entry(player: dict) -> dict:
    groups = extract_groups(player.get("first_round_grid", []))
    return {
        "player_name": player["name"],
        "sheet": player["sheet"],
        "groups": [
            {
                "group_id": group_id,
                "ordered_teams": [pick["team"] for pick in picks],
                "picks": picks,
            }
            for group_id, picks in sorted(groups.items())
        ],
        "best_thirds": [
            {"rank": parse_rank(pick.get("rank", "")), "team": pick.get("team", "")}
            for pick in player.get("best_thirds", [])
            if pick.get("rank") or pick.get("team")
        ],
    }


def extract_groups(grid: list[dict]) -> dict[str, list[dict]]:
    rows = [row["cells"] for row in grid]
    groups: dict[str, list[dict]] = {}

    for row_index, cells in enumerate(rows):
        for column_index, value in enumerate(cells):
            header = GROUP_HEADER_PATTERN.match(value)
            if not header:
                continue

            group_id = header.group(1)
            picks = []
            rank_column = column_index
            team_column = column_index + 1
            scan_index = row_index + 1

            while scan_index < len(rows):
                scan_row = rows[scan_index]
                if rank_column >= len(scan_row) or team_column >= len(scan_row):
                    break

                raw_rank = scan_row[rank_column]
                team = scan_row[team_column]
                if not RANK_PATTERN.match(raw_rank):
                    break

                picks.append({"rank": parse_rank(raw_rank), "team": team})
                scan_index += 1

            groups[group_id] = picks

    return groups


def futures_entry(player: dict) -> dict:
    futures = player["futures"]
    return {
        "player_name": player["name"],
        "sheet": player["sheet"],
        "champion": value(futures, "champion"),
        "runner_up": value(futures, "runner_up"),
        "favorite_team": value(futures, "favorite_team"),
        "favorite_team_round": value(futures, "favorite_team_round"),
        "favorite_team_round_key": normalize_stage(value(futures, "favorite_team_round")),
        "top_scorer": value(futures, "top_scorer"),
        "ecuador_round": value(futures, "ecuador_round"),
        "ecuador_round_key": normalize_stage(value(futures, "ecuador_round")),
    }


def value(futures: dict, key: str) -> str:
    return futures.get(key, {}).get("value", "")


def normalize_stage(stage: str) -> str:
    return STAGE_NORMALIZATION.get(stage.strip().lower(), stage.strip().lower().replace(" ", "_"))


def parse_rank(raw_rank: str) -> int | None:
    if not raw_rank:
        return None
    return int(float(raw_rank))


def group_winner_consensus(players: list[dict]) -> dict:
    counters: dict[str, Counter] = defaultdict(Counter)
    for player in players:
        for group in player["groups"]:
            if group["ordered_teams"]:
                counters[group["group_id"]][group["ordered_teams"][0]] += 1
    return {
        group_id: [
            {"team": team, "votes": votes}
            for team, votes in counter.most_common()
        ]
        for group_id, counter in sorted(counters.items())
    }


def futures_consensus(players: list[dict]) -> dict:
    fields = ("champion", "runner_up", "favorite_team", "top_scorer", "ecuador_round")
    return {
        field: [{"value": item, "votes": votes} for item, votes in Counter(player[field] for player in players).most_common()]
        for field in fields
    }


def best_third_consensus(players: list[dict]) -> list[dict]:
    counter = Counter(
        pick["team"]
        for player in players
        for pick in player["best_thirds"]
        if pick["team"]
    )
    return [{"team": team, "votes": votes} for team, votes in counter.most_common()]


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render_visualization(group_stage: dict, futures: dict, summary: dict) -> str:
    data_script = json.dumps(
        {"groupStage": group_stage, "futures": futures, "summary": summary},
        ensure_ascii=False,
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>World Cup Pool Predictions</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #1d2733;
      --muted: #667385;
      --line: #d9dee7;
      --accent: #12715f;
      --accent-soft: #dcefe9;
      --warn: #a35d00;
      --warn-soft: #f6e8cf;
      --blue: #1d5f9f;
      --blue-soft: #dce9f7;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }}
    header {{
      padding: 28px clamp(16px, 4vw, 48px) 18px;
      background: #101820;
      color: #fff;
    }}
    h1, h2, h3 {{ margin: 0; letter-spacing: 0; }}
    h1 {{ font-size: clamp(28px, 4vw, 46px); font-weight: 760; }}
    header p {{ max-width: 900px; margin: 10px 0 0; color: #d6dde7; }}
    main {{
      padding: 24px clamp(16px, 4vw, 48px) 44px;
      display: grid;
      gap: 24px;
    }}
    section {{
      display: grid;
      gap: 14px;
    }}
    .summary-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }}
    .metric {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }}
    .metric span {{
      display: block;
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
      text-transform: uppercase;
    }}
    .metric strong {{
      display: block;
      margin-top: 8px;
      font-size: 28px;
      line-height: 1.1;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }}
    .panel-head {{
      padding: 16px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .panel-head p {{ margin: 4px 0 0; color: var(--muted); }}
    .charts {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
      padding: 16px;
    }}
    .chart {{
      display: grid;
      gap: 10px;
      min-width: 0;
    }}
    .bar-row {{
      display: grid;
      grid-template-columns: minmax(92px, 150px) 1fr 36px;
      align-items: center;
      gap: 10px;
      font-size: 14px;
    }}
    .bar-label {{
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }}
    .bar-track {{
      height: 14px;
      border-radius: 999px;
      background: #ecf0f5;
      overflow: hidden;
    }}
    .bar {{
      height: 100%;
      min-width: 3px;
      border-radius: inherit;
      background: var(--accent);
    }}
    .chart:nth-child(2n) .bar {{ background: var(--blue); }}
    .chart:nth-child(3n) .bar {{ background: var(--warn); }}
    table {{
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }}
    th, td {{
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }}
    th {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      background: #f9fafc;
    }}
    td {{
      overflow-wrap: anywhere;
    }}
    .player-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
      padding: 16px;
    }}
    .player-card {{
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      display: grid;
      gap: 12px;
      background: #fff;
    }}
    .player-card h3 {{
      font-size: 17px;
      line-height: 1.25;
    }}
    .picks {{
      display: grid;
      gap: 8px;
    }}
    .pick-line {{
      display: grid;
      grid-template-columns: 64px 1fr;
      gap: 8px;
      font-size: 13px;
    }}
    .tag {{
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 3px 9px;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 700;
      font-size: 12px;
      white-space: nowrap;
    }}
    .tag.blue {{ background: var(--blue-soft); color: var(--blue); }}
    .tag.warn {{ background: var(--warn-soft); color: var(--warn); }}
    @media (max-width: 720px) {{
      .bar-row {{ grid-template-columns: minmax(82px, 120px) 1fr 28px; }}
      th, td {{ padding: 9px; }}
    }}
  </style>
</head>
<body>
  <header>
    <h1>World Cup Pool Predictions</h1>
    <p>Normalized group-stage picks and futures from <strong>{group_stage["metadata"]["source_file"]}</strong>.</p>
  </header>
  <main>
    <section class="summary-grid" id="metrics"></section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Consensus Futures</h2>
          <p>Most common long-range picks across the pool.</p>
        </div>
      </div>
      <div class="charts" id="futuresCharts"></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Group Winner Consensus</h2>
          <p>First-place picks by group.</p>
        </div>
      </div>
      <div class="charts" id="groupCharts"></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Player Futures</h2>
          <p>Submitted futures for every player.</p>
        </div>
      </div>
      <div style="overflow:auto">
        <table id="futuresTable"></table>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Stage Predictions</h2>
          <p>Each card lists group winners, runners-up, and best-third selections.</p>
        </div>
      </div>
      <div class="player-grid" id="playerCards"></div>
    </section>
  </main>
  <script id="prediction-data" type="application/json">{data_script}</script>
  <script>
    const data = JSON.parse(document.querySelector("#prediction-data").textContent);
    const playerCount = data.groupStage.players.length;

    document.querySelector("#metrics").replaceChildren(
      metric("Players", playerCount)
    );

    const futuresLabels = {{
      champion: "Champion",
      runner_up: "Runner-up",
      favorite_team: "Favorite team",
      top_scorer: "Top scorer",
      ecuador_round: "Ecuador round"
    }};

    document.querySelector("#futuresCharts").replaceChildren(
      ...Object.entries(data.summary.futures_consensus).map(([field, rows]) =>
        chart(futuresLabels[field] || field, rows.map(row => [row.value || "Blank", row.votes]), playerCount)
      )
    );

    document.querySelector("#groupCharts").replaceChildren(
      ...Object.entries(data.summary.group_winner_consensus).map(([groupId, rows]) =>
        chart(`Group ${{groupId}}`, rows.map(row => [row.team || "Blank", row.votes]), playerCount)
      )
    );

    renderFuturesTable();
    renderPlayerCards();

    function metric(label, value) {{
      const node = document.createElement("article");
      node.className = "metric";
      node.innerHTML = `<span>${{escapeHtml(label)}}</span><strong>${{escapeHtml(String(value))}}</strong>`;
      return node;
    }}

    function chart(title, rows, maxVotes) {{
      const node = document.createElement("article");
      node.className = "chart";
      const heading = document.createElement("h3");
      heading.textContent = title;
      node.append(heading);
      rows.forEach(([label, votes]) => {{
        const row = document.createElement("div");
        row.className = "bar-row";
        row.innerHTML = `
          <div class="bar-label" title="${{escapeHtml(label)}}">${{escapeHtml(label)}}</div>
          <div class="bar-track"><div class="bar" style="width: ${{Math.max(3, votes / maxVotes * 100)}}%"></div></div>
          <strong>${{votes}}</strong>
        `;
        node.append(row);
      }});
      return node;
    }}

    function renderFuturesTable() {{
      const table = document.querySelector("#futuresTable");
      table.innerHTML = `
        <thead>
          <tr>
            <th>Player</th>
            <th>Champion</th>
            <th>Runner-up</th>
            <th>Favorite</th>
            <th>Favorite Round</th>
            <th>Top Scorer</th>
            <th>Ecuador Round</th>
          </tr>
        </thead>
        <tbody>
          ${{data.futures.players.map(player => `
            <tr>
              <td>${{escapeHtml(player.player_name)}}</td>
              <td>${{escapeHtml(player.champion)}}</td>
              <td>${{escapeHtml(player.runner_up)}}</td>
              <td>${{escapeHtml(player.favorite_team)}}</td>
              <td>${{escapeHtml(player.favorite_team_round)}}</td>
              <td>${{escapeHtml(player.top_scorer)}}</td>
              <td>${{escapeHtml(player.ecuador_round)}}</td>
            </tr>
          `).join("")}}
        </tbody>
      `;
    }}

    function renderPlayerCards() {{
      const cards = data.groupStage.players.map(player => {{
        const node = document.createElement("article");
        node.className = "player-card";
        const groupPredictions = player.groups
          .map(group => `
            <div class="pick-line">
              <span class="tag">Group ${{group.group_id}}</span>
              <span>
                <strong>Winner:</strong> ${{escapeHtml(group.ordered_teams[0] || "Blank")}}<br>
                <strong>Runner-up:</strong> ${{escapeHtml(group.ordered_teams[1] || "Blank")}}
              </span>
            </div>
          `)
          .join("");
        const bestThirds = player.best_thirds.map(pick => escapeHtml(pick.team)).join(", ");
        node.innerHTML = `
          <h3>${{escapeHtml(player.player_name)}}</h3>
          <div class="picks">${{groupPredictions}}</div>
          <div>
            <span class="tag warn">Best thirds</span>
            <span>${{bestThirds || "Blank"}}</span>
          </div>
        `;
        return node;
      }});
      document.querySelector("#playerCards").replaceChildren(...cards);
    }}

    function escapeHtml(value) {{
      return String(value).replace(/[&<>"']/g, character => ({{
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }}[character]));
    }}
  </script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
