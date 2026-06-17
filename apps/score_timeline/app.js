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
const COLORS = ["#0f7a63", "#255f9d", "#986800", "#9d3333", "#5b6b2f", "#7b4da8", "#007c89", "#c45113", "#42526e", "#0b604e", "#734222"];
const SVG_NS = "http://www.w3.org/2000/svg";

const players = rawData.players.map(normalizePlayer);
const knockoutPredictionsByPlayer = normalizeKnockoutPredictions(knockoutData);
const checkpoints = buildTimelineCheckpoints(players, officialData);
let selectedCheckpointIndex = Math.max(0, checkpoints.length - 1);

const metrics = document.querySelector("#metrics");
const checkpointStatus = document.querySelector("#checkpointStatus");
const timelineChart = document.querySelector("#timelineChart");
const timelineTooltip = document.querySelector("#timelineTooltip");
const leaderboardTable = document.querySelector("#leaderboardTable");

render();

function render() {
  if (!players.length || !checkpoints.length) {
    renderEmptyState();
    return;
  }

  const series = buildTimelineSeries(players, checkpoints);
  const selectedCheckpoint = checkpoints[selectedCheckpointIndex];
  const selectedRows = scoreAllPlayersForCheckpoint(players, selectedCheckpoint);

  checkpointStatus.textContent = selectedCheckpoint.label;
  renderMetrics(series, selectedRows);
  renderChart(series, checkpoints);
  renderLeaderboard(selectedRows, selectedCheckpoint, series);
}

function renderEmptyState() {
  metrics.innerHTML = "";
  checkpointStatus.textContent = "Pending results";
  timelineChart.innerHTML = '<div class="empty-state">No official checkpoints are available yet.</div>';
  leaderboardTable.innerHTML = "";
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
      (player.matches || []).filter((match) => match?.matchId)
    );
  });
  return predictions;
}

function buildTimelineCheckpoints(sourcePlayers, resultsData) {
  const startCheckpoint = {
    key: "start",
    label: "Start",
    stage: "group_stage",
    completedAt: "",
    scenario: emptyScenario(sourcePlayers),
    officialMatches: [],
  };
  const declared = (resultsData?.timelineCheckpoints || [])
    .map((checkpoint) => normalizeTimelineCheckpoint(sourcePlayers, checkpoint))
    .filter((checkpoint) => checkpoint && hasScenarioData(checkpoint.scenario));

  if (declared.length) {
    return [startCheckpoint, ...declared];
  }

  const fallbackScenario = normalizeOfficialScenario(sourcePlayers, resultsData);
  if (!hasScenarioData(fallbackScenario)) {
    return [startCheckpoint];
  }

  const matchday = currentGroupMatchday(resultsData?.provisionalGroupStandings || {});
  return [
    startCheckpoint,
    {
      key: matchday ? `group_md${matchday}` : "current_official",
      label: matchday ? `After group matchday ${matchday}` : "Current official standings",
      stage: "group_stage",
      completedAt: resultsData?.lastCompletedMatchDate || resultsData?.generatedAt || "",
      scenario: fallbackScenario,
      officialMatches: normalizeKnockoutResults(resultsData?.matches || []),
    },
  ];
}

function normalizeTimelineCheckpoint(sourcePlayers, checkpoint) {
  const scenario = normalizeCheckpointScenario(sourcePlayers, checkpoint?.scenario || checkpoint);
  return {
    key: checkpoint.key || checkpoint.id || checkpoint.label || "",
    label: checkpoint.label || checkpoint.name || checkpoint.key || "Checkpoint",
    stage: normalizeStage(checkpoint.stage || "group_stage"),
    completedAt: checkpoint.completedAt || checkpoint.date || "",
    scenario,
    officialMatches: normalizeKnockoutResults(checkpoint.officialMatches || checkpoint.matches || []),
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
      teamLastRounds: Object.fromEntries(trackedTeams(sourcePlayers).map((team) => [team, ""])),
    },
  };
}

function normalizeGroupStandingRows(rows) {
  return (rows || [])
    .filter((row) => row?.team)
    .map((row) => ({
      team: row.team,
      position: Number(row.position) || 999,
      played: Number(row.played) || 0,
      points: Number(row.points) || 0,
      goalDifference: Number(row.goalDifference) || 0,
      goalsFor: Number(row.goalsFor) || 0,
    }))
    .sort((a, b) =>
      a.position - b.position ||
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.team.localeCompare(b.team)
    );
}

