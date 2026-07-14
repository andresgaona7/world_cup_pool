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
const KNOCKOUT_PERFECT_BONUS_POINTS_PER_MATCH = 2;
const KNOCKOUT_PERFECT_BONUS_BASE_POINTS = Object.fromEntries(
  [...KNOCKOUT_PERFECT_BONUS_STAGES].map((stage) => [
    stage,
    KNOCKOUT_PERFECT_BONUS_POINTS_PER_MATCH * KNOCKOUT_STAGE_MATCH_COUNTS[stage],
  ])
);
const KNOCKOUT_PERFECT_WINNER_BONUS_POINTS = KNOCKOUT_PERFECT_BONUS_BASE_POINTS;
const KNOCKOUT_PERFECT_SCORE_BONUS_POINTS = KNOCKOUT_PERFECT_BONUS_BASE_POINTS;
const KNOCKOUT_BONUS_QUESTION_POINTS = 2;
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
const PLANNED_TIMELINE_CHECKPOINTS = [
  { key: "group_md1", label: "After group matchday 1", shortLabel: "Group MD1", stage: "group_stage" },
  { key: "group_md2", label: "After group matchday 2", shortLabel: "Group MD2", stage: "group_stage" },
  { key: "group_md3", label: "After group matchday 3", shortLabel: "Group MD3", stage: "group_stage" },
  { key: "round_of_32", label: "Round of 32", shortLabel: "R32", stage: "round_of_32" },
  { key: "round_of_16", label: "Round of 16", shortLabel: "R16", stage: "round_of_16" },
  { key: "quarterfinal", label: "Quarterfinal", shortLabel: "QF", stage: "quarterfinal" },
  { key: "semifinal", label: "Semifinal", shortLabel: "SF", stage: "semifinal" },
  { key: "third_place_match", label: "3rd place", shortLabel: "3rd", stage: "third_place_match" },
  { key: "final", label: "Final", shortLabel: "Final", stage: "final" },
  { key: "futures", label: "Futures results", shortLabel: "Futures", stage: "futures", includeFutures: true },
  { key: "bonuses", label: "Bonuses", shortLabel: "Bonus", stage: "bonuses", includeFutures: true, includeBonuses: true },
];
const GROUP_IDS = "ABCDEFGHIJKL".split("");
const GROUP_HEADER_PATTERN = /^Group ([A-L])$/;
const RANK_PATTERN = /^\d+(?:\.0)?$/;
const PLAYER_EMOJIS = {
  "elwebo tegusta": "🥚",
  amal: "💣",
  daniel: "🩺",
  juan: "🍺",
  jjpro: "🍺",
  "elwebo lavenganza": "🍳",
  paul: "👮‍♀️",
  lucho: "🥭",
  llucho: "🥭",
  nodorex: "🕺",
  emi: "🏳️‍🌈",
  irina: "👩🏻‍🏫",
  "elwebo ai": "🪺",
  "elwebo con ai-chatgpt": "🪺",
};
const KNOCKOUT_TEAM_ALIASES = {
  bosnia: "bosnia-herzegovina",
  "bosnia and herzegovina": "bosnia-herzegovina",
  "cape verde": "cape verde islands",
  "dr congo": "congo dr",
  "democratic republic of congo": "congo dr",
  "democratic republic of the congo": "congo dr",
  morroco: "morocco",
  nederlands: "netherlands",
  usa: "united states",
};
const COLORS = ["#0f7a63", "#255f9d", "#986800", "#9d3333", "#5b6b2f", "#7b4da8", "#007c89", "#c45113", "#42526e", "#0b604e", "#734222"];
const SVG_NS = "http://www.w3.org/2000/svg";

const players = rawData.players.map(normalizePlayer);
const knockoutPredictionsByPlayer = normalizeKnockoutPredictions(knockoutData);
const knockoutBonusAnswersByPlayer = normalizeKnockoutBonusAnswers(knockoutData);
const checkpoints = buildTimelineCheckpoints(players, officialData);
let selectedCheckpointIndex = latestAvailableCheckpointIndex(checkpoints);

const metrics = document.querySelector("#metrics");
const checkpointStatus = document.querySelector("#checkpointStatus");
const timelineChart = document.querySelector("#timelineChart");
const timelineTooltip = document.querySelector("#timelineTooltip");
const leaderboardTable = document.querySelector("#leaderboardTable");
const chartWidthControl = document.querySelector("#chartWidthControl");
const chartPanel = document.querySelector("#chartPanel");
const leaderboardPanel = document.querySelector("#leaderboardPanel");
const playerFocusSelect = document.querySelector("#playerFocusSelect");
const selectedPlayerDetail = document.querySelector("#selectedPlayerDetail");
let chartWidthRatio = chartWidthSliderRatio();
let selectedPlayerIndex = playerFocusSelect?.value ? Number(playerFocusSelect.value) : null;

chartWidthControl?.addEventListener("input", () => {
  chartWidthRatio = chartWidthSliderRatio();
  render();
});

window.addEventListener("resize", () => {
  render();
});

playerFocusSelect?.addEventListener("change", () => {
  selectedPlayerIndex = playerFocusSelect.value === "" ? null : Number(playerFocusSelect.value);
  render();
});

populatePlayerFocusSelect();
render();

