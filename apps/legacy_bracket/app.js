const BRACKET_ROUNDS = [
  {
    title: "Round of 32",
    matches: [
      ["73", country("South Africa", "🇿🇦"), country("Canada", "🇨🇦")],
      ["74", country("Germany", "🇩🇪"), country("Paraguay", "🇵🇾")],
      ["75", country("Netherlands", "🇳🇱"), country("Morocco", "🇲🇦")],
      ["76", country("Brazil", "🇧🇷"), country("Japan", "🇯🇵")],
      ["77", country("France", "🇫🇷"), country("Sweden", "🇸🇪")],
      ["78", country("Ivory Coast", "🇨🇮"), country("Norway", "🇳🇴")],
      ["79", country("Mexico", "🇲🇽"), country("Ecuador", "🇪🇨")],
      ["80", country("England", "🏴"), country("DR Congo", "🇨🇩")],
      ["81", country("United States", "🇺🇸"), country("Bosnia and Herzegovina", "🇧🇦")],
      ["82", country("Belgium", "🇧🇪"), country("Senegal", "🇸🇳")],
      ["83", country("Portugal", "🇵🇹"), country("Croatia", "🇭🇷")],
      ["84", country("Spain", "🇪🇸"), country("Austria", "🇦🇹")],
      ["85", country("Switzerland", "🇨🇭"), country("Algeria", "🇩🇿")],
      ["86", country("Argentina", "🇦🇷"), country("Cabo Verde", "🇨🇻")],
      ["87", country("Colombia", "🇨🇴"), country("Ghana", "🇬🇭")],
      ["88", country("Australia", "🇦🇺"), country("Egypt", "🇪🇬")],
    ],
  },
  {
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
    title: "Quarterfinals",
    matches: [
      ["97", "Winner Match 89", "Winner Match 90"],
      ["98", "Winner Match 93", "Winner Match 94"],
      ["99", "Winner Match 91", "Winner Match 92"],
      ["100", "Winner Match 95", "Winner Match 96"],
    ],
  },
  {
    title: "Semifinals",
    matches: [
      ["101", "Winner Match 97", "Winner Match 98"],
      ["102", "Winner Match 99", "Winner Match 100"],
    ],
  },
  {
    title: "Medal Matches",
    matches: [
      ["103", "Loser Match 101", "Loser Match 102", "Third-place match"],
      ["104", "Winner Match 101", "Winner Match 102", "Final"],
    ],
  },
];

const board = document.querySelector("#wikiBracket");

renderBracket();

function country(name, flag) {
  return { name, flag };
}

function placeholder(name) {
  return { name, flag: "" };
}

function renderBracket() {
  board.replaceChildren(...BRACKET_ROUNDS.map(renderRound));
}

function renderRound(round) {
  const section = document.createElement("section");
  section.className = "round-column";
  section.innerHTML = `<h3>${round.title}</h3>`;

  const stack = document.createElement("div");
  stack.className = "match-stack";
  stack.replaceChildren(...round.matches.map(renderMatch));
  section.append(stack);
  return section;
}

function renderMatch([matchId, homeSeed, awaySeed, label]) {
  const article = document.createElement("article");
  article.className = "match-card";
  article.innerHTML = `
    <div class="match-head">
      <strong>Match ${matchId}</strong>
      <span>${label || ""}</span>
    </div>
    ${teamRow(homeSeed)}
    ${teamRow(awaySeed)}
  `;
  return article;
}

function teamRow(team) {
  const normalized = typeof team === "string" ? placeholder(team) : team;
  return `
    <div class="team-row">
      <span>${normalized.flag ? `<span class="flag" aria-hidden="true">${normalized.flag}</span>` : ""}${normalized.name}</span>
      <b></b>
    </div>
  `;
}
