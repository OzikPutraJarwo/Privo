/* ===================================================================
   Data Analysis Module (Beta)
   - ANOVA (Completely Randomized Design, 1 Factor)
   =================================================================== */

const analysisState = {
  active: false,
  treatmentColumn: null, // { key, label }
  valueColumn: null,     // { key, label }
  columns: [],
  rows: [],
  filters: {},
  sort: null,
  freezeUntilColKey: null,
  draggedColKey: null,
  draggedColLabel: null,
};

const analysisFullscreenState = {
  active: false,
  previousPageTitle: "",
  previousMenuHtml: "",
  previousMenuOnclick: null,
  previousDisplays: {},
};

/* ----------  Fullscreen Mode  ---------- */

function enterAnalysisFullscreenMode() {
  if (analysisFullscreenState.active) return;

  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.getElementById("menuToggle");

  const managedIds = ["syncDownBtn", "syncStatusBtn", "userMenu"];
  analysisFullscreenState.previousDisplays = {};
  managedIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    analysisFullscreenState.previousDisplays[id] = el.style.display;
    el.style.display = "none";
  });

  analysisFullscreenState.previousPageTitle = pageTitle?.textContent || "Data Analysis";
  if (menuToggle) {
    analysisFullscreenState.previousMenuHtml = menuToggle.innerHTML;
    analysisFullscreenState.previousMenuOnclick = menuToggle.onclick;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">close</span>';
    menuToggle.onclick = () => switchPage("dashboard");
  }

  if (topbar) topbar.classList.add("run-trial-mode");
  if (pageTitle) pageTitle.textContent = "Data Analysis (Beta)";

  document.body.classList.add("analysis-fullscreen-active", "sidebar-collapsed");
  analysisFullscreenState.active = true;
}