function render() {
  if (!players.length || !checkpoints.length) {
    renderEmptyState();
    return;
  }

  const series = buildTimelineSeries(players, checkpoints);
  const selectedCheckpoint = checkpoints[selectedCheckpointIndex];
  const selectedRows = scoreAllPlayersForCheckpoint(players, selectedCheckpoint);

  checkpointStatus.textContent = checkpointStatusLabel(selectedCheckpoint);
  renderMetrics(series, selectedRows);
  renderLeaderboard(selectedRows, series);
  renderChart(series, checkpoints);
  renderSelectedPlayerDetail(series, selectedCheckpoint);
}

function renderEmptyState() {
  metrics.innerHTML = "";
  checkpointStatus.textContent = "Pending results";
  timelineChart.innerHTML = '<div class="empty-state">No official checkpoints are available yet.</div>';
  leaderboardTable.innerHTML = "";
  if (selectedPlayerDetail) {
    selectedPlayerDetail.innerHTML = '<div class="empty-state">Select a player to pin their score details.</div>';
  }
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
    "third-place match": "third_place_match",
    "third place match": "third_place_match",
    final: "runner_up",
    "runner-up": "runner_up",
    "runner up": "runner_up",
    champion: "champion",
    winner: "champion",
  };
  return map[text] || text.replace(/\s+/g, "_");
}

function normalizeKnockoutPredictions(data) {
  const predictions = new Map();
  (data?.players || []).forEach((player) => {
    const playerName = player.name || player.playerName || "";
    if (!playerName) {
      return;
    }
    predictions.set(
      playerName,
      (player.matches || player.predictions || []).filter((match) => match?.matchId)
    );
  });
  return predictions;
}

function normalizeKnockoutBonusAnswers(sourceData) {
  return new Map(
    (sourceData?.players || []).map((player) => [
      player.name || player.sheet || "",
      {
        ...player.bonusAnswers,
        round_of_32: player.bonusAnswers?.round_of_32 || player.roundOf32BonusAnswers || [],
      },
    ])
  );
}

function buildTimelineCheckpoints(sourcePlayers, resultsData) {
  const startCheckpoint = {
    key: "start",
    label: "Start",
    shortLabel: "Start",
    stage: "group_stage",
    completedAt: "",
    isAvailable: true,
    scenario: emptyScenario(sourcePlayers),
    officialMatches: [],
    roundOf32BonusResults: {},
    quarterfinalBonusResults: {},
  };
  const declared = (resultsData?.timelineCheckpoints || [])
    .map((checkpoint) => normalizeTimelineCheckpoint(sourcePlayers, checkpoint, resultsData))
    .filter(Boolean);

  if (declared.length) {
    return [startCheckpoint, ...mergePlannedCheckpoints(sourcePlayers, addBonusCheckpoint(declared))];
  }

  const fallbackScenario = normalizeOfficialScenario(sourcePlayers, resultsData);
  const matchday = currentGroupMatchday(resultsData?.provisionalGroupStandings || {});
  const fallbackCheckpoints = [];
  const fallbackCheckpoint = hasNonFuturesScenarioData(fallbackScenario)
    ? {
      key: matchday ? `group_md${matchday}` : "current_official",
      label: matchday ? `After group matchday ${matchday}` : "Current official standings",
      shortLabel: matchday ? `Group MD${matchday}` : "Current",
      stage: "group_stage",
      completedAt: resultsData?.lastCompletedMatchDate || resultsData?.generatedAt || "",
      isAvailable: true,
      scenario: fallbackScenario,
      officialMatches: normalizeKnockoutResults(resultsData?.matches || []),
      roundOf32BonusResults: resultsData?.roundOf32BonusResults || {},
      quarterfinalBonusResults: resultsData?.quarterfinalBonusResults || {},
    }
    : null;
  if (fallbackCheckpoint) {
    fallbackCheckpoints.push(fallbackCheckpoint);
  }
  if (hasFuturesData(fallbackScenario)) {
    fallbackCheckpoints.push({
      key: "futures",
      label: "Futures results",
      shortLabel: "Futures",
      stage: "futures",
      completedAt: resultsData?.lastCompletedMatchDate || resultsData?.generatedAt || "",
      includeFutures: true,
      isAvailable: true,
      scenario: fallbackScenario,
      officialMatches: normalizeKnockoutResults(resultsData?.matches || []),
      roundOf32BonusResults: resultsData?.roundOf32BonusResults || {},
    });
    fallbackCheckpoints.push({
      key: "bonuses",
      label: "Bonuses",
      shortLabel: "Bonus",
      stage: "bonuses",
      completedAt: resultsData?.lastCompletedMatchDate || resultsData?.generatedAt || "",
      includeFutures: true,
      includeBonuses: true,
      isAvailable: true,
      scenario: fallbackScenario,
      officialMatches: normalizeKnockoutResults(resultsData?.matches || []),
      roundOf32BonusResults: resultsData?.roundOf32BonusResults || {},
    });
  }

  return [
    startCheckpoint,
    ...mergePlannedCheckpoints(sourcePlayers, fallbackCheckpoints),
  ];
}

