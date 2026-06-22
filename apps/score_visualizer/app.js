const rawData = window.POOL_DATA || { players: [] };
const officialData = window.OFFICIAL_RESULTS || null;
const knockoutData = window.KNOCKOUT_PREDICTIONS || { players: [] };

const GROUP_QUALIFIER_POINTS = 1;
const GROUP_EXACT_ADVANCING_POSITION_BONUS = 1;
const GROUP_FULL_ORDER_BONUS = 5;
const BEST_THIRD_TEAM_POINTS = 3;

const FUTURES_POINTS = {
  champion: 80,
  runnerUp: 50,
  reversedFinalPairing: 35,
  topScorer: 60,
  favoriteExact: 35,
  favoriteOffByOne: 15,
  ecuadorExact: 40,
  ecuadorOffByOne: 18,
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
  round_of_32: 10,
  round_of_16: 15,
  quarterfinal: 25,
  semifinal: 40,
};
const KNOCKOUT_PERFECT_SCORE_BONUS_POINTS = {
  round_of_32: 30,
  round_of_16: 45,
  quarterfinal: 75,
  semifinal: 120,
};
const KNOCKOUT_STAGE_LABELS = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinals",
  semifinal: "Semifinals",
  third_place_match: "Third-place match",
  final: "Final",
};
const LEADERBOARD_KNOCKOUT_STAGES = Object.keys(KNOCKOUT_BASE_POINTS);

const STAGES = [
  ["group_stage", "Group stage"],
  ["round_of_32", "Round of 32"],
  ["round_of_16", "Round of 16"],
  ["quarterfinal", "Quarter final"],
  ["semifinal", "Semi final"],
  ["third_place_match", "Third-place match"],
  ["runner_up", "Runner-up"],
  ["champion", "Champion"],
];

const STAGE_ORDER = Object.fromEntries(STAGES.map(([key], index) => [key, index]));
const GROUP_IDS = "ABCDEFGHIJKL".split("");
const GROUP_HEADER_PATTERN = /^Group ([A-L])$/;
const RANK_PATTERN = /^\d+(?:\.0)?$/;

const players = rawData.players.map(normalizePlayer);
const knockoutPredictionsByPlayer = normalizeKnockoutPredictions(knockoutData);
const officialScenario = normalizeOfficialScenario(players, officialData);
const scenario = officialScenario;
const officialKnockoutMatches = latestOfficialKnockoutMatches(officialData);
let comparisonPlayerIndex = 0;

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

playerSelect?.addEventListener("change", (event) => {
  selectComparisonPlayer(Number.parseInt(event.target.value, 10) || 0);
});

leaderboardTable.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-player-index]");
  if (!row) {
    return;
  }
  selectComparisonPlayer(Number.parseInt(row.dataset.playerIndex, 10) || 0);
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
  selectComparisonPlayer(Number.parseInt(row.dataset.playerIndex, 10) || 0);
});

populatePlayerSelect();
render();

function render() {
  renderComparison();
  renderKnockoutComparison();
  renderRules();
  renderLeaderboard();
}