function exitAnalysisFullscreenMode() {
  if (!analysisFullscreenState.active) return;

  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (topbar) topbar.classList.remove("run-trial-mode");
  if (pageTitle) pageTitle.textContent = analysisFullscreenState.previousPageTitle || "Dashboard";

  if (menuToggle) {
    menuToggle.innerHTML = analysisFullscreenState.previousMenuHtml || '<span class="material-symbols-rounded">menu</span>';
    menuToggle.onclick = analysisFullscreenState.previousMenuOnclick || null;
  }

  Object.entries(analysisFullscreenState.previousDisplays || {}).forEach(([id, display]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = display || "";
  });

  document.body.classList.remove("analysis-fullscreen-active", "sidebar-collapsed");
  if (sidebar) sidebar.classList.remove("open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("active");

  analysisFullscreenState.active = false;
}

/* ----------  Section Resize  ---------- */

let analysisResizeData = null;

function startAnalysisResize(event, handleId) {
  event.preventDefault();
  const container = document.querySelector(".analysis-container");
  if (!container) return;

  const results = container.querySelector(".analysis-results");
  const controls = container.querySelector(".analysis-controls");
  const table = container.querySelector(".analysis-table-section");
  if (!results || !controls || !table) return;

  const containerRect = container.getBoundingClientRect();
  const containerH = containerRect.height;

  // Total height occupied by the two resize handles (7px each)
  const handleEls = container.querySelectorAll(".analysis-resize-handle");
  let handlesH = 0;
  handleEls.forEach((h) => (handlesH += h.offsetHeight));

  const startY = event.clientY;

  const resultsH = results.offsetHeight;
  const controlsH = controls.offsetHeight;
  const tableH = table.offsetHeight;

  // Mark the active handle
  const handleEl = event.currentTarget;
  handleEl.classList.add("active");

  analysisResizeData = {
    handleId,
    handleEl,
    container,
    results,
    controls,
    table,
    containerH,
    handlesH,
    startY,
    resultsH,
    controlsH,
    tableH,
  };

  document.body.classList.add("analysis-resizing");
  document.addEventListener("mousemove", onAnalysisResizeMove);
  document.addEventListener("mouseup", onAnalysisResizeEnd);
}

function onAnalysisResizeMove(event) {
  if (!analysisResizeData) return;
  const { handleId, results, controls, table, containerH, handlesH, startY, resultsH, controlsH, tableH } = analysisResizeData;
  const delta = event.clientY - startY;
  const usable = containerH - handlesH;
  const MIN = 40;

  if (handleId === "results-controls") {
    // Dragging between results and controls+table
    let newResultsH = Math.max(MIN, resultsH + delta);
    // Controls has a natural height; the remainder goes to table
    let remaining = usable - newResultsH;
    if (remaining < controlsH + MIN) {
      newResultsH = usable - controlsH - MIN;
      remaining = controlsH + MIN;
    }
    if (newResultsH < MIN) newResultsH = MIN;

    results.style.flex = `0 0 ${newResultsH}px`;
    table.style.flex = `0 0 ${remaining - controlsH}px`;
  } else if (handleId === "controls-table") {
    // Dragging between controls and table
    let newControlsH = Math.max(MIN, controlsH + delta);
    let newTableH = Math.max(MIN, tableH - delta);

    // Clamp
    const maxControls = usable - resultsH - MIN;
    if (newControlsH > maxControls) {
      newControlsH = maxControls;
      newTableH = MIN;
    }
    if (newTableH < MIN) {
      newTableH = MIN;
      newControlsH = usable - resultsH - MIN;
    }

    controls.style.flex = `0 0 ${newControlsH}px`;
    controls.style.overflow = "auto";
    table.style.flex = `0 0 ${newTableH}px`;
  }
}

function onAnalysisResizeEnd() {
  if (analysisResizeData) {
    analysisResizeData.handleEl.classList.remove("active");
    analysisResizeData = null;
  }
  document.body.classList.remove("analysis-resizing");
  document.removeEventListener("mousemove", onAnalysisResizeMove);
  document.removeEventListener("mouseup", onAnalysisResizeEnd);
}

/* ----------  Initialise / Render  ---------- */

function initAnalysis() {
  const dataset = buildDatabaseDataset();

  analysisState.columns = [
    ...dataset.fixedColumns.map((c) => ({
      key: c.key, label: c.label, source: c.source || "fixed",
    })),
    ...(dataset.extraColumns || []).map((c) => ({
      key: c.key, label: c.label, source: c.source || "extra",
    })),
    ...dataset.parameterColumns.map((p) => ({
      key: `param_${p.id}`, label: p.name || "Parameter", source: "param",
    })),
  ];
  analysisState.rows = dataset.rows;
  analysisState.filters = {};
  analysisState.sort = null;
  analysisState.freezeUntilColKey = null;

  renderAnalysisTable();
}

/* ----------  Column visibility  ---------- */

function getAnalysisVisibleColumns() {
  return analysisState.columns; // show all columns in analysis
}

/* ----------  Filters  ---------- */

function getAnalysisColumnMode(key) {
  const filterData = analysisState.filters[key];
  if (analysisState.sort && analysisState.sort.key === key) return "sort";
  if (filterData && filterData.excluded && filterData.excluded.length > 0) return "filter";
  if (analysisState.freezeUntilColKey === key) return "freeze";
  return "default";
}

function applyAnalysisFilters(rows) {
  const filters = analysisState.filters;
  if (!filters || Object.keys(filters).length === 0) return rows;

  return rows.filter((row) =>
    Object.entries(filters).every(([key, filterData]) => {
      if (!filterData || !filterData.excluded || filterData.excluded.length === 0) return true;
      const raw = String(row[key] ?? "").trim();
      const norm = raw || "__BLANK__";
      return !filterData.excluded.includes(norm);
    }),
  );
}

function applyAnalysisSort(rows) {
  if (!analysisState.sort) return rows;
  const { key, direction } = analysisState.sort;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const va = a[key] ?? "";
    const vb = b[key] ?? "";
    const na = Number(va);
    const nb = Number(vb);
    if (!isNaN(na) && !isNaN(nb) && va !== "" && vb !== "") {
      return direction === "asc" ? na - nb : nb - na;
    }
    const sa = String(va).toLowerCase();
    const sb = String(vb).toLowerCase();
    if (sa < sb) return direction === "asc" ? -1 : 1;
    if (sa > sb) return direction === "asc" ? 1 : -1;
    return 0;
  });
  return sorted;
}