function provisionalBestThirds(standings, fallbackBestThirds) {
  const thirdPlaceRows = GROUP_IDS.map((groupId) => normalizeGroupStandingRows(standings?.[groupId])[2])
    .filter(Boolean)
    .sort((a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.team.localeCompare(b.team)
    );

  if (thirdPlaceRows.length) {
    return thirdPlaceRows.slice(0, 8).map((row) => row.team);
  }
  return fallbackBestThirds.filter(Boolean);
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
      stage: normalizeStage(match.stage || ""),
      homeTeam: match.homeTeam || match.home || "",
      awayTeam: match.awayTeam || match.away || "",
      homeScore: numberOrNull(match.homeScore),
      awayScore: numberOrNull(match.awayScore),
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
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
    scoreAllPlayersForCheckpoint(sourcePlayers, checkpoint)
  );

  return sourcePlayers.map((player, playerIndex) => {
    const points = checkpointScores.map((rows, checkpointIndex) => {
      const row = rows.find((item) => item.playerIndex === playerIndex);
      return {
        checkpointIndex,
        rank: row ? rows.indexOf(row) + 1 : null,
        ...row,
      };
    });

    return {
      player,
      playerIndex,
      emoji: emojiForPlayer(player),
      color: COLORS[playerIndex % COLORS.length],
      points,
      latest: points[points.length - 1],
    };
  });
}

