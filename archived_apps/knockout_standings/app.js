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
  { key: "round32", title: "Round of 32", shortTitle: "R32", matches: ROUND_OF_32 },
  {
    key: "round16",
    title: "Round of 16",
    shortTitle: "R16",
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
    shortTitle: "QF",
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
    shortTitle: "SF",
    matches: [
      ["101", "Winner Match 97", "Winner Match 98"],
      ["102", "Winner Match 99", "Winner Match 100"],
    ],
  },
  { key: "thirdPlace", title: "3rd place", shortTitle: "3P", matches: [["103", "Loser Match 101", "Loser Match 102"]] },
  { key: "final", title: "Final", shortTitle: "Final", matches: [["104", "Winner Match 101", "Winner Match 102"]] },
];

const PATHS = [
  { title: "Path A", subtitle: "Feeds Quarterfinal 97", matches: ["74", "77", "89", "73", "75", "90", "97"] },
  { title: "Path B", subtitle: "Feeds Quarterfinal 98", matches: ["83", "84", "93", "81", "82", "94", "98"] },
  { title: "Path C", subtitle: "Feeds Quarterfinal 99", matches: ["76", "78", "91", "79", "80", "92", "99"] },
  { title: "Path D", subtitle: "Feeds Quarterfinal 100", matches: ["86", "88", "95", "85", "87", "96", "100"] },
];

const stageTabs = document.querySelector("#stageTabs");
const stageSummary = document.querySelector("#stageSummary");
const championStrip = document.querySelector("#championStrip");
const pathGrid = document.querySelector("#pathGrid");
const statusPill = document.querySelector("#statusPill");

let activeStage = "round32";

const standings = normalizeStandings(officialData.provisionalGroupStandings || {});
const officialMatches = officialMatchesById();
const allMatches = resolvedMatchesById();

render();

function render() {
  renderTabs();
  renderStageSummary();
  renderChampionStrip();
  renderPaths();

  const generatedAt = formatDate(officialData.generatedAt);
  statusPill.textContent = generatedAt === "Unavailable" ? "Bracket data unavailable" : `Updated ${generatedAt}`;
}

function renderTabs() {
  stageTabs.replaceChildren(
    ...ROUNDS.map((round) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = round.key === activeStage ? "active" : "";
      button.setAttribute("aria-pressed", round.key === activeStage ? "true" : "false");
      button.innerHTML = `
        <span>${escapeHtml(round.shortTitle)}</span>
        <strong>${escapeHtml(round.title)}</strong>
      `;
      button.addEventListener("click", () => {
        activeStage = round.key;
        renderTabs();
        renderStageSummary();
      });
      return button;
    })
  );
}

function renderStageSummary() {
  const round = ROUNDS.find((item) => item.key === activeStage) || ROUNDS[0];
  const matches = round.matches.map(([matchId]) => allMatches.get(matchId)).filter(Boolean);
  const completed = matches.filter((match) => match.winner).length;
  const card = document.createElement("article");
  card.className = "stage-card";
  card.innerHTML = `
    <div class="stage-card-head">
      <div>
        <p class="eyebrow">Selected stage</p>
        <h2>${escapeHtml(round.title)}</h2>
      </div>
      <div class="stage-count">${completed}/${matches.length} complete</div>
    </div>
    <div class="match-grid">
      ${matches.map((match) => renderMatchCard(match)).join("")}
    </div>
  `;
  stageSummary.replaceChildren(card);
}

function renderChampionStrip() {
  const champion = officialData.futures?.champion || allMatches.get("104")?.winner || "TBD";
  championStrip.innerHTML = `
    <article>
      <span>Champion</span>
      <strong>${escapeHtml(champion)}</strong>
    </article>
    <article>
      <span>Final</span>
      <strong>${escapeHtml(scoreLabel(allMatches.get("104")))}</strong>
    </article>
    <article>
      <span>3rd place</span>
      <strong>${escapeHtml(scoreLabel(allMatches.get("103")))}</strong>
    </article>
  `;
}

function renderPaths() {
  pathGrid.replaceChildren(
    ...PATHS.map((path) => {
      const article = document.createElement("article");
      article.className = "path-card";
      article.innerHTML = `
        <div class="path-head">
          <div>
            <p class="eyebrow">${escapeHtml(path.subtitle)}</p>
            <h2>${escapeHtml(path.title)}</h2>
          </div>
        </div>
        <div class="path-list">
          ${path.matches.map((matchId) => renderPathRow(allMatches.get(matchId))).join("")}
        </div>
      `;
      return article;
    })
  );
}

function renderPathRow(match) {
  if (!match) {
    return "";
  }
  return `
    <div class="path-row">
      <span>M${escapeHtml(match.matchId)}</span>
      <strong>${escapeHtml(match.homeTeam)} vs ${escapeHtml(match.awayTeam)}</strong>
      <em>${escapeHtml(stageShortLabel(match.stage))}</em>
    </div>
  `;
}