/* ----------  Column Menu (filter/sort/freeze)  ---------- */

let analysisColumnMenuOpen = null;

function closeAnalysisColumnMenus() {
  document.querySelectorAll(".analysis-col-menu").forEach((m) => m.remove());
  analysisColumnMenuOpen = null;
}

function openAnalysisColumnMenu(event, colKey) {
  event.stopPropagation();
  const wasOpen = analysisColumnMenuOpen === colKey;
  closeAnalysisColumnMenus();
  if (wasOpen) return;
  analysisColumnMenuOpen = colKey;

  const btn = event.currentTarget;
  const allRows = analysisState.rows;
  const colValues = new Set();
  allRows.forEach((r) => {
    const v = String(r[colKey] ?? "").trim();
    colValues.add(v || "__BLANK__");
  });
  const sortedVals = [...colValues].sort((a, b) => {
    if (a === "__BLANK__") return 1;
    if (b === "__BLANK__") return -1;
    return a.localeCompare(b);
  });

  const filterData = analysisState.filters[colKey] || {};
  const excluded = filterData.excluded || [];

  const isFrozen = analysisState.freezeUntilColKey === colKey;
  const sortDir = analysisState.sort?.key === colKey ? analysisState.sort.direction : null;

  const menu = document.createElement("div");
  menu.className = "analysis-col-menu trial-report-column-menu";
  menu.innerHTML = `
    <div class="trial-report-column-menu-section">
      <button class="trial-report-column-menu-btn ${sortDir === "asc" ? "active" : ""}" data-action="sort-asc">
        <span class="material-symbols-rounded" style="font-size:.95rem">arrow_upward</span> Sort A → Z
      </button>
      <button class="trial-report-column-menu-btn ${sortDir === "desc" ? "active" : ""}" data-action="sort-desc">
        <span class="material-symbols-rounded" style="font-size:.95rem">arrow_downward</span> Sort Z → A
      </button>
      ${sortDir ? `<button class="trial-report-column-menu-btn" data-action="sort-clear">
        <span class="material-symbols-rounded" style="font-size:.95rem">close</span> Clear Sort
      </button>` : ""}
    </div>
    <div class="trial-report-column-menu-section">
      <button class="trial-report-column-menu-btn ${isFrozen ? "active" : ""}" data-action="freeze">
        <span class="material-symbols-rounded" style="font-size:.95rem">${isFrozen ? "lock_open" : "push_pin"}</span>
        ${isFrozen ? "Unfreeze Column" : "Freeze up to here"}
      </button>
    </div>
    <div class="trial-report-column-menu-section trial-report-column-menu-filter">
      <div class="trial-report-column-menu-filter-header">
        <span style="font-weight:600;font-size:.8rem">Filter</span>
        <div>
          <button class="trial-report-column-menu-link" data-action="filter-all">All</button>
          <button class="trial-report-column-menu-link" data-action="filter-none">None</button>
        </div>
      </div>
      <div class="trial-report-column-menu-filter-list">
        ${sortedVals
          .map(
            (v) => `
          <label class="trial-report-column-menu-filter-item">
            <input type="checkbox" data-filter-val="${encodeURIComponent(v)}" ${!excluded.includes(v) ? "checked" : ""}>
            <span>${v === "__BLANK__" ? "(blank)" : escapeHtml(v)}</span>
          </label>`,
          )
          .join("")}
      </div>
    </div>
  `;

  // Event handlers
  menu.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;

    if (action === "sort-asc") {
      analysisState.sort = { key: colKey, direction: "asc" };
      closeAnalysisColumnMenus();
      renderAnalysisTable();
    } else if (action === "sort-desc") {
      analysisState.sort = { key: colKey, direction: "desc" };
      closeAnalysisColumnMenus();
      renderAnalysisTable();
    } else if (action === "sort-clear") {
      analysisState.sort = null;
      closeAnalysisColumnMenus();
      renderAnalysisTable();
    } else if (action === "freeze") {
      analysisState.freezeUntilColKey = isFrozen ? null : colKey;
      closeAnalysisColumnMenus();
      renderAnalysisTable();
    } else if (action === "filter-all") {
      menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
      analysisState.filters[colKey] = { excluded: [] };
      renderAnalysisTable();
    } else if (action === "filter-none") {
      menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
      analysisState.filters[colKey] = { excluded: [...sortedVals] };
      renderAnalysisTable();
    }
  });

  menu.addEventListener("change", (e) => {
    if (!e.target.matches('input[type="checkbox"]')) return;
    const newExcluded = [];
    menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      if (!cb.checked) newExcluded.push(decodeURIComponent(cb.dataset.filterVal));
    });
    analysisState.filters[colKey] = { excluded: newExcluded };
    renderAnalysisTable();
  });

  document.body.appendChild(menu);

  // Position
  const btnRect = btn.getBoundingClientRect();
  let left = btnRect.left;
  let top = btnRect.bottom + 4;
  const menuW = 260;
  if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 8;
  if (left < 4) left = 4;
  menu.style.position = "fixed";
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  menu.style.zIndex = "9999";
}

