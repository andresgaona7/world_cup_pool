const STAGES = [
  {
    key: "round_of_32",
    title: "Round of 32",
    basePoints: 4,
    matches: [
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
    ],
  },
  {
    key: "round_of_16",
    title: "Round of 16",
    basePoints: 6,
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
    basePoints: 10,
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
    basePoints: 16,
    matches: [
      ["101", "Winner Match 97", "Winner Match 98"],
      ["102", "Winner Match 99", "Winner Match 100"],
    ],
  },
  {
    key: "final",
    title: "Final",
    basePoints: 20,
    matches: [["104", "Winner Match 101", "Winner Match 102"]],
  },
];

const EXTRA_BASE_POINTS = [["3rd place", 14]];
const bracket = document.querySelector("#bracket");
const basePointsTable = document.querySelector("#basePointsTable");

renderBracket();
renderBasePoints();

function renderBracket() {
  bracket.replaceChildren(...STAGES.map(renderStage));
}

function renderStage(stage) {
  const section = document.createElement("section");
  section.className = "stage-column";
  section.setAttribute("aria-labelledby", `${stage.key}-title`);
  section.innerHTML = `
    <div class="stage-head">
      <h3 id="${stage.key}-title">${stage.title}</h3>
      <span>${stage.basePoints} base</span>
    </div>
  `;
  const stack = document.createElement("div");
  stack.className = "match-stack";
  stack.replaceChildren(
    ...stage.matches.map(([matchId, homeSeed, awaySeed]) =>
      renderMatch(stage, matchId, homeSeed, awaySeed)
    )
  );
  section.append(stack);
  return section;
}

function renderMatch(stage, matchId, homeSeed, awaySeed) {
  const article = document.createElement("article");
  article.className = "match-card";
  article.innerHTML = `
    <div class="match-head">
      <strong>Match ${matchId}</strong>
      <span>${stage.title}</span>
    </div>
    <div class="team-grid" aria-label="Match ${matchId} teams">
      ${teamInput(matchId, "home", homeSeed)}
      ${teamInput(matchId, "away", awaySeed)}
    </div>
    <div class="prediction-grid">
      <label>
        <span>Mode</span>
        <select name="match-${matchId}-mode">
          <option value="score">Score</option>
        </select>
      </label>
      <label>
        <span>Home score</span>
        <input name="match-${matchId}-home-score" type="number" min="0" inputmode="numeric">
      </label>
      <label>
        <span>Away score</span>
        <input name="match-${matchId}-away-score" type="number" min="0" inputmode="numeric">
      </label>
      <label>
        <span>Home penalties</span>
        <input name="match-${matchId}-home-penalty-score" type="number" min="0" inputmode="numeric">
      </label>
      <label>
        <span>Away penalties</span>
        <input name="match-${matchId}-away-penalty-score" type="number" min="0" inputmode="numeric">
      </label>
    </div>
    <label class="winner-field">
      <span>Advancing team</span>
      <input name="match-${matchId}-winner" type="text" autocomplete="off">
    </label>
  `;
  return article;
}

function teamInput(matchId, side, seedLabel) {
  return `
    <label class="team-field">
      <span>${seedLabel}</span>
      <input name="match-${matchId}-${side}-team" type="text" autocomplete="off">
    </label>
  `;
}

function renderBasePoints() {
  const rows = STAGES.map((stage) => [stage.title, stage.basePoints]).concat(EXTRA_BASE_POINTS);
  basePointsTable.innerHTML = rows
    .map(([label, points]) => `
      <tr>
        <th scope="row">${label}</th>
        <td>${points}</td>
      </tr>
    `)
    .join("");
}