function scoreAllPlayersForCheckpoint(sourcePlayers, checkpoint) {
  return sourcePlayers
    .map((player, playerIndex) => {
      const group = scoreGroups(player, checkpoint.scenario);
      const bestThirds = scoreBestThirds(player, checkpoint.scenario);
      const knockout = scoreKnockout(player, checkpoint.officialMatches || []);
      const futuresScore = scoreFutures(player, checkpoint.scenario);
      const total = group + bestThirds + knockout.points + knockout.bonus + futuresScore.points + futuresScore.bonus;
      return {
        playerIndex,
        name: player.name,
        sheet: player.sheet,
        group,
        bestThirds,
        knockout: knockout.points,
        futures: futuresScore.points,
        bonus: knockout.bonus + futuresScore.bonus,
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

function scoreKnockout(player, officialMatches) {
  const predictions = knockoutPredictionsByPlayer.get(player.name) || [];
  const predictionByMatch = new Map(predictions.map((prediction) => [prediction.matchId, prediction]));
  const resultMatches = officialMatches.filter((match) => match.stage in KNOCKOUT_BASE_POINTS);
  let points = 0;

  resultMatches.forEach((result) => {
    const prediction = predictionByMatch.get(result.matchId);
    if (!prediction) {
      return;
    }
    points += scoreKnockoutMatch(prediction, result);
  });

  return { points, bonus: 0 };
}

function scoreKnockoutMatch(prediction, result) {
  const basePoints = KNOCKOUT_BASE_POINTS[result.stage] || 0;
  const predictedAdvancingTeam = prediction.winner || prediction.advancingTeam || prediction.predictedAdvancingTeam || "";
  const correctAdvancingTeam = predictedAdvancingTeam && predictedAdvancingTeam === result.advancingTeam;
  const predictedHomeScore = numberOrNull(prediction.homeScore);
  const predictedAwayScore = numberOrNull(prediction.awayScore);

  if (predictedHomeScore === null || predictedAwayScore === null) {
    return correctAdvancingTeam ? basePoints : 0;
  }

  const exactScore = predictedHomeScore === result.homeScore && predictedAwayScore === result.awayScore;
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

function scoreFutures(player, scenario) {
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
  points += lastRoundPoints(prediction.favoriteRound, favoriteActualStage, {
    exact: FUTURES_POINTS.favoriteExact,
    offByOne: FUTURES_POINTS.favoriteOffByOne,
  });

  const ecuadorActualStage = actual.teamLastRounds.Ecuador;
  points += lastRoundPoints(prediction.ecuadorRound, ecuadorActualStage, {
    exact: FUTURES_POINTS.ecuadorExact,
    offByOne: FUTURES_POINTS.ecuadorOffByOne,
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
  if (Math.abs(STAGE_ORDER[predicted] - STAGE_ORDER[actual]) === 1) {
    return pointValues.offByOne;
  }
  return 0;
}

function renderMetrics(series, selectedRows) {
  const leader = selectedRows[0];
  const finalScores = series.map((row) => row.latest?.total || 0);
  const maxScore = Math.max(...finalScores, 0);
  const checkpointsCount = checkpoints.length;

  metrics.replaceChildren(
    metric("Leader", leader ? leader.name : "None", leader ? `${formatPoints(leader.total)} pts` : "0 pts"),
    metric("Checkpoints", String(checkpointsCount), checkpoints[selectedCheckpointIndex]?.label || "None"),
    metric("Highest score", `${formatPoints(maxScore)} pts`, "Latest checkpoint")
  );
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

function renderChart(series, sourceCheckpoints) {
  const width = Math.max(760, sourceCheckpoints.length * 170 + 120);
  const height = 420;
  const padding = { top: 26, right: 34, bottom: 78, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxScore = Math.max(...series.flatMap((row) => row.points.map((point) => point.total || 0)), 1);
  const yMax = Math.max(10, Math.ceil(maxScore / 10) * 10);
  const xFor = (index) => padding.left + (sourceCheckpoints.length === 1 ? plotWidth / 2 : (index / (sourceCheckpoints.length - 1)) * plotWidth);
  const yFor = (score) => padding.top + plotHeight - (score / yMax) * plotHeight;

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
    svg.append(
      svgElement("line", { class: "grid-line", x1: x, y1: padding.top, x2: x, y2: padding.top + plotHeight }),
      svgText(checkpoint.label, x, padding.top + plotHeight + 28, "axis-label", "middle")
    );
  });

  series.forEach((row) => {
    const path = row.points.map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${xFor(index)} ${yFor(point.total || 0)}`;
    }).join(" ");
    svg.append(svgElement("path", { class: "player-line", d: path, stroke: row.color }));
  });

  series.forEach((row) => {
    row.points.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(point.total || 0);
      const group = svgElement("g", {
        class: "player-point",
        tabindex: "0",
        "data-player-index": row.playerIndex,
        "data-checkpoint-index": index,
        "aria-label": `${row.player.name}, ${sourceCheckpoints[index].label}, ${formatPoints(point.total || 0)} points`,
      });
      group.append(
        svgElement("circle", { cx: x, cy: y, r: 13, stroke: row.color }),
        svgText(row.emoji, x, y + 1, "", "middle")
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
  });

  timelineChart.replaceChildren(svg);
}

function selectCheckpoint(index) {
  selectedCheckpointIndex = Math.max(0, Math.min(index, checkpoints.length - 1));
  render();
}

function showTooltip(event, row, point, checkpoint) {
  timelineTooltip.hidden = false;
  timelineTooltip.innerHTML = `
    <strong>${escapeHtml(row.emoji)} ${escapeHtml(row.player.name)}</strong>
    <div>${escapeHtml(checkpoint.label)}</div>
    <div>Rank: ${point.rank || "-"}</div>
    <div>Total: ${formatPoints(point.total || 0)} pts</div>
    <div class="muted">Groups ${formatPoints(point.group || 0)} · Best 3rds ${formatPoints(point.bestThirds || 0)} · Knockout ${formatPoints(point.knockout || 0)} · Futures ${formatPoints(point.futures || 0)} · Bonus ${formatPoints(point.bonus || 0)}</div>
  `;
  positionTooltip(event);
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

function renderLeaderboard(rows, checkpoint, series) {
  const seriesByPlayerIndex = new Map(series.map((row) => [row.playerIndex, row]));
  leaderboardTable.innerHTML = `
    <thead>
      <tr>
        <th class="rank">#</th>
        <th>Emoji</th>
        <th>Player</th>
        <th>Total</th>
        <th>Groups</th>
        <th>Best 3rds</th>
        <th>Knockout</th>
        <th>Futures</th>
        <th>Bonus</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row, index) => `
        <tr>
          <td class="rank">${index + 1}</td>
          <td class="emoji-cell" style="border-left-color: ${escapeHtml(seriesByPlayerIndex.get(row.playerIndex)?.color || "transparent")}">${escapeHtml(seriesByPlayerIndex.get(row.playerIndex)?.emoji || "")}</td>
          <td><strong>${escapeHtml(row.name)}</strong><br><span class="muted">${escapeHtml(row.sheet)}</span></td>
          <td class="total">${formatPoints(row.total)}</td>
          <td>${formatPoints(row.group)}</td>
          <td>${formatPoints(row.bestThirds)}</td>
          <td>${formatPoints(row.knockout)}</td>
          <td>${formatPoints(row.futures)}</td>
          <td>${formatPoints(row.bonus)}</td>
        </tr>
      `).join("")}
    </tbody>
    <caption class="muted">Scores at ${escapeHtml(checkpoint.label)}</caption>
  `;
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