document.addEventListener("click", (e) => {
  if (analysisColumnMenuOpen && !e.target.closest(".analysis-col-menu") && !e.target.closest(".analysis-th-btn")) {
    closeAnalysisColumnMenus();
  }
});

/* ----------  Freeze Columns  ---------- */

function applyAnalysisFreezeColumns(tableEl, visibleColumns) {
  if (!analysisState.freezeUntilColKey) return;
  const idx = visibleColumns.findIndex((c) => c.key === analysisState.freezeUntilColKey);
  if (idx < 0) return;

  let left = 0;
  const ths = tableEl.querySelectorAll("thead th");
  const rows = tableEl.querySelectorAll("tbody tr");

  for (let i = 0; i <= idx; i++) {
    const th = ths[i];
    if (!th) continue;
    const width = th.offsetWidth;
    th.style.position = "sticky";
    th.style.left = left + "px";
    th.style.zIndex = "3";

    rows.forEach((row) => {
      const td = row.children[i];
      if (!td) return;
      td.style.position = "sticky";
      td.style.left = left + "px";
      td.style.zIndex = "1";
      td.style.background = "#fff";
    });

    left += width;
  }
}

/* ----------  Table Rendering  ---------- */

function renderAnalysisTable() {
  const tableEl = document.getElementById("analysisTable");
  if (!tableEl) return;

  const rowCountEl = document.getElementById("analysisRowCount");

  closeAnalysisColumnMenus();

  const visibleColumns = getAnalysisVisibleColumns();
  const rows = applyAnalysisSort(applyAnalysisFilters(analysisState.rows));

  const makeTh = (col, colIndex) => `
    <th draggable="true"
        ondragstart="handleAnalysisThDragStart(event, '${encodeURIComponent(col.key)}', '${encodeURIComponent(col.label)}')"
        ondragend="handleAnalysisThDragEnd(event)">
      <button type="button" class="trial-report-th-btn analysis-th-btn ${col.source === "param" ? "database-param-th" : ""}"
              data-col-key="${escapeHtml(col.key)}" data-col-index="${colIndex}"
              onclick="openAnalysisColumnMenu(event, decodeURIComponent('${encodeURIComponent(col.key)}'))">
        <span class="trial-report-th-text">${escapeHtml(col.label)}</span>
        <span class="material-symbols-rounded trial-report-th-marker ${getAnalysisColumnMode(col.key) !== "default" ? "active" : ""}">filter_alt</span>
      </button>
    </th>`;

  if (rows.length === 0) {
    tableEl.innerHTML = `
      <thead><tr>${visibleColumns.map((c, i) => makeTh(c, i)).join("")}</tr></thead>
      <tbody><tr><td colspan="${visibleColumns.length}" class="trial-report-empty">No rows</td></tr></tbody>
    `;
    if (rowCountEl) rowCountEl.textContent = "0 rows";
    return;
  }

  tableEl.innerHTML = `
    <thead><tr>${visibleColumns.map((c, i) => makeTh(c, i)).join("")}</tr></thead>
    <tbody>
      ${rows
        .map(
          (row) =>
            `<tr>${visibleColumns.map((c) => `<td class="${c.source === "param" ? "database-param-td" : ""}">${escapeHtml(String(row[c.key] ?? ""))}</td>`).join("")}</tr>`,
        )
        .join("")}
    </tbody>
  `;

  applyAnalysisFreezeColumns(tableEl, visibleColumns);
  if (rowCountEl) rowCountEl.textContent = `${rows.length.toLocaleString()} rows`;
}

