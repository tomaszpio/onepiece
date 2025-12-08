// --- Saga presentation ---
const sagaListSection = document.getElementById("saga-list");
if (sagaListSection) {
  // Funkcja do pobrania wszystkich plików JSON z katalogu data/ (tylko sagi)
  async function loadSagas() {
    // Lista plików sag (można rozbudować o kolejne pliki w przyszłości)
    const sagaFiles = [
      "east_blue_saga.json",
      "sky_island_saga.json",
      "water_7_saga.json",
      "thriller_bark_saga.json",
      "summit_war_saga.json",
      // Dodaj tu kolejne pliki jeśli będą
    ];
    const sagaData = await Promise.all(
      sagaFiles.map(async (file) => {
        try {
          const res = await fetch(`data/${file}`);
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      })
    );
    return sagaData.filter(Boolean);
  }

  function renderSagas(sagas) {
    sagaListSection.innerHTML = sagas.map(saga => `
      <div class="saga-card">
        <div class="saga-title">${saga.saga_name || "Saga"}</div>
        <div class="saga-jp">${saga.japanese_name || ""}</div>
        <div class="saga-summary">${saga.overall_summary || ""}</div>
      </div>
    `).join("");
  }

  loadSagas().then(renderSagas);
}
const svg = d3.select("#tree");
const tooltip = d3.select("#tooltip");
const searchInput = document.getElementById("search");
const sagaFilter = document.getElementById("saga-filter");
const arcFilter = document.getElementById("arc-filter");
const episodeCount = document.getElementById("episode-count");
const episodesTableBody = document.querySelector("#episodes-table tbody");
const episodesSection = document.getElementById("episodes");
const margin = { top: 20, right: 160, bottom: 20, left: 120 };
const width = 1100;
const defaultHeight = 720;

const colorScale = d3.scaleOrdinal()
  .domain(["root", "saga", "arc"])
  .range(["#ff8c00", "#4cc9f0", "#a066ff"]);

let dataCache = null;
let sagaNameById = new Map();
let arcNameById = new Map();
let arcToSaga = new Map();

function formatRange(range) {
  if (!range || !range.length) return "?";
  const [start, end] = range;
  return end ? `E${start} – E${end}` : `E${start} onward`;
}

function formatRanges(ranges) {
  return ranges.map(formatRange).join(", ");
}

function buildHierarchy(data) {
  const arcsCount = data.sagas.reduce((count, saga) => count + saga.arcs.length, 0);
  d3.select("#series-name").text(data.series);
  d3.select("#series-status").text(data.info.status);
  d3.select("#series-episodes").text(data.info.total_episodes.toLocaleString());
  d3.select("#series-sagas").text(data.sagas.length);
  d3.select("#series-arcs").text(arcsCount);

  // Lookup maps for fast name resolution and filtering.
  sagaNameById = new Map(data.sagas.map(s => [s.id, s.name]));
  arcNameById = new Map();
  arcToSaga = new Map();
  data.sagas.forEach(saga => {
    saga.arcs.forEach(arc => {
      arcNameById.set(arc.id, arc.name);
      arcToSaga.set(arc.id, saga.id);
    });
  });

  return {
    name: data.series,
    type: "root",
    children: data.sagas.map(saga => ({
      name: saga.name,
      superSaga: saga.super_saga,
      range: formatRange(saga.episode_range),
      type: "saga",
      children: saga.arcs.map(arc => ({
        name: arc.name,
        range: formatRanges(arc.episode_ranges),
        type: "arc",
        id: arc.id
      }))
    }))
  };
}

function initializeTree(treeData) {
  const root = d3.hierarchy(treeData);
  root.x0 = defaultHeight / 2;
  root.y0 = 0;
  root.children.forEach(collapse);

  const g = svg
    .attr("viewBox", [0, 0, width, defaultHeight])
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const treeLayout = d3.tree().nodeSize([26, 180]);

  function update(source) {
    const nodes = root.descendants();
    const links = root.links();

    const height = Math.max(defaultHeight, nodes.length * 28);
    svg.attr("viewBox", [0, 0, width, height]);
    treeLayout.size([height - margin.top - margin.bottom, width - margin.left - margin.right]);
    treeLayout(root);

    const link = g.selectAll("path.link")
      .data(links, d => d.target.data.name + d.target.depth);

    link.join(
      enter => enter.append("path")
        .attr("class", "link")
        .attr("d", d3.linkHorizontal()
          .x(d => d.y)
          .y(d => d.x))
    );

    const node = g.selectAll("g.node")
      .data(nodes, d => d.data.name + d.depth);

    const nodeEnter = node.enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${source.y0},${source.x0})`)
      .on("click", (event, d) => {
        if (d.data.type === "arc") {
          handleArcSelection(d.data.id);
          return;
        }
        toggle(d);
      })
      .on("mousemove", (event, d) => showTooltip(event, d))
      .on("mouseleave", hideTooltip);

    nodeEnter.append("circle")
      .attr("r", 8)
      .attr("fill", d => colorScale(d.data.type));

    nodeEnter.append("text")
      .attr("dy", "0.32em")
      .attr("x", d => d.children || d._children ? -14 : 14)
      .attr("text-anchor", d => d.children || d._children ? "end" : "start")
      .text(d => d.data.name);

    const nodeMerge = nodeEnter.merge(node);

    nodeMerge.transition().duration(250)
      .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeMerge.select("text")
      .attr("x", d => d.children || d._children ? -14 : 14)
      .attr("text-anchor", d => d.children || d._children ? "end" : "start");

    node.exit().remove();

    root.each(d => { d.x0 = d.x; d.y0 = d.y; });
  }

  function toggle(d) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else {
      d.children = d._children;
      d._children = null;
    }
    update(d);
  }

  function collapse(node) {
    if (node.children) {
      node._children = node.children;
      node._children.forEach(collapse);
      node.children = null;
    }
  }

  function showTooltip(event, d) {
    const { name, range, superSaga, type } = d.data;
    const lines = [
      `<strong>${name}</strong>`,
      type === "saga" ? `Super saga: ${superSaga}` : null,
      range ? `Episodes: ${range}` : null,
      type === "root" ? "Click sagas to expand arcs." : null
    ].filter(Boolean);

    tooltip.html(lines.join("<br>"))
      .style("left", `${event.pageX + 16}px`)
      .style("top", `${event.pageY - 10}px`)
      .style("opacity", 1);
  }

  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  update(root);
}

function populateFilters(data) {
  sagaFilter.innerHTML = `<option value="">Wszystkie sagi</option>` + data.sagas
    .map(s => `<option value="${s.id}">${s.name}</option>`)
    .join("");
  arcFilter.innerHTML = `<option value="">Wszystkie łuki</option>`;
  arcFilter.disabled = true;
}

function updateArcOptions(selectedSaga) {
  if (!selectedSaga) {
    arcFilter.innerHTML = `<option value="">Wszystkie łuki</option>`;
    arcFilter.disabled = true;
    return;
  }

  const saga = dataCache.sagas.find(s => s.id === selectedSaga);
  const options = saga.arcs
    .map(a => `<option value="${a.id}">${a.name}</option>`)
    .join("");
  arcFilter.innerHTML = `<option value="">Wszystkie łuki</option>${options}`;
  arcFilter.disabled = false;
}

function renderEpisodes() {
  if (!dataCache) return;

  const term = searchInput.value.trim().toLowerCase();
  const sagaId = sagaFilter.value;
  const arcId = arcFilter.value;

  const filtered = dataCache.episodes.filter(ep => {
    if (sagaId && ep.saga !== sagaId) return false;
    if (arcId && ep.arc !== arcId) return false;
    if (!term) return true;
    return (
      ep.title.toLowerCase().includes(term) ||
      ep.title_romaji.toLowerCase().includes(term)
    );
  });

  episodeCount.textContent = `${filtered.length} episodes`;

  const rows = filtered.map(ep => {
    const sagaName = sagaNameById.get(ep.saga) || ep.saga;
    const arcName = arcNameById.get(ep.arc) || ep.arc;
    return `
      <tr>
        <td class="episode-id">#${ep.id}</td>
        <td>${ep.title}</td>
        <td>${ep.title_romaji}</td>
        <td>${ep.air_date}</td>
        <td>${sagaName}</td>
        <td>${arcName}</td>
      </tr>
    `;
  }).join("");

  episodesTableBody.innerHTML = rows || `<tr><td colspan="6">No results.</td></tr>`;
}

function handleArcSelection(arcId) {
  const sagaId = arcToSaga.get(arcId);
  if (sagaId) {
    sagaFilter.value = sagaId;
    updateArcOptions(sagaId);
    arcFilter.value = arcId;
  }
  renderEpisodes();
  episodesSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupFilterEvents() {
  searchInput.addEventListener("input", renderEpisodes);
  sagaFilter.addEventListener("change", () => {
    updateArcOptions(sagaFilter.value);
    arcFilter.value = "";
    renderEpisodes();
  });
  arcFilter.addEventListener("change", renderEpisodes);
}

async function loadData() {
  const sources = [
    "one_piece_anime.json",
    "data/one_piece_anime.json"
  ];

  let lastError;

  for (const source of sources) {
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to load ${source}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to load data from any source.");
}

loadData()
  .then(data => {
    dataCache = data;
    const treeData = buildHierarchy(data);
    initializeTree(treeData);
    populateFilters(data);
    setupFilterEvents();
    renderEpisodes();
  })
  .catch(error => {
    console.error("Failed to load JSON", error);
    d3.select("body").append("p").text("Unable to load the One Piece dataset.");
  });
