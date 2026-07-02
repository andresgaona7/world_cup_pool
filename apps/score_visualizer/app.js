const rawData = window.POOL_DATA || { players: [] };
const officialData = window.OFFICIAL_RESULTS || null;
const knockoutData = window.KNOCKOUT_PREDICTIONS || { players: [] };

const GROUP_QUALIFIER_POINTS = 1;
const GROUP_EXACT_ADVANCING_POSITION_BONUS = 1;
const GROUP_FULL_ORDER_BONUS = 5;
const BEST_THIRD_TEAM_POINTS = 3;

const FUTURES_POINTS = {
  champion: 20,
  runnerUp: 15,
  topScorer: 10,
  favoriteExact: 10,
  ecuadorExact: 12,
  perfectBonus: 75,
};

const KNOCKOUT_BASE_POINTS = {
  round_of_32: 4,
  round_of_16: 6,
  quarterfinal: 10,
  semifinal: 16,
  third_place_match: 14,
  final: 20,
};
const KNOCKOUT_STAGE_ORDER = Object.fromEntries(Object.keys(KNOCKOUT_BASE_POINTS).map((stage, index) => [stage, index]));
const KNOCKOUT_PERFECT_BONUS_STAGES = new Set(["round_of_32", "round_of_16", "quarterfinal", "semifinal"]);
const KNOCKOUT_STAGE_MATCH_COUNTS = {
  round_of_32: 16,
  round_of_16: 8,
  quarterfinal: 4,
  semifinal: 2,
};
const KNOCKOUT_PERFECT_WINNER_BONUS_POINTS = {
  round_of_32: 25,
  round_of_16: 25,
  quarterfinal: 25,
  semifinal: 25,
};
const KNOCKOUT_PERFECT_SCORE_BONUS_POINTS = {
  round_of_32: 40,
  round_of_16: 25,
  quarterfinal: 15,
  semifinal: 10,
};
const ROUND_OF_32_BONUS_QUESTION_POINTS = 2;
const ROUND_OF_32_BONUS_QUESTIONS = [
  "How many matches will go to extra time?",
  "How many matches will be decided by penalties?",
  "Which team will score the most goals?",
  "Total goals scored in the R-32 (no penalties)",
  "Which team will score the fastest goal?",
  "Which team will score the latest goal?",
  "Team with the biggest winning margin?",
  "How many yellow cards will be shown?",
  "How many red cards will be shown?",
];
const KNOCKOUT_TEAM_ALIASES = {
  bosnia: "bosnia-herzegovina",
  "bosnia and herzegovina": "bosnia-herzegovina",
  "cape verde": "cape verde islands",
  "dr congo": "congo dr",
  "democratic republic of congo": "congo dr",
  "democratic republic of the congo": "congo dr",
  morroco: "morocco",
  nederlands: "netherlands",
};
const KNOCKOUT_STAGE_LABELS = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinals",
  semifinal: "Semifinals",
  third_place_match: "3rd place",
  final: "Final",
};
const LEADERBOARD_KNOCKOUT_STAGES = Object.keys(KNOCKOUT_BASE_POINTS);

const STAGES = [
  ["group_stage", "Group stage"],
  ["round_of_32", "Round of 32"],
  ["round_of_16", "Round of 16"],
  ["quarterfinal", "Quarter final"],
  ["semifinal", "Semi final"],
  ["third_place_match", "3rd place"],
  ["runner_up", "Runner-up"],
  ["champion", "Champion"],
];

const STAGE_ORDER = Object.fromEntries(STAGES.map(([key], index) => [key, index]));
const GROUP_IDS = "ABCDEFGHIJKL".split("");
const GROUP_HEADER_PATTERN = /^Group ([A-L])$/;
const RANK_PATTERN = /^\d+(?:\.0)?$/;

const players = rawData.players.map(normalizePlayer);
const knockoutPredictionsByPlayer = normalizeKnockoutPredictions(knockoutData);
const knockoutBonusAnswersByPlayer = normalizeKnockoutBonusAnswers(knockoutData);
const officialScenario = normalizeOfficialScenario(players, officialData);
const scenario = officialScenario;
const officialRoundOf32BonusResults = officialData?.roundOf32BonusResults || {};
const officialKnockoutMatches = latestOfficialKnockoutMatches(officialData);
const officialKnockoutDisplayMatches = latestOfficialKnockoutDisplayMatches(officialData);
const collapsedPanels = new Map();
let comparisonPlayerIndex = initialComparisonPlayerIndex();

const leaderboardTable = document.querySelector("#leaderboardTable");
const rulesGrid = document.querySelector("#rulesGrid");
const playerSelect = document.querySelector("#playerSelect");
const leaderboardScenarioStatus = document.querySelector("#leaderboardScenarioStatus");
const comparisonStatus = document.querySelector("#comparisonStatus");
const comparisonSummary = document.querySelector("#comparisonSummary");
const futuresSummary = document.querySelector("#futuresSummary");
const groupComparisonTable = document.querySelector("#groupComparisonTable");
const bestThirdComparisonTable = document.querySelector("#bestThirdComparisonTable");
const knockoutStagePanels = document.querySelector("#knockoutStagePanels");
const futuresComparisonTable = document.querySelector("#futuresComparisonTable");

document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".collapse-toggle");
  if (!toggle) {
    return;
  }

  const panel = toggle.closest("[data-collapsible-panel]");
  if (!panel) {
    return;
  }

  setPanelCollapsed(panel, !panel.classList.contains("is-collapsed"));
});

playerSelect?.addEventListener("change", (event) => {
  selectComparisonPlayer(Number.parseInt(event.target.value, 10) || 0, { syncUrl: true });
});

leaderboardTable.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-player-index]");
  if (!row) {
    return;
  }
  selectComparisonPlayer(Number.parseInt(row.dataset.playerIndex, 10) || 0, { syncUrl: true });
});

leaderboardTable.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const row = event.target.closest("tr[data-player-index]");
  if (!row) {
    return;
  }

  event.preventDefault();
  selectComparisonPlayer(Number.parseInt(row.dataset.playerIndex, 10) || 0, { syncUrl: true });
});

populatePlayerSelect();
initializeCollapsiblePanels();
render();
scrollToRequestedSection();

function render() {
  renderComparison();
  renderKnockoutComparison();
  renderRules();
  renderLeaderboard();
}

function initializeCollapsiblePanels() {
  document.querySelectorAll("[data-collapsible-panel]").forEach((panel) => {
    const collapsed = panel.dataset.collapsed === "true";
    if (panel.dataset.collapsibleKey) {
      collapsedPanels.set(panel.dataset.collapsibleKey, collapsed);
    }
    setPanelCollapsed(panel, collapsed);
  });
}

function setPanelCollapsed(panel, collapsed) {
  panel.classList.toggle("is-collapsed", collapsed);
  panel.dataset.collapsed = collapsed ? "true" : "false";
  if (panel.dataset.collapsibleKey) {
    collapsedPanels.set(panel.dataset.collapsibleKey, collapsed);
  }

  const toggle = panel.querySelector(".collapse-toggle");
  const label = toggle?.querySelector(".collapse-toggle-label");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(!collapsed));
  }
  if (label) {
    label.textContent = collapsed ? "Show" : "Hide";
  }
}

function isPanelCollapsed(key, defaultCollapsed = false) {
  return collapsedPanels.has(key) ? collapsedPanels.get(key) : defaultCollapsed;
}

function selectComparisonPlayer(playerIndex, options = {}) {
  comparisonPlayerIndex = Math.max(0, Math.min(playerIndex, players.length - 1));
  if (playerSelect) {
    playerSelect.value = String(comparisonPlayerIndex);
  }
  if (options.syncUrl) {
    syncPlayerUrl();
  }
  renderComparison();
  renderKnockoutComparison();
  renderLeaderboard();
}