/* ----------  Drag & Drop from TH to Drop Zones  ---------- */

function handleAnalysisThDragStart(event, encodedKey, encodedLabel) {
  const key = decodeURIComponent(encodedKey);
  const label = decodeURIComponent(encodedLabel);
  analysisState.draggedColKey = key;
  analysisState.draggedColLabel = label;
  event.dataTransfer.setData("text/plain", key);
  event.dataTransfer.effectAllowed = "copy";
  event.currentTarget.classList.add("analysis-th-dragging");

  // Highlight drop zones
  document.querySelectorAll(".analysis-dropzone-area").forEach((zone) => {
    zone.classList.add("analysis-dropzone-highlight");
  });
}

function handleAnalysisThDragEnd(event) {
  event.currentTarget.classList.remove("analysis-th-dragging");
  analysisState.draggedColKey = null;
  analysisState.draggedColLabel = null;
  document.querySelectorAll(".analysis-dropzone-area").forEach((zone) => {
    zone.classList.remove("analysis-dropzone-highlight", "analysis-dropzone-over");
  });
}

function handleAnalysisDropzoneDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  event.currentTarget.classList.add("analysis-dropzone-over");
}

function handleAnalysisDropzoneDragLeave(event) {
  event.currentTarget.classList.remove("analysis-dropzone-over");
}

function handleAnalysisDropzoneDrop(event, role) {
  event.preventDefault();
  event.currentTarget.classList.remove("analysis-dropzone-over", "analysis-dropzone-highlight");

  const key = event.dataTransfer.getData("text/plain") || analysisState.draggedColKey;
  if (!key) return;

  const col = analysisState.columns.find((c) => c.key === key);
  if (!col) return;

  if (role === "treatment") {
    analysisState.treatmentColumn = { key: col.key, label: col.label };
    renderDropzoneChip("analysisTreatmentArea", col.label, "treatment");
  } else if (role === "value") {
    analysisState.valueColumn = { key: col.key, label: col.label };
    renderDropzoneChip("analysisValueArea", col.label, "value");
  }

  updateAnalyzeButtonState();
}

function renderDropzoneChip(zoneId, label, role) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;
  zone.innerHTML = `
    <div class="analysis-dropzone-chip">
      <span>${escapeHtml(label)}</span>
      <button type="button" class="analysis-dropzone-chip-remove" onclick="removeAnalysisDropzoneChip('${role}')">
        <span class="material-symbols-rounded" style="font-size:.85rem">close</span>
      </button>
    </div>
  `;
}

function removeAnalysisDropzoneChip(role) {
  if (role === "treatment") {
    analysisState.treatmentColumn = null;
    const zone = document.getElementById("analysisTreatmentArea");
    if (zone) zone.innerHTML = '<span class="analysis-dropzone-placeholder">Drag a column header here</span>';
  } else if (role === "value") {
    analysisState.valueColumn = null;
    const zone = document.getElementById("analysisValueArea");
    if (zone) zone.innerHTML = '<span class="analysis-dropzone-placeholder">Drag a column header here</span>';
  }
  updateAnalyzeButtonState();
}

