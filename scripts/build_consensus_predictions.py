#!/usr/bin/env python3
"""Build consensus prediction data and a standalone consensus visualization."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "data" / "generated" / "pool_data.js"
GENERATED_DIR = ROOT / "data" / "generated"
APP_DIR = ROOT / "apps" / "consensus_predictions"

CONSENSUS_PATH = GENERATED_DIR / "consensus_predictions.json"
VISUALIZATION_PATH = APP_DIR / "index.html"

GROUP_HEADER_PATTERN = re.compile(r"^Group ([A-L])$")
RANK_PATTERN = re.compile(r"^\d+(?:\.0)?$")
REGIONAL_INDICATOR_PATTERN = re.compile(r"[\U0001F1E6-\U0001F1FF]")

COUNTRY_ALIASES = {
    "bosnia": "Bosnia-Herzegovina",
    "bosnia and herzegovina": "Bosnia-Herzegovina",
    "bosnia-herzegovina": "Bosnia-Herzegovina",
    "congo dr": "Congo DR",
    "democratic republic of congo": "Congo DR",
    "democratic republic of the congo": "Congo DR",
    "dr congo": "Congo DR",
    "czech republic": "Czechia",
    "czechia": "Czechia",
    "ecuador": "Ecuador",
    "espana": "Spain",
    "france": "France",
    "netherlands": "Netherlands",
    "portugal": "Portugal",
    "turkey": "Türkiye",
    "turkiye": "Türkiye",
}

PLAYER_ALIASES = {
    "harry keane": "Harry Kane",
    "kylian mbappe": "Kylian Mbappe",
    "kylian mbappe - 7": "Kylian Mbappe",
    "mbappe": "Kylian Mbappe",
    "mikel oyarzabal": "Mikel Oyarzabal",
    "oyarzabal": "Mikel Oyarzabal",
}


def main() -> None:
    pool_data = load_pool_data(SOURCE_PATH)
    generated_at = datetime.now(timezone.utc).isoformat()
    group_stage = [group_stage_entry(player) for player in pool_data["players"]]
    futures = [futures_entry(player) for player in pool_data["players"]]
    consensus = {
        "metadata": metadata(pool_data, generated_at),
        "group_winner_consensus": group_position_consensus(group_stage, 0),
        "group_runner_up_consensus": group_position_consensus(group_stage, 1),
        "group_third_place_consensus": group_position_consensus(group_stage, 2),
        "futures_consensus": futures_consensus(futures),
        "best_third_consensus": best_third_consensus(group_stage),
    }

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    APP_DIR.mkdir(parents=True, exist_ok=True)
    write_json(CONSENSUS_PATH, consensus)
    VISUALIZATION_PATH.write_text(render_visualization(consensus), encoding="utf-8")

    print(f"Wrote {CONSENSUS_PATH.relative_to(ROOT)}")
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
        "groups": [
            {
                "group_id": group_id,
                "ordered_teams": [normalize_country(pick["team"]) for pick in picks],
            }
            for group_id, picks in sorted(groups.items())
        ],
        "best_thirds": [
            {"team": normalize_country(pick.get("team", ""))}
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

                picks.append({"team": team})
                scan_index += 1

            groups[group_id] = picks

    return groups


def futures_entry(player: dict) -> dict:
    futures = player["futures"]
    return {
        "champion": normalize_country(value(futures, "champion")),
        "runner_up": normalize_country(value(futures, "runner_up")),
        "favorite_team": normalize_country(value(futures, "favorite_team")),
        "top_scorer": normalize_player_name(value(futures, "top_scorer")),
        "ecuador_round": value(futures, "ecuador_round"),
    }


def value(futures: dict, key: str) -> str:
    return futures.get(key, {}).get("value", "")


def normalize_country(name: str) -> str:
    cleaned = clean_name(name)
    return COUNTRY_ALIASES.get(normalization_key(cleaned), cleaned)


def normalize_player_name(name: str) -> str:
    cleaned = clean_name(name)
    return PLAYER_ALIASES.get(normalization_key(cleaned), cleaned)


def clean_name(name: str) -> str:
    without_flags = REGIONAL_INDICATOR_PATTERN.sub("", str(name))
    return re.sub(r"\s+", " ", without_flags).strip()


def normalization_key(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", clean_name(name))
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_name.lower()


def group_position_consensus(players: list[dict], position: int) -> dict:
    counters: dict[str, Counter] = defaultdict(Counter)
    for player in players:
        for group in player["groups"]:
            if len(group["ordered_teams"]) > position:
                counters[group["group_id"]][group["ordered_teams"][position]] += 1
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
        field: [
            {"value": item, "votes": votes}
            for item, votes in Counter(player[field] for player in players).most_common()
        ]
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


def render_visualization(consensus: dict) -> str:
    data_script = json.dumps({"consensus": consensus}, ensure_ascii=False)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>World Cup Pool Consensus Predictions</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #1d2733;
      --muted: #667385;
      --line: #d9dee7;
      --accent: #12715f;
      --warn: #a35d00;
      --blue: #1d5f9f;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }}
    .topbar {{
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      padding: 22px 28px;
      background: #14313d;
      color: #fff;
      border-bottom: 4px solid var(--accent);
    }}
    .eyebrow {{
      margin: 0 0 4px;
      color: inherit;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
      opacity: 0.72;
    }}
    h1, h2, h3 {{ margin: 0; letter-spacing: 0; }}
    h1 {{
      font-size: 28px;
      line-height: 1.1;
    }}
    .header-tools {{
      display: grid;
      justify-items: end;
      gap: 10px;
    }}
    .site-nav {{
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 6px;
    }}
    .site-nav a {{
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 6px;
      padding: 6px 10px;
      color: #e7f0f3;
      font-size: 13px;
      font-weight: 750;
      line-height: 1;
      text-decoration: none;
    }}
    .site-nav a:hover,
    .site-nav a:focus {{
      border-color: #ffffff;
      color: #ffffff;
      outline: none;
    }}
    .site-nav a.active {{
      border-color: #ffffff;
      background: #ffffff;
      color: #14313d;
    }}
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
    @media (max-width: 720px) {{
      .topbar {{
        align-items: flex-start;
        flex-direction: column;
        padding: 18px;
      }}
      .header-tools {{
        justify-items: start;
      }}
      .site-nav {{
        justify-content: flex-start;
      }}
      .bar-row {{ grid-template-columns: minmax(82px, 120px) 1fr 28px; }}
    }}
  </style>
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">World Cup 2026 Pool</p>
      <h1>Consensus Predictions</h1>
    </div>
    <div class="header-tools">
      <nav class="site-nav" aria-label="Visualization navigation">
        <a href="../../index.html">Home</a>
        <a href="../rules/index.html">Rules</a>
        <a href="../player_predictions/index.html">Player Picks</a>
        <a href="../score_visualizer/index.html">Scores</a>
        <a href="../third_places/index.html">Third places</a>
        <a href="../score_timeline/index.html">Official results</a>
        <a href="../blog/index.html">Blog</a>
        <a href="../legacy/index.html">Legacy</a>
      </nav>
    </div>
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
      <div class="charts" id="groupWinnerCharts"></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Group Runner-up Consensus</h2>
          <p>Second-place picks by group.</p>
        </div>
      </div>
      <div class="charts" id="groupRunnerUpCharts"></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Group Third-place Consensus</h2>
          <p>Third-place picks by group.</p>
        </div>
      </div>
      <div class="charts" id="groupThirdPlaceCharts"></div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Best Third Consensus</h2>
          <p>Most common best-third selections across the pool.</p>
        </div>
      </div>
      <div class="charts" id="bestThirdCharts"></div>
    </section>
  </main>
  <script id="consensus-data" type="application/json">{data_script}</script>
  <script>
    const data = JSON.parse(document.querySelector("#consensus-data").textContent);
    const consensus = data.consensus;
    const playerCount = consensus.metadata.player_count;

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
      ...Object.entries(consensus.futures_consensus).map(([field, rows]) =>
        chart(futuresLabels[field] || field, rows.map(row => [row.value || "Blank", row.votes]), playerCount)
      )
    );

    document.querySelector("#groupWinnerCharts").replaceChildren(
      ...Object.entries(consensus.group_winner_consensus).map(([groupId, rows]) =>
        chart(`Group ${{groupId}}`, rows.map(row => [row.team || "Blank", row.votes]), playerCount)
      )
    );

    document.querySelector("#groupRunnerUpCharts").replaceChildren(
      ...Object.entries(consensus.group_runner_up_consensus).map(([groupId, rows]) =>
        chart(`Group ${{groupId}}`, rows.map(row => [row.team || "Blank", row.votes]), playerCount)
      )
    );

    document.querySelector("#groupThirdPlaceCharts").replaceChildren(
      ...Object.entries(consensus.group_third_place_consensus).map(([groupId, rows]) =>
        chart(`Group ${{groupId}}`, rows.map(row => [row.team || "Blank", row.votes]), playerCount)
      )
    );

    document.querySelector("#bestThirdCharts").replaceChildren(
      chart(
        "Best thirds",
        consensus.best_third_consensus.map(row => [row.team || "Blank", row.votes]),
        playerCount
      )
    );

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
