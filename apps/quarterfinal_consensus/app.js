const dataNode = document.querySelector(
  "#quarterfinal-consensus-data, #semifinal-consensus-data, #finals-consensus-data"
);
const data = JSON.parse(dataNode.textContent);
const consensus = data.consensus;
const playerCount = consensus.metadata.player_count;
const stageLabel = consensus.metadata.stage_label || "Knockout";

document.querySelector("#metrics").replaceChildren(
  metric("Players", playerCount),
  metric("Matches", consensus.metadata.match_count),
  metric("Source", `${stageLabel} workbook`)
);

document.querySelector("#matchGrid").replaceChildren(
  ...consensus.matches.map((match) => matchCard(match, playerCount))
);

document.querySelector("#advancingTeams").replaceChildren(
  chart("Most common advancing teams", consensus.advancing_teams, playerCount)
);

document.querySelector("#bonusQuestions").replaceChildren(
  ...consensus.bonus_questions.map((question) =>
    chart(question.question, question.answers, playerCount)
  )
);

function metric(label, value) {
  const element = document.createElement("article");
  element.className = "metric";
  element.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  `;
  return element;
}

function matchCard(match, totalVotes) {
  const element = document.createElement("article");
  element.className = "match-card";
  const winner = match.advancingTeamConsensus[0];
  const score = match.scoreConsensus[0];
  element.innerHTML = `
    <div class="match-head">
      <div>
        <span>Match ${escapeHtml(match.matchId)}</span>
        <strong>${escapeHtml(match.homeTeam)} vs ${escapeHtml(match.awayTeam)}</strong>
      </div>
      <div class="vote-pill">${escapeHtml(match.picks)} picks</div>
    </div>
    <div class="winner-line">
      <span>Consensus winner</span>
      <strong>${escapeHtml(winner?.value || "TBD")}</strong>
      <em>${escapeHtml(voteText(winner?.votes || 0, totalVotes))}</em>
    </div>
    <div class="mini-grid">
      ${miniBlock("Score", score?.value || "Blank", score?.votes || 0, totalVotes)}
      ${miniBlock("Penalties", match.penaltyConsensus[0]?.value || "No consensus", match.penaltyConsensus[0]?.votes || 0, totalVotes)}
    </div>
    <div class="bar-stack">
      ${match.advancingTeamConsensus.map((row) => bar(row, totalVotes)).join("")}
    </div>
  `;
  return element;
}

function miniBlock(label, value, votes, totalVotes) {
  return `
    <div class="mini-block">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(votes ? voteText(votes, totalVotes) : "No votes")}</em>
    </div>
  `;
}

function chart(title, rows, totalVotes) {
  const element = document.createElement("article");
  element.className = "chart";
  element.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <div class="bar-stack">
      ${rows.length ? rows.map((row) => bar(row, totalVotes)).join("") : emptyRow()}
    </div>
  `;
  return element;
}

function bar(row, totalVotes) {
  const width = totalVotes ? Math.max((row.votes / totalVotes) * 100, 4) : 0;
  return `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(row.value)}">${escapeHtml(row.value)}</span>
      <span class="bar-track"><span class="bar" style="width: ${width}%"></span></span>
      <strong>${escapeHtml(row.votes)}</strong>
    </div>
  `;
}

function emptyRow() {
  return `<p class="empty-state">No picks available.</p>`;
}

function voteText(votes, totalVotes) {
  const percent = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
  return `${votes}/${totalVotes} (${percent}%)`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
