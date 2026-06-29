const data = window.POOL_DATA || { players: [] };
const knockoutData = window.KNOCKOUT_PREDICTIONS || { stages: [], players: [] };
const officialData = window.OFFICIAL_RESULTS || {};

const KNOCKOUT_STAGE_ORDER = [
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
];
const KNOCKOUT_BASE_POINTS = {
  round_of_32: 4,
  round_of_16: 6,
  quarterfinal: 10,
  semifinal: 16,
  final: 20,
};
const officialMatchesById = new Map(
  latestOfficialKnockoutMatches(officialData).map((match) => [match.matchId, match])
);

let selectedIndex = 0;

const loadStatus = document.querySelector("#loadStatus");
const playerSelect = document.querySelector("#playerSelect");
const playerName = document.querySelector("#playerName");
const sheetName = document.querySelector("#sheetName");
const futuresGrid = document.querySelector("#futuresGrid");
const firstRoundTable = document.querySelector("#firstRoundTable");
const bestThirds = document.querySelector("#bestThirds");
const knockoutStageTargets = {
  round_of_32: document.querySelector("#knockoutRoundOf32"),
  round_of_16: document.querySelector("#knockoutRoundOf16"),
  quarterfinal: document.querySelector("#knockoutQuarterfinal"),
  semifinal: document.querySelector("#knockoutSemifinal"),
  final: document.querySelector("#knockoutFinal"),
};
const sections = document.querySelectorAll(".section");

playerSelect.addEventListener("change", (event) => {
  selectedIndex = Number(event.target.value) || 0;
  render();
});

function showStatus(message, isError = false) {
  loadStatus.hidden = false;
  loadStatus.textContent = message;
  loadStatus.classList.toggle("is-error", isError);
}

function hideStatus() {
  loadStatus.hidden = true;
}

function setSectionsHidden(hidden) {
  sections.forEach((section) => {
    section.hidden = hidden;
  });
}

function populatePlayerSelect() {
  playerSelect.replaceChildren(
    ...data.players.map((player, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = player.name;
      return option;
    })
  );
}

function render() {
  const player = data.players[selectedIndex];
  if (!player) {
    playerName.textContent = "No players found";
    sheetName.textContent = "";
    playerSelect.disabled = true;
    futuresGrid.replaceChildren();
    firstRoundTable.replaceChildren();
    bestThirds.replaceChildren();
    clearKnockoutStages();
    setSectionsHidden(true);
    showStatus(
      window.POOL_DATA_LOAD_ERROR
        ? "Player prediction data failed to load. Confirm data/generated/pool_data.js is included in the GitHub Pages artifact."
        : "No player prediction data was found.",
      true
    );
    return;
  }

  playerSelect.disabled = false;
  playerSelect.value = String(selectedIndex);
  playerName.textContent = player.name;
  sheetName.textContent = `Sheet: ${player.sheet}`;
  setSectionsHidden(false);
  hideStatus();
  renderFutures(player);
  renderFirstRound(player);
  renderBestThirds(player);
  renderKnockoutPredictions(player);
}

function renderFutures(player) {
  const entries = Object.entries(player.futures || {}).filter(([key]) => key !== "name");
  futuresGrid.replaceChildren(
    ...entries.map(([, item]) => {
      const card = document.createElement("article");
      card.className = "future-item";

      const label = document.createElement("div");
      label.className = "future-label";
      label.textContent = item.label;

      const value = document.createElement("div");
      value.className = "future-value";
      value.textContent = item.value || "Blank";

      card.append(label, value);
      return card;
    })
  );
}

function renderFirstRound(player) {
  const firstRoundGrid = player.first_round_grid || [];
  const bestThirdsRowIndex = firstRoundGrid.findIndex((gridRow) =>
    gridRow.cells.includes("Best 3rd's")
  );
  const groupStageRows =
    bestThirdsRowIndex === -1
      ? firstRoundGrid
      : firstRoundGrid.slice(0, bestThirdsRowIndex);

  const rows = groupStageRows.map((gridRow) => {
    const tr = document.createElement("tr");
    (gridRow.cells || []).slice(1).forEach((value) => {
      const td = document.createElement("td");
      const displayValue = displayCellValue(value);
      td.textContent = displayValue;
      td.className = cellClass(displayValue);
      tr.append(td);
    });
    return tr;
  });
  firstRoundTable.replaceChildren(...rows);
}

