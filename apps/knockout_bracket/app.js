const officialData = window.OFFICIAL_RESULTS || {};
const GROUP_IDS = "ABCDEFGHIJKL".split("");
const QUALIFYING_THIRD_PLACE_COUNT = 8;

const ROUND_OF_32 = [
  ["73", "Runner-up Group A", "Runner-up Group B"],
  ["74", "Winner Group E", "Best 3rd Group A/B/C/D/F"],
  ["75", "Winner Group F", "Runner-up Group C"],
  ["76", "Winner Group C", "Runner-up Group F"],
  ["77", "Winner Group I", "Best 3rd Group C/D/F/G/H"],
  ["78", "Runner-up Group E", "Runner-up Group I"],
  ["79", "Winner Group A", "Best 3rd Group C/E/F/H/I"],
  ["80", "Winner Group L", "Best 3rd Group E/H/I/J/K"],
  ["81", "Winner Group D", "Best 3rd Group B/E/F/I/J"],
  ["82", "Winner Group G", "Best 3rd Group A/E/H/I/J"],
  ["83", "Runner-up Group K", "Runner-up Group L"],
  ["84", "Winner Group H", "Runner-up Group J"],
  ["85", "Winner Group B", "Best 3rd Group E/F/G/I/J"],
  ["86", "Winner Group J", "Runner-up Group H"],
  ["87", "Winner Group K", "Best 3rd Group D/E/I/J/L"],
  ["88", "Runner-up Group D", "Runner-up Group G"],
];

const ROUNDS = [
  { key: "round32", title: "Round of 32", matches: ROUND_OF_32 },
  {
    key: "round16",
    title: "Round of 16",
    matches: [
      ["89", "Winner Match 74", "Winner Match 77"],
      ["90", "Winner Match 73", "Winner Match 75"],
      ["91", "Winner Match 76", "Winner Match 78"],
      ["92", "Winner Match 79", "Winner Match 80"],
      ["93", "Winner Match 83", "Winner Match 84"],
      ["94", "Winner Match 81", "Winner Match 82"],
      ["95", "Winner Match 86", "Winner Match 88"],
      ["96", "Winner Match 85", "Winner Match 87"],
    ],
  },
  {
    key: "quarterfinal",
    title: "Quarterfinals",
    matches: [
      ["97", "Winner Match 89", "Winner Match 90"],
      ["98", "Winner Match 93", "Winner Match 94"],
      ["99", "Winner Match 91", "Winner Match 92"],
      ["100", "Winner Match 95", "Winner Match 96"],
    ],
  },
  {
    key: "semifinal",
    title: "Semifinals",
    matches: [
      ["101", "Winner Match 97", "Winner Match 98"],
      ["102", "Winner Match 99", "Winner Match 100"],
    ],
  },
  { key: "thirdPlace", title: "Third Place", matches: [["103", "Loser Match 101", "Loser Match 102"]] },
  { key: "final", title: "Final", matches: [["104", "Winner Match 101", "Winner Match 102"]] },
];

const BRACKET_PATHS = [
  {
    title: "Quarterfinal 97 Path",
    subtitle: "Feeds Semifinal 101",
    round32: ["74", "77", "73", "75"],
    round16: ["89", "90"],
    quarterfinal: "97",
  },
  {
    title: "Quarterfinal 98 Path",
    subtitle: "Feeds Semifinal 101",
    round32: ["83", "84", "81", "82"],
    round16: ["93", "94"],
    quarterfinal: "98",
  },
  {
    title: "Quarterfinal 99 Path",
    subtitle: "Feeds Semifinal 102",
    round32: ["76", "78", "79", "80"],
    round16: ["91", "92"],
    quarterfinal: "99",
  },
  {
    title: "Quarterfinal 100 Path",
    subtitle: "Feeds Semifinal 102",
    round32: ["86", "88", "85", "87"],
    round16: ["95", "96"],
    quarterfinal: "100",
  },
];

