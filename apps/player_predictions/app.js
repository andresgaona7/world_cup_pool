const data = window.POOL_DATA || { players: [] };

let selectedIndex = 0;
let searchTerm = "";

const sourceFile = document.querySelector("#sourceFile");
const playerSearch = document.querySelector("#playerSearch");
const playerList = document.querySelector("#playerList");
const playerName = document.querySelector("#playerName");
const sheetName = document.querySelector("#sheetName");
const futuresGrid = document.querySelector("#futuresGrid");
const firstRoundTable = document.querySelector("#firstRoundTable");
const bestThirds = document.querySelector("#bestThirds");

sourceFile.textContent = `Source: ${data.source_file || "workbook"}`;

playerSearch.addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderPlayerList();
});

function renderPlayerList() {
  const matches = data.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.name.toLowerCase().includes(searchTerm));

  playerList.replaceChildren(
    ...matches.map(({ player, index }) => {
      const button = document.createElement("button");
      button.className = `player-button${index === selectedIndex ? " active" : ""}`;
      button.type = "button";
      button.textContent = player.name;
      button.addEventListener("click", () => {
        selectedIndex = index;
        render();
      });
      return button;
    })
  );
}

function render() {
  const player = data.players[selectedIndex];
  if (!player) {
    playerName.textContent = "No players found";
    return;
  }

  playerName.textContent = player.name;
  sheetName.textContent = `Sheet: ${player.sheet}`;
  renderFutures(player);
  renderFirstRound(player);
  renderBestThirds(player);
  renderPlayerList();
}

function renderFutures(player) {
  const entries = Object.entries(player.futures).filter(([key]) => key !== "name");
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
  const rows = player.first_round_grid.map((gridRow) => {
    const tr = document.createElement("tr");
    gridRow.cells.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      td.className = cellClass(value);
      tr.append(td);
    });
    return tr;
  });
  firstRoundTable.replaceChildren(...rows);
}

function renderBestThirds(player) {
  const items = player.best_thirds.map((pick) => {
    const pill = document.createElement("div");
    pill.className = "best-third";

    const rank = document.createElement("span");
    rank.textContent = `#${pick.rank}`;

    const team = document.createElement("strong");
    team.textContent = pick.team || "Blank";

    pill.append(rank, team);
    return pill;
  });
  bestThirds.replaceChildren(...items);
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

render();
