const svg = d3.select("#tree");
const tooltip = d3.select("#tooltip");
const margin = { top: 20, right: 160, bottom: 20, left: 120 };
const width = 1100;
const defaultHeight = 720;

const colorScale = d3.scaleOrdinal()
  .domain(["root", "saga", "arc"])
  .range(["#ff8c00", "#4cc9f0", "#a066ff"]);

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
      .on("click", (_, d) => toggle(d))
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
    const treeData = buildHierarchy(data);
    initializeTree(treeData);
  })
  .catch(error => {
    console.error("Failed to load JSON", error);
    d3.select("body").append("p").text("Unable to load the One Piece dataset.");
  });