function updateAnalyzeButtonState() {
  const btn = document.getElementById("analysisRunBtn");
  if (!btn) return;
  btn.disabled = !(analysisState.treatmentColumn && analysisState.valueColumn);
}

/* ----------  ANOVA CRD (1 Factor) Computation  ---------- */

/**
 * Compute one-way ANOVA for a Completely Randomized Design.
 * @param {Object[]} data   – array of { treatment, value } (value is numeric)
 * @returns {{ groups, k, N, grandMean, SST, SSE, SSTotal, dfTreat, dfError, dfTotal, MST, MSE, F, pValue }}
 */
function computeAnovaCRD(data) {
  // Group by treatment
  const groupMap = new Map();
  data.forEach(({ treatment, value }) => {
    if (!groupMap.has(treatment)) groupMap.set(treatment, []);
    groupMap.get(treatment).push(value);
  });

  const groups = [...groupMap.entries()].map(([name, values]) => ({
    name,
    values,
    n: values.length,
    mean: values.reduce((s, v) => s + v, 0) / values.length,
  }));

  const k = groups.length;
  const N = data.length;
  const grandMean = data.reduce((s, d) => s + d.value, 0) / N;

  // Sum of Squares – Treatment
  const SST = groups.reduce((s, g) => s + g.n * Math.pow(g.mean - grandMean, 2), 0);
  // Sum of Squares – Error
  const SSE = groups.reduce(
    (s, g) => s + g.values.reduce((ss, v) => ss + Math.pow(v - g.mean, 2), 0),
    0,
  );
  const SSTotal = SST + SSE;

  const dfTreat = k - 1;
  const dfError = N - k;
  const dfTotal = N - 1;

  const MST = dfTreat > 0 ? SST / dfTreat : 0;
  const MSE = dfError > 0 ? SSE / dfError : 0;
  const F = MSE > 0 ? MST / MSE : 0;

  // P-value from F-distribution (upper tail)
  const pValue = dfTreat > 0 && dfError > 0 ? 1 - fDistCDF(F, dfTreat, dfError) : NaN;

  return { groups, k, N, grandMean, SST, SSE, SSTotal, dfTreat, dfError, dfTotal, MST, MSE, F, pValue };
}

/* ----------  F-Distribution CDF (approximation)  ---------- */

/**
 * Regularised incomplete beta function via continued-fraction (Lentz).
 */
function betaCF(a, b, x) {
  const maxIter = 200;
  const eps = 1e-14;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    // even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    // odd step
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function lnGamma(z) {
  // Lanczos approximation
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularisedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaCF(a, b, x)) / a;
  } else {
    return 1 - (front * betaCF(b, a, 1 - x)) / b;
  }
}

/**
 * CDF of the F-distribution at value x with df1 and df2.
 */
function fDistCDF(x, df1, df2) {
  if (x <= 0) return 0;
  const u = (df1 * x) / (df1 * x + df2);
  return regularisedBeta(u, df1 / 2, df2 / 2);
}

/* ----------  Run Analysis  ---------- */

function runAnalysis() {
  if (!analysisState.treatmentColumn || !analysisState.valueColumn) {
    if (typeof showToast === "function") showToast("Please assign both Treatment and Value columns.", "error");
    return;
  }

  const filteredRows = applyAnalysisSort(applyAnalysisFilters(analysisState.rows));

  const treatKey = analysisState.treatmentColumn.key;
  const valKey = analysisState.valueColumn.key;

  // Build cleaned data: skip blanks / non-numeric values
  const data = [];
  let skippedCount = 0;
  filteredRows.forEach((row) => {
    const treatment = String(row[treatKey] ?? "").trim();
    const rawVal = row[valKey];
    const num = Number(rawVal);
    if (!treatment || rawVal === "" || rawVal == null || isNaN(num)) {
      skippedCount++;
      return;
    }
    data.push({ treatment, value: num });
  });

  if (data.length < 3) {
    if (typeof showToast === "function") showToast("Not enough valid numeric data for ANOVA.", "error");
    return;
  }

  const groups = new Map();
  data.forEach((d) => {
    if (!groups.has(d.treatment)) groups.set(d.treatment, []);
    groups.get(d.treatment).push(d.value);
  });

  if (groups.size < 2) {
    if (typeof showToast === "function") showToast("At least 2 treatment groups are required.", "error");
    return;
  }

  const result = computeAnovaCRD(data);
  renderAnalysisResults(result, skippedCount);
}