function selectComparisonPlayer(playerIndex) {
  comparisonPlayerIndex = Math.max(0, Math.min(playerIndex, players.length - 1));
  if (playerSelect) {
    playerSelect.value = String(comparisonPlayerIndex);
  }
  renderComparison();
  renderKnockoutComparison();
  renderLeaderboard();
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

function normalizeKnockoutPrediction(match) {
  const homeScore = numberOrNull(match.homeScore);
  const awayScore = numberOrNull(match.awayScore);
  return {
    matchId: String(match.matchId || match.id || ""),
    stage: normalizeKnockoutStage(match.stage || ""),
    homeTeam: match.homeTeam || match.home || "",
    awayTeam: match.awayTeam || match.away || "",
    homeScore,
    awayScore,
    winner: match.winner || match.advancingTeam || match.predictedAdvancingTeam || "",
    mode: homeScore === null || awayScore === null ? "winner" : "score",
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

function normalizeOfficialKnockoutMatch(match) {
  return {
    matchId: String(match.matchId || match.id || ""),
    stage: normalizeKnockoutStage(match.stage || ""),
    homeTeam: match.homeTeam || match.home || "",
    awayTeam: match.awayTeam || match.away || "",
    homeScore: numberOrNull(match.homeScore),
    awayScore: numberOrNull(match.awayScore),
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
        `If the champion and runner-up are reversed, the entry earns ${FUTURES_POINTS.reversedFinalPairing} points instead of the champion or runner-up points.`,
        `Correct top scorer: ${FUTURES_POINTS.topScorer} points.`,
        `Favorite-team last round: ${FUTURES_POINTS.favoriteExact} points for exact, ${FUTURES_POINTS.favoriteOffByOne} points if off by one round.`,
        `Ecuador last round: ${FUTURES_POINTS.ecuadorExact} points for exact, ${FUTURES_POINTS.ecuadorOffByOne} points if off by one round.`,
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
      comparisonMetric("Reversed final pair", `${formatPoints(futuresRulePoints(futuresRows, "Reversed final pair"))} pts`),
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
  const stageRows = rows.filter((row) => row.stage === stage);
  const stageScore = scoreKnockoutStage(selectedPlayer, stage);
  const stageTotal = stageScore.points + stageScore.bonus;
  const hasStageResults = stageRows.length > 0;
  const basePoints = KNOCKOUT_BASE_POINTS[stage] || 0;
  const earnedMultiplier = basePoints ? stageScore.points / basePoints : 0;
  const bonusEquation = KNOCKOUT_PERFECT_BONUS_STAGES.has(stage)
    ? `
          <span class="comparison-operator">+</span>
          ${comparisonMetricHtml("Perfect winners bonus", `${formatPoints(stageScore.perfectWinnersBonus)} pts`)}
          <span class="comparison-operator">+</span>
          ${comparisonMetricHtml("Perfect scores bonus", `${formatPoints(stageScore.perfectScoresBonus)} pts`)}
      `
    : "";

  return `
    <section class="panel knockout-stage-panel">
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(knockoutStageLabel(stage))}</h2>
        </div>
        <span class="rule-pill ${hasStageResults ? "" : "pending"}">${hasStageResults ? "Official results" : "Pending results"}</span>
      </div>
      <div class="comparison-summary">
        <div class="comparison-equation-row">
          ${comparisonMetricHtml("Base points", `${formatPoints(basePoints)} pts`)}
          <span class="comparison-operator">x</span>
          ${comparisonMetricHtml("Earned multiplier", `${formatMultiplier(earnedMultiplier)}x`)}
          ${bonusEquation}
          <span class="comparison-operator">=</span>
          ${comparisonMetricHtml("Knockout score", `${formatPoints(stageTotal)} pts`)}
        </div>
      </div>
      <div class="comparison-content">
        <div class="comparison-block">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Official result</th>
                  <th>${escapeHtml(selectedPlayer?.name || "Player")} prediction</th>
                  <th>Result</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                ${stageRows.length ? stageRows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.matchLabel)}</td>
                    <td>${escapeHtml(row.officialLabel)}</td>
                    <td>${row.predictionLabel ? escapeHtml(row.predictionLabel) : '<span class="muted">Pending</span>'}</td>
                    <td>${resultBadge(row)}</td>
                    <td>${formatPoints(row.points)}</td>
                  </tr>
                `).join("") : `
                  <tr>
                    <td colspan="5"><span class="muted">No official ${escapeHtml(knockoutStageLabel(stage).toLowerCase())} results are available yet.</span></td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
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
  const predictionByMatch = new Map(predictions.map((prediction) => [prediction.matchId, prediction]));

  return officialKnockoutMatches.map((result) => {
    const prediction = predictionByMatch.get(result.matchId);
    const points = prediction ? scoreKnockoutMatch(prediction, result) : 0;
    const match = points > 0;
    return {
      stage: result.stage,
      matchLabel: `${result.homeTeam} vs ${result.awayTeam}`,
      officialLabel: `${result.homeTeam} ${result.homeScore}-${result.awayScore} ${result.awayTeam}; ${result.advancingTeam} advanced`,
      predictionLabel: prediction ? knockoutPredictionLabel(prediction, result) : "",
      match,
      points,
      status: prediction ? knockoutMatchStatus(prediction, result, points) : "No prediction",
    };
  });
}

function knockoutPredictionLabel(prediction, result) {
  const score = prediction.homeScore !== null && prediction.awayScore !== null
    ? `${result.homeTeam} ${prediction.homeScore}-${prediction.awayScore} ${result.awayTeam}; `
    : "";
  return `${score}${prediction.winner || "No winner"} advanced`;
}

function knockoutMatchStatus(prediction, result, points) {
  const exactScore = prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore;
  const correctWinner = prediction.winner && prediction.winner === result.advancingTeam;
  if (exactScore && correctWinner) {
    return "Exact";
  }
  if (exactScore) {
    return "Exact score";
  }
  if (correctWinner) {
    return "Winner";
  }
  return points > 0 ? "Partial" : "No match";
}

function futuresComparisonRows(player, comparisonScenario) {
  if (!player) {
    return [];
  }

  const prediction = player.futures;
  const actual = comparisonScenario.futures;
  const championCorrect = Boolean(actual.champion) && prediction.champion === actual.champion;
  const runnerUpCorrect = Boolean(actual.runnerUp) && prediction.runnerUp === actual.runnerUp;
  const topScorerCorrect = Boolean(actual.topScorer) && prediction.topScorer === actual.topScorer;
  const reversedFinalPairing =
    !championCorrect &&
    !runnerUpCorrect &&
    actual.champion &&
    actual.runnerUp &&
    prediction.champion === actual.runnerUp &&
    prediction.runnerUp === actual.champion;
  const favoriteActualStage = actual.teamLastRounds[prediction.favoriteTeam];
  const favoritePoints = lastRoundPoints(prediction.favoriteRound, favoriteActualStage, {
    exact: FUTURES_POINTS.favoriteExact,
    offByOne: FUTURES_POINTS.favoriteOffByOne,
  });
  const ecuadorActualStage = actual.teamLastRounds.Ecuador;
  const ecuadorPoints = lastRoundPoints(prediction.ecuadorRound, ecuadorActualStage, {
    exact: FUTURES_POINTS.ecuadorExact,
    offByOne: FUTURES_POINTS.ecuadorOffByOne,
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
      label: "Reversed final pair",
      actual: actual.champion && actual.runnerUp ? `${actual.champion} / ${actual.runnerUp}` : "",
      prediction: prediction.champion && prediction.runnerUp ? `${prediction.champion} / ${prediction.runnerUp}` : "",
      hasResult: Boolean(actual.champion && actual.runnerUp),
      match: Boolean(reversedFinalPairing),
      points: reversedFinalPairing ? FUTURES_POINTS.reversedFinalPairing : 0,
      bonus: 0,
      status: reversedFinalPairing ? "Match" : "No match",
    },
    {
      label: "Top scorer",
      actual: actual.topScorer,
      prediction: prediction.topScorer,
      hasResult: Boolean(actual.topScorer),
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
      match: favoritePoints > 0,
      points: favoritePoints,
      bonus: 0,
      status: roundMatchStatus(prediction.favoriteRound, favoriteActualStage),
    },
    {
      label: "Ecuador round",
      actual: ecuadorActualStage ? stageLabel(ecuadorActualStage) : "",
      prediction: prediction.ecuadorRound ? stageLabel(prediction.ecuadorRound) : "",
      hasResult: Boolean(ecuadorActualStage),
      match: ecuadorPoints > 0,
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
  if (Math.abs(STAGE_ORDER[predicted] - STAGE_ORDER[actual]) === 1) {
    return "Off by one";
  }
  return "No match";
}

function hasFuturesComparisonData(actual) {
  return Boolean(
    actual.champion ||
    actual.runnerUp ||
    actual.topScorer ||
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
  return {
    points,
    bonus: perfectWinnersBonus + perfectScoresBonus,
    perfectWinnersBonus,
    perfectScoresBonus,
  };
}

function scoreKnockoutStage(player, stage) {
  const predictions = knockoutPredictionsByPlayer.get(player?.name || "") || [];
  const predictionByMatch = new Map(predictions.map((prediction) => [prediction.matchId, prediction]));
  const stageMatches = officialKnockoutMatches.filter((match) => match.stage === stage);
  let points = 0;
  const completeBonusStage =
    KNOCKOUT_PERFECT_BONUS_STAGES.has(stage) &&
    stageMatches.length === KNOCKOUT_STAGE_MATCH_COUNTS[stage];
  let perfectWinnersPossible = completeBonusStage;
  let perfectScoresPossible = completeBonusStage;

  stageMatches.forEach((result) => {
    const prediction = predictionByMatch.get(result.matchId);
    if (!prediction) {
      perfectWinnersPossible = false;
      perfectScoresPossible = false;
      return;
    }

    points += scoreKnockoutMatch(prediction, result);

    if (prediction.winner !== result.advancingTeam) {
      perfectWinnersPossible = false;
    }

    const exactScore =
      prediction.mode === "score" &&
      prediction.homeScore === result.homeScore &&
      prediction.awayScore === result.awayScore &&
      prediction.winner === result.advancingTeam;
    if (!exactScore) {
      perfectScoresPossible = false;
    }
  });

  const perfectWinnersBonus = perfectWinnersPossible ? KNOCKOUT_PERFECT_WINNER_BONUS_POINTS[stage] : 0;
  const perfectScoresBonus = perfectScoresPossible ? KNOCKOUT_PERFECT_SCORE_BONUS_POINTS[stage] : 0;
  return {
    points,
    bonus: perfectWinnersBonus + perfectScoresBonus,
    perfectWinnersBonus,
    perfectScoresBonus,
  };
}

function scoreKnockoutMatch(prediction, result) {
  const basePoints = KNOCKOUT_BASE_POINTS[result.stage] || 0;
  const correctAdvancingTeam = prediction.winner && prediction.winner === result.advancingTeam;

  if (prediction.mode === "winner") {
    return correctAdvancingTeam ? basePoints : 0;
  }

  const exactScore = prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore;
  if (exactScore && correctAdvancingTeam) {
    return basePoints * 2.5;
  }
  if (exactScore) {
    return basePoints * 1.5;
  }
  if (correctAdvancingTeam) {
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
  const topScorerCorrect = Boolean(actual.topScorer) && prediction.topScorer === actual.topScorer;

  if (championCorrect) {
    points += FUTURES_POINTS.champion;
  }
  if (runnerUpCorrect) {
    points += FUTURES_POINTS.runnerUp;
  }
  if (
    !championCorrect &&
    !runnerUpCorrect &&
    actual.champion &&
    actual.runnerUp &&
    prediction.champion === actual.runnerUp &&
    prediction.runnerUp === actual.champion
  ) {
    points += FUTURES_POINTS.reversedFinalPairing;
  }
  if (topScorerCorrect) {
    points += FUTURES_POINTS.topScorer;
  }

  const favoriteActualStage = actual.teamLastRounds[prediction.favoriteTeam];
  const favoritePoints = lastRoundPoints(prediction.favoriteRound, favoriteActualStage, {
    exact: FUTURES_POINTS.favoriteExact,
    offByOne: FUTURES_POINTS.favoriteOffByOne,
  });
  points += favoritePoints;

  const ecuadorActualStage = actual.teamLastRounds.Ecuador;
  const ecuadorPoints = lastRoundPoints(prediction.ecuadorRound, ecuadorActualStage, {
    exact: FUTURES_POINTS.ecuadorExact,
    offByOne: FUTURES_POINTS.ecuadorOffByOne,
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
  if (Math.abs(STAGE_ORDER[predicted] - STAGE_ORDER[actual]) === 1) {
    return pointValues.offByOne;
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