function initialComparisonPlayerIndex() {
  const requestedPlayer = new URLSearchParams(window.location.search).get("player");
  if (!requestedPlayer) {
    return 0;
  }
  const requestedName = normalizeName(requestedPlayer);
  const playerIndex = players.findIndex((player) => normalizeName(player.name) === requestedName);
  return playerIndex === -1 ? 0 : playerIndex;
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function syncPlayerUrl() {
  if (!window.history?.replaceState) {
    return;
  }
  const selectedPlayer = players[comparisonPlayerIndex];
  if (!selectedPlayer) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  params.set("player", selectedPlayer.name);
  const section = params.get("section");
  const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
  if (section === "round_of_32_bonus" && !window.location.hash) {
    window.history.replaceState(null, "", `${nextUrl}#round-of-32-bonus`);
  }
}

function scrollToRequestedSection() {
  const params = new URLSearchParams(window.location.search);
  const requestedSection = params.get("section");
  if (requestedSection !== "round_of_32_bonus" && window.location.hash !== "#round-of-32-bonus") {
    return;
  }
  window.requestAnimationFrame(() => {
    document.querySelector("#round-of-32-bonus")?.scrollIntoView({ block: "start" });
  });
}

function normalizePlayer(player) {
  const futures = player.futures || {};
  return {
    name: player.name || player.sheet,
    sheet: player.sheet || "",
    groups: extractGroups(player.first_round_grid || []),
    bestThirds: (player.best_thirds || [])
      .map((pick) => ({ rank: parseRank(pick.rank), team: pick.team || "" }))
      .filter((pick) => pick.team),
    futures: {
      champion: value(futures, "champion"),
      runnerUp: value(futures, "runner_up"),
      favoriteTeam: value(futures, "favorite_team"),
      favoriteRound: normalizeStage(value(futures, "favorite_team_round")),
      topScorer: value(futures, "top_scorer"),
      ecuadorRound: normalizeStage(value(futures, "ecuador_round")),
    },
  };
}

function normalizeKnockoutPredictions(sourceData) {
  return new Map(
    (sourceData?.players || []).map((player) => [
      player.name || player.sheet || "",
      (player.matches || []).map(normalizeKnockoutPrediction).filter((match) => match.matchId),
    ])
  );
}

function normalizeKnockoutBonusAnswers(sourceData) {
  return new Map(
    (sourceData?.players || []).map((player) => [
      player.name || player.sheet || "",
      player.bonusAnswers?.round_of_32 || player.roundOf32BonusAnswers || [],
    ])
  );
}

function normalizeKnockoutPrediction(match) {
  const homeScore = numberOrNull(match.homeScore);
  const awayScore = numberOrNull(match.awayScore);
  const homePenaltyScore = numberOrNull(match.homePenaltyScore);
  const awayPenaltyScore = numberOrNull(match.awayPenaltyScore);
  return {
    matchId: String(match.matchId || match.id || ""),
    stage: normalizeKnockoutStage(match.stage || ""),
    homeTeam: match.homeTeam || match.home || "",
    awayTeam: match.awayTeam || match.away || "",
    homeScore,
    awayScore,
    homePenaltyScore,
    awayPenaltyScore,
    winner: match.winner || match.advancingTeam || match.predictedAdvancingTeam || "",
    mode: "score",
  };
}

function latestOfficialKnockoutMatches(resultsData) {
  const matchesById = new Map();
  [
    ...(resultsData?.officialMatches || []),
    ...(resultsData?.timelineCheckpoints || []).flatMap((checkpoint) => checkpoint.officialMatches || []),
  ]
    .map(normalizeOfficialKnockoutMatch)
    .filter((match) =>
      match.matchId &&
      match.stage in KNOCKOUT_BASE_POINTS &&
      match.homeTeam &&
      match.awayTeam &&
      match.homeScore !== null &&
      match.awayScore !== null &&
      match.advancingTeam
    )
    .forEach((match) => matchesById.set(match.matchId, match));

  return [...matchesById.values()].sort((a, b) => {
    const stageDiff = (KNOCKOUT_STAGE_ORDER[a.stage] || 0) - (KNOCKOUT_STAGE_ORDER[b.stage] || 0);
    return stageDiff || Number(a.matchId) - Number(b.matchId);
  });
}

function latestOfficialKnockoutDisplayMatches(resultsData) {
  const matchesById = new Map();
  [
    ...(resultsData?.officialMatches || []),
    ...(resultsData?.matches || []),
    ...(resultsData?.timelineCheckpoints || []).flatMap((checkpoint) => checkpoint.officialMatches || []),
  ]
    .map(normalizeOfficialKnockoutMatch)
    .filter((match) =>
      match.matchId &&
      match.stage in KNOCKOUT_BASE_POINTS &&
      match.homeTeam &&
      match.awayTeam
    )
    .forEach((match) => matchesById.set(match.matchId, match));

  return [...matchesById.values()].sort((a, b) => {
    const stageDiff = (KNOCKOUT_STAGE_ORDER[a.stage] || 0) - (KNOCKOUT_STAGE_ORDER[b.stage] || 0);
    return stageDiff || Number(a.matchId) - Number(b.matchId);
  });
}

function normalizeOfficialKnockoutMatch(match) {
  return {
    matchId: String(match.matchId || match.id || ""),
    stage: normalizeKnockoutStage(match.stage || ""),
    homeTeam: match.homeTeam || match.home || "",
    awayTeam: match.awayTeam || match.away || "",
    homeScore: numberOrNull(match.homeScore),
    awayScore: numberOrNull(match.awayScore),
    homePenaltyScore: numberOrNull(match.homePenaltyScore),
    awayPenaltyScore: numberOrNull(match.awayPenaltyScore),
    advancingTeam: match.advancingTeam || match.winner || "",
  };
}

function normalizeKnockoutStage(stage) {
  const text = String(stage || "").trim().toLowerCase();
  const map = {
    "round of 32": "round_of_32",
    "round of 16": "round_of_16",
    "quarter final": "quarterfinal",
    quarterfinal: "quarterfinal",
    "semi final": "semifinal",
    semifinal: "semifinal",
    "third-place match": "third_place_match",
    "third place match": "third_place_match",
    final: "final",
  };
  return map[text] || text.replace(/\s+/g, "_");
}

function extractGroups(grid) {
  const rows = grid.map((row) => row.cells || []);
  const groups = {};

  rows.forEach((cells, rowIndex) => {
    cells.forEach((cell, columnIndex) => {
      const header = GROUP_HEADER_PATTERN.exec(cell);
      if (!header) {
        return;
      }

      const groupId = header[1];
      const orderedTeams = [];
      let scanIndex = rowIndex + 1;

      while (scanIndex < rows.length) {
        const scanRow = rows[scanIndex];
        const rank = scanRow[columnIndex];
        const team = scanRow[columnIndex + 1];
        if (!RANK_PATTERN.test(rank || "")) {
          break;
        }
        orderedTeams.push(team || "");
        scanIndex += 1;
      }

      groups[groupId] = orderedTeams;
    });
  });

  return groups;
}

function value(futures, key) {
  return futures[key]?.value || "";
}

function parseRank(rawRank) {
  return rawRank ? Number.parseInt(Number.parseFloat(rawRank), 10) : null;
}

function normalizeStage(stage) {
  const text = String(stage || "").trim().toLowerCase();
  const map = {
    "group stage": "group_stage",
    "round of 32": "round_of_32",
    "round of 16": "round_of_16",
    "quarter final": "quarterfinal",
    quarterfinal: "quarterfinal",
    "semi final": "semifinal",
    semifinal: "semifinal",
    final: "runner_up",
    "runner-up": "runner_up",
    "runner up": "runner_up",
    champion: "champion",
    winner: "champion",
  };
  return map[text] || text.replace(/\s+/g, "_");
}

function buildConsensusScenario(sourcePlayers) {
  const groupResults = {};
  GROUP_IDS.forEach((groupId) => {
    groupResults[groupId] = consensusGroupOrder(sourcePlayers, groupId);
  });

  const champion = mode(sourcePlayers.map((player) => player.futures.champion));
  const runnerUp = mode(sourcePlayers.map((player) => player.futures.runnerUp));
  const topScorer = mode(sourcePlayers.map((player) => player.futures.topScorer));
  const teamLastRounds = {};

  trackedTeams(sourcePlayers).forEach((team) => {
    if (team === champion) {
      teamLastRounds[team] = "champion";
    } else if (team === runnerUp) {
      teamLastRounds[team] = "runner_up";
    } else {
      teamLastRounds[team] = consensusStageForTeam(sourcePlayers, team);
    }
  });

  return {
    groupResults,
    bestThirds: consensusBestThirds(sourcePlayers).slice(0, 8).map((row) => row.team),
    futures: {
      champion,
      runnerUp,
      topScorer,
      topScorers: topScorer ? [topScorer] : [],
      teamLastRounds,
    },
  };
}

function normalizeOfficialScenario(sourcePlayers, resultsData) {
  const standings = resultsData?.provisionalGroupStandings || {};
  const groupResults = {};
  GROUP_IDS.forEach((groupId) => {
    const provisionalTeams = normalizeGroupStandingRows(standings[groupId]).slice(0, 3).map((row) => row.team);
    groupResults[groupId] = provisionalTeams.length
      ? provisionalTeams
      : (resultsData?.groupResults?.[groupId] || []).slice(0, 3);
  });

  const futures = resultsData?.futures || {};
  return {
    groupResults,
    bestThirds: provisionalBestThirds(standings, resultsData?.bestThirds || []),
    futures: {
      champion: futures.champion || "",
      runnerUp: futures.runnerUp || "",
      topScorer: futures.topScorer || "",
      topScorers: actualTopScorers(futures),
      teamLastRounds: {
        ...Object.fromEntries(trackedTeams(sourcePlayers).map((team) => [team, ""])),
        ...(futures.teamLastRounds || {}),
      },
    },
  };
}

function normalizeGroupStandingRows(rows) {
  return (rows || [])
    .filter((row) => row?.team)
    .map((row, index) => ({
      ...row,
      sourceIndex: index,
      team: row.team,
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
    );
}

function provisionalBestThirds(standings, fallbackBestThirds) {
  const thirdPlaceRows = GROUP_IDS.map((groupId, groupIndex) => {
    const row = normalizeGroupStandingRows(standings?.[groupId])[2];
    return row ? { ...row, groupIndex } : null;
  })
    .filter(Boolean)
    .sort(compareThirdPlaces);

  if (thirdPlaceRows.length) {
    return thirdPlaceRows.slice(0, 8).map((row) => row.team);
  }
  return fallbackBestThirds.filter(Boolean);
}

function compareThirdPlaces(left, right) {
  return (
    right.points - left.points ||
    right.goalDifference - left.goalDifference ||
    right.goalsFor - left.goalsFor ||
    right.fairPlayPoints - left.fairPlayPoints ||
    compareLots(left, right) ||
    left.groupIndex - right.groupIndex
  );
}

function compareLots(left, right) {
  if (left.lotsOrder === null || right.lotsOrder === null) {
    return 0;
  }
  return left.lotsOrder - right.lotsOrder;
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

function numberValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function consensusGroupOrder(sourcePlayers, groupId) {
  const scoreByTeam = new Map();
  sourcePlayers.forEach((player) => {
    (player.groups[groupId] || []).forEach((team, index) => {
      if (!team) {
        return;
      }
      scoreByTeam.set(team, (scoreByTeam.get(team) || 0) + 3 - index);
    });
  });
  return [...scoreByTeam.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([team]) => team);
}

function consensusBestThirds(sourcePlayers) {
  const counts = new Map();
  sourcePlayers.forEach((player) => {
    player.bestThirds.forEach((pick) => {
      counts.set(pick.team, (counts.get(pick.team) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([team, votes]) => ({ team, votes }));
}

function consensusStageForTeam(sourcePlayers, team) {
  const stages = sourcePlayers
    .filter((player) => player.futures.favoriteTeam === team)
    .map((player) => player.futures.favoriteRound)
    .filter(Boolean);
  return mode(stages) || "round_of_16";
}

function trackedTeams(sourcePlayers) {
  return unique([
    "Ecuador",
    ...sourcePlayers.map((player) => player.futures.favoriteTeam),
    ...sourcePlayers.map((player) => player.futures.champion),
    ...sourcePlayers.map((player) => player.futures.runnerUp),
  ]).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function mode(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function populatePlayerSelect() {
  if (!playerSelect) {
    return;
  }

  playerSelect.replaceChildren(
    ...players.map((player, index) => new Option(player.name, String(index)))
  );
  playerSelect.value = String(comparisonPlayerIndex);
}

function renderRules() {
  if (!rulesGrid) {
    return;
  }

  const sections = [
    {
      title: "Group stage",
      rows: [
        `Each correctly predicted group-stage qualifier earns ${GROUP_QUALIFIER_POINTS} point.`,
        `A correctly predicted qualifier earns ${GROUP_EXACT_ADVANCING_POSITION_BONUS} extra point when it also finishes in the exact predicted advancing position.`,
        "Third-place teams only count as qualifiers if they are official best thirds.",
        `A completely correct group order earns an extra ${GROUP_FULL_ORDER_BONUS} point bonus.`,
        `Each correctly selected best third-place qualifier earns ${BEST_THIRD_TEAM_POINTS} points. The order of those best-third picks does not matter.`,
      ],
    },
    {
      title: "Futures",
      rows: [
        `Correct champion: ${FUTURES_POINTS.champion} points.`,
        `Correct runner-up: ${FUTURES_POINTS.runnerUp} points.`,
        `Correct top scorer: ${FUTURES_POINTS.topScorer} points.`,
        `Favorite-team last round: ${FUTURES_POINTS.favoriteExact} points for exact.`,
        `Ecuador last round: ${FUTURES_POINTS.ecuadorExact} points for exact.`,
        `Perfect futures card bonus: ${FUTURES_POINTS.perfectBonus} points when champion, runner-up, top scorer, favorite-team round, and Ecuador round are all exact.`,
      ],
    },
    {
      title: "Current visualization",
      rows: [
        officialData
          ? "The page scores against official provisional standings from data/generated/official_results.js."
          : "The workbook export does not include official results yet, so official-result rows remain pending.",
        "Knockout points are shown when official knockout matches exist in data/generated/official_results.js and predictions exist in data/generated/knockout_predictions.js.",
      ],
    },
  ];

  rulesGrid.replaceChildren(
    ...sections.map((section) => {
      const article = document.createElement("article");
      article.className = "rule-section";
      article.innerHTML = `
        <h3>${escapeHtml(section.title)}</h3>
        <ul>
          ${section.rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}
        </ul>
      `;
      return article;
    })
  );
}

function renderComparison() {
  const comparisonScenario = scenario;
  const hasComparisonData = hasScenarioData(comparisonScenario);
  const selectedPlayer = players[comparisonPlayerIndex] || players[0];
  const resultLabel = "Official result";
  comparisonStatus.textContent = "Official results";
  comparisonStatus.classList.toggle("pending", !hasComparisonData);

  const groupRows = GROUP_IDS.map((groupId) => groupComparisonRow(groupId, selectedPlayer, comparisonScenario));
  const qualifierMatches = groupRows.reduce((total, row) => total + row.qualifierMatches, 0);
  const exactAdvancingPositions = groupRows.reduce((total, row) => total + row.exactAdvancingPositions, 0);
  const possibleQualifiers = groupRows.reduce((total, row) => total + row.actualQualifiers, 0);
  const bestThirdMatches = selectedPlayer
    ? selectedPlayer.bestThirds.filter((pick) => comparisonScenario.bestThirds.includes(pick.team)).length
    : 0;
  const groupPoints = groupRows.reduce((total, row) => total + row.points, 0);
  const groupTotals = groupRows.reduce(
    (total, row) => ({
      qualifierPoints: total.qualifierPoints + row.qualifierPoints,
      exactAdvancingPoints: total.exactAdvancingPoints + row.exactAdvancingPoints,
      fullOrderPoints: total.fullOrderPoints + row.fullOrderPoints,
      points: total.points + row.points,
    }),
    {
      qualifierPoints: 0,
      exactAdvancingPoints: 0,
      fullOrderPoints: 0,
      points: 0,
    }
  );
  const bestThirdPoints = bestThirdMatches * BEST_THIRD_TEAM_POINTS;
  const futuresScore = selectedPlayer ? scoreFutures(selectedPlayer) : { points: 0, bonus: 0 };
  const futuresPoints = futuresScore.points + futuresScore.bonus;

  comparisonSummary.replaceChildren(
    comparisonEquationRow(
      comparisonMetric("Qualifier points", `${formatPoints(groupTotals.qualifierPoints)} pts (${qualifierMatches}/${possibleQualifiers || 0})`),
      comparisonOperator("+"),
      comparisonMetric("Exact-position bonus", `${formatPoints(groupTotals.exactAdvancingPoints)} pts (${exactAdvancingPositions}/${possibleQualifiers || 0})`),
      comparisonOperator("+"),
      comparisonMetric("Full-order bonus", `${formatPoints(groupTotals.fullOrderPoints)} pts`),
      comparisonOperator("+"),
      comparisonMetric("Best-third overlap", `${formatPoints(bestThirdPoints)} pts (${bestThirdMatches}/${comparisonScenario.bestThirds.length || 0})`),
      comparisonOperator("="),
      comparisonMetric("Group Stage", `${formatPoints(groupPoints + bestThirdPoints)} pts`)
    )
  );

  groupComparisonTable.innerHTML = `
    <thead>
      <tr>
        <th>Group</th>
        <th>${escapeHtml(resultLabel)}</th>
        <th>${escapeHtml(selectedPlayer?.name || "Player")} prediction</th>
        <th>Qualifier points</th>
        <th>Exact-position bonus</th>
        <th>Full-order bonus</th>
        <th>Total points</th>
      </tr>
    </thead>
    <tbody>
      ${groupRows.map((row) => `
        <tr>
          <td><strong>Group ${escapeHtml(row.groupId)}</strong></td>
          <td>${teamList(row.official)}</td>
          <td>${teamList(row.prediction)}</td>
          <td>${groupRulePoints(row, "qualifierPoints", `${row.qualifierMatches}/${row.actualQualifiers}`)}</td>
          <td>${groupRulePoints(row, "exactAdvancingPoints", `${row.exactAdvancingPositions}/${row.actualQualifiers}`)}</td>
          <td>${groupRulePoints(row, "fullOrderPoints", row.fullOrder ? "Yes" : "No")}</td>
          <td>${row.official.length ? formatPoints(row.points) : '<span class="muted">Pending</span>'}</td>
        </tr>
      `).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3"><strong>Group stage total</strong></td>
        <td><strong>${formatPoints(groupTotals.qualifierPoints)} pts</strong></td>
        <td><strong>${formatPoints(groupTotals.exactAdvancingPoints)} pts</strong></td>
        <td><strong>${formatPoints(groupTotals.fullOrderPoints)} pts</strong></td>
        <td><strong>${formatPoints(groupTotals.points)} pts</strong></td>
      </tr>
    </tfoot>
  `;

  const bestThirdRows = bestThirdComparisonRows(selectedPlayer, comparisonScenario);
  const bestThirdTotals = bestThirdRows.reduce(
    (total, row) => ({
      matches: total.matches + (row.match ? 1 : 0),
      points: total.points + row.points,
    }),
    { matches: 0, points: 0 }
  );
  bestThirdComparisonTable.innerHTML = `
    <thead>
      <tr>
        <th>Official results</th>
        <th>${escapeHtml(selectedPlayer?.name || "Player")} prediction</th>
        <th>Overlap result</th>
        <th>Points</th>
      </tr>
    </thead>
    <tbody>
      ${bestThirdRows.map((row) => `
        <tr>
          <td>${comparisonValue(row.chosenResult)}</td>
          <td>${comparisonValue(row.prediction)}</td>
          <td>${row.hasResults ? resultBadge(row) : '<span class="muted">Pending</span>'}</td>
          <td>${row.hasResults ? formatPoints(row.points) : '<span class="muted">Pending</span>'}</td>
        </tr>
      `).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2"><strong>Total</strong></td>
        <td><strong>${bestThirdTotals.matches} match${bestThirdTotals.matches === 1 ? "" : "es"}</strong></td>
        <td><strong>${formatPoints(bestThirdTotals.points)} pts</strong></td>
      </tr>
    </tfoot>
  `;

  const futuresRows = futuresComparisonRows(selectedPlayer, comparisonScenario);
  const futuresTotals = futuresRows.reduce(
    (total, row) => ({
      points: total.points + row.points,
      bonus: total.bonus + row.bonus,
    }),
    { points: 0, bonus: 0 }
  );
  futuresSummary.replaceChildren(
    comparisonEquationRow(
      comparisonMetric("Champion", `${formatPoints(futuresRulePoints(futuresRows, "Champion"))} pts`),
      comparisonOperator("+"),
      comparisonMetric("Runner-up", `${formatPoints(futuresRulePoints(futuresRows, "Runner-up"))} pts`),
      comparisonOperator("+"),
      comparisonMetric("Top scorer", `${formatPoints(futuresRulePoints(futuresRows, "Top scorer"))} pts`),
      comparisonOperator("+"),
      comparisonMetric("Favorite-team round", `${formatPoints(futuresRulePoints(futuresRows, "Favorite-team round"))} pts`),
      comparisonOperator("+"),
      comparisonMetric("Ecuador round", `${formatPoints(futuresRulePoints(futuresRows, "Ecuador round"))} pts`),
      comparisonOperator("+"),
      comparisonMetric("Perfect futures bonus", `${formatPoints(futuresRulePoints(futuresRows, "Perfect futures card bonus"))} pts`),
      comparisonOperator("="),
      comparisonMetric("Futures score", `${formatPoints(futuresPoints)} pts`)
    )
  );
  futuresComparisonTable.innerHTML = `
    <thead>
      <tr>
        <th>Rule</th>
        <th>Official results</th>
        <th>${escapeHtml(selectedPlayer?.name || "Player")} prediction</th>
        <th>Result</th>
        <th>Points</th>
      </tr>
    </thead>
    <tbody>
      ${futuresRows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.label)}</strong></td>
          <td>${comparisonValue(row.actual)}</td>
          <td>${comparisonValue(row.prediction)}</td>
          <td>${row.hasResult ? resultBadge(row) : '<span class="muted">Pending</span>'}</td>
          <td>${row.hasResult ? formatPoints(row.points + row.bonus) : '<span class="muted">Pending</span>'}</td>
        </tr>
      `).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4"><strong>Futures total</strong></td>
        <td><strong>${formatPoints(futuresTotals.points + futuresTotals.bonus)} pts</strong></td>
      </tr>
    </tfoot>
  `;
}

function renderKnockoutComparison() {
  if (!knockoutStagePanels) {
    return;
  }

  const selectedPlayer = players[comparisonPlayerIndex] || players[0];
  const rows = knockoutComparisonRows(selectedPlayer);

  knockoutStagePanels.innerHTML = Object.keys(KNOCKOUT_BASE_POINTS)
    .map((stage) => knockoutStagePanelHtml(stage, rows, selectedPlayer))
    .join("");
}

function knockoutStagePanelHtml(stage, rows, selectedPlayer) {
  const panelKey = `knockout-${stage}`;
  const stageRows = rows.filter((row) => row.stage === stage);
  const stageScore = scoreKnockoutStage(selectedPlayer, stage);
  const predictionPoints = stageScore.points + stageScore.perfectWinnersBonus + stageScore.perfectScoresBonus;
  const stageTotal = predictionPoints + stageScore.bonusQuestionPoints;
  const hasStageResults = stageRows.some((row) => row.hasResult);
  const basePoints = KNOCKOUT_BASE_POINTS[stage] || 0;
  const collapsed = isPanelCollapsed(panelKey);

  return `
    <section class="panel knockout-stage-panel collapsible-panel ${collapsed ? "is-collapsed" : ""}" data-collapsible-panel data-collapsible-key="${escapeHtml(panelKey)}" data-collapsed="${collapsed ? "true" : "false"}">
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(knockoutStageLabel(stage))}</h2>
        </div>
        <div class="panel-actions">
          <span class="rule-pill ${hasStageResults ? "" : "pending"}">${hasStageResults ? "Official results" : "Pending results"}</span>
          <button class="collapse-toggle" type="button" aria-expanded="${collapsed ? "false" : "true"}">
            <span class="collapse-toggle-label">${collapsed ? "Show" : "Hide"}</span>
          </button>
        </div>
      </div>
      <div class="collapsible-body">
        <div class="comparison-summary">
          <div class="comparison-equation-row">
            ${comparisonMetricHtml("Base point", `${formatPoints(basePoints)} pts`)}
            <span class="comparison-operator">|</span>
            ${comparisonMetricHtml("Prediction points", `${formatPoints(predictionPoints)} pts`)}
            <span class="comparison-operator">+</span>
            ${comparisonMetricHtml("Bonus questions points", `${formatPoints(stageScore.bonusQuestionPoints)} pts`)}
            <span class="comparison-operator">=</span>
            ${comparisonMetricHtml("Total points", `${formatPoints(stageTotal)} pts`)}
          </div>
        </div>
        <div class="comparison-content">
          <div class="comparison-block">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th rowspan="2">Match</th>
                    <th colspan="3">Official</th>
                    <th colspan="3">Predicted</th>
                    <th rowspan="2">Multiplier</th>
                    <th rowspan="2">Total points</th>
                  </tr>
                  <tr>
                    <th>Result</th>
                    <th>Penalties</th>
                    <th>Adv team</th>
                    <th>Result</th>
                    <th>Penalties</th>
                    <th>Adv team</th>
                  </tr>
                </thead>
                <tbody>
                  ${stageRows.length ? stageRows.map((row) => `
                    <tr>
                      <td>${escapeHtml(row.matchLabel)}</td>
                      <td>${knockoutValueHtml(row.officialResult)}</td>
                      <td>${knockoutValueHtml(row.officialPenalties)}</td>
                      <td>${knockoutValueHtml(row.officialAdvancingTeam)}</td>
                      <td>${knockoutValueHtml(row.predictedResult)}</td>
                      <td>${knockoutValueHtml(row.predictedPenalties)}</td>
                      <td>${knockoutValueHtml(row.predictedAdvancingTeam)}</td>
                      <td>${row.hasResult ? `${formatMultiplier(row.earnedMultiplier)}x` : '<span class="muted">Pending</span>'}</td>
                      <td class="total">${row.hasResult ? formatPoints(row.points) : '<span class="muted">Pending</span>'}</td>
                    </tr>
                  `).join("") : `
                    <tr>
                      <td colspan="9"><span class="muted">No official ${escapeHtml(knockoutStageLabel(stage).toLowerCase())} fixtures are available yet.</span></td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
          ${stage === "round_of_32" ? roundOf32BonusQuestionsHtml(selectedPlayer) : ""}
        </div>
      </div>
    </section>
  `;
}

function roundOf32BonusQuestionsHtml(selectedPlayer) {
  const maxPoints = ROUND_OF_32_BONUS_QUESTIONS.length * ROUND_OF_32_BONUS_QUESTION_POINTS;
  const answerByQuestion = new Map(
    (knockoutBonusAnswersByPlayer.get(selectedPlayer?.name || "") || []).map((item) => [
      canonicalBonusQuestion(item.question),
      item.answer || "Blank",
    ])
  );
  return `
        <div class="comparison-block bonus-question-block" id="round-of-32-bonus">
          <div class="bonus-question-head">
            <h3>Round of 32 Bonus Questions</h3>
            <span>${formatPoints(ROUND_OF_32_BONUS_QUESTION_POINTS)} pts each, ${formatPoints(maxPoints)} pts max</span>
          </div>
          <div class="table-wrap bonus-question-table">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Your answer</th>
                  <th>Official answer</th>
                  <th>Points earned</th>
                </tr>
              </thead>
              <tbody>
                ${ROUND_OF_32_BONUS_QUESTIONS.map((question) => {
                  const playerAnswer = answerByQuestion.get(canonicalBonusQuestion(question)) || "Blank";
                  const officialAnswer = officialRoundOf32BonusAnswer(question);
                  const earnedPoints = roundOf32BonusQuestionPoints(playerAnswer, officialAnswer);
                  return `
                    <tr>
                      <td>${escapeHtml(question)}</td>
                      <td>${escapeHtml(playerAnswer)}</td>
                      <td class="official-answer">${escapeHtml(formatRoundOf32BonusAnswer(officialAnswer))}</td>
                      <td class="points-answer total">${earnedPoints === null ? "Pending" : formatPoints(earnedPoints)}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3">Round of 32 bonus questions total</td>
                  <td class="total">${formatPoints(scoreRoundOf32BonusQuestions(selectedPlayer))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
  `;
}

function comparisonMetric(label, value) {
  const node = document.createElement("article");
  node.className = "comparison-metric";
  node.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  `;
  return node;
}

function comparisonMetricHtml(label, value) {
  return `
    <article class="comparison-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function futuresRulePoints(rows, label) {
  const row = rows.find((item) => item.label === label);
  return row ? row.points + row.bonus : 0;
}

function comparisonMetricRow(...metrics) {
  const node = document.createElement("div");
  node.className = "comparison-summary-row";
  node.append(...metrics);
  return node;
}

function comparisonEquationRow(...items) {
  const node = document.createElement("div");
  node.className = "comparison-equation-row";
  node.append(...items);
  return node;
}

function comparisonOperator(value) {
  const node = document.createElement("span");
  node.className = "comparison-operator";
  node.textContent = value;
  return node;
}

function groupComparisonRow(groupId, player, comparisonScenario) {
  const official = comparisonScenario.groupResults[groupId] || [];
  const prediction = player?.groups[groupId] || [];
  const predictedQualifiers = groupAdvancingTeams(prediction, playerBestThirdSet(player));
  const actualQualifiers = groupAdvancingTeams(official, new Set(comparisonScenario.bestThirds));
  const qualifierMatches = countSetIntersection(predictedQualifiers, actualQualifiers);
  const exactAdvancingPositions = official.reduce(
    (count, team, index) =>
      count + (
        team &&
        team === prediction[index] &&
        predictedQualifiers.has(team) &&
        actualQualifiers.has(team)
          ? 1
          : 0
      ),
    0
  );
  const fullOrder = official.length > 0 && official.every((team, index) => team && team === prediction[index]);
  const qualifierPoints = qualifierMatches * GROUP_QUALIFIER_POINTS;
  const exactAdvancingPoints = exactAdvancingPositions * GROUP_EXACT_ADVANCING_POSITION_BONUS;
  const fullOrderPoints = fullOrder ? GROUP_FULL_ORDER_BONUS : 0;
  const points =
    qualifierPoints +
    exactAdvancingPoints +
    fullOrderPoints;

  return {
    groupId,
    official,
    prediction,
    actualQualifiers: actualQualifiers.size,
    qualifierMatches,
    exactAdvancingPositions,
    fullOrder,
    qualifierPoints,
    exactAdvancingPoints,
    fullOrderPoints,
    points,
  };
}

function groupRulePoints(row, pointKey, context) {
  if (!row.official.length) {
    return '<span class="muted">Pending</span>';
  }
  return `${escapeHtml(context)} <span class="muted">(${formatPoints(row[pointKey])} pts)</span>`;
}

function bestThirdComparisonRows(player, comparisonScenario) {
  if (!player) {
    return [];
  }

  const resultBestThirds = comparisonScenario.bestThirds.filter(Boolean);
  const resultBestThirdSet = new Set(resultBestThirds);
  const hasResults = resultBestThirds.length > 0;
  const picks = player.bestThirds.map((pick, index) => ({
    prediction: pick.team,
    match: hasResults && resultBestThirdSet.has(pick.team),
    sortOrder: index,
  }));
  const matchedResultTeams = new Set(picks.filter((pick) => pick.match).map((pick) => pick.prediction));
  const unmatchedResultTeams = resultBestThirds.filter((team) => !matchedResultTeams.has(team));
  let unmatchedResultIndex = 0;

  return picks
    .sort((a, b) => Number(b.match) - Number(a.match) || a.sortOrder - b.sortOrder)
    .map((pick) => {
      const chosenResult = pick.match ? pick.prediction : unmatchedResultTeams[unmatchedResultIndex++] || "";
      return {
        prediction: pick.prediction,
        chosenResult,
        match: pick.match,
        hasResults,
        points: pick.match ? BEST_THIRD_TEAM_POINTS : 0,
        status: pick.match ? "Match" : "No match",
      };
    });
}

function knockoutComparisonRows(player) {
  if (!player) {
    return [];
  }

  const predictions = knockoutPredictionsByPlayer.get(player.name) || [];
  const predictionIndex = knockoutPredictionIndex(predictions);

  return officialKnockoutDisplayMatches.map((result) => {
    const prediction = findKnockoutPrediction(result, predictionIndex);
    const hasResult = result.homeScore !== null && result.awayScore !== null && Boolean(result.advancingTeam);
    const points = prediction && hasResult ? scoreKnockoutMatch(prediction, result) : 0;
    const match = points > 0;
    return {
      stage: result.stage,
      matchLabel: `${result.homeTeam} vs ${result.awayTeam}`,
      homeTeam: result.homeTeam,
      awayTeam: result.awayTeam,
      officialResult: hasResult ? knockoutRegulationScoreLabel(result) : "",
      officialPenalties: hasPenaltyScore(result) ? knockoutPenaltyScoreLabel(result) : "",
      officialAdvancingTeam: result.advancingTeam,
      predictedResult: prediction && prediction.homeScore !== null && prediction.awayScore !== null
        ? knockoutRegulationScoreLabel(prediction)
        : "",
      predictedPenalties: prediction && hasPenaltyScore(prediction) ? knockoutPenaltyScoreLabel(prediction) : "",
      predictedAdvancingTeam: prediction?.winner || "",
      match,
      points,
      hasResult,
      basePoints: KNOCKOUT_BASE_POINTS[result.stage] || 0,
      earnedMultiplier: knockoutEarnedMultiplier(result, prediction, hasResult),
      status: prediction && hasResult ? knockoutMatchStatus(prediction, result, points) : (prediction ? "Pending result" : "No prediction"),
    };
  });
}

function knockoutMatchStatus(prediction, result, points) {
  const exactScore = prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore;
  const correctWinner = sameKnockoutTeam(prediction.winner, result.advancingTeam);
  const predictedPenalties = prediction.homeScore !== null &&
    prediction.awayScore !== null &&
    prediction.homeScore === prediction.awayScore;
  const decidedOnPenalties = result.homeScore === result.awayScore && Boolean(result.advancingTeam);
  const exactPenaltyScore = hasPenaltyScore(result) &&
    prediction.homePenaltyScore === result.homePenaltyScore &&
    prediction.awayPenaltyScore === result.awayPenaltyScore;
  if (exactScore && correctWinner && exactPenaltyScore) {
    return "Exact penalties";
  }
  if (exactScore && correctWinner) {
    return "Exact";
  }
  if (exactScore) {
    return "Exact score";
  }
  if (correctWinner && decidedOnPenalties && predictedPenalties) {
    return "Winner + penalties";
  }
  if (correctWinner) {
    return "Winner";
  }
  return points > 0 ? "Partial" : "No match";
}

function knockoutPredictionIndex(predictions) {
  return {
    byFixture: new Map(predictions.map((prediction) => [knockoutFixtureKey(prediction), prediction])),
    byMatchId: new Map(predictions.map((prediction) => [prediction.matchId, prediction])),
  };
}

function findKnockoutPrediction(result, predictionIndex) {
  const fixtureMatch = predictionIndex.byFixture.get(knockoutFixtureKey(result));
  if (fixtureMatch) {
    return fixtureMatch;
  }

  const idMatch = predictionIndex.byMatchId.get(result.matchId);
  return idMatch && sameKnockoutFixture(idMatch, result) ? idMatch : null;
}

function sameKnockoutFixture(left, right) {
  return knockoutFixtureKey(left) === knockoutFixtureKey(right);
}

function sameKnockoutTeam(left, right) {
  return Boolean(left && right) && canonicalKnockoutTeamName(left) === canonicalKnockoutTeamName(right);
}

function knockoutFixtureKey(match) {
  return [
    match.stage || "",
    canonicalKnockoutTeamName(match.homeTeam),
    canonicalKnockoutTeamName(match.awayTeam),
  ].join("|");
}

function canonicalKnockoutTeamName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return KNOCKOUT_TEAM_ALIASES[normalized] || normalized;
}

function knockoutScoreLabel(match) {
  const score = knockoutRegulationScoreLabel(match);
  if (hasPenaltyScore(match)) {
    return `${score} (${knockoutPenaltyScoreLabel(match)} pens)`;
  }
  return score;
}

function knockoutRegulationScoreLabel(match) {
  return `${match.homeScore ?? "-"}-${match.awayScore ?? "-"}`;
}

function knockoutPenaltyScoreLabel(match) {
  return `${match.homePenaltyScore ?? "-"}-${match.awayPenaltyScore ?? "-"}`;
}

function knockoutValueHtml(value) {
  return value ? escapeHtml(value) : '<span class="muted">Pending</span>';
}

function knockoutEarnedMultiplier(result, prediction, hasResult) {
  const basePoints = KNOCKOUT_BASE_POINTS[result.stage] || 0;
  if (!prediction || !hasResult || !basePoints) {
    return 0;
  }
  const points = scoreKnockoutMatch(prediction, result);
  return points / basePoints;
}

function hasPenaltyScore(match) {
  return match.homePenaltyScore !== null && match.awayPenaltyScore !== null;
}

function actualTopScorers(futures) {
  const scorers = Array.isArray(futures?.topScorers)
    ? futures.topScorers.filter(Boolean)
    : [];
  if (futures?.topScorer && !scorers.includes(futures.topScorer)) {
    scorers.unshift(futures.topScorer);
  }
  return scorers;
}

function normalizedTopScorerNames(futures) {
  return actualTopScorers(futures).map(normalizePersonName);
}

function normalizePersonName(name) {
  return String(name || "")
    .trim()
    .replace(/\s*[-–—]?\s*\d+\s*$/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function actualTeamLastRound(teamLastRounds, teamName) {
  const rounds = teamLastRounds || {};
  if (rounds[teamName]) {
    return rounds[teamName];
  }
  const normalizedTeam = canonicalKnockoutTeamName(teamName);
  const match = Object.entries(rounds).find(
    ([candidate]) => canonicalKnockoutTeamName(candidate) === normalizedTeam
  );
  return match ? match[1] : undefined;
}

function futuresComparisonRows(player, comparisonScenario) {
  if (!player) {
    return [];
  }

  const prediction = player.futures;
  const actual = comparisonScenario.futures;
  const championCorrect = Boolean(actual.champion) && prediction.champion === actual.champion;
  const runnerUpCorrect = Boolean(actual.runnerUp) && prediction.runnerUp === actual.runnerUp;
  const topScorerCorrect = normalizedTopScorerNames(actual).includes(normalizePersonName(prediction.topScorer));
  const favoriteActualStage = actualTeamLastRound(actual.teamLastRounds, prediction.favoriteTeam);
  const favoritePoints = lastRoundPoints(prediction.favoriteRound, favoriteActualStage, {
    exact: FUTURES_POINTS.favoriteExact,
  });
  const ecuadorActualStage = actualTeamLastRound(actual.teamLastRounds, "Ecuador");
  const ecuadorPoints = lastRoundPoints(prediction.ecuadorRound, ecuadorActualStage, {
    exact: FUTURES_POINTS.ecuadorExact,
  });
  const perfectBonus =
    championCorrect &&
    runnerUpCorrect &&
    topScorerCorrect &&
    prediction.favoriteRound === favoriteActualStage &&
    prediction.ecuadorRound === ecuadorActualStage;

  return [
    {
      label: "Champion",
      actual: actual.champion,
      prediction: prediction.champion,
      hasResult: Boolean(actual.champion),
      match: championCorrect,
      points: championCorrect ? FUTURES_POINTS.champion : 0,
      bonus: 0,
      status: championCorrect ? "Match" : "No match",
    },
    {
      label: "Runner-up",
      actual: actual.runnerUp,
      prediction: prediction.runnerUp,
      hasResult: Boolean(actual.runnerUp),
      match: runnerUpCorrect,
      points: runnerUpCorrect ? FUTURES_POINTS.runnerUp : 0,
      bonus: 0,
      status: runnerUpCorrect ? "Match" : "No match",
    },
    {
      label: "Top scorer",
      actual: actualTopScorers(actual).join(" / "),
      prediction: prediction.topScorer,
      hasResult: actualTopScorers(actual).length > 0,
      match: topScorerCorrect,
      points: topScorerCorrect ? FUTURES_POINTS.topScorer : 0,
      bonus: 0,
      status: topScorerCorrect ? "Match" : "No match",
    },
    {
      label: "Favorite-team round",
      actual: favoriteActualStage ? `${prediction.favoriteTeam}: ${stageLabel(favoriteActualStage)}` : "",
      prediction: prediction.favoriteTeam && prediction.favoriteRound ? `${prediction.favoriteTeam}: ${stageLabel(prediction.favoriteRound)}` : "",
      hasResult: Boolean(favoriteActualStage),
      match: prediction.favoriteRound === favoriteActualStage,
      points: favoritePoints,
      bonus: 0,
      status: roundMatchStatus(prediction.favoriteRound, favoriteActualStage),
    },
    {
      label: "Ecuador round",
      actual: ecuadorActualStage ? stageLabel(ecuadorActualStage) : "",
      prediction: prediction.ecuadorRound ? stageLabel(prediction.ecuadorRound) : "",
      hasResult: Boolean(ecuadorActualStage),
      match: prediction.ecuadorRound === ecuadorActualStage,
      points: ecuadorPoints,
      bonus: 0,
      status: roundMatchStatus(prediction.ecuadorRound, ecuadorActualStage),
    },
    {
      label: "Perfect futures card bonus",
      actual: "All futures exact",
      prediction: "All futures exact",
      hasResult: hasFuturesComparisonData(actual),
      match: perfectBonus,
      points: 0,
      bonus: perfectBonus ? FUTURES_POINTS.perfectBonus : 0,
      status: perfectBonus ? "Match" : "No match",
    },
  ];
}

function roundMatchStatus(predicted, actual) {
  if (!predicted || !actual || !(predicted in STAGE_ORDER) || !(actual in STAGE_ORDER)) {
    return "No match";
  }
  if (STAGE_ORDER[predicted] === STAGE_ORDER[actual]) {
    return "Exact";
  }
  return "No match";
}

function hasFuturesComparisonData(actual) {
  return Boolean(
    actual.champion ||
    actual.runnerUp ||
    actualTopScorers(actual).length > 0 ||
    Object.values(actual.teamLastRounds).some(Boolean)
  );
}

function resultBadge(row) {
  const tone = row.match ? "hit" : "miss";
  return `<span class="result-badge ${tone}">${escapeHtml(row.status)}</span>`;
}

function teamList(teams) {
  if (!teams.length) {
    return '<span class="muted">Pending</span>';
  }
  return `<ol class="team-list">${teams.map((team) => `<li>${escapeHtml(team)}</li>`).join("")}</ol>`;
}

function comparisonValue(value) {
  return value ? escapeHtml(value) : '<span class="muted">Pending</span>';
}

function renderGroupEditors() {
  const teamOptions = teamsByGroup();
  groupEditors.replaceChildren(
    ...GROUP_IDS.map((groupId) => {
      const card = document.createElement("article");
      card.className = "group-card";
      card.innerHTML = `<h3>Group ${groupId}</h3>`;

      [0, 1, 2].forEach((index) => {
        card.append(
          selectField({
            label: `${index + 1}${ordinalSuffix(index + 1)} place`,
            value: scenario.groupResults[groupId]?.[index] || "",
            options: teamOptions[groupId] || [],
            onChange: (value) => {
              scenario.groupResults[groupId][index] = value;
              renderAfterScenarioChange();
            },
          })
        );
      });

      return card;
    })
  );
}

function ordinalSuffix(value) {
  return value === 1 ? "st" : value === 2 ? "nd" : "rd";
}

function teamsByGroup() {
  const groups = {};
  GROUP_IDS.forEach((groupId) => {
    groups[groupId] = unique(players.flatMap((player) => player.groups[groupId] || [])).sort((a, b) =>
      a.localeCompare(b)
    );
  });
  return groups;
}

function renderBestThirdEditor() {
  const teams = consensusBestThirds(players);
  bestThirdEditor.replaceChildren(
    ...teams.map(({ team, votes }) => {
      const label = document.createElement("label");
      label.className = "check-pill";
      label.innerHTML = `
        <input type="checkbox" ${scenario.bestThirds.includes(team) ? "checked" : ""}>
        <span>${escapeHtml(team)} <span class="muted">(${votes})</span></span>
      `;
      label.querySelector("input").addEventListener("change", (event) => {
        if (event.target.checked) {
          scenario.bestThirds = unique([...scenario.bestThirds, team]);
        } else {
          scenario.bestThirds = scenario.bestThirds.filter((item) => item !== team);
        }
        renderAfterScenarioChange();
      });
      return label;
    })
  );
}

function renderFuturesEditor() {
  const teamOptions = unique([
    ...players.map((player) => player.futures.champion),
    ...players.map((player) => player.futures.runnerUp),
    ...players.map((player) => player.futures.favoriteTeam),
  ]).sort((a, b) => a.localeCompare(b));
  const scorers = unique(players.map((player) => player.futures.topScorer)).sort((a, b) => a.localeCompare(b));

  futuresEditor.replaceChildren(
    selectField({
      label: "Champion",
      value: scenario.futures.champion,
      options: teamOptions,
      onChange: (value) => {
        scenario.futures.champion = value;
        if (value) {
          scenario.futures.teamLastRounds[value] = "champion";
        }
        render();
      },
    }),
    selectField({
      label: "Runner-up",
      value: scenario.futures.runnerUp,
      options: teamOptions,
      onChange: (value) => {
        scenario.futures.runnerUp = value;
        if (value) {
          scenario.futures.teamLastRounds[value] = "runner_up";
        }
        render();
      },
    }),
    selectField({
      label: "Top scorer",
      value: scenario.futures.topScorer,
      options: scorers,
      onChange: (value) => {
        scenario.futures.topScorer = value;
        renderAfterScenarioChange();
      },
    }),
    trackedStageEditor()
  );
}

function trackedStageEditor() {
  const wrapper = document.createElement("div");
  wrapper.className = "stage-list";
  wrapper.innerHTML = "<h3>Tracked Team Last Round</h3>";

  trackedTeams(players).forEach((team) => {
    wrapper.append(
      selectField({
        label: team,
        value: scenario.futures.teamLastRounds[team] || "",
        options: STAGES.map(([key]) => key),
        optionLabel: (stageKey) => stageLabel(stageKey),
        onChange: (value) => {
          scenario.futures.teamLastRounds[team] = value;
          renderAfterScenarioChange();
        },
      })
    );
  });

  return wrapper;
}

function selectField({ label, value, options, onChange, optionLabel = (option) => option }) {
  const field = document.createElement("label");
  field.className = "field";

  const title = document.createElement("span");
  title.textContent = label;

  const select = document.createElement("select");
  select.append(new Option("Blank", ""));
  options.forEach((option) => {
    select.append(new Option(optionLabel(option), option));
  });
  select.value = value || "";
  select.addEventListener("change", (event) => onChange(event.target.value));

  field.append(title, select);
  return field;
}

function renderAfterScenarioChange() {
  renderComparison();
  renderKnockoutComparison();
  renderLeaderboard();
}

function renderConsensusCharts() {
  const playerCount = players.length || 1;
  consensusCharts.replaceChildren(
    chart("Champion", countRows(players.map((player) => player.futures.champion)), playerCount),
    chart("Runner-up", countRows(players.map((player) => player.futures.runnerUp)), playerCount),
    chart("Top scorer", countRows(players.map((player) => player.futures.topScorer)), playerCount),
    chart("Best thirds", consensusBestThirds(players).slice(0, 12).map((row) => [row.team, row.votes]), playerCount),
    ...GROUP_IDS.map((groupId) =>
      chart(
        `Group ${groupId} winner`,
        countRows(players.map((player) => player.groups[groupId]?.[0] || "")),
        playerCount
      )
    )
  );
}

function countRows(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function chart(title, rows, maxVotes) {
  const node = document.createElement("article");
  node.className = "chart";
  const heading = document.createElement("h3");
  heading.textContent = title;
  node.append(heading);

  rows.slice(0, 8).forEach(([label, votes]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
      <div class="bar-track"><div class="bar" style="width: ${Math.max(3, (votes / maxVotes) * 100)}%"></div></div>
      <strong>${votes}</strong>
    `;
    node.append(row);
  });

  return node;
}

function renderLeaderboard() {
  document.querySelector(".empty-state")?.remove();
  leaderboardScenarioStatus.textContent = "Official results";
  const rows = scoreAllPlayers();

  if (!rows.length) {
    leaderboardTable.innerHTML = "";
    leaderboardTable.insertAdjacentHTML("afterend", '<div class="empty-state">No players available.</div>');
    return;
  }

  leaderboardTable.innerHTML = `
    <thead>
      <tr>
        <th class="rank">#</th>
        <th>Player</th>
        <th>Total</th>
        <th>Group Stage</th>
        ${LEADERBOARD_KNOCKOUT_STAGES.map((stage) => `<th>${escapeHtml(knockoutStageLabel(stage))}</th>`).join("")}
        <th>Futures</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row, index) => `
            <tr
              class="${row.playerIndex === comparisonPlayerIndex ? "is-selected" : ""}"
              data-player-index="${row.playerIndex}"
              tabindex="0"
              aria-selected="${row.playerIndex === comparisonPlayerIndex ? "true" : "false"}"
            >
              <td class="rank">${index + 1}</td>
              <td class="player-cell"><strong class="player-name">${escapeHtml(row.name)}</strong><br><span class="muted">${escapeHtml(row.sheet)}</span></td>
              <td class="total">${formatPoints(row.total)}</td>
              <td>${formatPoints(row.firstRound)}</td>
              ${LEADERBOARD_KNOCKOUT_STAGES.map((stage) => `<td>${formatPoints(row.knockoutStages[stage] || 0)}</td>`).join("")}
              <td>${formatPoints(row.futures)}</td>
            </tr>
          `
        )
        .join("")}
    </tbody>
  `;
}

function hasScenarioData(value) {
  return (
    Object.values(value.groupResults).some((teams) => teams.some(Boolean)) ||
    value.bestThirds.length > 0 ||
    value.futures.champion ||
    value.futures.runnerUp ||
    value.futures.topScorer ||
    actualTopScorers(value.futures).length > 0 ||
    Object.values(value.futures.teamLastRounds).some(Boolean)
  );
}

function scoreAllPlayers() {
  return players
    .map((player, playerIndex) => {
      const group = scoreGroups(player);
      const bestThirds = scoreBestThirds(player);
      const knockoutScore = scoreKnockout(player);
      const knockoutStages = Object.fromEntries(
        LEADERBOARD_KNOCKOUT_STAGES.map((stage) => {
          const stageScore = scoreKnockoutStage(player, stage);
          return [stage, stageScore.points + stageScore.bonus];
        })
      );
      const futuresScore = scoreFutures(player);
      const firstRound = group + bestThirds;
      const total = firstRound + knockoutScore.points + knockoutScore.bonus + futuresScore.points + futuresScore.bonus;
      return {
        playerIndex,
        name: player.name,
        sheet: player.sheet,
        group,
        bestThirds,
        firstRound,
        knockout: knockoutScore.points + knockoutScore.bonus,
        knockoutStages,
        futures: futuresScore.points,
        bonus: knockoutScore.bonus + futuresScore.bonus,
        total,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function scoreGroups(player) {
  return GROUP_IDS.reduce((total, groupId) => {
    const predicted = player.groups[groupId] || [];
    const actual = scenario.groupResults[groupId] || [];
    if (!actual.some(Boolean)) {
      return total;
    }

    const predictedQualifiers = groupAdvancingTeams(predicted, playerBestThirdSet(player));
    const actualQualifiers = groupAdvancingTeams(actual, new Set(scenario.bestThirds));
    const qualifierMatches = countSetIntersection(predictedQualifiers, actualQualifiers);
    const exactAdvancingPositions = predicted.reduce(
      (count, team, index) =>
        count + (
          team &&
          team === actual[index] &&
          predictedQualifiers.has(team) &&
          actualQualifiers.has(team)
            ? 1
            : 0
        ),
      0
    );
    const fullOrder = actual.length > 0 && actual.every((team, index) => team && team === predicted[index]);
    return (
      total +
      qualifierMatches * GROUP_QUALIFIER_POINTS +
      exactAdvancingPositions * GROUP_EXACT_ADVANCING_POSITION_BONUS +
      (fullOrder ? GROUP_FULL_ORDER_BONUS : 0)
    );
  }, 0);
}

function scoreBestThirds(player) {
  const actual = new Set(scenario.bestThirds);
  return player.bestThirds.filter((pick) => actual.has(pick.team)).length * BEST_THIRD_TEAM_POINTS;
}

function scoreKnockout(player) {
  const stageScores = Object.keys(KNOCKOUT_BASE_POINTS).map((stage) => scoreKnockoutStage(player, stage));
  const points = stageScores.reduce((total, stageScore) => total + stageScore.points, 0);
  const perfectWinnersBonus = stageScores.reduce((total, stageScore) => total + stageScore.perfectWinnersBonus, 0);
  const perfectScoresBonus = stageScores.reduce((total, stageScore) => total + stageScore.perfectScoresBonus, 0);
  const bonusQuestionPoints = stageScores.reduce((total, stageScore) => total + stageScore.bonusQuestionPoints, 0);
  return {
    points,
    bonus: perfectWinnersBonus + perfectScoresBonus + bonusQuestionPoints,
    perfectWinnersBonus,
    perfectScoresBonus,
    bonusQuestionPoints,
  };
}

function scoreKnockoutStage(player, stage) {
  const predictions = knockoutPredictionsByPlayer.get(player?.name || "") || [];
  const predictionIndex = knockoutPredictionIndex(predictions);
  const stageMatches = officialKnockoutMatches.filter((match) => match.stage === stage);
  let points = 0;
  const completeBonusStage =
    KNOCKOUT_PERFECT_BONUS_STAGES.has(stage) &&
    stageMatches.length === KNOCKOUT_STAGE_MATCH_COUNTS[stage];
  let perfectWinnersPossible = completeBonusStage;
  let perfectScoresPossible = completeBonusStage;

  stageMatches.forEach((result) => {
    const prediction = findKnockoutPrediction(result, predictionIndex);
    if (!prediction) {
      perfectWinnersPossible = false;
      perfectScoresPossible = false;
      return;
    }

    points += scoreKnockoutMatch(prediction, result);

    if (!sameKnockoutTeam(prediction.winner, result.advancingTeam)) {
      perfectWinnersPossible = false;
    }

    const exactScore =
      prediction.mode === "score" &&
      prediction.homeScore === result.homeScore &&
      prediction.awayScore === result.awayScore &&
      sameKnockoutTeam(prediction.winner, result.advancingTeam);
    if (!exactScore) {
      perfectScoresPossible = false;
    }
  });

  const perfectWinnersBonus = perfectWinnersPossible ? KNOCKOUT_PERFECT_WINNER_BONUS_POINTS[stage] : 0;
  const perfectScoresBonus = perfectScoresPossible ? KNOCKOUT_PERFECT_SCORE_BONUS_POINTS[stage] : 0;
  const bonusQuestionPoints = stage === "round_of_32" ? scoreRoundOf32BonusQuestions(player) : 0;
  return {
    points,
    bonus: perfectWinnersBonus + perfectScoresBonus + bonusQuestionPoints,
    perfectWinnersBonus,
    perfectScoresBonus,
    bonusQuestionPoints,
  };
}

function scoreRoundOf32BonusQuestions(player) {
  const answers = knockoutBonusAnswersByPlayer.get(player?.name || "") || [];
  return answers.reduce((total, item) => {
    const earnedPoints = roundOf32BonusQuestionPoints(item.answer, officialRoundOf32BonusAnswer(item.question));
    return total + (earnedPoints || 0);
  }, 0);
}

function roundOf32BonusQuestionPoints(playerAnswer, officialAnswer) {
  if (officialAnswer === null || officialAnswer === "" || officialAnswer === undefined) {
    return null;
  }
  return bonusAnswerMatches(playerAnswer, officialAnswer) ? ROUND_OF_32_BONUS_QUESTION_POINTS : 0;
}

function officialRoundOf32BonusAnswer(question) {
  const key = canonicalBonusQuestion(question);
  const values = {
    extra_time_matches: officialRoundOf32BonusResults.extraTimeMatches,
    penalty_matches: officialRoundOf32BonusResults.penaltyMatches,
    most_goals_team: officialRoundOf32BonusResults.mostGoalsTeam,
    total_goals: officialRoundOf32BonusResults.totalGoals,
    fastest_goal_team: officialRoundOf32BonusResults.fastestGoalTeam,
    latest_goal_team: officialRoundOf32BonusResults.latestGoalTeam,
    biggest_winning_margin_team: officialRoundOf32BonusResults.biggestWinningMarginTeam,
    yellow_cards: officialRoundOf32BonusResults.yellowCards,
    red_cards: officialRoundOf32BonusResults.redCards,
  };
  return values[key];
}

function formatRoundOf32BonusAnswer(answer) {
  if (answer === null || answer === "" || answer === undefined) {
    return "Pending";
  }
  return String(answer);
}

function canonicalBonusQuestion(question) {
  const text = String(question || "").toLowerCase();
  if (text.includes("extra time") && !text.includes("latest goal")) {
    return "extra_time_matches";
  }
  if (text.includes("most goals")) {
    return "most_goals_team";
  }
  if (text.includes("total goals")) {
    return "total_goals";
  }
  if (text.includes("penalties")) {
    return "penalty_matches";
  }
  if (text.includes("fastest goal")) {
    return "fastest_goal_team";
  }
  if (text.includes("latest goal")) {
    return "latest_goal_team";
  }
  if (text.includes("biggest winning margin")) {
    return "biggest_winning_margin_team";
  }
  if (text.includes("yellow cards")) {
    return "yellow_cards";
  }
  if (text.includes("red cards")) {
    return "red_cards";
  }
  return "";
}

function bonusAnswerMatches(prediction, actual) {
  const predictedText = String(prediction || "").trim();
  if (!predictedText) {
    return false;
  }
  if (typeof actual === "number") {
    return numericBonusAnswerMatches(predictedText, actual);
  }
  return sameKnockoutTeam(predictedText, String(actual));
}

function numericBonusAnswerMatches(prediction, actual) {
  const normalized = prediction.replace(/\s+/g, " ").trim();
  const rangeMatch = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    return actual >= low && actual <= high;
  }

  const greaterThanMatch = normalized.match(/^>\s*(\d+)$/);
  if (greaterThanMatch) {
    return actual > Number(greaterThanMatch[1]);
  }

  const lessThanMatch = normalized.match(/^<\s*(\d+)$/);
  if (lessThanMatch) {
    return actual < Number(lessThanMatch[1]);
  }

  const exact = Number(normalized);
  return Number.isFinite(exact) && actual === exact;
}

function scoreKnockoutMatch(prediction, result) {
  const basePoints = KNOCKOUT_BASE_POINTS[result.stage] || 0;
  const correctAdvancingTeam = sameKnockoutTeam(prediction.winner, result.advancingTeam);

  const exactScore = prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore;
  const predictedPenalties = prediction.homeScore !== null &&
    prediction.awayScore !== null &&
    prediction.homeScore === prediction.awayScore;
  const decidedOnPenalties = result.homeScore === result.awayScore && Boolean(result.advancingTeam);
  const exactPenaltyScore = hasPenaltyScore(result) &&
    prediction.homePenaltyScore === result.homePenaltyScore &&
    prediction.awayPenaltyScore === result.awayPenaltyScore;
  if (exactScore && correctAdvancingTeam && exactPenaltyScore) {
    return basePoints * 3;
  }
  if (exactScore && correctAdvancingTeam) {
    return basePoints * 2;
  }
  if (correctAdvancingTeam) {
    if (decidedOnPenalties && predictedPenalties) {
      if (exactPenaltyScore) {
        return basePoints * 2;
      }
      return basePoints * 1.5;
    }
    return basePoints;
  }
  if (decidedOnPenalties) {
    return basePoints * 0.5;
  }
  return 0;
}

function playerBestThirdSet(player) {
  return new Set((player?.bestThirds || []).map((pick) => pick.team));
}

function groupAdvancingTeams(orderedTeams, bestThirds) {
  const directQualifiers = orderedTeams.slice(0, 2).filter(Boolean);
  return new Set(
    [
      ...directQualifiers,
      ...orderedTeams.filter((team) => team && bestThirds.has(team)),
    ]
  );
}

function countSetIntersection(left, right) {
  return [...left].filter((value) => right.has(value)).length;
}

function scoreFutures(player) {
  const prediction = player.futures;
  const actual = scenario.futures;
  let points = 0;
  let bonus = 0;

  const championCorrect = Boolean(actual.champion) && prediction.champion === actual.champion;
  const runnerUpCorrect = Boolean(actual.runnerUp) && prediction.runnerUp === actual.runnerUp;
  const topScorerCorrect = normalizedTopScorerNames(actual).includes(normalizePersonName(prediction.topScorer));

  if (championCorrect) {
    points += FUTURES_POINTS.champion;
  }
  if (runnerUpCorrect) {
    points += FUTURES_POINTS.runnerUp;
  }
  if (topScorerCorrect) {
    points += FUTURES_POINTS.topScorer;
  }

  const favoriteActualStage = actualTeamLastRound(actual.teamLastRounds, prediction.favoriteTeam);
  const favoritePoints = lastRoundPoints(prediction.favoriteRound, favoriteActualStage, {
    exact: FUTURES_POINTS.favoriteExact,
  });
  points += favoritePoints;

  const ecuadorActualStage = actualTeamLastRound(actual.teamLastRounds, "Ecuador");
  const ecuadorPoints = lastRoundPoints(prediction.ecuadorRound, ecuadorActualStage, {
    exact: FUTURES_POINTS.ecuadorExact,
  });
  points += ecuadorPoints;

  if (
    championCorrect &&
    runnerUpCorrect &&
    topScorerCorrect &&
    prediction.favoriteRound === favoriteActualStage &&
    prediction.ecuadorRound === ecuadorActualStage
  ) {
    bonus += FUTURES_POINTS.perfectBonus;
  }

  return { points, bonus };
}

function lastRoundPoints(predicted, actual, pointValues) {
  if (!predicted || !actual || !(predicted in STAGE_ORDER) || !(actual in STAGE_ORDER)) {
    return 0;
  }
  if (STAGE_ORDER[predicted] === STAGE_ORDER[actual]) {
    return pointValues.exact;
  }
  return 0;
}

function stageLabel(stageKey) {
  if (stageKey in KNOCKOUT_STAGE_LABELS) {
    return knockoutStageLabel(stageKey);
  }
  return STAGES.find(([key]) => key === stageKey)?.[1] || stageKey;
}

function knockoutStageLabel(stageKey) {
  return KNOCKOUT_STAGE_LABELS[stageKey] || stageKey;
}

function formatPoints(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMultiplier(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}
