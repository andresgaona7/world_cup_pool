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
      ["103", "Loser Match 101", "Loser Match 102", "3rd place"],
      ["104", "Winner Match 101", "Winner Match 102", "Final"],
    ],
  },
];

const officialData = window.OFFICIAL_RESULTS || {};
const officialMatches = latestOfficialKnockoutMatches(officialData);
const officialMatchesById = new Map(officialMatches.map((match) => [match.matchId, match]));
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
  const officialMatch = officialMatchesById.get(String(matchId));
  const homeTeam = displayTeam(officialMatch?.homeTeam ? officialTeam(officialMatch.homeTeam) : homeSeed);
  const awayTeam = displayTeam(officialMatch?.awayTeam ? officialTeam(officialMatch.awayTeam) : awaySeed);
  const article = document.createElement("article");
  article.className = `match-card ${officialMatch ? "has-result" : "is-pending"}`;
  article.innerHTML = `
    <div class="match-head">
      <strong>Match ${matchId}</strong>
      ${label ? `<span>${label}</span>` : ""}
    </div>
    ${teamRow(homeTeam, officialMatch, "home")}
    ${teamRow(awayTeam, officialMatch, "away")}
  `;
  return article;
}

function teamRow(team, officialMatch, side) {
  const score = scoreForSide(officialMatch, side);
  const winnerClass = isWinner(officialMatch, team.name) ? " is-winner" : "";
  return `
    <div class="team-row${winnerClass}">
      <span>${team.flag ? `<span class="flag" aria-hidden="true">${team.flag}</span>` : ""}${team.name}</span>
      <b>${score}</b>
    </div>
  `;
}

function displayTeam(seed) {
  if (typeof seed !== "string") {
    return seed;
  }

  const winnerMatch = seed.match(/^Winner Match (\d+)$/);
  if (winnerMatch) {
    const match = officialMatchesById.get(winnerMatch[1]);
    return match?.advancingTeam ? officialTeam(match.advancingTeam) : placeholder(seed);
  }

  const loserMatch = seed.match(/^Loser Match (\d+)$/);
  if (loserMatch) {
    const match = officialMatchesById.get(loserMatch[1]);
    const loser = matchLoser(match);
    return loser ? officialTeam(loser) : placeholder(seed);
  }

  return placeholder(seed);
}

function officialTeam(name) {
  return country(name, flagForTeam(name));
}

function scoreForSide(match, side) {
  if (!match || match.homeScore === null || match.awayScore === null) {
    return "";
  }
  const score = side === "home" ? match.homeScore : match.awayScore;
  const penaltyScore = side === "home" ? match.homePenaltyScore : match.awayPenaltyScore;
  return penaltyScore === null ? String(score) : `${score} (${penaltyScore})`;
}

function isWinner(match, teamName) {
  return Boolean(match?.advancingTeam && teamName && match.advancingTeam === teamName);
}

function matchLoser(match) {
  if (!match?.advancingTeam) {
    return "";
  }
  if (match.advancingTeam === match.homeTeam) {
    return match.awayTeam;
  }
  if (match.advancingTeam === match.awayTeam) {
    return match.homeTeam;
  }
  return "";
}

function latestOfficialKnockoutMatches(resultsData) {
  const matchesById = new Map();
  [
    ...(resultsData?.officialMatches || []),
    ...(resultsData?.matches || []),
    ...(resultsData?.timelineCheckpoints || []).flatMap((checkpoint) => checkpoint.officialMatches || []),
  ]
    .map(normalizeOfficialKnockoutMatch)
    .filter((match) => match.matchId && match.homeTeam && match.awayTeam)
    .forEach((match) => matchesById.set(match.matchId, match));

  return [...matchesById.values()];
}

function normalizeOfficialKnockoutMatch(match) {
  return {
    matchId: String(match.matchId || match.id || ""),
    stage: String(match.stage || ""),
    homeTeam: match.homeTeam || match.home || "",
    awayTeam: match.awayTeam || match.away || "",
    homeScore: numberOrNull(match.homeScore),
    awayScore: numberOrNull(match.awayScore),
    homePenaltyScore: numberOrNull(match.homePenaltyScore),
    awayPenaltyScore: numberOrNull(match.awayPenaltyScore),
    advancingTeam: match.advancingTeam || match.winner || "",
    duration: match.duration || "",
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function flagForTeam(name) {
  return {
    Algeria: "🇩🇿",
    Argentina: "🇦🇷",
    Australia: "🇦🇺",
    Belgium: "🇧🇪",
    "Bosnia-Herzegovina": "🇧🇦",
    "Bosnia and Herzegovina": "🇧🇦",
    Brazil: "🇧🇷",
    Canada: "🇨🇦",
    "Cape Verde Islands": "🇨🇻",
    "Cabo Verde": "🇨🇻",
    Colombia: "🇨🇴",
    Croatia: "🇭🇷",
    "Congo DR": "🇨🇩",
    "DR Congo": "🇨🇩",
    Ecuador: "🇪🇨",
    Egypt: "🇪🇬",
    England: "🏴",
    France: "🇫🇷",
    Germany: "🇩🇪",
    Ghana: "🇬🇭",
    "Ivory Coast": "🇨🇮",
    Japan: "🇯🇵",
    Mexico: "🇲🇽",
    Morocco: "🇲🇦",
    Netherlands: "🇳🇱",
    Norway: "🇳🇴",
    Paraguay: "🇵🇾",
    Portugal: "🇵🇹",
    Senegal: "🇸🇳",
    Spain: "🇪🇸",
    "South Africa": "🇿🇦",
    Sweden: "🇸🇪",
    Switzerland: "🇨🇭",
    "United States": "🇺🇸",
  }[name] || "";
}