function normalizeTimelineCheckpoint(sourcePlayers, checkpoint, resultsData = {}) {
  const scenario = normalizeCheckpointScenario(sourcePlayers, checkpoint?.scenario || checkpoint);
  const officialMatches = normalizeKnockoutResults(checkpoint.officialMatches || checkpoint.matches || []);
  const stage = normalizeStage(checkpoint.stage || checkpoint.key || "group_stage");
  const roundOf32BonusResults =
    checkpoint.roundOf32BonusResults ||
    (checkpointIncludesRoundOf32(stage) ? resultsData?.roundOf32BonusResults : {}) ||
    {};
  const quarterfinalBonusResults =
    checkpoint.quarterfinalBonusResults ||
    (checkpointIncludesQuarterfinal(stage) ? resultsData?.quarterfinalBonusResults : {}) ||
    {};
  const includeFutures = Boolean(checkpoint.includeFutures || checkpoint.key === "futures" || stage === "futures");
  const includeBonuses = Boolean(checkpoint.includeBonuses || checkpoint.key === "bonuses" || stage === "bonuses");
  const includesFutures = includeFutures || includeBonuses;
  return {
    key: checkpoint.key || checkpoint.id || checkpoint.label || "",
    label: checkpoint.label || checkpoint.name || checkpoint.key || "Checkpoint",
    shortLabel: checkpoint.shortLabel || "",
    stage,
    completedAt: checkpoint.completedAt || checkpoint.date || "",
    includeFutures: includesFutures,
    includeBonuses,
    isAvailable: includesFutures
      ? hasFuturesData(scenario)
      : hasNonFuturesScenarioData(scenario) || officialMatches.length > 0,
    scenario,
    officialMatches,
    roundOf32BonusResults,
    quarterfinalBonusResults,
  };
}

function checkpointIncludesRoundOf32(stage) {
  return (KNOCKOUT_STAGE_ORDER[stage] ?? -1) >= KNOCKOUT_STAGE_ORDER.round_of_32;
}

function checkpointIncludesQuarterfinal(stage) {
  return (KNOCKOUT_STAGE_ORDER[stage] ?? -1) >= KNOCKOUT_STAGE_ORDER.quarterfinal;
}

function mergePlannedCheckpoints(sourcePlayers, availableCheckpoints) {
  const availableByKey = new Map(
    availableCheckpoints
      .filter((checkpoint) => checkpoint.key)
      .map((checkpoint) => [checkpoint.key, checkpoint])
  );
  const planned = PLANNED_TIMELINE_CHECKPOINTS.map((checkpoint) => {
    const available = availableByKey.get(checkpoint.key);
    return {
      ...emptyTimelineCheckpoint(sourcePlayers, checkpoint),
      ...(available || {}),
      key: checkpoint.key,
      label: available?.label || checkpoint.label,
      shortLabel: available?.shortLabel || checkpoint.shortLabel,
      stage: checkpoint.stage,
      includeFutures: Boolean(checkpoint.includeFutures || available?.includeFutures),
      includeBonuses: Boolean(checkpoint.includeBonuses || available?.includeBonuses),
    };
  });
  const plannedKeys = new Set(PLANNED_TIMELINE_CHECKPOINTS.map((checkpoint) => checkpoint.key));
  const extras = availableCheckpoints.filter((checkpoint) => checkpoint.key && !plannedKeys.has(checkpoint.key));
  return [...planned, ...extras];
}

function addBonusCheckpoint(availableCheckpoints) {
  if (availableCheckpoints.some((checkpoint) => checkpoint.key === "bonuses" || checkpoint.includeBonuses)) {
    return availableCheckpoints;
  }
  const futuresCheckpoint = availableCheckpoints.find(
    (checkpoint) => checkpoint.key === "futures" || checkpoint.includeFutures
  );
  if (!futuresCheckpoint) {
    return availableCheckpoints;
  }
  return [
    ...availableCheckpoints,
    {
      ...futuresCheckpoint,
      key: "bonuses",
      label: "Bonuses",
      shortLabel: "Bonus",
      stage: "bonuses",
      includeFutures: true,
      includeBonuses: true,
    },
  ];
}

function emptyTimelineCheckpoint(sourcePlayers, checkpoint) {
  return {
    key: checkpoint.key,
    label: checkpoint.label,
    shortLabel: checkpoint.shortLabel || checkpoint.label,
    stage: checkpoint.stage,
    completedAt: "",
    includeFutures: Boolean(checkpoint.includeFutures),
    includeBonuses: Boolean(checkpoint.includeBonuses),
    isAvailable: false,
    scenario: emptyScenario(sourcePlayers),
    officialMatches: [],
  };
}