function renderBestThirds(player) {
  const table = document.createElement("table");
  table.className = "best-thirds-table";

  const tbody = document.createElement("tbody");
  const teams = (player.best_thirds || []).map((pick) => pick.team || "Blank");

  for (let index = 0; index < teams.length; index += 4) {
    const tr = document.createElement("tr");
    teams.slice(index, index + 4).forEach((team) => {
      const td = document.createElement("td");
      td.textContent = team;
      tr.append(td);
    });
    tbody.append(tr);
  }

  table.append(tbody);
  bestThirds.replaceChildren(table);
}

function renderKnockoutPredictions(player) {
  const knockoutPlayer = findKnockoutPlayer(player.name);
  const matches = knockoutPlayer?.matches || [];
  const stages = knockoutStages();

  if (window.KNOCKOUT_DATA_LOAD_ERROR) {
    renderKnockoutError();
    return;
  }

  stages.forEach((stage) => {
    const target = knockoutStageTargets[stage.stage];
    if (!target) {
      return;
    }
    target.replaceChildren(...knockoutStageContent(stage, matches, knockoutPlayer));
  });
}

function knockoutStageContent(stage, matches, knockoutPlayer) {
  const stageMatches = matches.filter((match) => match.stage === stage.stage);

  const count = document.createElement("span");
  count.className = "knockout-stage-count";
  count.textContent = `${stageMatches.length}/${stage.expectedMatchCount || stageMatches.length} picks`;

  if (!stageMatches.length) {
    const message = document.createElement("p");
    message.className = "empty-note";
    message.textContent = "No picks recorded.";
    return [count, message];
  }

  const wrap = document.createElement("div");
  wrap.className = "knockout-table-wrap";

  const table = document.createElement("table");
  table.className = "knockout-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Teams</th>
        <th scope="col">Game Score</th>
        <th scope="col">Penalty Score</th>
        <th scope="col">Advancing Team</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");
  tbody.replaceChildren(
    ...stageMatches.map((match) => {
      const tr = document.createElement("tr");
      if ((match.ignoredFields || []).length) {
        tr.className = "ignored-row";
      }
      [
        teamsText(match),
        gameScoreText(match),
        penaltyScoreText(match),
        match.predictedAdvancingTeam || "Blank",
      ].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });
      return tr;
    })
  );
  table.append(tbody);
  wrap.append(table);

  const content = [count, wrap];
  if (stage.stage === "round_of_32") {
    const bonusAnswers = roundOf32BonusAnswersTable(knockoutPlayer);
    if (bonusAnswers) {
      content.push(bonusAnswers);
    }
  }
  return content;
}

function roundOf32BonusAnswersTable(knockoutPlayer) {
  const answers = knockoutPlayer?.bonusAnswers?.round_of_32 || knockoutPlayer?.roundOf32BonusAnswers || [];
  if (!answers.length) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "bonus-answer-wrap";

  const title = document.createElement("h4");
  title.textContent = "Bonus Questions";

  const table = document.createElement("table");
  table.className = "bonus-answer-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Question</th>
        <th scope="col">Answer</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");
  tbody.replaceChildren(
    ...answers.map((item) => {
      const tr = document.createElement("tr");
      [item.question || "", item.answer || "Blank"].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });
      return tr;
    })
  );
  table.append(tbody);
  wrap.append(title, table);
  return wrap;
}

function renderKnockoutError() {
  Object.values(knockoutStageTargets).forEach((target) => {
    const message = document.createElement("p");
    message.className = "empty-note";
    message.textContent =
      "Knockout prediction data failed to load. Confirm data/generated/knockout_predictions.js is included in the GitHub Pages artifact.";
    target.replaceChildren(message);
  });
}

function clearKnockoutStages() {
  Object.values(knockoutStageTargets).forEach((target) => {
    target.replaceChildren();
  });
}

function knockoutStages() {
  const byKey = new Map(
    (knockoutData.stages || []).map((stage) => [stage.stage, stage])
  );
  return KNOCKOUT_STAGE_ORDER.map((stage) => byKey.get(stage)).filter(Boolean);
}