const TEAM_FLAGS = {
  Algeria: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  "Bosnia-Herzegovina": "🇧🇦",
  Brazil: "🇧🇷",
  Canada: "🇨🇦",
  "Cape Verde Islands": "🇨🇻",
  Colombia: "🇨🇴",
  "Congo DR": "🇨🇩",
  Croatia: "🇭🇷",
  Czechia: "🇨🇿",
  Ecuador: "🇪🇨",
  Egypt: "🇪🇬",
  England: "🏴",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Ghana: "🇬🇭",
  Iran: "🇮🇷",
  "Ivory Coast": "🇨🇮",
  Japan: "🇯🇵",
  Mexico: "🇲🇽",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  Norway: "🇳🇴",
  Paraguay: "🇵🇾",
  Portugal: "🇵🇹",
  Scotland: "🏴",
  Senegal: "🇸🇳",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  Spain: "🇪🇸",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Uruguay: "🇺🇾",
  "United States": "🇺🇸",
};

const board = document.querySelector("#bracketBoard");
const statusPill = document.querySelector("#statusPill");

render();

function render() {
  const standings = normalizeStandings(officialData.provisionalGroupStandings || {});
  const officialMatches = officialMatchesById();
  const resolvedMatches = resolveMatches(standings, officialMatches);
  const resolvedRound32 = new Map(resolvedMatches.map((match) => [match[0], match]));

  board.replaceChildren(
    renderFinalPanel(officialMatches),
    renderBracketPaths(resolvedRound32, officialMatches)
  );

  const generatedAt = formatDate(officialData.generatedAt);
  statusPill.textContent = generatedAt === "Unavailable" ? "Bracket data unavailable" : `Updated ${generatedAt}`;
}

function renderBracketPaths(resolvedRound32, officialMatches) {
  const paths = document.createElement("section");
  paths.className = "paths-grid";
  paths.setAttribute("aria-label", "Knockout bracket paths");
  paths.replaceChildren(
    ...BRACKET_PATHS.map((path) => renderPath(path, resolvedRound32, officialMatches))
  );
  return paths;
}

