const officialData = window.OFFICIAL_RESULTS || {};
const GROUP_IDS = "ABCDEFGHIJKL".split("");
const QUALIFYING_THIRD_PLACE_COUNT = 8;

const metrics = document.querySelector("#metrics");
const thirdPlaceTable = document.querySelector("#thirdPlaceTable");

render();

function render() {
  const rows = thirdPlaceRows(officialData.provisionalGroupStandings || {});
  const rankedRows = rankThirdPlaces(rows);

  renderMetrics(rankedRows);
  renderTable(rankedRows);
}

function thirdPlaceRows(standings) {
  return GROUP_IDS.map((groupId, groupIndex) => {
    const sortedRows = normalizeGroupStandingRows(standings[groupId]);
    const row = sortedRows.find((item) => item.position === 3) || sortedRows[2];
    if (!row) {
      return null;
    }

    return {
      ...row,
      groupId,
      groupIndex,
      fairPlayPoints: fairPlayPoints(row),
      lotsOrder: lotsOrder(row),
    };
  }).filter(Boolean);
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
      goalsFor: numberValue(row.goalsFor, 0),
      goalsAgainst: numberValue(row.goalsAgainst, 0),
      goalDifference: numberValue(row.goalDifference, 0),
      points: numberValue(row.points, 0),
    }))
    .sort((a, b) =>
      a.position - b.position ||
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.sourceIndex - b.sourceIndex
    );
}

function rankThirdPlaces(rows) {
  const sortedRows = [...rows].sort(compareThirdPlaces);
  return sortedRows.map((row, index) => ({
    ...row,
    rank: index + 1,
    isQualifier: index < QUALIFYING_THIRD_PLACE_COUNT,
    needsLots: tiedThroughFairPlay(row, sortedRows[index - 1]) || tiedThroughFairPlay(row, sortedRows[index + 1]),
  }));
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

function tiedThroughFairPlay(left, right) {
  return Boolean(
    left &&
    right &&
    left.points === right.points &&
    left.goalDifference === right.goalDifference &&
    left.goalsFor === right.goalsFor &&
    left.fairPlayPoints === right.fairPlayPoints
  );
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

function renderMetrics(rows) {
  const qualifiers = rows.filter((row) => row.isQualifier);
  const cutoff = qualifiers.at(-1);
  const latestUpdate = formatDate(officialData.generatedAt);

  metrics.replaceChildren(
    metric("Cutoff", cutoff ? `${cutoff.team}, ${cutoff.points} pts` : "Pending"),
    metric("Latest update", latestUpdate)
  );
}

function metric(label, value) {
  const node = document.createElement("article");
  node.className = "metric";
  node.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  `;
  return node;
}

function renderTable(rows) {
  document.querySelector(".empty-state")?.remove();
  if (!rows.length) {
    thirdPlaceTable.innerHTML = "";
    thirdPlaceTable.insertAdjacentHTML("afterend", '<div class="empty-state">No official group standings available.</div>');
    return;
  }

  thirdPlaceTable.innerHTML = `
    <thead>
      <tr>
        <th class="rank">#</th>
        <th>Group</th>
        <th>Team</th>
        <th>Played</th>
        <th>Pts</th>
        <th>GD</th>
        <th>GF</th>
        <th>Fair play</th>
        <th>Lots</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr class="${row.isQualifier ? "is-qualifier" : "is-outside"}">
          <td class="rank">${row.rank}</td>
          <td><strong>Group ${escapeHtml(row.groupId)}</strong></td>
          <td><strong>${escapeHtml(row.team)}</strong></td>
          <td>${formatNumber(row.played)}</td>
          <td>${formatNumber(row.points)}</td>
          <td>${formatSigned(row.goalDifference)}</td>
          <td>${formatNumber(row.goalsFor)}</td>
          <td>${formatSigned(row.fairPlayPoints)}</td>
          <td>${lotsValue(row)}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function lotsValue(row) {
  if (row.lotsOrder !== null) {
    return formatNumber(row.lotsOrder);
  }
  if (row.needsLots) {
    return '<span class="muted">Needed</span>';
  }
  return '<span class="muted">Not needed</span>';
}

function numberValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatSigned(value) {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatDate(value) {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}