function findKnockoutPlayer(name) {
  const normalizedName = normalizeName(name);
  return (knockoutData.players || []).find(
    (player) => normalizeName(player.name) === normalizedName
  );
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function teamsText(match) {
  const homeTeam = match.homeTeam || "TBD";
  const awayTeam = match.awayTeam || "TBD";
  return `${homeTeam} vs ${awayTeam}`;
}

function gameScoreText(match) {
  if (match.homeScore === undefined && match.awayScore === undefined) {
    return "Blank";
  }
  return `${match.homeScore ?? "-"}-${match.awayScore ?? "-"}`;
}

function penaltyScoreText(match) {
  if (match.homePenaltyScore === undefined && match.awayPenaltyScore === undefined) {
    return "-";
  }
  return `${match.homePenaltyScore ?? "-"}-${match.awayPenaltyScore ?? "-"}`;
}

function scoreText(match) {
  if (match.homeScore === undefined && match.awayScore === undefined) {
    return "Blank";
  }
  const score = `${match.homeScore ?? "-"}-${match.awayScore ?? "-"}`;
  if (match.homePenaltyScore !== undefined || match.awayPenaltyScore !== undefined) {
    return `${score} (${match.homePenaltyScore ?? "-"}-${match.awayPenaltyScore ?? "-"} pens)`;
  }
  return score;
}

function officialText(match) {
  if (!match || match.homeScore === null || match.awayScore === null) {
    return "Pending";
  }
  const score = knockoutScoreText(match);
  return `${match.homeTeam} ${score} ${match.awayTeam}; ${match.advancingTeam || "winner pending"}`;
}

function predictionStatus(prediction, result) {
  const points = scoreKnockoutPrediction(prediction, result);
  const exactScore = numberOrNull(prediction.homeScore) === result.homeScore &&
    numberOrNull(prediction.awayScore) === result.awayScore;
  const correctWinner = prediction.predictedAdvancingTeam === result.advancingTeam;
  const exactPenaltyScore = hasPenaltyScore(result) &&
    numberOrNull(prediction.homePenaltyScore) === result.homePenaltyScore &&
    numberOrNull(prediction.awayPenaltyScore) === result.awayPenaltyScore;
  if (exactScore && correctWinner && exactPenaltyScore) {
    return "Exact penalties";
  }
  if (exactScore && correctWinner) {
    return "Exact";
  }
  if (correctWinner) {
    return "Winner";
  }
  if (points > 0) {
    return "Partial";
  }
  return "No match";
}

function scoreKnockoutPrediction(prediction, result) {
  const basePoints = KNOCKOUT_BASE_POINTS[result.stage] || 0;
  const predictedHomeScore = numberOrNull(prediction.homeScore);
  const predictedAwayScore = numberOrNull(prediction.awayScore);
  const exactScore = predictedHomeScore === result.homeScore && predictedAwayScore === result.awayScore;
  const correctWinner = prediction.predictedAdvancingTeam === result.advancingTeam;
  const decidedOnPenalties = result.homeScore === result.awayScore && Boolean(result.advancingTeam);
  const exactPenaltyScore = decidedOnPenalties &&
    hasPenaltyScore(result) &&
    numberOrNull(prediction.homePenaltyScore) === result.homePenaltyScore &&
    numberOrNull(prediction.awayPenaltyScore) === result.awayPenaltyScore;

  if (exactScore && correctWinner) {
    return basePoints * (exactPenaltyScore ? 3 : 2);
  }
  if (correctWinner) {
    return basePoints;
  }
  if (decidedOnPenalties) {
    return basePoints * 0.5;
  }
  return 0;
}

function knockoutScoreText(match) {
  const score = `${match.homeScore ?? "-"}-${match.awayScore ?? "-"}`;
  if (hasPenaltyScore(match)) {
    return `${score} (${match.homePenaltyScore}-${match.awayPenaltyScore} pens)`;
  }
  return score;
}

function hasPenaltyScore(match) {
  return match.homePenaltyScore !== null && match.awayPenaltyScore !== null;
}

function statusClass(status) {
  if (status === "Exact" || status === "Exact penalties") {
    return "result-cell result-exact";
  }
  if (status === "Winner" || status === "Partial") {
    return "result-cell result-partial";
  }
  if (status === "Pending") {
    return "result-cell result-pending";
  }
  return "result-cell result-miss";
}

function latestOfficialKnockoutMatches(resultsData) {
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
      match.awayTeam &&
      match.homeScore !== null &&
      match.awayScore !== null
    )
    .forEach((match) => matchesById.set(match.matchId, match));
  return [...matchesById.values()];
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
  return {
    last_32: "round_of_32",
    round_of_32: "round_of_32",
    last_16: "round_of_16",
    round_of_16: "round_of_16",
    quarter_finals: "quarterfinal",
    quarterfinal: "quarterfinal",
    semi_finals: "semifinal",
    semifinal: "semifinal",
    final: "final",
  }[text] || text;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function modeText(mode) {
  if (mode === "score") {
    return "Score";
  }
  return "Legacy";
}

function displayCellValue(value) {
  if (/^\d+\.0$/.test(value)) {
    return value.slice(0, -2);
  }
  return value;
}

function cellClass(value) {
  if (!value) {
    return "empty";
  }
  if (/^Group [A-L]$/.test(value) || value === "Best 3rd's") {
    return "group-label";
  }
  if (/^\d+(\.0)?$/.test(value)) {
    return "rank";
  }
  return "";
}

populatePlayerSelect();
render();