function renderMatchCard(match) {
  return `
    <article class="match-card">
      <div class="match-topline">
        <span>M${escapeHtml(match.matchId)}</span>
        <strong>${escapeHtml(match.status)}</strong>
      </div>
      ${renderTeamSlot(match.homeTeam, match.homeSeed, match.winner)}
      ${renderTeamSlot(match.awayTeam, match.awaySeed, match.winner)}
      <div class="match-footer">${escapeHtml(scoreLabel(match))}</div>
    </article>
  `;
}

function renderTeamSlot(team, seed, winner) {
  const won = winner && winner === team;
  const unresolved = team === seed;
  return `
    <div class="team-row ${won ? "winner" : ""} ${unresolved ? "seed" : ""}">
      <span>${escapeHtml(seedLabel(seed))}</span>
      <strong>${escapeHtml(team)}</strong>
    </div>
  `;
}

function resolvedMatchesById() {
  const round32 = resolveRound32();
  const matchMap = new Map(round32.map((match) => [match.matchId, match]));

  ROUNDS.slice(1).forEach((round) => {
    round.matches.forEach(([matchId, homeSeed, awaySeed]) => {
      const official = officialMatches.get(matchId);
      const homeTeam = official?.homeTeam || resolveKnockoutSeed(homeSeed, matchMap);
      const awayTeam = official?.awayTeam || resolveKnockoutSeed(awaySeed, matchMap);
      matchMap.set(matchId, normalizeMatch(matchId, round.key, homeSeed, awaySeed, homeTeam, awayTeam, official));
    });
  });

  return matchMap;
}

function resolveRound32() {
  const thirdPlaceTeams = rankedThirdPlaces(standings).slice(0, QUALIFYING_THIRD_PLACE_COUNT);
  const usedThirdPlaceTeams = new Set();
  return ROUND_OF_32.map(([matchId, homeSeed, awaySeed]) => {
    const official = officialMatches.get(matchId);
    const homeTeam = official?.homeTeam || resolveSeed(homeSeed, thirdPlaceTeams, usedThirdPlaceTeams);
    const awayTeam = official?.awayTeam || resolveSeed(awaySeed, thirdPlaceTeams, usedThirdPlaceTeams);
    return normalizeMatch(matchId, "round32", homeSeed, awaySeed, homeTeam, awayTeam, official);
  });
}

function normalizeMatch(matchId, stage, homeSeed, awaySeed, homeTeam, awayTeam, official) {
  const winner = winnerOfMatch(official);
  return {
    matchId,
    stage,
    homeSeed,
    awaySeed,
    homeTeam,
    awayTeam,
    winner,
    homeScore: official?.homeScore,
    awayScore: official?.awayScore,
    homePenaltyScore: official?.homePenaltyScore ?? official?.home_penalty_score,
    awayPenaltyScore: official?.awayPenaltyScore ?? official?.away_penalty_score,
    status: winner ? "Confirmed" : "Projected",
  };
}

function resolveKnockoutSeed(seed, matchMap) {
  const winnerMatch = seed.match(/^Winner Match (\d+)$/);
  if (winnerMatch) {
    return matchMap.get(winnerMatch[1])?.winner || seed;
  }

  const loserMatch = seed.match(/^Loser Match (\d+)$/);
  if (loserMatch) {
    const match = matchMap.get(loserMatch[1]);
    if (!match?.winner) {
      return seed;
    }
    return match.homeTeam === match.winner ? match.awayTeam : match.homeTeam;
  }

  return seed;
}

function resolveSeed(seed, thirdPlaceTeams, usedThirdPlaceTeams) {
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
  if (match.winner) return match.winner;
  if (match.advancingTeam) return match.advancingTeam;
  if (match.winningTeam) return match.winningTeam;

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

function rankedThirdPlaces(groups) {
  const rows = GROUP_IDS.map((groupId, groupIndex) => {
    const row = groups[groupId]?.find((item) => item.position === 3) || groups[groupId]?.[2];
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

function seedLabel(seed) {
  const bestThirdMatch = seed.match(/^Best 3rd Group /);
  if (bestThirdMatch) {
    return "3rd";
  }

  return seed
    .replace("Winner Group ", "1")
    .replace("Runner-up Group ", "2")
    .replace("Winner Match ", "W")
    .replace("Loser Match ", "L");
}

function stageShortLabel(stage) {
  return ROUNDS.find((round) => round.key === stage)?.shortTitle || stage;
}

function scoreLabel(match) {
  if (!match) {
    return "TBD";
  }
  if (match.homeScore === undefined || match.awayScore === undefined) {
    return "Pending result";
  }
  const penalties =
    match.homePenaltyScore !== undefined || match.awayPenaltyScore !== undefined
      ? ` (${match.homePenaltyScore || 0}-${match.awayPenaltyScore || 0} pens)`
      : "";
  return `${match.homeScore}-${match.awayScore}${penalties}`;
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