function normalizeCheckpointScenario(sourcePlayers, checkpointScenario) {
  const groupResults = {};
  GROUP_IDS.forEach((groupId) => {
    groupResults[groupId] = (checkpointScenario?.groupResults?.[groupId] || []).slice(0, 3);
  });

  const futures = checkpointScenario?.futures || {};
  return {
    groupResults,
    bestThirds: (checkpointScenario?.bestThirds || []).filter(Boolean),
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

function emptyScenario(sourcePlayers) {
  return {
    groupResults: Object.fromEntries(GROUP_IDS.map((groupId) => [groupId, ["", "", ""]])),
    bestThirds: [],
    futures: {
      champion: "",
      runnerUp: "",
      topScorer: "",
      topScorers: [],
      teamLastRounds: Object.fromEntries(trackedTeams(sourcePlayers).map((team) => [team, ""])),
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
      played: numberValue(row.played, 0),
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

function currentGroupMatchday(standings) {
  const playedValues = GROUP_IDS.flatMap((groupId) =>
    normalizeGroupStandingRows(standings?.[groupId]).map((row) => row.played)
  ).filter((played) => played > 0);
  if (!playedValues.length) {
    return null;
  }
  return Math.max(1, Math.min(3, Math.min(...playedValues)));
}

function normalizeKnockoutResults(matches) {
  return (matches || [])
    .map((match) => ({
      matchId: match.matchId || match.id || "",
      stage: normalizeKnockoutStage(match.stage || ""),
      homeTeam: match.homeTeam || match.home || "",
      awayTeam: match.awayTeam || match.away || "",
      homeScore: numberOrNull(match.homeScore),
      awayScore: numberOrNull(match.awayScore),
      homePenaltyScore: numberOrNull(match.homePenaltyScore),
      awayPenaltyScore: numberOrNull(match.awayPenaltyScore),
      advancingTeam: match.advancingTeam || match.winner || "",
    }))
    .filter((match) =>
      match.matchId &&
      match.stage in KNOCKOUT_BASE_POINTS &&
      match.homeTeam &&
      match.awayTeam &&
      match.homeScore !== null &&
      match.awayScore !== null &&
      match.advancingTeam
    );
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function hasScenarioData(value) {
  return hasNonFuturesScenarioData(value) || hasFuturesData(value);
}

function hasNonFuturesScenarioData(value) {
  return (
    Object.values(value.groupResults).some((teams) => teams.some(Boolean)) ||
    value.bestThirds.length > 0
  );
}

function hasFuturesData(value) {
  return (
    value.futures.champion ||
    value.futures.runnerUp ||
    value.futures.topScorer ||
    actualTopScorers(value.futures).length > 0 ||
    Object.values(value.futures.teamLastRounds).some(Boolean)
  );
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

function buildTimelineSeries(sourcePlayers, sourceCheckpoints) {
  const checkpointScores = sourceCheckpoints.map((checkpoint) =>
    checkpoint.isAvailable ? scoreAllPlayersForCheckpoint(sourcePlayers, checkpoint) : []
  );

  return sourcePlayers.map((player, playerIndex) => {
    const points = checkpointScores.map((rows, checkpointIndex) => {
      const row = rows.find((item) => item.playerIndex === playerIndex);
      if (!sourceCheckpoints[checkpointIndex].isAvailable) {
        return {
          checkpointIndex,
          rank: null,
          playerIndex,
          name: player.name,
          sheet: player.sheet,
          isAvailable: false,
          total: null,
        };
      }
      return {
        checkpointIndex,
        rank: row ? rows.indexOf(row) + 1 : null,
        isAvailable: true,
        ...row,
      };
    });

    const availablePoints = points.filter((point) => point.isAvailable);
    return {
      player,
      playerIndex,
      emoji: emojiForPlayer(player),
      color: COLORS[playerIndex % COLORS.length],
      points,
      latest: availablePoints[availablePoints.length - 1],
    };
  });
}

function scoreAllPlayersForCheckpoint(sourcePlayers, checkpoint) {
  if (!checkpoint?.isAvailable) {
    return [];
  }
  return sourcePlayers
    .map((player, playerIndex) => {
      const group = scoreGroups(player, checkpoint.scenario);
      const bestThirds = scoreBestThirds(player, checkpoint.scenario);
      const bonusResults = {
        round_of_32: checkpoint.roundOf32BonusResults || {},
        quarterfinal: checkpoint.quarterfinalBonusResults || {},
      };
      const knockout = scoreKnockout(player, checkpoint.officialMatches || [], bonusResults);
      const knockoutStages = Object.fromEntries(
        LEADERBOARD_KNOCKOUT_STAGES.map((stage) => {
          const stageScore = scoreKnockoutStage(player, stage, checkpoint.officialMatches || [], bonusResults);
          return [stage, stageScore.points + stageScore.bonus];
        })
      );
      const futuresScore = checkpoint.includeFutures ? scoreFutures(player, checkpoint.scenario) : { points: 0, bonus: 0 };
      const firstRound = group + bestThirds;
      const bonus = knockout.bonus + futuresScore.bonus;
      const total = firstRound + knockout.points + knockout.bonus + futuresScore.points + futuresScore.bonus;
      return {
        playerIndex,
        name: player.name,
        sheet: player.sheet,
        group,
        bestThirds,
        firstRound,
        knockout: knockout.points + knockout.bonus,
        knockoutStages,
        futures: futuresScore.points,
        bonus,
        includedBonus: bonus,
        displayedTotal: firstRound + knockout.points + knockout.bonus,
        total,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function scoreGroups(player, scenario) {
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

function scoreBestThirds(player, scenario) {
  const actual = new Set(scenario.bestThirds);
  return player.bestThirds.filter((pick) => actual.has(pick.team)).length * BEST_THIRD_TEAM_POINTS;
}

function scoreKnockout(player, officialMatches, bonusResults = {}) {
  const resultMatches = officialMatches.filter((match) => match.stage in KNOCKOUT_BASE_POINTS);
  const stageScores = Object.keys(KNOCKOUT_BASE_POINTS).map((stage) =>
    scoreKnockoutStage(player, stage, resultMatches, bonusResults)
  );
  const points = stageScores.reduce((total, stageScore) => total + stageScore.points, 0);
  const bonus = stageScores.reduce((total, stageScore) => total + stageScore.bonus, 0);

  return { points, bonus };
}

function scoreKnockoutStage(player, stage, officialMatches, bonusResults = {}) {
  const predictions = knockoutPredictionsByPlayer.get(player.name) || [];
  const predictionIndex = knockoutPredictionIndex(predictions);
  const stageMatches = officialMatches.filter((match) => match.stage === stage);
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

    const predictedAdvancingTeam = prediction.winner || prediction.advancingTeam || prediction.predictedAdvancingTeam || "";
    if (!sameKnockoutTeam(predictedAdvancingTeam, result.advancingTeam)) {
      perfectWinnersPossible = false;
    }

    const exactScore =
      numberOrNull(prediction.homeScore) === result.homeScore &&
      numberOrNull(prediction.awayScore) === result.awayScore &&
      sameKnockoutTeam(predictedAdvancingTeam, result.advancingTeam);
    if (!exactScore) {
      perfectScoresPossible = false;
    }
  });

  const perfectWinnersBonus = perfectWinnersPossible ? KNOCKOUT_PERFECT_WINNER_BONUS_POINTS[stage] : 0;
  const perfectScoresBonus = perfectScoresPossible ? KNOCKOUT_PERFECT_SCORE_BONUS_POINTS[stage] : 0;
  const bonusQuestionPoints = ["round_of_32", "quarterfinal"].includes(stage)
    ? scoreKnockoutBonusQuestions(player, stage, bonusResults[stage] || {}, stageMatches)
    : 0;
  return {
    points,
    bonus: perfectWinnersBonus + perfectScoresBonus + bonusQuestionPoints,
  };
}

function scoreKnockoutBonusQuestions(player, stage, officialResults = {}, stageMatches = []) {
  const answers = knockoutBonusAnswersByPlayer.get(player?.name || "")?.[stage] || [];
  return answers.reduce((total, item) => {
    const earnedPoints = knockoutBonusQuestionPoints(
      item.answer,
      officialKnockoutBonusAnswer(item.question, officialResults, stageMatches)
    );
    return total + (earnedPoints || 0);
  }, 0);
}

function knockoutBonusQuestionPoints(playerAnswer, officialAnswer) {
  if (officialAnswer === null || officialAnswer === "" || officialAnswer === undefined) {
    return null;
  }
  return bonusAnswerMatches(playerAnswer, officialAnswer) ? KNOCKOUT_BONUS_QUESTION_POINTS : 0;
}

function officialKnockoutBonusAnswer(question, officialResults = {}, stageMatches = []) {
  const key = canonicalBonusQuestion(question);
  const values = {
    extra_time_matches: officialResults.extraTimeMatches,
    penalty_matches: officialResults.penaltyMatches,
    most_goals_team: officialResults.mostGoalsTeam,
    total_goals: officialResults.totalGoals,
    fastest_goal_team: officialResults.fastestGoalTeam,
    latest_goal_team: officialResults.latestGoalTeam,
    biggest_winning_margin_team: officialResults.biggestWinningMarginTeam,
    yellow_cards: officialResults.yellowCards,
    red_cards: officialResults.redCards,
  };
  if (values[key] !== null && values[key] !== "" && values[key] !== undefined) {
    return values[key];
  }
  if (key === "extra_time_matches") {
    return stageMatches.filter((match) => String(match.duration || "").toUpperCase() === "EXTRA_TIME").length;
  }
  if (key === "penalty_matches") {
    return stageMatches.filter((match) => match.homePenaltyScore != null && match.awayPenaltyScore != null).length;
  }
  return values[key];
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
  if (Array.isArray(actual)) {
    return actual.some((value) => sameKnockoutTeam(predictedText, String(value)));
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
  const components = knockoutScoringComponents(prediction, result);
  return basePoints * [
    components.correctAdvancingTeam,
    components.exactScore,
    components.exactPenaltyScore,
  ].filter(Boolean).length;
}

function knockoutScoringComponents(prediction, result) {
  const predictedHomeScore = numberOrNull(prediction.homeScore);
  const predictedAwayScore = numberOrNull(prediction.awayScore);
  if (predictedHomeScore === null || predictedAwayScore === null) {
    return {
      correctAdvancingTeam: false,
      exactScore: false,
      exactPenaltyScore: false,
    };
  }

  const predictedAdvancingTeam = knockoutPredictedAdvancingTeam(prediction, result);
  const exactScore = predictedHomeScore === result.homeScore && predictedAwayScore === result.awayScore;
  return {
    correctAdvancingTeam: sameKnockoutTeam(predictedAdvancingTeam, result.advancingTeam),
    exactScore,
    exactPenaltyScore: exactKnockoutPenaltyScore(prediction, result, predictedAdvancingTeam),
  };
}

function knockoutPredictedAdvancingTeam(prediction, result) {
  const explicitWinner = prediction.winner || prediction.advancingTeam || prediction.predictedAdvancingTeam || "";
  if (explicitWinner) {
    return explicitWinner;
  }

  const predictedHomeScore = numberOrNull(prediction.homeScore);
  const predictedAwayScore = numberOrNull(prediction.awayScore);
  if (predictedHomeScore === null || predictedAwayScore === null) {
    return "";
  }
  if (predictedHomeScore > predictedAwayScore) {
    return result.homeTeam;
  }
  if (predictedAwayScore > predictedHomeScore) {
    return result.awayTeam;
  }

  const predictedHomePenaltyScore = numberOrNull(prediction.homePenaltyScore);
  const predictedAwayPenaltyScore = numberOrNull(prediction.awayPenaltyScore);
  if (
    predictedHomePenaltyScore === null ||
    predictedAwayPenaltyScore === null ||
    predictedHomePenaltyScore === predictedAwayPenaltyScore
  ) {
    return "";
  }
  return predictedHomePenaltyScore > predictedAwayPenaltyScore ? result.homeTeam : result.awayTeam;
}

function exactKnockoutPenaltyScore(prediction, result, predictedAdvancingTeam) {
  return hasPenaltyScore(result) &&
    hasPenaltyScore(prediction) &&
    numberOrNull(prediction.homePenaltyScore) === result.homePenaltyScore &&
    numberOrNull(prediction.awayPenaltyScore) === result.awayPenaltyScore &&
    sameKnockoutTeam(predictedAdvancingTeam, result.advancingTeam);
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

function canonicalKnockoutTeamName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return KNOCKOUT_TEAM_ALIASES[normalized] || normalized;
}

function hasPenaltyScore(match) {
  return numberOrNull(match.homePenaltyScore) !== null && numberOrNull(match.awayPenaltyScore) !== null;
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

function scoreFutures(player, scenario) {
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
  points += lastRoundPoints(prediction.favoriteRound, favoriteActualStage, {
    exact: FUTURES_POINTS.favoriteExact,
  });

  const ecuadorActualStage = actualTeamLastRound(actual.teamLastRounds, "Ecuador");
  points += lastRoundPoints(prediction.ecuadorRound, ecuadorActualStage, {
    exact: FUTURES_POINTS.ecuadorExact,
  });

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

function playerBestThirdSet(player) {
  return new Set((player?.bestThirds || []).map((pick) => pick.team));
}

function groupAdvancingTeams(orderedTeams, bestThirds) {
  const directQualifiers = orderedTeams.slice(0, 2).filter(Boolean);
  return new Set([
    ...directQualifiers,
    ...orderedTeams.filter((team) => team && bestThirds.has(team)),
  ]);
}

function countSetIntersection(left, right) {
  return [...left].filter((value) => right.has(value)).length;
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

function renderMetrics(series, selectedRows) {
  const displayRows = leaderboardDisplayRows(selectedRows);
  const leader = displayRows[0];
  const runnerUp = displayRows[1];
  const thirdPlace = displayRows[2];
  const availableCheckpointsCount = checkpoints.filter((checkpoint) => checkpoint.isAvailable).length;

  metrics.replaceChildren(
    rankMetric("Leader", leader),
    rankMetric("Runner-up", runnerUp),
    rankMetric("Third place", thirdPlace),
    metric("Checkpoints", `${availableCheckpointsCount} / ${checkpoints.length}`, "Available / planned")
  );
}

function rankMetric(label, row) {
  return metric(label, row ? row.name : "None", row ? `${formatPoints(row.displayedTotal)} pts` : "0 pts");
}

function metric(label, value, detail) {
  const node = document.createElement("article");
  node.className = "metric";
  node.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <div class="muted">${escapeHtml(detail)}</div>
  `;
  return node;
}

function populatePlayerFocusSelect() {
  if (!playerFocusSelect) {
    return;
  }

  const options = players.map((player, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${emojiForPlayer(player)} ${player.name}`;
    return option;
  });

  playerFocusSelect.replaceChildren(playerFocusSelect.options[0], ...options);
}

function renderSelectedPlayerDetail(series, checkpoint) {
  if (!selectedPlayerDetail) {
    return;
  }

  if (selectedPlayerIndex === null || Number.isNaN(selectedPlayerIndex)) {
    selectedPlayerDetail.innerHTML = '<div class="empty-state">Select a player to pin their score details.</div>';
    return;
  }

  const row = series.find((item) => item.playerIndex === selectedPlayerIndex);
  const point = row?.points[selectedCheckpointIndex];
  if (!row || !point?.isAvailable) {
    selectedPlayerDetail.innerHTML = `
      <div class="detail-kicker">Selected player</div>
      <h3>No score available</h3>
      <div class="muted">${escapeHtml(checkpoint?.label || "Selected checkpoint")} is pending.</div>
    `;
    return;
  }

  selectedPlayerDetail.innerHTML = `
    <div class="detail-kicker">Selected player</div>
    <h3><span>${escapeHtml(row.emoji)}</span> ${escapeHtml(row.player.name)}</h3>
    ${scoreDetailHtml(point, checkpoint, {
      afterTotalHtml: selectedPlayerDetail.closest(".selected-player-panel")
        ? checkpointHistoryHtml(row)
        : "",
      showBreakdown: !selectedPlayerDetail.closest(".selected-player-panel"),
      showCheckpointLabel: !selectedPlayerDetail.closest(".selected-player-panel"),
    })}
  `;
}

function renderChart(series, sourceCheckpoints) {
  const height = timelineChartHeight();
  const padding = { top: 26, right: 34, bottom: 78, left: 58 };
  const width = timelineChartWidth(sourceCheckpoints.length, padding);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxScore = Math.max(...series.flatMap((row) => row.points.map((point) => point.total || 0)), 1);
  const yMax = Math.max(10, Math.ceil(maxScore / 10) * 10);
  const xFor = (index) => padding.left + (sourceCheckpoints.length === 1 ? plotWidth / 2 : (index / (sourceCheckpoints.length - 1)) * plotWidth);
  const yFor = (score) => padding.top + plotHeight - (score / yMax) * plotHeight;

  timelineChart.style.width = `${width}px`;

  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Score timeline chart" });

  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const y = padding.top + plotHeight - ratio * plotHeight;
    const value = yMax * ratio;
    svg.append(
      svgElement("line", { class: "grid-line", x1: padding.left, y1: y, x2: width - padding.right, y2: y }),
      svgText(formatPoints(value), padding.left - 10, y + 4, "axis-label", "end")
    );
  });

  svg.append(
    svgElement("line", {
      class: "axis-line",
      x1: padding.left,
      y1: padding.top + plotHeight,
      x2: width - padding.right,
      y2: padding.top + plotHeight,
    })
  );

  sourceCheckpoints.forEach((checkpoint, index) => {
    const x = xFor(index);
    const labelClass = checkpoint.isAvailable ? "axis-label" : "axis-label pending-label";
    svg.append(
      svgElement("line", { class: "grid-line", x1: x, y1: padding.top, x2: x, y2: padding.top + plotHeight }),
      svgText(checkpoint.shortLabel || checkpoint.label, x, padding.top + plotHeight + 28, labelClass, "middle")
    );
  });

  const selectedSeries = series.filter((row) => row.playerIndex === selectedPlayerIndex);
  const baseSeries = selectedPlayerIndex === null
    ? series
    : series.filter((row) => row.playerIndex !== selectedPlayerIndex);

  const drawLine = (row) => {
    const isSelected = row.playerIndex === selectedPlayerIndex;
    const isDimmed = selectedPlayerIndex !== null && !isSelected;
    const path = row.points.map((point, index) => {
      if (!point.isAvailable) {
        return "";
      }
      const previousPoint = row.points[index - 1];
      const command = previousPoint?.isAvailable ? "L" : "M";
      return `${command} ${xFor(index)} ${yFor(point.total || 0)}`;
    }).filter(Boolean).join(" ");
    if (!path) {
      return;
    }
    svg.append(svgElement("path", {
      class: ["player-line", isSelected ? "is-selected" : "", isDimmed ? "is-dimmed" : ""].filter(Boolean).join(" "),
      d: path,
      stroke: row.color,
    }));
  };

  const drawPoints = (row) => {
    const isSelected = row.playerIndex === selectedPlayerIndex;
    const isDimmed = selectedPlayerIndex !== null && !isSelected;
    row.points.forEach((point, index) => {
      if (!point.isAvailable) {
        return;
      }
      const x = xFor(index);
      const y = yFor(point.total || 0);
      const group = svgElement("g", {
        class: ["player-point", isSelected ? "is-selected" : "", isDimmed ? "is-dimmed" : ""].filter(Boolean).join(" "),
        tabindex: "0",
        "data-player-index": row.playerIndex,
        "data-checkpoint-index": index,
        "aria-label": `${row.player.name}, ${sourceCheckpoints[index].label}, ${formatPoints(point.total || 0)} points${point.includedBonus ? `, ${formatPoints(point.includedBonus)} bonus points` : ""}`,
      });
      group.append(
        svgElement("circle", { cx: x, cy: y, r: isSelected ? 18 : 13, stroke: row.color }),
        svgText(row.emoji, x, y + 1, isSelected ? "selected-player-icon" : "", "middle")
      );
      group.addEventListener("mouseenter", (event) => showTooltip(event, row, point, sourceCheckpoints[index]));
      group.addEventListener("mousemove", (event) => positionTooltip(event));
      group.addEventListener("mouseleave", hideTooltip);
      group.addEventListener("focus", (event) => showTooltip(event, row, point, sourceCheckpoints[index]));
      group.addEventListener("blur", hideTooltip);
      group.addEventListener("click", () => selectCheckpoint(index));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectCheckpoint(index);
        }
      });
      svg.append(group);
    });
  };

  baseSeries.forEach(drawLine);
  baseSeries.forEach(drawPoints);
  selectedSeries.forEach(drawLine);
  selectedSeries.forEach(drawPoints);

  timelineChart.replaceChildren(svg);
}

function chartWidthSliderRatio() {
  if (!chartWidthControl) {
    return 0;
  }
  const min = Number(chartWidthControl.min || 0);
  const max = Number(chartWidthControl.max || 100);
  const value = Number(chartWidthControl.value || min);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0;
  }
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function timelineChartWidth(checkpointCount, padding) {
  const visibleWidth = timelineChartVisibleWidth();
  const count = Math.max(1, checkpointCount);
  const visibleStagesAtMax = Math.min(3, count);
  const visiblePlotWidth = Math.max(1, visibleWidth - padding.left - padding.right);
  const zoomedPlotWidth = visibleStagesAtMax <= 1
    ? visiblePlotWidth
    : visiblePlotWidth * ((count - 1) / (visibleStagesAtMax - 1));
  const zoomedWidth = Math.max(visibleWidth, zoomedPlotWidth + padding.left + padding.right);
  return Math.round(visibleWidth + (zoomedWidth - visibleWidth) * chartWidthRatio);
}

function timelineChartVisibleWidth() {
  const chartWrap = chartPanel?.querySelector?.(".chart-wrap");
  const fallbackWidth = 760;
  if (!chartWrap) {
    return fallbackWidth;
  }
  const chartWrapStyles = typeof window.getComputedStyle === "function"
    ? window.getComputedStyle(chartWrap)
    : null;
  const horizontalPadding = chartWrapStyles
    ? (Number.parseFloat(chartWrapStyles.paddingLeft) || 0) + (Number.parseFloat(chartWrapStyles.paddingRight) || 0)
    : 32;
  const width = chartWrap.clientWidth - horizontalPadding;
  return Math.max(1, Number.isFinite(width) ? width : fallbackWidth);
}

function timelineChartHeight() {
  const minimumHeight = 420;
  if (!leaderboardPanel || !chartPanel) {
    return minimumHeight;
  }

  const leaderboardHeight = leaderboardPanel.getBoundingClientRect().height;
  const chartHeadHeight = chartPanel.querySelector?.(".panel-head")?.getBoundingClientRect().height || 0;
  const chartWrap = chartPanel.querySelector?.(".chart-wrap");
  const chartWrapStyles = chartWrap && typeof window.getComputedStyle === "function"
    ? window.getComputedStyle(chartWrap)
    : null;
  const verticalPadding = chartWrapStyles
    ? (Number.parseFloat(chartWrapStyles.paddingTop) || 0) + (Number.parseFloat(chartWrapStyles.paddingBottom) || 0)
    : 32;

  if (!Number.isFinite(leaderboardHeight) || leaderboardHeight <= 0) {
    return minimumHeight;
  }
  return Math.max(minimumHeight, Math.round(leaderboardHeight - chartHeadHeight - verticalPadding));
}

function selectCheckpoint(index) {
  selectedCheckpointIndex = Math.max(0, Math.min(index, checkpoints.length - 1));
  render();
}

function latestAvailableCheckpointIndex(sourceCheckpoints) {
  const latestIndex = sourceCheckpoints.map((checkpoint) => checkpoint.isAvailable).lastIndexOf(true);
  return Math.max(0, latestIndex);
}

function checkpointStatusLabel(checkpoint) {
  if (!checkpoint) {
    return "Pending results";
  }
  return checkpoint.isAvailable ? checkpoint.label : `${checkpoint.label}: pending`;
}

function showTooltip(event, row, point, checkpoint) {
  timelineTooltip.hidden = false;
  timelineTooltip.innerHTML = `
    <strong>${escapeHtml(row.emoji)} ${escapeHtml(row.player.name)}</strong>
    ${scoreDetailHtml(point, checkpoint, { showBreakdown: false })}
  `;
  positionTooltip(event);
}

function checkpointHistoryHtml(row) {
  const items = checkpoints.map((checkpoint, index) => {
    const point = row.points[index];
    if (!checkpoint.isAvailable || !point?.isAvailable) {
      return `
        <div class="checkpoint-history-row is-pending">
          <span>${escapeHtml(checkpoint.shortLabel || checkpoint.label)}</span>
          <strong>Pending</strong>
        </div>
      `;
    }

    return `
      <div class="checkpoint-history-row">
        <span>${escapeHtml(checkpoint.shortLabel || checkpoint.label)}</span>
        <strong>${formatPoints(point.total || 0)} pts</strong>
        <span>Rank ${point.rank || "-"}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="checkpoint-history" aria-label="Selected player score by checkpoint">
      ${items}
    </div>
  `;
}

function scoreDetailHtml(point, checkpoint, options = {}) {
  return `
    ${options.showCheckpointLabel === false ? "" : `<div>${escapeHtml(checkpoint.label)}</div>`}
    <div>Rank: ${point.rank || "-"}</div>
    <div>Total: ${formatPoints(point.total || 0)} pts</div>
    ${options.afterTotalHtml || ""}
    ${options.showBreakdown === false ? "" : `<div class="muted">Groups ${formatPoints(point.group || 0)} · Best 3rds ${formatPoints(point.bestThirds || 0)} · Knockout ${formatPoints(point.knockout || 0)} · Futures ${formatPoints(point.futures || 0)} · Bonus ${formatPoints(point.includedBonus || 0)}</div>`}
  `;
}

function positionTooltip(event) {
  const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect?.() || timelineChart.getBoundingClientRect();
  const wrapBounds = timelineChart.getBoundingClientRect();
  const targetBounds = event.currentTarget.getBoundingClientRect?.() || wrapBounds;
  const clientX = Number.isFinite(event.clientX) ? event.clientX : targetBounds.left + targetBounds.width / 2;
  const clientY = Number.isFinite(event.clientY) ? event.clientY : targetBounds.top;
  timelineTooltip.style.left = `${Math.min(Math.max(clientX - wrapBounds.left + 14, 8), bounds.width - 240)}px`;
  timelineTooltip.style.top = `${Math.max(clientY - wrapBounds.top - 24, 8)}px`;
}

function hideTooltip() {
  timelineTooltip.hidden = true;
}

function renderLeaderboard(rows, series) {
  const seriesByPlayerIndex = new Map(series.map((row) => [row.playerIndex, row]));
  const displayRows = leaderboardDisplayRows(rows);
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
      ${displayRows.map((row, index) => `
        <tr>
          <td class="rank">${index + 1}</td>
          <td class="player-cell" style="border-left-color: ${escapeHtml(seriesByPlayerIndex.get(row.playerIndex)?.color || "transparent")}"><strong class="player-name">${escapeHtml(row.name)}</strong><br><span class="muted">${escapeHtml(row.sheet)}</span></td>
          <td class="total">${formatPoints(row.displayedTotal)}</td>
          <td>${formatPoints(row.firstRound)}</td>
          ${LEADERBOARD_KNOCKOUT_STAGES.map((stage) => `<td>${formatPoints(row.knockoutStages[stage] || 0)}</td>`).join("")}
          <td>${formatPoints(row.futures)}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function leaderboardDisplayRows(rows) {
  return [...rows].sort(
    (a, b) => b.displayedTotal - a.displayedTotal || a.name.localeCompare(b.name)
  );
}

function knockoutStageLabel(stageKey) {
  return KNOCKOUT_STAGE_LABELS[stageKey] || stageKey;
}

function emojiForPlayer(player) {
  const candidates = [
    player.name,
    player.sheet,
    normalizePlayerEmojiKey(player.name).replace(/\s*\(.*/, ""),
  ];
  for (const candidate of candidates) {
    const emoji = PLAYER_EMOJIS[normalizePlayerEmojiKey(candidate)];
    if (emoji) {
      return emoji;
    }
  }
  return "⚽";
}

function normalizePlayerEmojiKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function svgElement(tagName, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
  return node;
}

function svgText(value, x, y, className = "", anchor = "start") {
  const node = svgElement("text", { x, y, "text-anchor": anchor });
  if (className) {
    node.setAttribute("class", className);
  }
  node.textContent = value;
  return node;
}

function formatPoints(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

window.ScoreTimeline = {
  buildTimelineCheckpoints,
  buildTimelineSeries,
  scoreAllPlayersForCheckpoint,
  emojiForPlayer,
};