/* ----------  Render Results (Minitab-style)  ---------- */

function formatNum(n, dec = 4) {
  if (n == null || isNaN(n)) return "-";
  return Number(n).toFixed(dec);
}

function renderAnalysisResults(result, skippedCount) {
  const body = document.getElementById("analysisResultsBody");
  if (!body) return;

  const treatLabel = analysisState.treatmentColumn?.label || "Treatment";
  const valLabel = analysisState.valueColumn?.label || "Value";

  const sig = result.pValue < 0.001 ? "***" : result.pValue < 0.01 ? "**" : result.pValue < 0.05 ? "*" : "ns";

  body.innerHTML = `
    <div class="analysis-result-block">
      <div class="analysis-result-title">One-way ANOVA: ${escapeHtml(valLabel)} versus ${escapeHtml(treatLabel)}</div>
      <div class="analysis-result-subtitle">Method: Completely Randomized Design &nbsp;|&nbsp; Factor: 1 &nbsp;|&nbsp; Significance: ${sig}</div>

      <table class="analysis-anova-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>DF</th>
            <th>SS</th>
            <th>MS</th>
            <th>F-Value</th>
            <th>P-Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(treatLabel)}</td>
            <td>${result.dfTreat}</td>
            <td>${formatNum(result.SST, 4)}</td>
            <td>${formatNum(result.MST, 4)}</td>
            <td>${formatNum(result.F, 4)}</td>
            <td>${formatNum(result.pValue, 6)}</td>
          </tr>
          <tr>
            <td>Error</td>
            <td>${result.dfError}</td>
            <td>${formatNum(result.SSE, 4)}</td>
            <td>${formatNum(result.MSE, 4)}</td>
            <td></td>
            <td></td>
          </tr>
          <tr class="analysis-anova-total-row">
            <td>Total</td>
            <td>${result.dfTotal}</td>
            <td>${formatNum(result.SSTotal, 4)}</td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div class="analysis-result-subtitle" style="margin-top:1rem">Model Summary</div>
      <table class="analysis-anova-table analysis-summary-table">
        <thead>
          <tr><th>S</th><th>R-sq</th><th>R-sq (adj)</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${formatNum(Math.sqrt(result.MSE), 4)}</td>
            <td>${formatNum(result.SSTotal > 0 ? (result.SST / result.SSTotal) * 100 : 0, 2)}%</td>
            <td>${formatNum(result.SSTotal > 0 && result.dfTotal > 0 ? (1 - (result.SSE / result.dfError) / (result.SSTotal / result.dfTotal)) * 100 : 0, 2)}%</td>
          </tr>
        </tbody>
      </table>

      <div class="analysis-result-subtitle" style="margin-top:1rem">Means</div>
      <table class="analysis-anova-table analysis-means-table">
        <thead>
          <tr><th>${escapeHtml(treatLabel)}</th><th>N</th><th>Mean</th><th>StDev</th></tr>
        </thead>
        <tbody>
          ${result.groups
            .map((g) => {
              const stdev = g.n > 1 ? Math.sqrt(g.values.reduce((s, v) => s + Math.pow(v - g.mean, 2), 0) / (g.n - 1)) : 0;
              return `<tr><td>${escapeHtml(g.name)}</td><td>${g.n}</td><td>${formatNum(g.mean, 4)}</td><td>${formatNum(stdev, 4)}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>

      ${skippedCount > 0 ? `<div class="analysis-result-note">Note: ${skippedCount} rows were excluded (blank or non-numeric value).</div>` : ""}
    </div>
  `;

  // Scroll results into view
  const resultsSection = document.getElementById("analysisResults");
  if (resultsSection) resultsSection.scrollTop = 0;
}
