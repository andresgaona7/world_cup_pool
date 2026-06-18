const data = window.POOL_DATA || { players: [] };

let selectedIndex = 0;

const loadStatus = document.querySelector("#loadStatus");
const playerSelect = document.querySelector("#playerSelect");
const playerName = document.querySelector("#playerName");
const sheetName = document.querySelector("#sheetName");
const futuresGrid = document.querySelector("#futuresGrid");
const firstRoundTable = document.querySelector("#firstRoundTable");
const bestThirds = document.querySelector("#bestThirds");
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
