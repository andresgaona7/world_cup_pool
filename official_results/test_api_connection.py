import requests
import json

GROUPS = {
    "A": ["Mexico", "South Africa", "South Korea", "Czechia"],
    "B": ["Canada", "Bosnia-Herzegovina", "Qatar", "Switzerland"],
    "C": ["Brazil", "Morocco", "Haiti", "Scotland"],
    "D": ["United States", "Paraguay", "Australia", "Türkiye"],
    "E": ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
    "F": ["Netherlands", "Japan", "Sweden", "Tunisia"],
    "G": ["Belgium", "Egypt", "Iran", "New Zealand"],
    "H": ["Spain", "Cape Verde Islands", "Saudi Arabia", "Uruguay"],
    "I": ["France", "Senegal", "Iraq", "Norway"],
    "J": ["Argentina", "Algeria", "Austria", "Jordan"],
    "K": ["Portugal", "Congo DR", "Uzbekistan", "Colombia"],
    "L": ["England", "Croatia", "Ghana", "Panama"],
}

API_KEY = "9a022f9d132d4a5d9d01116e0f99ab6f"
headers = {
    "X-Auth-Token": API_KEY
}

url = "https://api.football-data.org/v4/competitions/WC/standings?season=2026"
headers = {"X-Auth-Token": API_KEY}
response = requests.get(url, headers=headers)
data = response.json()
total_table = next(
    s["table"] for s in data["standings"]
    if s["stage"] == "GROUP_STAGE" and s["type"] == "TOTAL"
)

team_lookup = {
    row["team"]["name"]: row
    for row in total_table
}

grouped_standings = {}
for group_name, teams in GROUPS.items():
    group_rows = []
    for team_name in teams:
        if team_name in team_lookup:
            group_rows.append(team_lookup[team_name])
    group_rows.sort(
        key=lambda row: (
            row["points"],
            row["goalDifference"],
            row["goalsFor"],
            row["won"]
        ),
        reverse=True
    )
    
    grouped_standings[group_name] = group_rows

for group_name, rows in grouped_standings.items():
    print(f"\nGROUP {group_name}")
    print("-" * 60)
    for pos, row in enumerate(rows, start=1):
        print(
            f"{pos}. {row['team']['name']:22} "
            f"Pts:{row['points']:2} "
            f"P:{row['playedGames']} "
            f"W:{row['won']} "
            f"D:{row['draw']} "
            f"L:{row['lost']} "
            f"GF:{row['goalsFor']} "
            f"GA:{row['goalsAgainst']} "
            f"GD:{row['goalDifference']}"
        )
        
clean_grouped = {}

for group_name, rows in grouped_standings.items():
    clean_grouped[group_name] = []

    for pos, row in enumerate(rows, start=1):
        clean_grouped[group_name].append({
            "position": pos,
            "team": row["team"]["name"],
            "tla": row["team"]["tla"],
            "played": row["playedGames"],
            "won": row["won"],
            "draw": row["draw"],
            "lost": row["lost"],
            "points": row["points"],
            "goalsFor": row["goalsFor"],
            "goalsAgainst": row["goalsAgainst"],
            "goalDifference": row["goalDifference"],
            "form": row["form"],
        })