const rawData = window.POOL_DATA || { players: [] };

const GROUP_EXACT_POSITION_POINTS = 2;
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

let players = rawData.players.map(normalizePlayer);
let filterTerm = "";
let scenario = buildConsensusScenario(players);

const sourceFile = document.querySelector("#sourceFile");
const metrics = document.querySelector("#metrics");
const leaderboardTable = document.querySelector("#leaderboardTable");
const rulesGrid = document.querySelector("#rulesGrid");
const playerFilter = document.querySelector("#playerFilter");

sourceFile.textContent = rawData.source_file || "interface/data/pool_data.js";

playerFilter.addEventListener("input", (event) => {
  filterTerm = event.target.value.trim().toLowerCase();
  renderLeaderboard();
});

render();

function render() {
  renderMetrics();
  renderRules();
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

function buildEmptyScenario(sourcePlayers) {
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

function renderMetrics() {
  const scored = scoreAllPlayers();
  const places = [
    ["Leader", scored[0]],
    ["Runner-up", scored[1]],
    ["Third place", scored[2]],
  ];

  metrics.replaceChildren(...places.map(([label, row]) => podiumMetric(label, row)));
}

function podiumMetric(label, row) {
  const node = document.createElement("article");
  node.className = "metric podium-metric";
  node.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(row ? row.name : "None")}</strong>
    <em>${row ? `${formatPoints(row.total)} pts` : "0 pts"}</em>
  `;
  return node;
}

function renderRules() {
  const sections = [
    {
      title: "Group stage",
      rows: [
        `Each team in the exact predicted group position earns ${GROUP_EXACT_POSITION_POINTS} points.`,
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
        "The workbook export does not include official results yet, so this page uses a consensus scenario derived from the submitted picks.",
        "Knockout scoring exists in the Python scorer, but knockout predictions are not present in pool_data.js, so this page does not include knockout points.",
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
  renderMetrics();
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
  const rows = scoreAllPlayers().filter((row) => {
    if (!filterTerm) {
      return true;
    }
    return `${row.name} ${row.sheet}`.toLowerCase().includes(filterTerm);
  });

  if (!rows.length) {
    leaderboardTable.innerHTML = "";
    leaderboardTable.insertAdjacentHTML("afterend", '<div class="empty-state">No players match the current filter.</div>');
    return;
  }

  leaderboardTable.innerHTML = `
    <thead>
      <tr>
        <th class="rank">#</th>
        <th>Player</th>
        <th>Total</th>
        <th>Groups</th>
        <th>Best 3rds</th>
        <th>Futures</th>
        <th>Bonus</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row, index) => `
            <tr>
              <td class="rank">${index + 1}</td>
              <td><strong>${escapeHtml(row.name)}</strong><br><span class="muted">${escapeHtml(row.sheet)}</span></td>
              <td class="total">${formatPoints(row.total)}</td>
              <td>${formatPoints(row.group)}</td>
              <td>${formatPoints(row.bestThirds)}</td>
              <td>${formatPoints(row.futures)}</td>
              <td>${formatPoints(row.bonus)}</td>
            </tr>
          `
        )
        .join("")}
    </tbody>
  `;
}

function scoreAllPlayers() {
  return players
    .map((player) => {
      const group = scoreGroups(player);
      const bestThirds = scoreBestThirds(player);
      const futuresScore = scoreFutures(player);
      const total = group + bestThirds + futuresScore.points + futuresScore.bonus;
      return {
        name: player.name,
        sheet: player.sheet,
        group,
        bestThirds,
        futures: futuresScore.points,
        bonus: futuresScore.bonus,
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

    const exact = predicted.reduce(
      (count, team, index) => count + (team && team === actual[index] ? 1 : 0),
      0
    );
    const fullOrder = actual.length > 0 && actual.every((team, index) => team && team === predicted[index]);
    return total + exact * GROUP_EXACT_POSITION_POINTS + (fullOrder ? GROUP_FULL_ORDER_BONUS : 0);
  }, 0);
}

function scoreBestThirds(player) {
  const actual = new Set(scenario.bestThirds);
  return player.bestThirds.filter((pick) => actual.has(pick.team)).length * BEST_THIRD_TEAM_POINTS;
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
  return STAGES.find(([key]) => key === stageKey)?.[1] || stageKey;
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