function renderPath(path, resolvedRound32, officialMatches) {
  const section = document.createElement("article");
  section.className = "path-card";
  section.innerHTML = `
    <div class="path-head">
      <div>
        <h3>${escapeHtml(path.title)}</h3>
        <p>${escapeHtml(path.subtitle)}</p>
      </div>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "path-rounds";
  body.append(
    renderColumn("Round of 32", path.round32.map((matchId) => resolvedRound32.get(matchId)), "round32"),
    renderColumn(
      "Round of 16",
      resolveKnockoutRound(matchesById(ROUNDS[1].matches, path.round16), officialMatches),
      "round16"
    ),
    renderColumn(
      "Quarterfinal",
      resolveKnockoutRound(matchesById(ROUNDS[2].matches, [path.quarterfinal]), officialMatches),
      "quarterfinal"
    )
  );
  section.append(body);
  return section;
}

function matchesById(matches, matchIds) {
  const matchMap = new Map(matches.map((match) => [match[0], match]));
  return matchIds.map((matchId) => matchMap.get(matchId)).filter(Boolean);
}

function renderColumn(title, matches, roundKey) {
  const column = document.createElement("div");
  column.className = `round-column ${roundKey}`;
  column.innerHTML = `<h3>${escapeHtml(title)}</h3>`;

  const stack = document.createElement("div");
  stack.className = "match-stack";
  stack.replaceChildren(...matches.filter(Boolean).map((match) => renderMatch(match, roundKey)));
  column.append(stack);
  return column;
}

function renderMatch(match, roundKey) {
  const [matchId, homeSeed, awaySeed, homeTeam, awayTeam] = match;
  const node = document.createElement("article");
  node.className = `match-card ${roundKey}`;
  node.innerHTML = `
    <div class="match-label">M${escapeHtml(matchId)}</div>
    ${renderTeamSlot(homeTeam || homeSeed, homeSeed)}
    ${renderTeamSlot(awayTeam || awaySeed, awaySeed)}
  `;
  return node;
}

function renderTeamSlot(label, seed) {
  const isTeam = label !== seed || !/^Winner|^Runner-up|^Best|^Loser|^TBD/.test(label);
  const flag = TEAM_FLAGS[label] || "";
  return `
    <div class="team-slot ${isTeam ? "has-team" : "is-seed"}">
      <span class="flag">${escapeHtml(flag)}</span>
      <span class="team-name">${escapeHtml(label)}</span>
    </div>
  `;
}

function renderFinalPanel(officialMatches) {
  const finalMatch = resolveKnockoutRound(ROUNDS[5].matches, officialMatches);
  const thirdPlaceMatch = resolveKnockoutRound(ROUNDS[4].matches, officialMatches);
  const semifinals = resolveKnockoutRound(ROUNDS[3].matches, officialMatches);
  const champion = officialData.futures?.champion || winnerOfMatch(officialMatches.get("104")) || "TBD";
  const panel = document.createElement("section");
  panel.className = "final-panel";
  panel.setAttribute("aria-label", "Final, third-place match, and champion");
  panel.innerHTML = `
    <div class="mark">
      <span>26</span>
      <strong>FIFA</strong>
    </div>
    <div class="center-matches">
      ${renderColumn("Semifinals", semifinals, "semifinal").outerHTML}
      ${renderColumn("Final", finalMatch, "final").outerHTML}
      ${renderColumn("Third Place", thirdPlaceMatch, "third-place").outerHTML}
    </div>
    <div class="champion-box">
      <span>Champion</span>
      <strong>${escapeHtml(champion)}</strong>
    </div>
  `;
  return panel;
}

function resolveMatches(standings, officialMatches) {
  const thirdPlaceTeams = rankedThirdPlaces(standings).slice(0, QUALIFYING_THIRD_PLACE_COUNT);
  const usedThirdPlaceTeams = new Set();

  return ROUND_OF_32.map(([matchId, homeSeed, awaySeed]) => [
    matchId,
    homeSeed,
    awaySeed,
    officialMatches.get(matchId)?.homeTeam || resolveSeed(homeSeed, standings, thirdPlaceTeams, usedThirdPlaceTeams),
    officialMatches.get(matchId)?.awayTeam || resolveSeed(awaySeed, standings, thirdPlaceTeams, usedThirdPlaceTeams),
  ]);
}

function resolveKnockoutRound(matches, officialMatches) {
  return matches.map(([matchId, homeSeed, awaySeed]) => {
    const officialMatch = officialMatches.get(matchId);
    return [
      matchId,
      homeSeed,
      awaySeed,
      officialMatch?.homeTeam || resolveKnockoutSeed(homeSeed, officialMatches),
      officialMatch?.awayTeam || resolveKnockoutSeed(awaySeed, officialMatches),
    ];
  });
}

function resolveKnockoutSeed(seed, officialMatches) {
  const winnerMatch = seed.match(/^Winner Match (\d+)$/);
  if (winnerMatch) {
    return winnerOfMatch(officialMatches.get(winnerMatch[1])) || seed;
  }

  const loserMatch = seed.match(/^Loser Match (\d+)$/);
  if (loserMatch) {
    return loserOfMatch(officialMatches.get(loserMatch[1])) || seed;
  }

  return seed;
}

function officialMatchesById() {
  return new Map(
    (officialData.matches || [])
      .map((match) => [String(match.matchId || match.id || ""), match])
      .filter(([matchId]) => matchId)
  );
}

function winnerOfMatch(match) {
  if (!match) {
    return "";
  }
  if (match.winner) {
    return match.winner;
  }
  if (match.advancingTeam) {
    return match.advancingTeam;
  }
  if (match.winningTeam) {
    return match.winningTeam;
  }
  const homePenaltyScore = match.homePenaltyScore ?? match.home_penalty_score;
  const awayPenaltyScore = match.awayPenaltyScore ?? match.away_penalty_score;
  if (homePenaltyScore !== undefined || awayPenaltyScore !== undefined) {
    const homePenalties = Number(homePenaltyScore);
    const awayPenalties = Number(awayPenaltyScore);
    if (homePenalties > awayPenalties) return match.homeTeam || "";
    if (awayPenalties > homePenalties) return match.awayTeam || "";
  }
  const homeScore = Number(match.homeScore);
  const awayScore = Number(match.awayScore);
  if (homeScore > awayScore) return match.homeTeam || "";
  if (awayScore > homeScore) return match.awayTeam || "";
  return "";
}

function loserOfMatch(match) {
  const winner = winnerOfMatch(match);
  if (!winner) {
    return "";
  }
  if (match.homeTeam === winner) {
    return match.awayTeam || "";
  }
  if (match.awayTeam === winner) {
    return match.homeTeam || "";
  }
  return "";
}

function resolveSeed(seed, standings, thirdPlaceTeams, usedThirdPlaceTeams) {
  const winnerMatch = seed.match(/^Winner Group ([A-L])$/);
  if (winnerMatch) {
    return standings[winnerMatch[1]]?.[0]?.team || seed;
  }

  const runnerUpMatch = seed.match(/^Runner-up Group ([A-L])$/);
  if (runnerUpMatch) {
    return standings[runnerUpMatch[1]]?.[1]?.team || seed;
  }

  const bestThirdMatch = seed.match(/^Best 3rd Group ([A-L/]+)$/);
  if (bestThirdMatch) {
    const allowed = new Set(bestThirdMatch[1].split("/"));
    const row = thirdPlaceTeams.find((item) => allowed.has(item.groupId) && !usedThirdPlaceTeams.has(item.team));
    if (row) {
      usedThirdPlaceTeams.add(row.team);
      return row.team;
    }
  }

  return seed;
}

function normalizeStandings(groups) {
  return Object.fromEntries(
    GROUP_IDS.map((groupId) => [
      groupId,
      (groups[groupId] || [])
        .filter((row) => row?.team)
        .map((row, index) => ({
          ...row,
          sourceIndex: index,
          position: numberValue(row.position, index + 1),
          points: numberValue(row.points, 0),
          goalDifference: numberValue(row.goalDifference, 0),
          goalsFor: numberValue(row.goalsFor, 0),
          fairPlayPoints: fairPlayPoints(row),
          lotsOrder: lotsOrder(row),
        }))
        .sort((a, b) =>
          a.position - b.position ||
          b.points - a.points ||
          b.goalDifference - a.goalDifference ||
          b.goalsFor - a.goalsFor ||
          a.sourceIndex - b.sourceIndex
        ),
    ])
  );
}

function rankedThirdPlaces(standings) {
  const rows = GROUP_IDS.map((groupId, groupIndex) => {
    const row = standings[groupId]?.find((item) => item.position === 3) || standings[groupId]?.[2];
    return row ? { ...row, groupId, groupIndex } : null;
  }).filter(Boolean);

  return rows.sort((left, right) =>
    right.points - left.points ||
    right.goalDifference - left.goalDifference ||
    right.goalsFor - left.goalsFor ||
    right.fairPlayPoints - left.fairPlayPoints ||
    compareLots(left, right) ||
    left.groupIndex - right.groupIndex
  );
}

function fairPlayPoints(row) {
  if (Number.isFinite(Number(row.fairPlayPoints))) {
    return Number(row.fairPlayPoints);
  }
  return (
    -1 * numberValue(row.yellowCards, 0) +
    -3 * numberValue(row.indirectRedCards ?? row.secondYellowRedCards ?? row.secondYellowCards, 0) +
    -4 * numberValue(row.directRedCards ?? row.redCards, 0) +
    -5 * numberValue(row.yellowDirectRedCards ?? row.yellowRedCards, 0)
  );
}

function lotsOrder(row) {
  const value = row.lotsOrder ?? row.lotOrder ?? row.drawingLotsOrder ?? row.lotsRank ?? row.lotRank;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function compareLots(left, right) {
  if (left.lotsOrder === null || right.lotsOrder === null) {
    return 0;
  }
  return left.lotsOrder - right.lotsOrder;
}

function numberValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatDate(value) {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
