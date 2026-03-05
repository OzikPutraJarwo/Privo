// Trial Management
let trialState = {
  trials: [],
  editingTrialId: null,
  currentAreas: [],
  isDrawing: false,
  currentPolygon: null,
  currentSection: "basic", // Track current section
};

let trialMapInstance = null;
let trialDrawnLayers = [];
let trialCurrentDrawing = null;

// Initialize trial module
async function initializeTrials(options = {}) {
  const onProgress = options.onProgress;
  let hasCache = false;

  try {
    const cached = typeof loadLocalCache === "function"
      ? loadLocalCache("trials")
      : null;

    if (cached?.trials) {
      trialState.trials = cached.trials;
      hasCache = true;

      renderTrials();

      if (onProgress) {
        onProgress(0.2, "Loaded trials from device");
      }
    }

    // Load trials from Google Drive (in background via sync queue) — skip for guest
    const isGuest = typeof getCurrentUser === 'function' && getCurrentUser()?.isGuest;
    if (!isGuest) {
      if (typeof enqueueSync === 'function') {
        enqueueSync({
          label: 'Load Trials',
          run: async () => {
            trialState.trials = await loadTrialsFromGoogleDrive();
            renderTrials();

            if (typeof saveLocalCache === "function") {
              saveLocalCache("trials", { trials: trialState.trials });
            }

            if (onProgress) {
              onProgress(1, "Trials synced");
            }
          }
        });
      } else {
        trialState.trials = await loadTrialsFromGoogleDrive();
        renderTrials();

        if (typeof saveLocalCache === "function") {
          saveLocalCache("trials", { trials: trialState.trials });
        }

        if (onProgress) {
          onProgress(1, "Trials synced");
        }
      }
    }
  } catch (error) {
    console.error("Error initializing trials:", error);
    if (!hasCache) {
      showToast("Error loading trials data. Please refresh the page.", "error");
    }
  }
}

// Render trials list
function renderTrials() {
  const activeContainer = document.getElementById("trialList");
  const archivedContainer = document.getElementById("archivedTrialList");
  const archivedPanel = document.getElementById("archivedTrialManagementPanel");
  
  // Separate active and archived trials
  const activeTrials = trialState.trials.filter(t => !t.archived);
  const archivedTrials = trialState.trials.filter(t => t.archived);

  const renderTrialCard = (trial) => {
    const progress = calculateCombinedTrialProgress(trial);
    const progressPercent = progress.percentage;
    const hasLayout = trial.areas && trial.areas.length > 0 && trial.areas.some(a => a.layout?.result);

    return `
      <div class="run-trial-card" data-trial-id="${trial.id}" onclick="showTrialActionPopup(event, '${trial.id}')">
        <div class="run-trial-card-header">
          <div class="run-trial-card-icon">
            <svg class="progress-circle" width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" class="progress-circle-bg"></circle>
              <circle cx="32" cy="32" r="28" class="progress-circle-fill"
                      style="stroke-dasharray: ${progressPercent * 1.75} 175; stroke: ${getProgressGradientColor(progressPercent)}"></circle>
              <text x="32" y="37" class="progress-circle-text" text-anchor="middle">${progressPercent}%</text>
            </svg>
          </div>
          <div class="run-trial-card-body">
            <div class="run-trial-card-title">${escapeHtml(trial.name)}</div>
            <div class="run-trial-card-meta">${escapeHtml(trial.cropName || "")}${trial.trialType ? " · " + escapeHtml(trial.trialType) : ""}${!hasLayout ? ' · <span style="color:var(--text-tertiary);font-size:0.75rem;">No layout</span>' : ""}</div>
          </div>
        </div>
      </div>
    `;
  };

  const renderArchivedTrialCard = (trial) => {
    const progress = calculateCombinedTrialProgress(trial);
    const progressPercent = progress.percentage;

    return `
      <div class="run-trial-card trial-card-archived" data-trial-id="${trial.id}" onclick="showTrialActionPopup(event, '${trial.id}')">
        <div class="run-trial-card-header">
          <div class="run-trial-card-icon">
            <svg class="progress-circle" width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" class="progress-circle-bg"></circle>
              <circle cx="32" cy="32" r="28" class="progress-circle-fill"
                      style="stroke-dasharray: ${progressPercent * 1.75} 175; stroke: ${getProgressGradientColor(progressPercent)}"></circle>
              <text x="32" y="37" class="progress-circle-text" text-anchor="middle">${progressPercent}%</text>
            </svg>
          </div>
          <div class="run-trial-card-body">
            <div class="run-trial-card-title">${escapeHtml(trial.name)}</div>
            <div class="run-trial-card-meta">${escapeHtml(trial.cropName || "")}${trial.trialType ? " · " + escapeHtml(trial.trialType) : ""} · <span style="color:var(--text-tertiary);font-size:0.75rem;">Archived</span></div>
          </div>
        </div>
      </div>
    `;
  };

  if (activeTrials.length === 0 && archivedTrials.length === 0) {
    activeContainer.innerHTML = `
      <div class="empty-state run-empty-grid" style="grid-column: 1/-1;">
        <span class="material-symbols-rounded">science</span>
        <p>No trials yet. Create your first trial to get started.</p>
      </div>
    `;
    if (archivedPanel) archivedPanel.style.display = "none";
    return;
  }

  // Render active trials
  if (activeTrials.length > 0) {
    activeContainer.innerHTML = activeTrials.map(renderTrialCard).join("");
  } else {
    activeContainer.innerHTML = `
      <div class="empty-state run-empty-grid" style="grid-column: 1/-1;">
        <span class="material-symbols-rounded">science</span>
        <p>No active trials. Create your first trial to get started.</p>
      </div>
    `;
  }

  // Render archived trials
  if (archivedTrials.length > 0) {
    if (archivedPanel) archivedPanel.style.display = "block";
    archivedContainer.innerHTML = archivedTrials.map(renderArchivedTrialCard).join("");
  } else {
    if (archivedPanel) archivedPanel.style.display = "none";
  }

  // Keep dashboard in sync
  renderDashboardTrialProgress();
  if (typeof refreshReminderViewsRealtime === "function") {
    refreshReminderViewsRealtime();
  }

  const databaseContent = document.getElementById("databaseContent");
  if (
    databaseContent?.classList.contains("active") &&
    typeof renderDatabaseTable === "function"
  ) {
    renderDatabaseTable();
  }
}

// Format month-year for display
function formatMonthYear(dateString) {
  if (!dateString) return "-";
  const [year, month] = dateString.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(month) - 1]} ${year}`;
}

function getAreaPlantingDate(trial, areaIndex) {
  const area = trial?.areas?.[areaIndex];
  return (
    area?.plantingDate ||
    area?.layout?.plantingDate ||
    trial?.plantingDate ||
    ""
  );
}

function getTrialPlantingDates(trial) {
  const areas = trial?.areas || [];
  const dates = areas
    .map((_, areaIndex) => getAreaPlantingDate(trial, areaIndex))
    .filter(Boolean);
  if (dates.length > 0) {
    return Array.from(new Set(dates)).sort();
  }
  return trial?.plantingDate ? [trial.plantingDate] : [];
}

function getTrialPrimaryPlantingDate(trial) {
  const dates = getTrialPlantingDates(trial);
  return dates.length > 0 ? dates[0] : "";
}

function getTrialPlantingDateSummary(trial) {
  const dates = getTrialPlantingDates(trial);
  if (dates.length === 0) return "–";
  if (dates.length === 1) {
    return new Date(`${dates[0]}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  const first = new Date(`${dates[0]}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const last = new Date(`${dates[dates.length - 1]}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${first} – ${last}`;
}

// Toggle archived trials visibility
function toggleArchivedTrials() {
  const archivedPanel = document.getElementById("archivedTrialManagementPanel");
  const archivedList = document.getElementById("archivedTrialList");
  const toggleHead = document.querySelector(".inventory-header.archived-header");
  const toggle = document.querySelector(".archived-header-toggle");
  
  if (!archivedPanel) return;
  
  archivedList.classList.toggle("collapsed");
  toggleHead.classList.toggle("collapsed");
  toggle.classList.toggle("collapsed");
}

// Open add trial modal
function openAddTrialModal() {
  trialState.editingTrialId = null;
  trialState.currentAreas = [];
  trialState.currentSection = "basic";
  document.getElementById("trialForm").reset();

  // Show first section
  showTrialSection("basic");

  // Populate crops from inventory
  populateTrialCrops();

  // Populate locations
  populateTrialLocations();

  // Populate parameters
  populateTrialParameters();

  // Reset agronomy monitoring
  const agronomyCheckbox = document.getElementById('trialAgronomyMonitoring');
  if (agronomyCheckbox) agronomyCheckbox.checked = false;
  const agronomyContainer = document.getElementById('agronomyPickerContainer');
  if (agronomyContainer) agronomyContainer.classList.add('hidden');
  trialState.selectedAgronomyOrder = [];

  // Setup pollination → trial type cascade
  setupPollinationTrialTypeCascade();
  updateTrialTypeOptions();
  updatePlotSpecVisibility();

  // Setup calculation listeners and reset calculated fields
  setupTrialGeneralCalculations();

  // Setup factors/treatments fields
  setupTrialFactorsAndTreatments();
  renderTrialTreatmentsInputs(1, []);

  // Setup agronomy monitoring listeners
  setupAgronomyMonitoringListeners();

  // Reset areas list
  document.getElementById("areasList").classList.add("hidden");
  document.getElementById("areasListContainer").innerHTML = "";

  // Setup section nav click handlers
  setupSectionNavHandlers();

  toggleTrialEditor(true);
  document.getElementById("trialName").focus();
}

// Setup section navigation click handlers
function setupSectionNavHandlers() {
  document.querySelectorAll(".section-nav-item").forEach((item) => {
    item.onclick = () => {
      const targetSection = item.dataset.section;
      if (targetSection === "plotspec" && !canAccessPlotSpecSection()) {
        showToast("Please select type of pollination and trial type first", "error");
        return;
      }
      // Only allow navigation to completed or current section
      // For now, allow free navigation during development
      showTrialSection(targetSection);
    };
  });
}

// Open edit trial modal
function openEditTrialModal(trialId) {
  trialState.editingTrialId = trialId;
  trialState.currentSection = "basic";
  const trial = trialState.trials.find((t) => t.id === trialId);

  if (!trial) return;
  document.getElementById("trialName").value = trial.name;
  document.getElementById("trialDescription").value = trial.description || "";
  document.getElementById("trialPlantingStart").value =
    trial.plantingStart || "";
  document.getElementById("trialPlantingEnd").value = trial.plantingEnd || "";
  document.getElementById("trialPlantingSeason").value = trial.plantingSeason || "";

  // Set pollination first so trial type options get populated
  document.getElementById("trialPollination").value = trial.pollination || "";
  updateTrialTypeOptions();
  document.getElementById("trialType").value = trial.trialType || "";
  updatePlotSpecVisibility();

  document.getElementById("trialExpDesign").value = trial.expDesign || "";
  const factorCount = normalizeTrialFactorsCount(trial.trialFactors);
  document.getElementById("trialFactors").value = String(factorCount);
  renderTrialTreatmentsInputs(factorCount, normalizeTrialFactorDefinitions(trial));

  // Restore Parent Test / Process Research fields
  document.getElementById("trialRowsPerPlot").value = trial.rowsPerPlot ?? "";
  document.getElementById("trialPlotLength").value = trial.plotLength ?? "";
  document.getElementById("trialPlantSpacingWidth").value = trial.plantSpacingWidth ?? "";
  document.getElementById("trialPlantSpacingHeight").value = trial.plantSpacingHeight ?? "";

  // Restore Micropilot fields
  document.getElementById("trialMpPanel").value = trial.mpPanel ?? "";
  document.getElementById("trialRatioFemale").value = trial.ratioFemale ?? "";
  document.getElementById("trialRatioMale").value = trial.ratioMale ?? "";
  document.getElementById("trialMpFemaleLineNames").value = trial.mpFemaleLineNames || "";
  document.getElementById("trialMpMaleLineNames").value = trial.mpMaleLineNames || "";
  document.getElementById("trialMpPlotLength").value = trial.mpPlotLength ?? "";
  document.getElementById("trialMpSpacingWidth").value = trial.mpSpacingWidth ?? "";
  document.getElementById("trialMpSpacingHeight").value = trial.mpSpacingHeight ?? "";

  // Populate dropdowns
  populateTrialCrops();
  document.getElementById("trialCrops").value = trial.cropId || "";

  populateTrialLocations();
  const trialLocationSelect = document.getElementById("trialLocation");
  if (trialLocationSelect) trialLocationSelect.value = trial.locationId || "";

  populateTrialParameters(trial.parameters);

  // Restore agronomy monitoring
  const agronomyCheckbox = document.getElementById('trialAgronomyMonitoring');
  const agronomyContainer = document.getElementById('agronomyPickerContainer');
  if (trial.agronomyMonitoring && agronomyCheckbox) {
    agronomyCheckbox.checked = true;
    if (agronomyContainer) agronomyContainer.classList.remove('hidden');
    trialState.selectedAgronomyOrder = Array.isArray(trial.agronomyItems) ? [...trial.agronomyItems] : [];
    populateTrialAgronomy(trialState.selectedAgronomyOrder);
  } else {
    if (agronomyCheckbox) agronomyCheckbox.checked = false;
    if (agronomyContainer) agronomyContainer.classList.add('hidden');
    trialState.selectedAgronomyOrder = [];
  }

  // Setup pollination → trial type cascade
  setupPollinationTrialTypeCascade();

  // Setup calculation listeners and refresh calculated fields
  setupTrialGeneralCalculations();

  // Setup factors/treatments listeners
  setupTrialFactorsAndTreatments();

  // Setup agronomy monitoring listeners
  setupAgronomyMonitoringListeners();

  // Load areas
  trialState.currentAreas = trial.areas || [];
  if (trial.plantingDate && trialState.currentAreas.length > 0) {
    trialState.currentAreas = trialState.currentAreas.map((area) => ({
      ...area,
      plantingDate: area?.plantingDate || area?.layout?.plantingDate || trial.plantingDate,
    }));
  }

  // Show first section
  showTrialSection("basic");

  // Setup section nav click handlers
  setupSectionNavHandlers();

  toggleTrialEditor(true);
  document.getElementById("trialName").focus();
}

// Close trial modal
function closeTrialModal() {
  toggleTrialEditor(false);
  trialState.editingTrialId = null;
  trialState.currentAreas = [];
  trialState.isDrawing = false;
  trialState.currentPolygon = null;
  trialState.currentSection = "basic";
  destroyTrialMap();
}

function toggleTrialEditor(show) {
  const editor = document.getElementById("trialEditor");
  const panel = document.getElementById("trialManagementPanel");
  const archive = document.getElementById("archivedTrialManagementPanel");
  if (!editor || !panel) return;

  if (show) {
    editor.classList.add("active");
    panel.classList.add("hidden");
    if (archive) archive.classList.add("hidden");
    enterTrialFullscreenMode({
      title: trialState.editingTrialId ? "Edit Trial" : "Create Trial",
      onClose: closeTrialModal,
    });
  } else {
    editor.classList.remove("active");
    panel.classList.remove("hidden");
    if (archive) archive.classList.remove("hidden");
    exitTrialFullscreenMode();
  }
}

let trialFullscreenState = {
  active: false,
  previousPageTitle: "Trial",
  previousMenuHtml: '<span class="material-symbols-rounded">menu</span>',
  previousMenuOnclick: null,
  previousDisplays: {},
};

function enterTrialFullscreenMode({ title, onClose }) {
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");

  const managedIds = [
    "syncDownBtn",
    "syncStatusBtn",
    "runTrialNavBtn",
    "runTrialSaveBtn",
    "trialReportSheetSelect",
    "trialReportTopbarDownloadBtn",
    "databaseSeasonFilter",
    "databaseYearFilter",
    "databaseLocationFilter",
    "databaseExportBtn",
    "userMenu",
  ];

  trialFullscreenState.previousDisplays = {};
  managedIds.forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    trialFullscreenState.previousDisplays[id] = element.style.display;
    element.style.display = "none";
  });

  trialFullscreenState.previousPageTitle = pageTitle?.textContent || "Trial";
  if (menuToggle) {
    trialFullscreenState.previousMenuHtml = menuToggle.innerHTML;
    trialFullscreenState.previousMenuOnclick = menuToggle.onclick;
  }

  if (topbar) topbar.classList.add("run-trial-mode");
  if (pageTitle) pageTitle.textContent = title || "Trial";
  if (menuToggle) {
    menuToggle.innerHTML = '<span class="material-symbols-rounded">close</span>';
    menuToggle.onclick = onClose;
  }

  document.body.classList.add("trial-fullscreen-active", "sidebar-collapsed");
  trialFullscreenState.active = true;
}

function exitTrialFullscreenMode() {
  if (!trialFullscreenState.active) return;

  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");

  if (topbar) topbar.classList.remove("run-trial-mode");
  if (pageTitle) pageTitle.textContent = trialFullscreenState.previousPageTitle || "Trial";
  if (menuToggle) {
    menuToggle.innerHTML = trialFullscreenState.previousMenuHtml || '<span class="material-symbols-rounded">menu</span>';
    menuToggle.onclick = trialFullscreenState.previousMenuOnclick || null;
  }

  Object.entries(trialFullscreenState.previousDisplays || {}).forEach(([id, display]) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.style.display = display || "";
  });

  document.body.classList.remove("trial-fullscreen-active", "sidebar-collapsed");
  trialFullscreenState.active = false;
}

function switchTrialTab(tabName) {
  // In the unified view, 'run' simply means initialize run trial (which will be triggered from modal)
  if (tabName === "run") {
    initializeRunTrial();
  }
}

function getTrialEditorSections() {
  return ["basic", "experiment", "plotspec", "observation", "field", "layouting"];
}

function canAccessPlotSpecSection() {
  const pollination = document.getElementById("trialPollination")?.value || "";
  const trialType = document.getElementById("trialType")?.value || "";
  return Boolean(pollination && trialType);
}

function updatePlotSpecSectionAccessState() {
  const navItem = document.querySelector('.section-nav-item[data-section="plotspec"]');
  if (!navItem) return;
  navItem.classList.toggle("disabled", !canAccessPlotSpecSection());
}

// Show trial section
function showTrialSection(sectionName) {
  trialState.currentSection = sectionName;

  // Hide all sections
  document.querySelectorAll(".trial-section").forEach((sec) => {
    sec.classList.remove("active");
  });

  // Show selected section
  const sectionMap = {
    basic: "trialSectionBasic",
    experiment: "trialSectionExperiment",
    plotspec: "trialSectionPlotSpec",
    observation: "trialSectionObservation",
    field: "trialSectionField",
    layouting: "trialSectionLayouting",
  };

  const sectionId = sectionMap[sectionName];
  if (sectionId) {
    document.getElementById(sectionId).classList.add("active");
  }

  const scrollContainer = document.querySelector(
    "#trialEditor .modal-body-scrollable",
  );
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }

  // Update navigation
  document.querySelectorAll(".section-nav-item").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.section === sectionName) {
      item.classList.add("active");
    }
  });

  // Update buttons
  const prevBtn = document.getElementById("trialPrevBtn");
  const nextBtn = document.getElementById("trialNextBtn");
  const saveBtn = document.getElementById("trialModalSaveBtn");
  const sections = getTrialEditorSections();
  const isFirstSection = sectionName === sections[0];
  const isLastSection = sectionName === sections[sections.length - 1];

  if (isFirstSection) {
    prevBtn.classList.add("hidden");
    nextBtn.classList.remove("hidden");
    saveBtn.classList.add("hidden");
  } else if (isLastSection) {
    prevBtn.classList.remove("hidden");
    nextBtn.classList.add("hidden");
    saveBtn.classList.remove("hidden");
  } else {
    prevBtn.classList.remove("hidden");
    nextBtn.classList.remove("hidden");
    saveBtn.classList.add("hidden");
  }

  if (sectionName === "field") {
    const trial = trialState.editingTrialId
      ? trialState.trials.find((t) => t.id === trialState.editingTrialId)
      : null;

    // Ensure map exists for location section
    if (!trialMapInstance) {
      initializeTrialMap(trial?.locationCoordinates);
    }

    // Re-sync area layers every time entering location section
    if (trialMapInstance) {
      trialDrawnLayers.forEach((entry) => {
        if (entry?.layer && trialMapInstance.hasLayer(entry.layer)) {
          trialMapInstance.removeLayer(entry.layer);
        }
      });
      trialDrawnLayers = [];

      if (trialState.currentPolygon?.polygon && trialMapInstance.hasLayer(trialState.currentPolygon.polygon)) {
        trialMapInstance.removeLayer(trialState.currentPolygon.polygon);
      }
      trialState.currentPolygon = null;

      if (trialState.currentAreas.length > 0) {
        trialState.currentAreas.forEach((area, index) => {
          drawSavedArea(area, index);
        });
      }
    }

    // Always rebuild area list + preview maps when entering location section
    renderAreasList();

    // Ensure both main map and preview maps layout correctly after section becomes visible
    setTimeout(() => {
      if (trialMapInstance) trialMapInstance.invalidateSize();
      invalidateAllPreviewMaps();
    }, 100);
  } else if (sectionName === "layouting") {
    initializeLayoutingSection();
  } else if (sectionName === "plotspec") {
    if (!canAccessPlotSpecSection()) {
      showToast("Please select type of pollination and trial type first", "error");
      showTrialSection("experiment");
      return;
    }
    updatePlotSpecVisibility();
  }
}

// Navigate to next section
function nextTrialSection() {
  const sections = getTrialEditorSections();
  const currentIndex = sections.indexOf(trialState.currentSection);

  // Validate current section
  if (trialState.currentSection === "basic" && !validateBasicSection()) return;
  if (trialState.currentSection === "experiment" && !validateExperimentSection()) return;
  if (trialState.currentSection === "observation" && !validateObservationSection()) return;
  if (trialState.currentSection === "field" && !validateLocationSection()) return;

  if (currentIndex < sections.length - 1) {
    showTrialSection(sections[currentIndex + 1]);
  }
}

// Navigate to previous section
function prevTrialSection() {
  const sections = getTrialEditorSections();
  const currentIndex = sections.indexOf(trialState.currentSection);

  if (currentIndex > 0) {
    showTrialSection(sections[currentIndex - 1]);
  }
}

function validateBasicSection() {
  const name = document.getElementById("trialName").value.trim();
  const plantingStart = document.getElementById("trialPlantingStart").value;
  const plantingEnd = document.getElementById("trialPlantingEnd").value;
  const cropId = document.getElementById("trialCrops").value;
  const plantingSeason = document.getElementById("trialPlantingSeason").value;

  if (!name) {
    showToast("Please enter trial name", "error");
    return false;
  }
  if (!plantingStart || !plantingEnd) {
    showToast("Please enter planting window dates", "error");
    return false;
  }
  if (!cropId) {
    showToast("Please select crop", "error");
    return false;
  }
  if (!plantingSeason) {
    showToast("Please select planting season", "error");
    return false;
  }

  return true;
}

function validateExperimentSection() {
  const pollination = document.getElementById("trialPollination").value;
  const trialType = document.getElementById("trialType").value;
  const factorCount = normalizeTrialFactorsCount(document.getElementById("trialFactors").value);
  const factorDefinitions = getTrialTreatmentsFromForm();

  if (!pollination) {
    showToast("Please select type of pollination", "error");
    return false;
  }
  if (!trialType) {
    showToast("Please select trial type", "error");
    return false;
  }
  if (!Number.isFinite(factorCount) || factorCount < 1) {
    showToast("No. of Factors must be at least 1", "error");
    return false;
  }
  if (factorDefinitions.length !== factorCount) {
    showToast(`Please fill ${factorCount} factor(s)`, "error");
    return false;
  }

  const invalidIndex = factorDefinitions.findIndex((factor) => {
    return !factor.name || !Array.isArray(factor.treatments) || factor.treatments.length === 0;
  });
  if (invalidIndex >= 0) {
    showToast(`Please complete Factor ${invalidIndex + 1} name and treatments`, "error");
    return false;
  }
  return true;
}

function validateObservationSection() {
  const selectedParams = getSelectedParameterIds().length;
  if (selectedParams === 0) {
    showToast("Please select at least one observation parameter", "error");
    return false;
  }

  return true;
}

function normalizeTrialFactorsCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  const parsed = parseInt(String(value || "").trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }

  const legacy = String(value || "").trim().toLowerCase();
  if (legacy === "single") return 1;
  if (legacy === "factorial") return 2;
  return 1;
}

function setupTrialFactorsAndTreatments() {
  const factorsInput = document.getElementById("trialFactors");
  if (!factorsInput) return;

  factorsInput.removeEventListener("input", factorsInput._treatmentSyncHandler);
  factorsInput._treatmentSyncHandler = () => {
    const count = normalizeTrialFactorsCount(factorsInput.value);
    if (String(count) !== String(factorsInput.value || "")) {
      factorsInput.value = String(count);
    }
    const current = getTrialTreatmentsFromForm();
    renderTrialTreatmentsInputs(count, current);
  };
  factorsInput.addEventListener("input", factorsInput._treatmentSyncHandler);
}

function normalizeTrialFactorDefinitions(trial) {
  const count = normalizeTrialFactorsCount(trial?.trialFactors);
  const normalized = [];

  if (Array.isArray(trial?.factorDefinitions) && trial.factorDefinitions.length > 0) {
    for (let index = 0; index < count; index += 1) {
      const item = trial.factorDefinitions[index] || {};
      const name = String(item.name || "").trim();
      const treatments = Array.isArray(item.treatments)
        ? item.treatments.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      normalized.push({ name, treatments });
    }
    return normalized;
  }

  const legacy = Array.isArray(trial?.treatments) ? trial.treatments : [];
  for (let index = 0; index < count; index += 1) {
    normalized.push({
      name: String(legacy[index] || "").trim(),
      treatments: [],
    });
  }
  return normalized;
}

function parseFactorTreatmentsText(value) {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderTrialTreatmentsInputs(factorCount, factorDefinitions = []) {
  const container = document.getElementById("trialTreatmentsContainer");
  if (!container) return;

  const count = normalizeTrialFactorsCount(factorCount);
  const values = Array.from({ length: count }, (_, index) => {
    const source = factorDefinitions[index] || {};
    const factorName = typeof source === "string"
      ? String(source || "").trim()
      : String(source.name || "").trim();
    const treatments = Array.isArray(source.treatments)
      ? source.treatments.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    return { name: factorName, treatments };
  });

  container.innerHTML = values
    .map(
      (value, index) => `
        <div class="form-group" style="margin:0 0 1rem 0; padding:0.75rem; border:1px solid var(--border); border-radius:10px;">
          <label for="trialFactorName_${index + 1}">Factor ${index + 1} Name</label>
          <input
            type="text"
            id="trialFactorName_${index + 1}"
            class="trial-factor-name-input"
            data-index="${index}"
            placeholder="e.g., Line / Planting Space"
            value="${escapeHtml(value.name)}"
          >
          <label for="trialFactorTreatments_${index + 1}" style="margin-top:0.5rem;">Treatments for Factor ${index + 1}</label>
          <textarea
            id="trialFactorTreatments_${index + 1}"
            class="trial-factor-treatments-input"
            data-index="${index}"
            rows="3"
            placeholder="One per line or separated by comma"
          >${escapeHtml(value.treatments.join("\n"))}</textarea>
        </div>
      `,
    )
    .join("");
}

function getTrialTreatmentsFromForm() {
  const factorNames = Array.from(document.querySelectorAll("#trialTreatmentsContainer .trial-factor-name-input"));
  const factorTreatments = Array.from(document.querySelectorAll("#trialTreatmentsContainer .trial-factor-treatments-input"));

  return factorNames.map((nameInput, index) => {
    const treatmentsInput = factorTreatments[index];
    return {
      name: String(nameInput?.value || "").trim(),
      treatments: parseFactorTreatmentsText(treatmentsInput?.value || ""),
    };
  });
}

// Validate location section
function validateLocationSection() {
  const locationEl = document.getElementById("trialLocation");
  const locationId = locationEl ? locationEl.value : null;

  if (locationEl && !locationId) {
    showToast("Please select location", "error");
    return false;
  }
  if (trialState.currentAreas.length === 0) {
    showToast("Please draw at least one trial area", "error");
    return false;
  }

  return true;
}

// Populate crop types dropdown
function populateTrialCrops() {
  const select = document.getElementById("trialCrops");
  const crops = inventoryState.items.crops || [];

  select.innerHTML =
    '<option value="">Select crop</option>' +
    crops
      .map(
        (crop) =>
          `<option value="${crop.id}" data-name="${escapeHtml(crop.name)}">${escapeHtml(crop.name)}</option>`,
      )
      .join("");
}

// Populate locations dropdown
function populateTrialLocations() {
  const select = document.getElementById("trialLocation");
  if (!select) return; // Skip if element doesn't exist (removed from HTML)
  
  const locations = inventoryState.items.locations || [];

  select.innerHTML =
    '<option value="">Select location for drawing area</option>' +
    locations
      .map(
        (loc) =>
          `<option value="${loc.id}" data-coords="${escapeHtml(loc.coordinates)}">${escapeHtml(loc.name)}</option>`,
      )
      .join("");

  // Add change listener to navigate map to location
  select.removeEventListener("change", handleLocationChange);
  select.addEventListener("change", handleLocationChange);
}

// Handle location change
function handleLocationChange(e) {
  const select = e.target;
  const selectedOption = select.options[select.selectedIndex];
  const coords = selectedOption.dataset.coords;

  if (coords && trialMapInstance) {
    const parsed = parseCoordinates(coords);
    if (parsed) {
      trialMapInstance.setView([parsed.lat, parsed.lng], 13);
    }
  }
}

// Populate parameters with search
function populateTrialParameters(selectedIds = []) {
  const availableList = document.getElementById("parameterAvailableList");
  const selectedList = document.getElementById("parameterSelectedList");
  const searchInput = document.getElementById("parameterSearch");
  const moveRightBtn = document.getElementById("parameterMoveRight");
  const moveUpBtn = document.getElementById("parameterMoveUp");
  const moveDownBtn = document.getElementById("parameterMoveDown");
  const removeBtn = document.getElementById("parameterRemove");
  const allParameters = inventoryState.items.parameters || [];
  if (!availableList || !selectedList || !searchInput) return;

  // Filter parameters by selected crop's DoO
  const cropId = document.getElementById("trialCrops")?.value || "";
  const parameters = cropId
    ? allParameters.filter(p => {
        if ((p.type || "").toLowerCase() === "formula") return true;
        if (!p.daysOfObservation) return false;
        const val = p.daysOfObservation[cropId];
        if (val == null) return false;
        return typeof val === 'object' ? (val.min != null || val.max != null) : true;
      })
    : allParameters;

  trialState.selectedParametersOrder = Array.isArray(selectedIds)
    ? [...selectedIds]
    : [];

  const setSelection = (listEl, id) => {
    listEl.querySelectorAll(".picklist-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.id === id);
    });
    listEl.dataset.selectedId = id || "";
  };

  const renderAvailable = (searchTerm = "") => {
    const filtered = parameters.filter((param) => {
      const match =
        param.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (param.initial || "").toLowerCase().includes(searchTerm.toLowerCase());
      return match && !trialState.selectedParametersOrder.includes(param.id);
    });

    if (filtered.length === 0) {
      availableList.innerHTML =
        '<p class="param-no-results">No parameters found</p>';
      return;
    }

    availableList.innerHTML = filtered
      .map(
        (param) => `
          <div class="picklist-item" draggable="true" data-id="${param.id}">
            <div class="picklist-item-title">${escapeHtml(param.name)}</div>
            <div class="picklist-item-meta">
              ${escapeHtml(param.initial || "")} · ${escapeHtml(param.type || "")} · ${escapeHtml(param.unit || "")}
            </div>
          </div>
        `,
      )
      .join("");

    availableList.querySelectorAll(".picklist-item").forEach((item) => {
      item.addEventListener("click", () => {
        setSelection(availableList, item.dataset.id);
        setSelection(selectedList, "");
      });
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", item.dataset.id);
        e.dataTransfer.setData("source", "available");
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragend", (e) => {
        item.classList.remove("dragging");
        document.querySelectorAll(".picklist-item.drag-over").forEach(el => el.classList.remove("drag-over"));
      });
    });
  };

  const renderSelected = () => {
    if (trialState.selectedParametersOrder.length === 0) {
      selectedList.innerHTML =
        '<p class="param-no-results">No parameters selected</p>';
      return;
    }

    selectedList.innerHTML = trialState.selectedParametersOrder
      .map((id) => {
        const param = allParameters.find((p) => p.id === id);
        if (!param) return "";
        return `
          <div class="picklist-item" draggable="true" data-id="${param.id}">
            <div class="picklist-item-title">${escapeHtml(param.name)}</div>
            <div class="picklist-item-meta">
              ${escapeHtml(param.initial || "")} · ${escapeHtml(param.type || "")} · ${escapeHtml(param.unit || "")}
            </div>
          </div>
        `;
      })
      .join("");

    selectedList.querySelectorAll(".picklist-item").forEach((item) => {
      item.addEventListener("click", () => {
        setSelection(selectedList, item.dataset.id);
        setSelection(availableList, "");
      });
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", item.dataset.id);
        e.dataTransfer.setData("source", "selected");
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", (e) => {
        item.classList.remove("dragging");
        document.querySelectorAll(".picklist-item.drag-over").forEach(el => el.classList.remove("drag-over"));
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        const source = e.dataTransfer.getData("source");
        if (source === "selected" && draggedId !== item.dataset.id) {
          item.classList.add("drag-over");
          e.dataTransfer.dropEffect = "move";
        }
      });
      item.addEventListener("dragleave", (e) => {
        if (e.target === item) {
          item.classList.remove("drag-over");
        }
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const source = e.dataTransfer.getData("source");
        if (!draggedId) return;
        if (source === "selected") {
          const fromIndex = trialState.selectedParametersOrder.indexOf(draggedId);
          const toIndex = trialState.selectedParametersOrder.indexOf(item.dataset.id);
          if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
            const [moved] = trialState.selectedParametersOrder.splice(fromIndex, 1);
            trialState.selectedParametersOrder.splice(toIndex, 0, moved);
            renderSelected();
          }
        } else if (source === "available") {
          if (!trialState.selectedParametersOrder.includes(draggedId)) {
            const toIndex = trialState.selectedParametersOrder.indexOf(item.dataset.id);
            trialState.selectedParametersOrder.splice(toIndex, 0, draggedId);
            renderSelected();
            renderAvailable(searchInput.value);
            updateSelectedParamCount();
          }
        }
      });
    });
  };

  const addSelectedFromAvailable = () => {
    const selectedId = availableList.dataset.selectedId;
    if (!selectedId) return;
    if (!trialState.selectedParametersOrder.includes(selectedId)) {
      trialState.selectedParametersOrder.push(selectedId);
      renderSelected();
      renderAvailable(searchInput.value);
      updateSelectedParamCount();
    }
  };

  const removeSelectedFromSelected = () => {
    const selectedId = selectedList.dataset.selectedId;
    if (!selectedId) return;
    trialState.selectedParametersOrder = trialState.selectedParametersOrder.filter(
      (id) => id !== selectedId,
    );
    renderSelected();
    renderAvailable(searchInput.value);
    updateSelectedParamCount();
  };

  const moveSelected = (direction) => {
    const selectedId = selectedList.dataset.selectedId;
    if (!selectedId) return;
    const currentIndex = trialState.selectedParametersOrder.indexOf(selectedId);
    if (currentIndex === -1) return;
    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= trialState.selectedParametersOrder.length) return;
    const [moved] = trialState.selectedParametersOrder.splice(currentIndex, 1);
    trialState.selectedParametersOrder.splice(newIndex, 0, moved);
    renderSelected();
    setSelection(selectedList, selectedId);
  };

  const handleListDrop = (targetList) => (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const source = e.dataTransfer.getData("source");
    if (!draggedId) return;

    if (targetList === "selected") {
      if (!trialState.selectedParametersOrder.includes(draggedId)) {
        trialState.selectedParametersOrder.push(draggedId);
        renderSelected();
        renderAvailable(searchInput.value);
        updateSelectedParamCount();
      }
    }

    if (targetList === "available" && source === "selected") {
      trialState.selectedParametersOrder = trialState.selectedParametersOrder.filter(
        (id) => id !== draggedId,
      );
      renderSelected();
      renderAvailable(searchInput.value);
      updateSelectedParamCount();
    }
  };

  availableList.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    availableList.classList.add("drag-over-list");
  });
  availableList.addEventListener("dragleave", (e) => {
    if (e.target === availableList) {
      availableList.classList.remove("drag-over-list");
    }
  });
  availableList.addEventListener("drop", handleListDrop("available"));
  
  selectedList.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    selectedList.classList.add("drag-over-list");
  });
  selectedList.addEventListener("dragleave", (e) => {
    if (e.target === selectedList) {
      selectedList.classList.remove("drag-over-list");
    }
  });
  selectedList.addEventListener("drop", handleListDrop("selected"));

  moveRightBtn?.addEventListener("click", addSelectedFromAvailable);
  moveUpBtn?.addEventListener("click", () => moveSelected("up"));
  moveDownBtn?.addEventListener("click", () => moveSelected("down"));
  removeBtn?.addEventListener("click", removeSelectedFromSelected);

  // Initial render
  renderAvailable();
  renderSelected();
  updateSelectedParamCount();

  // Search listener
  searchInput.removeEventListener("input", searchInput._searchHandler);
  searchInput._searchHandler = (e) => renderAvailable(e.target.value);
  searchInput.addEventListener("input", searchInput._searchHandler);
}

// Update selected parameter count
function updateSelectedParamCount() {
  const count = getSelectedParameterIds().length;
  const countEl = document.getElementById("selectedParamCount");
  if (countEl) countEl.textContent = count;
}

function getSelectedParameterIds() {
  return Array.isArray(trialState.selectedParametersOrder)
    ? trialState.selectedParametersOrder
    : [];
}

function getRunnableTrialParameters(trial) {
  if (!trial) return [];
  return (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter((param) => param && (param.type || "").toLowerCase() !== "formula");
}

// ═══════════════════════════════════════════════
// Agronomy Monitoring Picker (same pattern as parameters)
// ═══════════════════════════════════════════════

function populateTrialAgronomy(selectedIds = []) {
  const availableList = document.getElementById("agronomyAvailableList");
  const selectedList = document.getElementById("agronomySelectedList");
  const searchInput = document.getElementById("agronomySearch");
  const moveRightBtn = document.getElementById("agronomyMoveRight");
  const moveUpBtn = document.getElementById("agronomyMoveUp");
  const moveDownBtn = document.getElementById("agronomyMoveDown");
  const removeBtn = document.getElementById("agronomyRemove");
  if (!availableList || !selectedList || !searchInput) return;

  trialState.selectedAgronomyOrder = Array.isArray(selectedIds) ? [...selectedIds] : [];

  // Get current trial crop
  const cropId = document.getElementById("trialCrops")?.value;

  // Filter agronomy items by crop
  const allAgronomy = inventoryState.items.agronomy || [];
  const filteredAgronomy = cropId
    ? allAgronomy.filter(a => a.cropIds && a.cropIds.includes(cropId))
    : allAgronomy;

  const setSelection = (listEl, id) => {
    listEl.querySelectorAll(".picklist-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.id === id);
    });
    listEl.dataset.selectedId = id || "";
  };

  const renderAvailable = (searchTerm = "") => {
    const filtered = filteredAgronomy.filter((item) => {
      const activity = item.activity || item.name || "";
      const match = activity.toLowerCase().includes(searchTerm.toLowerCase());
      return match && !trialState.selectedAgronomyOrder.includes(item.id);
    });

    if (filtered.length === 0) {
      availableList.innerHTML = '<p class="param-no-results">No agronomy items found</p>';
      return;
    }

    availableList.innerHTML = filtered.map((item) => {
      const dapText = item.dapMin != null
        ? (item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin
          ? `DAP ${item.dapMin}-${item.dapMax}`
          : `DAP ${item.dapMin}`)
        : "";
      return `
        <div class="picklist-item" draggable="true" data-id="${item.id}">
          <div class="picklist-item-title">${escapeHtml(item.activity || item.name || "")}</div>
        </div>
      `;
    }).join("");

    availableList.querySelectorAll(".picklist-item").forEach((el) => {
      el.addEventListener("click", () => {
        setSelection(availableList, el.dataset.id);
        setSelection(selectedList, "");
      });
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", el.dataset.id);
        e.dataTransfer.setData("source", "available");
        el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        document.querySelectorAll(".picklist-item.drag-over").forEach(x => x.classList.remove("drag-over"));
      });
    });
  };

  const renderSelected = () => {
    if (trialState.selectedAgronomyOrder.length === 0) {
      selectedList.innerHTML = '<p class="param-no-results">No agronomy selected</p>';
      return;
    }

    selectedList.innerHTML = trialState.selectedAgronomyOrder.map((id) => {
      const item = allAgronomy.find((a) => a.id === id);
      if (!item) return "";
      const dapText = item.dapMin != null
        ? (item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin
          ? `DAP ${item.dapMin}-${item.dapMax}`
          : `DAP ${item.dapMin}`)
        : "";
      return `
        <div class="picklist-item" draggable="true" data-id="${item.id}">
          <div class="picklist-item-title">${escapeHtml(item.activity || item.name || "")}</div>
        </div>
      `;
    }).join("");

    selectedList.querySelectorAll(".picklist-item").forEach((el) => {
      el.addEventListener("click", () => {
        setSelection(selectedList, el.dataset.id);
        setSelection(availableList, "");
      });
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", el.dataset.id);
        e.dataTransfer.setData("source", "selected");
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        document.querySelectorAll(".picklist-item.drag-over").forEach(x => x.classList.remove("drag-over"));
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("drag-over");
        e.dataTransfer.dropEffect = "move";
      });
      el.addEventListener("dragleave", (e) => {
        if (e.target === el) el.classList.remove("drag-over");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const source = e.dataTransfer.getData("source");
        const targetId = el.dataset.id;
        if (draggedId === targetId) return;

        if (source === "available") {
          const targetIdx = trialState.selectedAgronomyOrder.indexOf(targetId);
          trialState.selectedAgronomyOrder.splice(targetIdx, 0, draggedId);
        } else if (source === "selected") {
          const fromIdx = trialState.selectedAgronomyOrder.indexOf(draggedId);
          if (fromIdx >= 0) trialState.selectedAgronomyOrder.splice(fromIdx, 1);
          const targetIdx = trialState.selectedAgronomyOrder.indexOf(targetId);
          trialState.selectedAgronomyOrder.splice(targetIdx, 0, draggedId);
        }
        renderAvailable(searchInput.value);
        renderSelected();
        updateSelectedAgronomyCount();
      });
    });
  };

  const updateSelectedAgronomyCount = () => {
    const countEl = document.getElementById("selectedAgronomyCount");
    if (countEl) countEl.textContent = trialState.selectedAgronomyOrder.length;
  };

  // Drop on available list (remove from selected)
  availableList.ondragover = (e) => { e.preventDefault(); availableList.classList.add("picklist-list-drag-over"); };
  availableList.ondragleave = () => { availableList.classList.remove("picklist-list-drag-over"); };
  availableList.ondrop = (e) => {
    e.preventDefault();
    availableList.classList.remove("picklist-list-drag-over");
    const draggedId = e.dataTransfer.getData("text/plain");
    const source = e.dataTransfer.getData("source");
    if (source === "selected") {
      const idx = trialState.selectedAgronomyOrder.indexOf(draggedId);
      if (idx >= 0) trialState.selectedAgronomyOrder.splice(idx, 1);
      renderAvailable(searchInput.value);
      renderSelected();
      updateSelectedAgronomyCount();
    }
  };

  // Drop on selected list (add from available)
  selectedList.ondragover = (e) => { e.preventDefault(); selectedList.classList.add("picklist-list-drag-over"); };
  selectedList.ondragleave = () => { selectedList.classList.remove("picklist-list-drag-over"); };
  selectedList.ondrop = (e) => {
    e.preventDefault();
    selectedList.classList.remove("picklist-list-drag-over");
    const draggedId = e.dataTransfer.getData("text/plain");
    const source = e.dataTransfer.getData("source");
    if (source === "available" && !trialState.selectedAgronomyOrder.includes(draggedId)) {
      trialState.selectedAgronomyOrder.push(draggedId);
      renderAvailable(searchInput.value);
      renderSelected();
      updateSelectedAgronomyCount();
    }
  };

  // Button controls
  if (moveRightBtn) {
    moveRightBtn.onclick = () => {
      const id = availableList.dataset.selectedId;
      if (id && !trialState.selectedAgronomyOrder.includes(id)) {
        trialState.selectedAgronomyOrder.push(id);
        renderAvailable(searchInput.value);
        renderSelected();
        updateSelectedAgronomyCount();
      }
    };
  }
  if (moveUpBtn) {
    moveUpBtn.onclick = () => {
      const id = selectedList.dataset.selectedId;
      const idx = trialState.selectedAgronomyOrder.indexOf(id);
      if (idx > 0) {
        [trialState.selectedAgronomyOrder[idx - 1], trialState.selectedAgronomyOrder[idx]] =
          [trialState.selectedAgronomyOrder[idx], trialState.selectedAgronomyOrder[idx - 1]];
        renderSelected();
        setSelection(selectedList, id);
      }
    };
  }
  if (moveDownBtn) {
    moveDownBtn.onclick = () => {
      const id = selectedList.dataset.selectedId;
      const idx = trialState.selectedAgronomyOrder.indexOf(id);
      if (idx >= 0 && idx < trialState.selectedAgronomyOrder.length - 1) {
        [trialState.selectedAgronomyOrder[idx], trialState.selectedAgronomyOrder[idx + 1]] =
          [trialState.selectedAgronomyOrder[idx + 1], trialState.selectedAgronomyOrder[idx]];
        renderSelected();
        setSelection(selectedList, id);
      }
    };
  }
  if (removeBtn) {
    removeBtn.onclick = () => {
      const id = selectedList.dataset.selectedId;
      const idx = trialState.selectedAgronomyOrder.indexOf(id);
      if (idx >= 0) {
        trialState.selectedAgronomyOrder.splice(idx, 1);
        renderAvailable(searchInput.value);
        renderSelected();
        updateSelectedAgronomyCount();
      }
    };
  }

  renderAvailable();
  renderSelected();
  updateSelectedAgronomyCount();

  // Search listener
  searchInput.removeEventListener("input", searchInput._agronomySearchHandler);
  searchInput._agronomySearchHandler = (e) => renderAvailable(e.target.value);
  searchInput.addEventListener("input", searchInput._agronomySearchHandler);
}

// Setup agronomy monitoring toggle and crop change listener
function setupAgronomyMonitoringListeners() {
  const checkbox = document.getElementById('trialAgronomyMonitoring');
  const container = document.getElementById('agronomyPickerContainer');
  const cropSelect = document.getElementById('trialCrops');

  if (checkbox) {
    checkbox.removeEventListener('change', checkbox._agronomyToggle);
    checkbox._agronomyToggle = () => {
      if (checkbox.checked) {
        container?.classList.remove('hidden');
        populateTrialAgronomy(trialState.selectedAgronomyOrder || []);
      } else {
        container?.classList.add('hidden');
      }
    };
    checkbox.addEventListener('change', checkbox._agronomyToggle);
  }

  // When crop changes, refresh agronomy available list and parameters list
  if (cropSelect) {
    cropSelect.removeEventListener('change', cropSelect._agronomyCropChange);
    cropSelect._agronomyCropChange = () => {
      // Refresh parameters list (filter by crop DoO)
      populateTrialParameters(trialState.selectedParametersOrder || []);
      // Refresh agronomy list
      if (checkbox?.checked) {
        populateTrialAgronomy(trialState.selectedAgronomyOrder || []);
      }
    };
    cropSelect.addEventListener('change', cropSelect._agronomyCropChange);
  }
}

// ═════════════════════════════════════════════
// Pollination → Trial Type cascade & plot spec
// ═════════════════════════════════════════════

function setupPollinationTrialTypeCascade() {
  const pollinationSelect = document.getElementById("trialPollination");
  const trialTypeSelect = document.getElementById("trialType");
  if (!pollinationSelect || !trialTypeSelect) return;

  pollinationSelect.removeEventListener("change", pollinationSelect._cascadeHandler);
  pollinationSelect._cascadeHandler = () => {
    updateTrialTypeOptions();
    updatePlotSpecVisibility();
  };
  pollinationSelect.addEventListener("change", pollinationSelect._cascadeHandler);

  trialTypeSelect.removeEventListener("change", trialTypeSelect._plotSpecHandler);
  trialTypeSelect._plotSpecHandler = () => {
    updatePlotSpecVisibility();
  };
  trialTypeSelect.addEventListener("change", trialTypeSelect._plotSpecHandler);
}

function updateTrialTypeOptions() {
  const pollination = document.getElementById("trialPollination")?.value || "";
  const trialTypeSelect = document.getElementById("trialType");
  if (!trialTypeSelect) return;

  const oldValue = trialTypeSelect.value;
  let options = [];

  if (pollination === "Selfing") {
    options = [
      { value: "Parent Test", label: "Parent Test" },
      { value: "Process Research", label: "Process Research" },
    ];
  } else if (pollination === "Crossing") {
    options = [
      { value: "Micropilot", label: "Micropilot" },
      { value: "Process Research", label: "Process Research" },
    ];
  }

  trialTypeSelect.innerHTML = '<option value="">Select trial type</option>' +
    options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

  // Restore old value if it's still among the new options
  if (options.some(o => o.value === oldValue)) {
    trialTypeSelect.value = oldValue;
  } else {
    trialTypeSelect.value = "";
  }

  updatePlotSpecSectionAccessState();
}

function updatePlotSpecVisibility() {
  const pollination = document.getElementById("trialPollination")?.value || "";
  const trialType = document.getElementById("trialType")?.value || "";
  const parentTestBlock = document.getElementById("plotSpecParentTest");
  const micropilotBlock = document.getElementById("plotSpecMicropilot");
  const lockNotice = document.getElementById("plotSpecLockNotice");
  const plotSpecContent = document.getElementById("plotSpecContent");
  if (!parentTestBlock || !micropilotBlock) return;

  const isReady = Boolean(pollination && trialType);
  if (lockNotice) lockNotice.classList.toggle("hidden", isReady);
  if (plotSpecContent) plotSpecContent.classList.toggle("hidden", !isReady);
  updatePlotSpecSectionAccessState();

  if (!isReady) {
    parentTestBlock.classList.remove("hidden");
    micropilotBlock.classList.add("hidden");
    return;
  }

  if (trialType === "Micropilot") {
    parentTestBlock.classList.add("hidden");
    micropilotBlock.classList.remove("hidden");
    setupMicropilotCalculations();
  } else {
    parentTestBlock.classList.remove("hidden");
    micropilotBlock.classList.add("hidden");
  }
}

// ═══════════════════════════════════════
// Micropilot-specific calculations
// ═══════════════════════════════════════

function setupMicropilotCalculations() {
  const ids = ["trialMpPanel", "trialRatioFemale", "trialRatioMale", "trialMpPlotLength", "trialMpSpacingWidth", "trialMpSpacingHeight"];
  const inputs = ids.map(id => document.getElementById(id)).filter(Boolean);

  inputs.forEach(input => {
    input.removeEventListener("input", updateMicropilotCalculations);
    input.addEventListener("input", updateMicropilotCalculations);
  });

  updateMicropilotCalculations();
}

function updateMicropilotCalculations() {
  const panel = parseFloat(document.getElementById("trialMpPanel")?.value || "");
  const ratioFemale = parseFloat(document.getElementById("trialRatioFemale")?.value || "");
  const ratioMale = parseFloat(document.getElementById("trialRatioMale")?.value || "");
  const plotLength = parseFloat(document.getElementById("trialMpPlotLength")?.value || "");
  const spacingWCm = parseFloat(document.getElementById("trialMpSpacingWidth")?.value || "");
  const spacingHCm = parseFloat(document.getElementById("trialMpSpacingHeight")?.value || "");

  const totalFemaleRowsEl = document.getElementById("trialMpTotalFemaleRows");
  const totalMaleRowsEl = document.getElementById("trialMpTotalMaleRows");
  const plotAreaEl = document.getElementById("trialMpPlotArea");
  const expFemaleEl = document.getElementById("trialMpExpectedFemale");
  const expMaleEl = document.getElementById("trialMpExpectedMale");
  const popFemaleEl = document.getElementById("trialMpPopFemale");
  const popMaleEl = document.getElementById("trialMpPopMale");

  const widthM = Number.isFinite(spacingWCm) ? spacingWCm / 100 : NaN;
  const heightM = Number.isFinite(spacingHCm) ? spacingHCm / 100 : NaN;

  const totalRatio = (Number.isFinite(ratioFemale) ? ratioFemale : 0) + (Number.isFinite(ratioMale) ? ratioMale : 0);

  // Micropilot pattern:
  // Female rows = ratioFemale * panel
  // Male rows   = (ratioMale * panel) + ratioMale
  const femaleRows = Number.isFinite(ratioFemale) && Number.isFinite(panel) && ratioFemale >= 0 && panel >= 0
    ? ratioFemale * panel
    : NaN;
  const maleRows = Number.isFinite(ratioMale) && Number.isFinite(panel) && ratioMale >= 0 && panel >= 0
    ? (ratioMale * panel) + ratioMale
    : NaN;
  const totalRows = Number.isFinite(femaleRows) && Number.isFinite(maleRows)
    ? femaleRows + maleRows
    : NaN;

  if (totalFemaleRowsEl) totalFemaleRowsEl.value = Number.isFinite(femaleRows) ? String(femaleRows) : "";
  if (totalMaleRowsEl) totalMaleRowsEl.value = Number.isFinite(maleRows) ? String(maleRows) : "";

  // Population/plot by row count and plant spacing height
  const canCalcPopPlot = Number.isFinite(plotLength) && Number.isFinite(heightM) && plotLength > 0 && heightM > 0;
  const femalePopPlot = canCalcPopPlot && Number.isFinite(femaleRows) ? (plotLength / heightM) * femaleRows : NaN;
  const malePopPlot = canCalcPopPlot && Number.isFinite(maleRows) ? (plotLength / heightM) * maleRows : NaN;
  if (expFemaleEl) expFemaleEl.value = Number.isFinite(femalePopPlot) ? Math.round(femalePopPlot).toLocaleString() : "";
  if (expMaleEl) expMaleEl.value = Number.isFinite(malePopPlot) ? Math.round(malePopPlot).toLocaleString() : "";

  // Plot area in m²: totalRows * spacingWidth(m) * plotLength(m)
  const plotAreaM2 = Number.isFinite(totalRows) && Number.isFinite(widthM) && Number.isFinite(plotLength)
    && totalRows > 0 && widthM > 0 && plotLength > 0
      ? totalRows * widthM * plotLength
      : NaN;
  if (plotAreaEl) plotAreaEl.value = Number.isFinite(plotAreaM2) ? plotAreaM2.toFixed(2) : "";

  // Population/ha = ratio part * (10000 / (spacingW(m) * spacingH(m)))
  const totalPopHa = Number.isFinite(widthM) && Number.isFinite(heightM) && widthM > 0 && heightM > 0
    ? 10000 / (widthM * heightM)
    : NaN;
  const femalePopHa = Number.isFinite(totalPopHa) && totalRatio > 0 && Number.isFinite(ratioFemale)
    ? totalPopHa * (ratioFemale / totalRatio)
    : NaN;
  const malePopHa = Number.isFinite(totalPopHa) && totalRatio > 0 && Number.isFinite(ratioMale)
    ? totalPopHa * (ratioMale / totalRatio)
    : NaN;
  if (popFemaleEl) popFemaleEl.value = Number.isFinite(femalePopHa) ? Math.round(femalePopHa).toLocaleString() : "";
  if (popMaleEl) popMaleEl.value = Number.isFinite(malePopHa) ? Math.round(malePopHa).toLocaleString() : "";
}

function setupTrialGeneralCalculations() {
  const inputs = [
    document.getElementById("trialRowsPerPlot"),
    document.getElementById("trialPlotLength"),
    document.getElementById("trialPlantSpacingWidth"),
    document.getElementById("trialPlantSpacingHeight"),
  ].filter(Boolean);

  inputs.forEach((input) => {
    input.removeEventListener("input", updateTrialGeneralCalculations);
    input.addEventListener("input", updateTrialGeneralCalculations);
  });

  updateTrialGeneralCalculations();
}

function updateTrialGeneralCalculations() {
  const rowsPerPlot = parseFloat(
    document.getElementById("trialRowsPerPlot")?.value || "",
  );
  const plotLength = parseFloat(
    document.getElementById("trialPlotLength")?.value || "",
  );
  const spacingWidthCm = parseFloat(
    document.getElementById("trialPlantSpacingWidth")?.value || "",
  );
  const spacingHeightCm = parseFloat(
    document.getElementById("trialPlantSpacingHeight")?.value || "",
  );

  const plotAreaEl = document.getElementById("trialPlotArea");
  const expectedPlantsEl = document.getElementById("trialExpectedPlants");
  const populationEl = document.getElementById("trialPopulationHa");

  if (!plotAreaEl || !expectedPlantsEl || !populationEl) return;

  const widthM = Number.isFinite(spacingWidthCm) ? spacingWidthCm / 100 : NaN;
  const heightM = Number.isFinite(spacingHeightCm) ? spacingHeightCm / 100 : NaN;

  const canCalcArea =
    Number.isFinite(rowsPerPlot) &&
    Number.isFinite(plotLength) &&
    Number.isFinite(widthM) &&
    rowsPerPlot > 0 &&
    plotLength > 0 &&
    widthM > 0;

  const canCalcExpected =
    Number.isFinite(rowsPerPlot) &&
    Number.isFinite(plotLength) &&
    Number.isFinite(heightM) &&
    rowsPerPlot > 0 &&
    plotLength > 0 &&
    heightM > 0;

  const canCalcPopulation =
    Number.isFinite(widthM) &&
    Number.isFinite(heightM) &&
    widthM > 0 &&
    heightM > 0;

  plotAreaEl.value = canCalcArea
    ? (rowsPerPlot * plotLength * widthM).toFixed(2)
    : "";

  expectedPlantsEl.value = canCalcExpected
    ? Math.round((plotLength / heightM) * rowsPerPlot).toString()
    : "";

  populationEl.value = canCalcPopulation
    ? (10000 / (widthM * heightM)).toFixed(2)
    : "";
}

// Initialize trial map
function initializeTrialMap(centerCoords = null) {
  // Destroy existing map
  if (trialMapInstance) {
    trialMapInstance.remove();
    trialMapInstance = null;
  }

  trialDrawnLayers = [];
  trialCurrentDrawing = null;

  const mapContainer = document.getElementById("trialMap");
  if (!mapContainer) return;

  // Default center (Indonesia)
  let center = [-2.5, 118.0];
  let zoom = 4;

  if (centerCoords) {
    const parsed = parseCoordinates(centerCoords);
    if (parsed) {
      center = [parsed.lat, parsed.lng];
      zoom = 13;
    }
  }

  // Create map
  trialMapInstance = L.map(mapContainer).setView(center, zoom);

  // Add satellite tile layer
  L.tileLayer(
    "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg",
    {
      attribution:
        "© Stadia Maps",
      maxNativeZoom: 20,
      maxZoom: 25,
    },
  ).addTo(trialMapInstance);

  // Add labels layer on top of satellite
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap contributors, &copy; CartoDB",
      maxNativeZoom: 20,
      maxZoom: 25,
    },
  ).addTo(trialMapInstance);

  // Fit Indonesia bounds when no specific location is provided
  if (!centerCoords) {
    const indonesiaBounds = L.latLngBounds([
      [-11.0, 95.0],
      [6.5, 141.0],
    ]);
    trialMapInstance.fitBounds(indonesiaBounds, { padding: [20, 20] });
  }

  // Setup drawing controls
  setupTrialMapDrawing();

  // Invalidate size after render
  setTimeout(() => {
    if (trialMapInstance) {
      trialMapInstance.invalidateSize();
    }
  }, 100);
}

// Setup trial map drawing with controls overlay
function setupTrialMapDrawing() {
  const startBtn = document.getElementById("startDrawingBtn");
  const saveBtn = document.getElementById("saveAreaBtn");
  const clearBtn = document.getElementById("clearDrawingBtn");

  // Use buttons from HTML
  if (startBtn && trialMapInstance) {
    startBtn.onclick = () => {
      if (trialState.isDrawing) {
        stopDrawing();
      } else {
        startDrawing();
      }
    };

    saveBtn.onclick = () => {
      saveCurrentArea();
    };

    clearBtn.onclick = () => {
      clearCurrentDrawingPoints();
    };

    // Setup undo button from zone info panel
    const undoBtn = document.getElementById("undoPointBtn");
    if (undoBtn) {
      undoBtn.onclick = () => {
        undoLastPoint();
      };
    }
  }
}

// Start drawing polygon
function startDrawing() {
  if (!trialMapInstance) return;

  trialState.isDrawing = true;
  trialCurrentDrawing = {
    points: [],
    markers: [],
    polyline: null,
    polygonPreview: null,
  };

  // Update button
  const startBtn = document.getElementById("startDrawingBtn");
  startBtn.innerHTML =
    '<span class="material-symbols-rounded">stop</span><span>Stop Drawing</span>';
  startBtn.classList.add("btn-drawing");

  // Show zone info panel
  const zonePanel = document.getElementById("zoneInfoPanel");
  if (zonePanel) {
    zonePanel.classList.remove("hidden");
  }

  // Add click listener to map
  trialMapInstance.on("click", handleMapClickForDrawing);

  // Change cursor
  trialMapInstance.getContainer().classList.add("cursor-crosshair");

  // Add keyboard shortcuts
  document.addEventListener("keydown", handleDrawingKeyboard);
}

// Stop drawing
function stopDrawing() {
  if (!trialMapInstance) return;

  trialState.isDrawing = false;

  // Update button
  const startBtn = document.getElementById("startDrawingBtn");
  startBtn.innerHTML =
    '<span class="material-symbols-rounded">draw</span><span>Start Drawing Area</span>';
  startBtn.classList.remove("btn-drawing");

  // Remove click listener
  trialMapInstance.off("click", handleMapClickForDrawing);

  // Remove keyboard listener
  document.removeEventListener("keydown", handleDrawingKeyboard);

  // Restore cursor
  trialMapInstance.getContainer().classList.remove("cursor-crosshair");

  // Hide zone info panel
  const zonePanel = document.getElementById("zoneInfoPanel");
  if (zonePanel) {
    zonePanel.classList.add("hidden");
  }

  // Clear current drawing if not complete
  if (trialCurrentDrawing) {
    trialCurrentDrawing.markers.forEach((m) => trialMapInstance.removeLayer(m));
    if (trialCurrentDrawing.polyline) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
    }
    if (trialCurrentDrawing.polygonPreview) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polygonPreview);
    }
    trialCurrentDrawing = null;
  }

  document.getElementById("saveAreaBtn").disabled = true;
}

// Handle map click for drawing with real-time area calculation
function handleMapClickForDrawing(e) {
  if (!trialState.isDrawing || !trialCurrentDrawing) return;

  const latlng = e.latlng;

  // Add point
  trialCurrentDrawing.points.push(latlng);

  // Add marker
  const marker = L.circleMarker(latlng, {
    radius: 6,
    fillColor: "#2563eb",
    color: "#fff",
    weight: 2,
    fillOpacity: 0.8,
  }).addTo(trialMapInstance);

  trialCurrentDrawing.markers.push(marker);

  // Remove old polyline
  if (trialCurrentDrawing.polyline) {
    trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
  }

  // Show polygon preview if we have 3+ points
  if (trialCurrentDrawing.points.length >= 3) {
    // Remove old polygon preview
    if (trialCurrentDrawing.polygonPreview) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polygonPreview);
    }

    // Create filled polygon preview
    trialCurrentDrawing.polygonPreview = L.polygon(trialCurrentDrawing.points, {
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.3,
      weight: 2,
    }).addTo(trialMapInstance);
  } else {
    // Show dashed polyline for 1-2 points
    trialCurrentDrawing.polyline = L.polyline(trialCurrentDrawing.points, {
      color: "#2563eb",
      weight: 2,
      dashArray: "5, 5",
    }).addTo(trialMapInstance);
  }

  // Update zone info panel
  updateZoneInfoPanel();

  // Enable save button if we have 3+ points
  if (trialCurrentDrawing.points.length >= 3) {
    document.getElementById("saveAreaBtn").disabled = false;
  }
}

// Update zone information panel with current drawing data
function updateZoneInfoPanel() {
  if (!trialCurrentDrawing) return;

  const pointCount = trialCurrentDrawing.points.length;
  const pointCountEl = document.getElementById("pointCount");
  const zoneAreaEl = document.getElementById("zoneArea");
  const zonePanel = document.getElementById("zoneInfoPanel");

  if (pointCountEl) {
    pointCountEl.textContent = pointCount;
  }

  // Show panel once we have points
  if (pointCount > 0 && zonePanel) {
    zonePanel.classList.remove("hidden");
  }

  // Calculate and display area if we have 3+ points
  if (pointCount >= 3 && zoneAreaEl) {
    const coords = trialCurrentDrawing.points.map((p) => [p.lat, p.lng]);
    const hectares = calculatePolygonArea(coords);
    zoneAreaEl.textContent = hectares.toFixed(2);
  } else if (zoneAreaEl) {
    zoneAreaEl.textContent = "0";
  }
}

// Complete polygon
function completePolygon() {
  if (!trialCurrentDrawing || trialCurrentDrawing.points.length < 3) return;

  // Remove temp markers and polyline
  trialCurrentDrawing.markers.forEach((m) => trialMapInstance.removeLayer(m));
  if (trialCurrentDrawing.polyline) {
    trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
  }

  // Create polygon
  const polygon = L.polygon(trialCurrentDrawing.points, {
    color: "#2563eb",
    fillColor: "#3b82f6",
    fillOpacity: 0.3,
    weight: 2,
  }).addTo(trialMapInstance);

  // Store for temporary display
  trialState.currentPolygon = {
    polygon: polygon,
    points: trialCurrentDrawing.points.map((p) => [p.lat, p.lng]),
  };

  // Stop drawing
  stopDrawing();
}

// Save current area
function saveCurrentArea() {
  if (!trialState.currentPolygon) {
    if (trialCurrentDrawing && trialCurrentDrawing.points.length >= 3) {
      completePolygon();
    } else {
      return;
    }
  }

  // Show area name dialog
  const dialog = document.getElementById("areaNameDialog");
  const input = document.getElementById("areaNameInput");
  const confirmBtn = document.getElementById("confirmAreaNameBtn");
  const cancelBtn = document.getElementById("cancelAreaNameBtn");

  input.value = `Area ${trialState.currentAreas.length + 1}`;
  dialog.classList.remove("hidden");
  input.focus();
  input.select();

  // Remove old listeners
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

  // Confirm handler
  newConfirmBtn.addEventListener("click", () => {
    const areaName = input.value.trim();
    if (!areaName) {
      showToast("Please enter area name", "error");
      return;
    }

    // Calculate area size in hectares
    const hectares = calculatePolygonArea(trialState.currentPolygon.points);
    const squareMeters = hectares * 10000;
    const centroid = getPolygonCentroid(trialState.currentPolygon.points);

    // Add to areas list
    trialState.currentAreas.push({
      name: areaName,
      coordinates: trialState.currentPolygon.points,
      areaSize: {
        hectares: hectares,
        squareMeters: squareMeters,
      },
      centroid: centroid,
      address: "Fetching address...",
    });

    // Remove from map (will be redrawn with proper styling)
    trialMapInstance.removeLayer(trialState.currentPolygon.polygon);

    // Redraw with saved styling
    drawSavedArea(
      trialState.currentAreas[trialState.currentAreas.length - 1],
      trialState.currentAreas.length - 1,
    );

    // Clear current polygon
    trialState.currentPolygon = null;

    // Disable save button
    document.getElementById("saveAreaBtn").disabled = true;

    // Hide dialog
    dialog.classList.add("hidden");
    input.value = "";

    // Update areas list
    renderAreasList();

    // Resolve address in background
    const areaIndex = trialState.currentAreas.length - 1;
    resolveAreaAddress(areaIndex);
  });

  // Cancel handler
  newCancelBtn.addEventListener("click", () => {
    dialog.classList.add("hidden");
    input.value = "";
  });

  // Enter key handler
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      newConfirmBtn.click();
    }
  });
}

// Clear only the current drawing points (not saved areas)
function clearCurrentDrawingPoints() {
  if (!trialMapInstance) return;

  if (trialCurrentDrawing) {
    trialCurrentDrawing.markers.forEach((m) => trialMapInstance.removeLayer(m));
    if (trialCurrentDrawing.polyline) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
    }
    if (trialCurrentDrawing.polygonPreview) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polygonPreview);
    }
    trialCurrentDrawing.points = [];
    trialCurrentDrawing.markers = [];
    trialCurrentDrawing.polyline = null;
    trialCurrentDrawing.polygonPreview = null;
  }

  if (trialState.currentPolygon) {
    trialMapInstance.removeLayer(trialState.currentPolygon.polygon);
    trialState.currentPolygon = null;
  }

  document.getElementById("saveAreaBtn").disabled = true;
  updateZoneInfoPanel();
}

// Undo the last point in drawing
function undoLastPoint() {
  if (!trialCurrentDrawing || trialCurrentDrawing.points.length === 0) return;

  // Remove the last point
  trialCurrentDrawing.points.pop();

  // Remove the last marker
  if (trialCurrentDrawing.markers.length > 0) {
    const lastMarker = trialCurrentDrawing.markers.pop();
    if (lastMarker) {
      trialMapInstance.removeLayer(lastMarker);
    }
  }

  // Remove old polyline/polygon preview
  if (trialCurrentDrawing.polyline) {
    trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
    trialCurrentDrawing.polyline = null;
  }
  if (trialCurrentDrawing.polygonPreview) {
    trialMapInstance.removeLayer(trialCurrentDrawing.polygonPreview);
    trialCurrentDrawing.polygonPreview = null;
  }

  // Redraw polyline/polygon with remaining points
  if (trialCurrentDrawing.points.length >= 3) {
    trialCurrentDrawing.polygonPreview = L.polygon(trialCurrentDrawing.points, {
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.3,
      weight: 2,
    }).addTo(trialMapInstance);
  } else if (trialCurrentDrawing.points.length >= 1) {
    trialCurrentDrawing.polyline = L.polyline(trialCurrentDrawing.points, {
      color: "#2563eb",
      weight: 2,
      dashArray: "5, 5",
    }).addTo(trialMapInstance);
  }

  // Update UI
  if (trialCurrentDrawing.points.length < 3) {
    document.getElementById("saveAreaBtn").disabled = true;
  }

  updateZoneInfoPanel();
}

// Handle keyboard shortcuts during drawing
function handleDrawingKeyboard(e) {
  if (!trialState.isDrawing) return;

  // Ctrl+Z or Cmd+Z for undo
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undoLastPoint();
  }

  // Enter to complete drawing
  if (e.key === "Enter" && trialCurrentDrawing && trialCurrentDrawing.points.length >= 3) {
    e.preventDefault();
    saveCurrentArea();
  }

  // Escape to cancel drawing
  if (e.key === "Escape") {
    e.preventDefault();
    stopDrawing();
  }
}

// Calculate polygon area in hectares using Shoelace formula
function calculatePolygonArea(coordinates) {
  if (coordinates.length < 3) return 0;

  // Convert to meters using approximate conversion
  // 1 degree latitude ≈ 111,000 meters
  // 1 degree longitude ≈ 111,000 * cos(latitude) meters

  const avgLat =
    coordinates.reduce((sum, coord) => sum + coord[0], 0) / coordinates.length;
  const latToMeters = 111000;
  const lngToMeters = 111000 * Math.cos((avgLat * Math.PI) / 180);

  // Convert coordinates to meters
  const coordsInMeters = coordinates.map((coord) => [
    coord[0] * latToMeters,
    coord[1] * lngToMeters,
  ]);

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < coordsInMeters.length; i++) {
    const j = (i + 1) % coordsInMeters.length;
    area += coordsInMeters[i][0] * coordsInMeters[j][1];
    area -= coordsInMeters[j][0] * coordsInMeters[i][1];
  }
  area = Math.abs(area) / 2;

  // Convert to hectares (1 hectare = 10,000 m²)
  return area / 10000;
}

// Calculate polygon centroid
function getPolygonCentroid(coordinates) {
  if (coordinates.length < 3) return null;

  let x = 0;
  let y = 0;
  let z = 0;

  coordinates.forEach((coord) => {
    const lat = (coord[0] * Math.PI) / 180;
    const lng = (coord[1] * Math.PI) / 180;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  });

  const total = coordinates.length;
  x /= total;
  y /= total;
  z /= total;

  const lng = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);

  return {
    lat: (lat * 180) / Math.PI,
    lng: (lng * 180) / Math.PI,
  };
}

// Reverse geocode centroid to address
async function resolveAreaAddress(areaIndex) {
  const area = trialState.currentAreas[areaIndex];
  if (!area || !area.centroid) return;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${area.centroid.lat}&lon=${area.centroid.lng}`;
    const response = await fetch(url, {
      headers: { "Accept-Language": "en" },
    });

    if (!response.ok) {
      throw new Error("Failed to resolve address");
    }

    const data = await response.json();
    area.address = data.display_name || "Unknown address";
  } catch (error) {
    area.address = "Unknown address";
  }

  renderAreasList();
  updateAreaPopup(areaIndex);
}

function buildAreaPopupContent(area) {
  const areaSize = area.areaSize ? area.areaSize.hectares.toFixed(2) : "0.00";
  const coordsList = area.coordinates
    .map(
      (coord, i) =>
        `<div class="area-popup-coord-item">Point ${i + 1}: ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}</div>`,
    )
    .join("");

  const address = area.address || "Unknown address";

  return `
        <div class="area-popup">
            <strong class="area-popup-title">${escapeHtml(area.name)}</strong>
            <div class="area-popup-info">
                <strong>Area:</strong> ${areaSize} hectares
            </div>
            <div class="area-popup-info">
                <strong>Address:</strong> ${escapeHtml(address)}
            </div>
            <div class="area-popup-coords">
                <strong class="area-popup-coords-title">Coordinates:</strong>
                ${coordsList}
            </div>
        </div>
    `;
}

function updateAreaPopup(index) {
  const layerEntry = trialDrawnLayers.find((l) => l.index === index);
  const area = trialState.currentAreas[index];
  if (!layerEntry || !area) return;

  layerEntry.layer.bindPopup(buildAreaPopupContent(area));
}

// Draw saved area
function drawSavedArea(area, index) {
  if (!trialMapInstance) return;

  const polygon = L.polygon(area.coordinates, {
    color: "#10b981",
    fillColor: "#10b981",
    fillOpacity: 0.2,
    weight: 2,
  }).addTo(trialMapInstance);

  polygon.bindPopup(buildAreaPopupContent(area));

  trialDrawnLayers.push({
    layer: polygon,
    index: index,
  });

  if (!area.address || area.address === "Fetching address...") {
    resolveAreaAddress(index);
  }
}

// Render areas list
function renderAreasList() {
  const container = document.getElementById("areasListContainer");
  const listDiv = document.getElementById("areasList");

  if (trialState.currentAreas.length === 0) {
    listDiv.classList.add("hidden");
    return;
  }

  listDiv.classList.remove("hidden");

  container.innerHTML = trialState.currentAreas
    .map((area, index) => {
      const areaSize = area.areaSize
        ? area.areaSize.hectares.toFixed(2)
        : "0.00";
      const address = area.address || "Unknown address";
      const coordsList = area.coordinates
        .map(
          (coord, i) =>
            `<div class="area-coord-item">  • Point ${i + 1}: ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}</div>`,
        )
        .join("");

      return `
            <div class="area-list-card">
                <div id="areaPreviewMap${index}" class="area-preview-map"></div>
                <div class="area-list-body">
                    <div class="area-list-header">
                        <strong class="area-list-title">${escapeHtml(area.name)}</strong>
                        <button type="button" onclick="removeArea(${index})" class="btn btn-sm area-remove-btn">
                            <span class="material-symbols-rounded">delete</span>
                            <span>Remove</span>
                        </button>
                    </div>
                    <div class="area-list-info">
                        <strong>Area:</strong> ${areaSize} hectares (${(areaSize * 10000).toFixed(0)} m²)
                    </div>
                    <div class="area-list-info">
                        <strong>Address:</strong> ${escapeHtml(address)}
                    </div>
                    <!--
                    <div class="area-list-info">
                        <strong>Points:</strong> ${area.coordinates.length}
                    </div>
                    -->
                    <details class="area-list-details">
                        <summary>View Coordinates</summary>
                        <div class="area-list-coords">
                            ${coordsList}
                        </div>
                    </details>
                </div>
            </div>
        `;
    })
    .join("");

  // Initialize preview maps for each area
  trialState.currentAreas.forEach((area, index) => {
    renderAreaPreviewMap(area, index);
  });
}

// Render preview map for area
function renderAreaPreviewMap(area, index) {
  const mapContainer = document.getElementById(`areaPreviewMap${index}`);
  if (!mapContainer) return;

  // Remove old map if exists
  // if (window[`areaPreviewMap${index}`]) {
  //   window[`areaPreviewMap${index}`].remove();
  // }

  // Create map instance (with no zoom control)
  const map = L.map(mapContainer, {
    zoomControl: false,
    attributionControl: false
  }).setView([-6.2, 106.8], 12);
  
  // Add satellite layer
  L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', {
    attribution: '',
    maxNativeZoom: 20,
    maxZoom: 25
  }).addTo(map);

  // Add labels layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
    attribution: '',
    maxNativeZoom: 20,
    maxZoom: 25,
    pane: 'shadowPane'
  }).addTo(map);

  // Disable all interactions
  map.dragging.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.scrollWheelZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  if (map.tap) map.tap.disable();

  // Draw polygon
  if (area.coordinates && area.coordinates.length > 0) {
    const latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
    L.polygon(latlngs, {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.3,
      weight: 2
    }).addTo(map);

    // Fit bounds to polygon
    map.fitBounds(latlngs, { padding: [10, 10] });
  }

  // Store map instance
  window[`areaPreviewMap${index}`] = map;
  
  // Fix map size — multiple attempts to handle layout timing
  const fixSize = () => {
    map.invalidateSize();
    if (area.coordinates && area.coordinates.length > 0) {
      const latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
      map.fitBounds(latlngs, { padding: [10, 10] });
    }
  };
  setTimeout(fixSize, 50);
  setTimeout(fixSize, 200);
  setTimeout(fixSize, 500);
}

// Re-invalidate all existing preview maps (e.g. when returning to location section)
function invalidateAllPreviewMaps() {
  trialState.currentAreas.forEach((area, index) => {
    const map = window[`areaPreviewMap${index}`];
    if (map) {
      setTimeout(() => {
        map.invalidateSize();
        if (area.coordinates && area.coordinates.length > 0) {
          const latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
          map.fitBounds(latlngs, { padding: [10, 10] });
        }
      }, 100);
    }
  });
}

// Remove area
function removeArea(index) {
  // Remove from array
  trialState.currentAreas.splice(index, 1);

  // Remove from map
  const layerToRemove = trialDrawnLayers.find((l) => l.index === index);
  if (layerToRemove) {
    trialMapInstance.removeLayer(layerToRemove.layer);
  }

  // Redraw all areas with updated indices
  trialDrawnLayers = [];
  trialState.currentAreas.forEach((area, idx) => {
    drawSavedArea(area, idx);
  });

  // Update list
  renderAreasList();
}

// Clear all areas
function clearAllAreas() {
  trialState.currentAreas = [];

  // Remove all layers from map
  trialDrawnLayers.forEach((l) => trialMapInstance.removeLayer(l.layer));
  trialDrawnLayers = [];

  // Clear current polygon if exists
  if (trialState.currentPolygon) {
    trialMapInstance.removeLayer(trialState.currentPolygon.polygon);
    trialState.currentPolygon = null;
  }

  // Update list
  renderAreasList();
}

// Destroy trial map
function destroyTrialMap() {
  // Clean up preview map instances
  for (let i = 0; i < 20; i++) {
    if (window[`areaPreviewMap${i}`]) {
      window[`areaPreviewMap${i}`].remove();
      delete window[`areaPreviewMap${i}`];
    }
  }
  if (trialMapInstance) {
    trialMapInstance.remove();
    trialMapInstance = null;
  }
  trialDrawnLayers = [];
  trialCurrentDrawing = null;
}

// Save trial
async function saveTrial() {
  const name = document.getElementById("trialName").value.trim();
  const description = document.getElementById("trialDescription").value.trim();
  const plantingStart = document.getElementById("trialPlantingStart").value;
  const plantingEnd = document.getElementById("trialPlantingEnd").value;
  const plantingSeason = document.getElementById("trialPlantingSeason").value;
  const cropSelect = document.getElementById("trialCrops");
  const cropId = cropSelect.value;
  const cropName =
    cropSelect.options[cropSelect.selectedIndex].dataset.name || "";
  const pollination = document.getElementById("trialPollination").value;
  const trialType = document.getElementById("trialType").value;
  const expDesign = document.getElementById("trialExpDesign").value;
  const trialFactors = normalizeTrialFactorsCount(
    document.getElementById("trialFactors").value,
  );
  const factorDefinitions = getTrialTreatmentsFromForm();

  // Parent Test / Process Research fields
  const rowsPerPlot = parseFloat(
    document.getElementById("trialRowsPerPlot").value || "",
  );
  const plotLength = parseFloat(
    document.getElementById("trialPlotLength").value || "",
  );
  const plantSpacingWidth = parseFloat(
    document.getElementById("trialPlantSpacingWidth").value || "",
  );
  const plantSpacingHeight = parseFloat(
    document.getElementById("trialPlantSpacingHeight").value || "",
  );
  const widthM = Number.isFinite(plantSpacingWidth)
    ? plantSpacingWidth / 100
    : NaN;
  const heightM = Number.isFinite(plantSpacingHeight)
    ? plantSpacingHeight / 100
    : NaN;
  const plotArea =
    Number.isFinite(rowsPerPlot) &&
    Number.isFinite(plotLength) &&
    Number.isFinite(widthM) &&
    rowsPerPlot > 0 &&
    plotLength > 0 &&
    widthM > 0
      ? rowsPerPlot * plotLength * widthM
      : null;
  const expectedPlantsPerPlot =
    Number.isFinite(rowsPerPlot) &&
    Number.isFinite(plotLength) &&
    Number.isFinite(heightM) &&
    rowsPerPlot > 0 &&
    plotLength > 0 &&
    heightM > 0
      ? (plotLength / heightM) * rowsPerPlot
      : null;
  const populationPerHa =
    Number.isFinite(widthM) &&
    Number.isFinite(heightM) &&
    widthM > 0 &&
    heightM > 0
      ? 10000 / (widthM * heightM)
      : null;

  // Micropilot fields
  const mpPanel = parseFloat(document.getElementById("trialMpPanel")?.value || "");
  const ratioFemale = parseFloat(document.getElementById("trialRatioFemale")?.value || "");
  const ratioMale = parseFloat(document.getElementById("trialRatioMale")?.value || "");
  const mpFemaleLineNames = String(document.getElementById("trialMpFemaleLineNames")?.value || "").trim();
  const mpMaleLineNames = String(document.getElementById("trialMpMaleLineNames")?.value || "").trim();
  const mpPlotLength = parseFloat(document.getElementById("trialMpPlotLength")?.value || "");
  const mpSpacingWidth = parseFloat(document.getElementById("trialMpSpacingWidth")?.value || "");
  const mpSpacingHeight = parseFloat(document.getElementById("trialMpSpacingHeight")?.value || "");
  const mpWidthM = Number.isFinite(mpSpacingWidth) ? mpSpacingWidth / 100 : NaN;
  const mpHeightM = Number.isFinite(mpSpacingHeight) ? mpSpacingHeight / 100 : NaN;
  const mpTotalFemaleRows = Number.isFinite(ratioFemale) && Number.isFinite(mpPanel) ? ratioFemale * mpPanel : null;
  const mpTotalMaleRows = Number.isFinite(ratioMale) && Number.isFinite(mpPanel) ? (ratioMale * mpPanel) + ratioMale : null;
  const mpTotalRows = Number.isFinite(mpTotalFemaleRows) && Number.isFinite(mpTotalMaleRows)
    ? mpTotalFemaleRows + mpTotalMaleRows
    : null;
  const mpPlotArea = Number.isFinite(mpTotalRows) && Number.isFinite(mpWidthM) && Number.isFinite(mpPlotLength) && mpTotalRows > 0 && mpWidthM > 0 && mpPlotLength > 0
    ? mpTotalRows * mpWidthM * mpPlotLength
    : null;
  const mpExpectedFemale = Number.isFinite(mpPlotLength) && mpPlotLength > 0 && Number.isFinite(mpHeightM) && mpHeightM > 0 && Number.isFinite(mpTotalFemaleRows) && mpTotalFemaleRows > 0
    ? (mpPlotLength / mpHeightM) * mpTotalFemaleRows : null;
  const mpExpectedMale = Number.isFinite(mpPlotLength) && mpPlotLength > 0 && Number.isFinite(mpHeightM) && mpHeightM > 0 && Number.isFinite(mpTotalMaleRows) && mpTotalMaleRows > 0
    ? (mpPlotLength / mpHeightM) * mpTotalMaleRows : null;
  const mpTotalRatio = (Number.isFinite(ratioFemale) ? ratioFemale : 0) + (Number.isFinite(ratioMale) ? ratioMale : 0);
  const mpTotalPop = Number.isFinite(mpWidthM) && Number.isFinite(mpHeightM) && mpWidthM > 0 && mpHeightM > 0
    ? 10000 / (mpWidthM * mpHeightM)
    : null;
  const mpPopFemale = mpTotalPop && mpTotalRatio > 0 && Number.isFinite(ratioFemale) ? mpTotalPop * (ratioFemale / mpTotalRatio) : null;
  const mpPopMale = mpTotalPop && mpTotalRatio > 0 && Number.isFinite(ratioMale) ? mpTotalPop * (ratioMale / mpTotalRatio) : null;

  const locationEl = document.getElementById("trialLocation");
  const locationId = locationEl ? locationEl.value : (trialState.editingTrialId ? trialState.trials.find(t => t.id === trialState.editingTrialId)?.locationId : "");

  // Get selected parameters
  const selectedParams = getSelectedParameterIds();

  // Get agronomy monitoring
  const agronomyMonitoring = document.getElementById('trialAgronomyMonitoring')?.checked || false;
  const selectedAgronomy = agronomyMonitoring ? (trialState.selectedAgronomyOrder || []) : [];

  // Validation
  if (!name) {
    showToast("Please enter trial name", "error");
    return;
  }
  if (!plantingStart || !plantingEnd) {
    showToast("Please enter planting window dates", "error");
    return;
  }
  if (!cropId) {
    showToast("Please select crop", "error");
    return;
  }
  if (!pollination) {
    showToast("Please select type of pollination", "error");
    return;
  }
  if (!trialType) {
    showToast("Please select trial type", "error");
    return;
  }
  if (trialType === "Micropilot") {
    if (!Number.isFinite(mpPanel) || mpPanel <= 0) {
      showToast("Panel must be greater than 0", "error");
      return;
    }
    if (!Number.isFinite(ratioFemale) || ratioFemale <= 0 || !Number.isFinite(ratioMale) || ratioMale <= 0) {
      showToast("Female and Male ratio must be greater than 0", "error");
      return;
    }
    if (!Number.isFinite(mpPlotLength) || mpPlotLength <= 0) {
      showToast("Plot Length must be greater than 0", "error");
      return;
    }
    if (!Number.isFinite(mpSpacingWidth) || mpSpacingWidth <= 0 || !Number.isFinite(mpSpacingHeight) || mpSpacingHeight <= 0) {
      showToast("Plant Spacing Width and Height must be greater than 0", "error");
      return;
    }
  }
  if (!plantingSeason) {
    showToast("Please select planting season", "error");
    return;
  }
  if (!Number.isFinite(trialFactors) || trialFactors < 1) {
    showToast("No. of Factors must be at least 1", "error");
    return;
  }
  if (factorDefinitions.length !== trialFactors) {
    showToast(`Please fill ${trialFactors} factor(s)`, "error");
    return;
  }
  const invalidFactorIndex = factorDefinitions.findIndex((factor) => !factor.name || factor.treatments.length === 0);
  if (invalidFactorIndex >= 0) {
    showToast(`Please complete Factor ${invalidFactorIndex + 1} name and treatments`, "error");
    return;
  }
  if (selectedParams.length === 0) {
    showToast("Please select at least one observation parameter", "error");
    return;
  }
  if (trialState.currentAreas.length === 0) {
    showToast("Please draw at least one trial area", "error");
    return;
  }

  const missingAreaPlantingDate = trialState.currentAreas.findIndex(
    (area) => !(area?.plantingDate || "").trim(),
  );
  if (missingAreaPlantingDate >= 0) {
    showToast(
      `Please set planting date for ${trialState.currentAreas[missingAreaPlantingDate]?.name || `Area ${missingAreaPlantingDate + 1}`}`,
      "error",
    );
    return;
  }

  try {
    // Calculate line usage across all areas
    const lineUsage = {}; // {lineId: count}
    trialState.currentAreas.forEach(area => {
      if (area.layout && area.layout.lines) {
        area.layout.lines.forEach(line => {
          // Count how many times this line appears (lines × replications)
          const numReps = area.layout.numReps || 1;
          lineUsage[line.id] = (lineUsage[line.id] || 0) + numReps;
        });
      }
    });

    // Validate line availability (only for new trials, not edits)
    if (!trialState.editingTrialId) {
      const insufficientLines = [];
      for (const [lineId, neededQty] of Object.entries(lineUsage)) {
        const lineItem = inventoryState.items.lines.find(l => l.id === lineId);
        if (lineItem) {
          const availableQty = lineItem.quantity || 0;
          if (availableQty < neededQty) {
            insufficientLines.push({
              name: lineItem.name,
              available: availableQty,
              needed: neededQty
            });
          }
        }
      }

      if (insufficientLines.length > 0) {
        const errorMsg = insufficientLines.map(l => 
          `• ${l.name}: Available ${l.available}, Needed ${l.needed}`
        ).join('\n');
        
        showAlert(
          `Insufficient line quantity:\n\n${errorMsg}\n\nPlease adjust line quantities or remove lines from trial layout.`,
          "error",
          "Insufficient Lines"
        );
        return;
      }
    }

    // Get location coordinates
    let locationCoords = "";
    if (locationEl) {
      const selectedOption = locationEl.options[locationEl.selectedIndex];
      locationCoords = selectedOption?.dataset?.coords || "";
    } else if (trialState.editingTrialId) {
      const existing = trialState.trials.find(t => t.id === trialState.editingTrialId);
      locationCoords = existing?.locationCoordinates || "";
    }

    let trial;
    let oldLineUsage = {}; // Track old usage for edits

    if (trialState.editingTrialId) {
      // Update existing trial
      trial = trialState.trials.find((t) => t.id === trialState.editingTrialId);
      if (trial) {
        // Store old line usage to restore quantities
        oldLineUsage = trial.consumedLines || {};
        
        trial.name = name;
        trial.description = description;
        trial.plantingStart = plantingStart;
        trial.plantingEnd = plantingEnd;
        trial.plantingSeason = plantingSeason;
        trial.cropId = cropId;
        trial.cropName = cropName;
        trial.pollination = pollination;
        trial.trialType = trialType;
        trial.expDesign = expDesign;
        trial.trialFactors = trialFactors;
        trial.factorDefinitions = factorDefinitions;
        trial.treatments = factorDefinitions.map((factor) => factor.name);
        trial.rowsPerPlot = Number.isFinite(rowsPerPlot) ? rowsPerPlot : null;
        trial.plotLength = Number.isFinite(plotLength) ? plotLength : null;
        trial.plantSpacingWidth = Number.isFinite(plantSpacingWidth)
          ? plantSpacingWidth
          : null;
        trial.plantSpacingHeight = Number.isFinite(plantSpacingHeight)
          ? plantSpacingHeight
          : null;
        trial.plotArea = plotArea;
        trial.expectedPlantsPerPlot = expectedPlantsPerPlot;
        trial.populationPerHa = populationPerHa;
        trial.mpPanel = Number.isFinite(mpPanel) ? mpPanel : null;
        trial.ratioFemale = Number.isFinite(ratioFemale) ? ratioFemale : null;
        trial.ratioMale = Number.isFinite(ratioMale) ? ratioMale : null;
        trial.mpFemaleLineNames = mpFemaleLineNames;
        trial.mpMaleLineNames = mpMaleLineNames;
        trial.mpTotalFemaleRows = Number.isFinite(mpTotalFemaleRows) ? mpTotalFemaleRows : null;
        trial.mpTotalMaleRows = Number.isFinite(mpTotalMaleRows) ? mpTotalMaleRows : null;
        trial.mpPlotLength = Number.isFinite(mpPlotLength) ? mpPlotLength : null;
        trial.mpSpacingWidth = Number.isFinite(mpSpacingWidth) ? mpSpacingWidth : null;
        trial.mpSpacingHeight = Number.isFinite(mpSpacingHeight) ? mpSpacingHeight : null;
        trial.mpPlotArea = mpPlotArea;
        trial.mpExpectedFemale = mpExpectedFemale;
        trial.mpExpectedMale = mpExpectedMale;
        trial.mpPopFemale = mpPopFemale;
        trial.mpPopMale = mpPopMale;
        trial.locationId = locationId;
        trial.locationCoordinates = locationCoords;
        trial.parameters = selectedParams;
        trial.agronomyMonitoring = agronomyMonitoring;
        trial.agronomyItems = selectedAgronomy;
        trial.areas = trialState.currentAreas;
        delete trial.plantingDate;
        trial.consumedLines = lineUsage;
        trial.updatedAt = new Date().toISOString();
        
        // Restore old quantities then consume new
        restoreLineQuantities(oldLineUsage);
        consumeLineQuantities(lineUsage);
      }
    } else {
      // Create new trial
      trial = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name,
        description: description,
        plantingStart: plantingStart,
        plantingEnd: plantingEnd,
        plantingSeason: plantingSeason,
        cropId: cropId,
        cropName: cropName,
        pollination: pollination,
        trialType: trialType,
        expDesign: expDesign,
        trialFactors: trialFactors,
        factorDefinitions: factorDefinitions,
        treatments: factorDefinitions.map((factor) => factor.name),
        rowsPerPlot: Number.isFinite(rowsPerPlot) ? rowsPerPlot : null,
        plotLength: Number.isFinite(plotLength) ? plotLength : null,
        plantSpacingWidth: Number.isFinite(plantSpacingWidth)
          ? plantSpacingWidth
          : null,
        plantSpacingHeight: Number.isFinite(plantSpacingHeight)
          ? plantSpacingHeight
          : null,
        plotArea: plotArea,
        expectedPlantsPerPlot: expectedPlantsPerPlot,
        populationPerHa: populationPerHa,
        mpPanel: Number.isFinite(mpPanel) ? mpPanel : null,
        ratioFemale: Number.isFinite(ratioFemale) ? ratioFemale : null,
        ratioMale: Number.isFinite(ratioMale) ? ratioMale : null,
        mpFemaleLineNames: mpFemaleLineNames,
        mpMaleLineNames: mpMaleLineNames,
        mpTotalFemaleRows: Number.isFinite(mpTotalFemaleRows) ? mpTotalFemaleRows : null,
        mpTotalMaleRows: Number.isFinite(mpTotalMaleRows) ? mpTotalMaleRows : null,
        mpPlotLength: Number.isFinite(mpPlotLength) ? mpPlotLength : null,
        mpSpacingWidth: Number.isFinite(mpSpacingWidth) ? mpSpacingWidth : null,
        mpSpacingHeight: Number.isFinite(mpSpacingHeight) ? mpSpacingHeight : null,
        mpPlotArea: mpPlotArea,
        mpExpectedFemale: mpExpectedFemale,
        mpExpectedMale: mpExpectedMale,
        mpPopFemale: mpPopFemale,
        mpPopMale: mpPopMale,
        locationId: locationId,
        locationCoordinates: locationCoords,
        parameters: selectedParams,
        agronomyMonitoring: agronomyMonitoring,
        agronomyItems: selectedAgronomy,
        areas: trialState.currentAreas,
        consumedLines: lineUsage,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      trialState.trials.push(trial);
      
      // Consume line quantities
      consumeLineQuantities(lineUsage);
    }

    // Save inventory state (lines quantities changed)
    if (typeof saveLocalCache === "function") {
      saveLocalCache("inventory", { items: inventoryState.items });
    }
    
    // Sync inventory to Drive
    enqueueSync({
      label: "Save Lines",
      run: () => saveItemsToGoogleDrive("Lines", inventoryState.items.lines)
    });

    // Save to Google Drive
    enqueueSync({
      label: `Save Trial: ${trial.name}`,
      run: () => saveTrialToGoogleDrive(trial),
    });

    // Render trials
    renderTrials();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("trials", { trials: trialState.trials });
    }

    // Close modal
    closeTrialModal();

    showSuccessMessage("Trial saved locally. Syncing in background.");
  } catch (error) {
    console.error("Error saving trial:", error);
    showErrorMessage(`Error saving trial: ${error.message}`);
  }
}

// Consume line quantities
function consumeLineQuantities(lineUsage) {
  for (const [lineId, qty] of Object.entries(lineUsage)) {
    const lineItem = inventoryState.items.lines.find(l => l.id === lineId);
    if (lineItem) {
      lineItem.quantity = Math.max(0, (lineItem.quantity || 0) - qty);
    }
  }
}

// Restore line quantities
function restoreLineQuantities(lineUsage) {
  for (const [lineId, qty] of Object.entries(lineUsage)) {
    const lineItem = inventoryState.items.lines.find(l => l.id === lineId);
    if (lineItem) {
      lineItem.quantity = (lineItem.quantity || 0) + qty;
    }
  }
}

// Show delete trial modal with restore option
function showDeleteTrialModal(trial, linesList, callback) {
  const modal = document.createElement('div');
  modal.className = 'confirm-modal active';
  modal.id = 'deleteTrialModal';
  
  modal.innerHTML = `
    <div class="confirm-modal-content">
      <div class="confirm-modal-header">
        <span class="material-symbols-rounded">delete</span>
        <h3>Delete Trial</h3>
      </div>
      <div class="confirm-modal-body">
        <p>Are you sure you want to delete trial "<strong>${escapeHtml(trial.name)}</strong>"?</p>
        <p>This action cannot be undone.</p>
        ${linesList !== 'No lines to restore' ? `
          <div class="delete-trial-restore-section">
            <label class="delete-trial-restore-label">
              <input type="checkbox" id="deleteTrialRestoreCheckbox" checked>
              <span>Restore line quantities</span>
            </label>
            <div class="delete-trial-lines-list">
              ${linesList}
            </div>
            <small class="form-hint">If unchecked, line quantities will remain consumed.</small>
          </div>
        ` : ''}
      </div>
      <div class="confirm-modal-footer">
        <button class="btn btn-secondary" id="deleteTrialCancelBtn">Cancel</button>
        <button class="btn btn-primary btn-danger" id="deleteTrialConfirmBtn">Delete Trial</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const cancelBtn = modal.querySelector('#deleteTrialCancelBtn');
  const confirmBtn = modal.querySelector('#deleteTrialConfirmBtn');
  const restoreCheckbox = modal.querySelector('#deleteTrialRestoreCheckbox');
  
  const cleanup = () => {
    modal.remove();
  };
  
  cancelBtn.addEventListener('click', cleanup);
  
  confirmBtn.addEventListener('click', () => {
    const shouldRestore = restoreCheckbox ? restoreCheckbox.checked : false;
    cleanup();
    callback(shouldRestore);
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cleanup();
  });
}

// Generic confirm modal
function showConfirmModal(title, message, onConfirm, confirmButtonText = "Confirm", confirmButtonClass = "btn-primary") {
  const modal = document.createElement('div');
  modal.className = 'confirm-modal active';
  modal.id = 'genericConfirmModal';
  
  modal.innerHTML = `
    <div class="confirm-modal-content">
      <div class="confirm-modal-header">
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="confirm-modal-body">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="confirm-modal-footer">
        <button class="btn btn-secondary" id="confirmModalCancelBtn">Cancel</button>
        <button class="btn ${confirmButtonClass}" id="confirmModalConfirmBtn">${escapeHtml(confirmButtonText)}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const cancelBtn = modal.querySelector('#confirmModalCancelBtn');
  const confirmBtn = modal.querySelector('#confirmModalConfirmBtn');
  
  const cleanup = () => {
    modal.remove();
  };
  
  cancelBtn.addEventListener('click', cleanup);
  
  confirmBtn.addEventListener('click', () => {
    cleanup();
    onConfirm();
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cleanup();
  });
}

// Delete trial
function deleteTrial(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;
  
  const consumedLines = trial.consumedLines || {};
  const linesList = Object.keys(consumedLines).length > 0 
    ? Object.entries(consumedLines).map(([lineId, qty]) => {
        const lineItem = inventoryState.items.lines.find(l => l.id === lineId);
        return lineItem ? `• ${lineItem.name}: ${qty} units` : null;
      }).filter(Boolean).join('\n')
    : 'No lines to restore';
  
  // Show custom modal with restore option
  showDeleteTrialModal(trial, linesList, (restoreLines) => {
    try {
      const trialIndex = trialState.trials.findIndex((t) => t.id === trialId);
      const removedTrial = trialState.trials[trialIndex];

      if (trialIndex >= 0) {
        trialState.trials.splice(trialIndex, 1);
      }
      
      // Restore line quantities if user chose to
      if (restoreLines && removedTrial.consumedLines) {
        restoreLineQuantities(removedTrial.consumedLines);
        
        // Save inventory state
        if (typeof saveLocalCache === "function") {
          saveLocalCache("inventory", { items: inventoryState.items });
        }
        
        // Sync inventory to Drive
        enqueueSync({
          label: "Save Lines",
          run: () => saveItemsToGoogleDrive("Lines", inventoryState.items.lines)
        });
      }

      // Delete from Google Drive
      enqueueSync({
        label: `Delete Trial: ${removedTrial?.name || trialId}`,
        run: () => deleteTrialFromGoogleDrive(trialId),
      });

      // Render trials
      renderTrials();

      if (typeof saveLocalCache === "function") {
        saveLocalCache("trials", { trials: trialState.trials });
      }
      
      showAlert(restoreLines ? "Trial deleted and line quantities restored" : "Trial deleted", "success");
    } catch (error) {
      console.error("Error deleting trial:", error);
      showAlert("Error deleting trial. Please try again.", "error");
    }
  });
}

// Archive trial
function archiveTrial(trialId) {
  showConfirmModal(
    "Archive Trial",
    "Are you sure you want to archive this trial? You can unarchive it later.",
    () => {
      try {
        const trial = trialState.trials.find(t => t.id === trialId);
        if (trial) {
          trial.archived = true;
          trial.archivedAt = new Date().toISOString();
          
          // Save to Google Drive
          enqueueSync({
            label: `Archive Trial: ${trial.name}`,
            run: () => saveTrialToGoogleDrive(trial),
          });

          // Render trials
          renderTrials();

          if (typeof saveLocalCache === "function") {
            saveLocalCache("trials", { trials: trialState.trials });
          }
          
          showAlert("Trial archived", "success");
        }
      } catch (error) {
        console.error("Error archiving trial:", error);
        showAlert("Error archiving trial. Please try again.", "error");
      }
    }
  );
}

// Unarchive trial
function unarchiveTrial(trialId) {
  try {
    const trial = trialState.trials.find(t => t.id === trialId);
    if (trial) {
      trial.archived = false;
      trial.archivedAt = undefined;
      
      // Save to Google Drive
      enqueueSync({
        label: `Unarchive Trial: ${trial.name}`,
        run: () => saveTrialToGoogleDrive(trial),
      });

      // Render trials
      renderTrials();

      if (typeof saveLocalCache === "function") {
        saveLocalCache("trials", { trials: trialState.trials });
      }
      
      showAlert("Trial unarchived", "success");
    }
  } catch (error) {
    console.error("Error unarchiving trial:", error);
    showAlert("Error unarchiving trial. Please try again.", "error");
  }
}

// Load trials from Google Drive
// ===========================
// GRANULAR DRIVE STORAGE FOR TRIALS
// Structure: Advanta/Trials/{trialId}/meta.json
//            Advanta/Trials/{trialId}/responses/{areaIndex}~{paramId}~{repIndex}~{lineId}.json
// Each area+param+rep+line = separate file → maximum conflict prevention across devices
// Legacy format: {areaIndex}_{paramId}.json (still supported on load)
// ===========================

let trialsFolderId = null;

async function getTrialsFolderId() {
  if (!trialsFolderId) {
    trialsFolderId = await getOrCreateFolder("Trials", driveState.advantaFolderId);
  }
  return trialsFolderId;
}

async function loadTrialsFromGoogleDrive() {
  try {
    const rootFolderId = await getTrialsFolderId();

    // List all trial folders
    const foldersResp = await gapi.client.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1000,
    });

    const trialFolders = foldersResp.result.files || [];
    const trials = [];

    for (const folder of trialFolders) {
      try {
        // Load meta.json
        const metaFile = await findFile("meta.json", folder.id);
        if (!metaFile) continue;

        const trial = await getFileContent(metaFile.id);
        trial.id = trial.id || folder.name; // Folder name = trialId

        // Load responses from responses/ subfolder
        const responsesFolderId = await findFolder("responses", folder.id);
        if (responsesFolderId) {
          const respFiles = await gapi.client.drive.files.list({
            q: `'${responsesFolderId.id}' in parents and mimeType='application/json' and trashed=false`,
            fields: "files(id, name)",
            pageSize: 1000,
          });

          const responses = {};
          for (const respFile of (respFiles.result.files || [])) {
            try {
              const respData = await getFileContent(respFile.id);
              const fileName = respFile.name.replace(".json", "");

              if (fileName.includes("~")) {
                // New format: {areaIndex}~{paramId}~{repIndex}~{lineId}
                const parts = fileName.split("~");
                if (parts.length < 4) continue;
                const areaIndex = parts[0];
                const paramId = parts[1];
                if (!responses[areaIndex]) responses[areaIndex] = {};
                if (!responses[areaIndex][paramId]) responses[areaIndex][paramId] = {};
                Object.assign(responses[areaIndex][paramId], respData);
              } else {
                // Legacy format: {areaIndex}_{paramId}
                const sepIdx = fileName.indexOf("_");
                if (sepIdx === -1) continue;
                const areaIndex = fileName.substring(0, sepIdx);
                const paramId = fileName.substring(sepIdx + 1);
                if (!responses[areaIndex]) responses[areaIndex] = {};
                responses[areaIndex][paramId] = respData;
              }
            } catch (e) {
              console.error(`Error loading response ${respFile.name}:`, e);
            }
          }
          trial.responses = responses;
        }

        // Load agronomy responses from agronomy/ subfolder
        const agronomyFolder = await findFolder("agronomy", folder.id);
        if (agronomyFolder) {
          const agroFiles = await gapi.client.drive.files.list({
            q: `'${agronomyFolder.id}' in parents and mimeType='application/json' and trashed=false`,
            fields: "files(id, name)",
            pageSize: 1000,
          });

          const agronomyResponses = {};
          for (const agroFile of (agroFiles.result.files || [])) {
            try {
              const agroData = await getFileContent(agroFile.id);
              const fileName = agroFile.name.replace(".json", "");
              // Format: {areaIndex}~{itemId}
              const parts = fileName.split("~");
              if (parts.length < 2) continue;
              const areaIndex = parts[0];
              const itemId = parts[1];
              if (!agronomyResponses[areaIndex]) agronomyResponses[areaIndex] = {};
              agronomyResponses[areaIndex][itemId] = agroData;
            } catch (e) {
              console.error(`Error loading agronomy response ${agroFile.name}:`, e);
            }
          }
          trial.agronomyResponses = agronomyResponses;
        }

        trials.push(trial);
      } catch (e) {
        console.error(`Error loading trial folder ${folder.name}:`, e);
      }
    }

    return trials;
  } catch (error) {
    console.error("Error loading trials:", error);
    return [];
  }
}

// Save trial metadata to Google Drive (without responses)
async function saveTrialToGoogleDrive(trial) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);

  // Save meta.json (trial definition WITHOUT responses to keep it small)
  const meta = { ...trial };
  delete meta.responses; // Responses saved separately
  delete meta.agronomyResponses; // Agronomy responses saved separately

  await uploadJsonFile("meta.json", trialFolderId, meta);
}

// Save a single line's responses to Drive (targeted — per area+param+rep+line file)
async function saveTrialLineToDrive(trial, areaIndex, paramId, repIndex, lineId) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);
  const responsesFolderId = await getOrCreateFolder("responses", trialFolderId);

  // Extract all data keys belonging to this line (samples + per-line photos)
  const paramResponses = trial.responses?.[areaIndex]?.[paramId] || {};
  const lineData = {};
  const prefix = `${lineId}_${repIndex}_`;
  const exactKey = `${lineId}_${repIndex}`;

  for (const key of Object.keys(paramResponses)) {
    if (key === exactKey || key.startsWith(prefix)) {
      lineData[key] = paramResponses[key];
    }
  }

  if (Object.keys(lineData).length === 0) return; // Nothing to save

  const fileName = `${areaIndex}~${paramId}~${repIndex}~${lineId}.json`;
  await uploadJsonFile(fileName, responsesFolderId, lineData);
}

// Save all responses for a trial to Drive (full backup — iterates per area+param+rep+line)
async function saveTrialResponsesToDrive(trial) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);
  const responsesFolderId = await getOrCreateFolder("responses", trialFolderId);

  const responses = trial.responses || {};

  for (const areaIndex of Object.keys(responses)) {
    for (const paramId of Object.keys(responses[areaIndex])) {
      const area = trial.areas?.[parseInt(areaIndex)];
      const layoutResult = area?.layout?.result || [];

      for (let repIndex = 0; repIndex < layoutResult.length; repIndex++) {
        const grid = layoutResult[repIndex] || [];
        const uniqueLines = new Set();
        grid.forEach(row => (row || []).forEach(cell => {
          if (cell?.id) uniqueLines.add(cell.id);
        }));

        for (const lineId of uniqueLines) {
          const paramResponses = responses[areaIndex]?.[paramId] || {};
          const lineData = {};
          const prefix = `${lineId}_${repIndex}_`;
          const exactKey = `${lineId}_${repIndex}`;

          for (const key of Object.keys(paramResponses)) {
            if (key === exactKey || key.startsWith(prefix)) {
              lineData[key] = paramResponses[key];
            }
          }

          if (Object.keys(lineData).length === 0) continue;

          const fileName = `${areaIndex}~${paramId}~${repIndex}~${lineId}.json`;
          await uploadJsonFile(fileName, responsesFolderId, lineData);
        }
      }
    }
  }
}

// Helper: upload/update a JSON file in a specific folder
async function uploadJsonFile(fileName, parentFolderId, data) {
  const content = JSON.stringify(data, null, 2);
  const existingFile = await findFile(fileName, parentFolderId);

  const metadata = {
    name: fileName,
    mimeType: "application/json",
  };
  if (!existingFile) {
    metadata.parents = [parentFolderId];
  }

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const body =
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    content +
    closeDelimiter;

  const request = gapi.client.request({
    path: existingFile
      ? `/upload/drive/v3/files/${existingFile.id}`
      : "/upload/drive/v3/files",
    method: existingFile ? "PATCH" : "POST",
    params: { uploadType: "multipart" },
    headers: {
      "Content-Type": 'multipart/related; boundary="' + boundary + '"',
    },
    body: body,
  });

  await request;
}

// Delete trial folder and all contents from Google Drive
async function deleteTrialFromGoogleDrive(trialId) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolder = await findFolder(trialId, rootFolderId);

  if (trialFolder) {
    // Deleting the folder deletes all contents (meta.json, responses/, etc.)
    await gapi.client.drive.files.delete({ fileId: trialFolder.id });
  }
}

// LAYOUTING SECTION FUNCTIONS

// Initialize and render layouting section
function initializeLayoutingSection() {
  const container = document.getElementById("layoutingAreasContainer");
  if (!container) return;

  container.innerHTML = "";

  // Check if we have areas from location section
  if (!trialState.currentAreas || trialState.currentAreas.length === 0) {
    container.innerHTML = `
            <div class="td-no-items">
                <p>No areas defined. Please go to the Location section and create trial areas first.</p>
            </div>
        `;
    return;
  }

  // Create layouting form for each area
  trialState.currentAreas.forEach((area, areaIndex) => {
    const areaDiv = createAreaLayoutingForm(area, areaIndex);
    container.appendChild(areaDiv);
    if (area.layout && area.layout.result) {
      renderLayoutResult(areaIndex, area.layout.result);
    }
  });
}

// Create layouting form for a single area
function createAreaLayoutingForm(area, areaIndex) {
  const cropSelect = document.getElementById("trialCrops");
  const selectedCropId = cropSelect.value;
  const selectedCropName =
    cropSelect.options[cropSelect.selectedIndex].dataset.name || "";

  // Filter lines by crop ID
  const matchingLines = inventoryState.items.lines.filter((line) => {
    return line.cropId === selectedCropId || line.cropType === selectedCropName;
  });

  const areaDiv = document.createElement("div");
  areaDiv.className = "layouting-area-card";
  areaDiv.dataset.areaIndex = areaIndex;

  let linesHTML = matchingLines
    .map((line) => {
      const qty = line.quantity !== undefined ? line.quantity : "∞";
      const qtyClass =
        line.quantity !== undefined && line.quantity <= 0
          ? "line-qty-empty"
          : "";
      return `
        <div class="picklist-item ${qtyClass}" data-id="${line.id}" data-name="${escapeHtml(line.name)}" data-disabled="${line.quantity !== undefined && line.quantity <= 0}">
          <span>${escapeHtml(line.name)}</span>
          <span class="line-quantity-badge ${qtyClass}">${qty}</span>
        </div>
      `;
    })
    .join("");

  if (matchingLines.length === 0) {
    linesHTML = '<p class="layouting-empty">No lines available for this crop.</p>';
  }

  areaDiv.innerHTML = `
        <div class="layouting-area-header">
            <div>
                <h5 class="layouting-area-title">${escapeHtml(area.name || "Area " + (areaIndex + 1))}</h5>
                <div class="layouting-area-meta">
                    Size: ${area.areaSize ? area.areaSize.hectares + " ha, " + area.areaSize.squareMeters.toLocaleString() + " m²" : "N/A"}
                </div>
            </div>
        </div>
        
        <div class="layouting-grid">
          <div class="layouting-lines">
            <label class="layouting-label">
              Select Lines
              <span class="layouting-hint"> (matching ${escapeHtml(selectedCropName)})</span>
            </label>
            <div class="dual-picklist">
              <div class="picklist-column">
                <div class="picklist-header form-hint">Available Lines</div>
                <div class="picklist-search">
                  <span class="material-symbols-rounded">search</span>
                  <input 
                    type="text" 
                    class="area-line-search" 
                    placeholder="Search lines..." 
                    data-area-index="${areaIndex}"
                  >
                </div>
                <div class="area-lines-list layouting-lines-list picklist-list" data-area-index="${areaIndex}" data-list="available">
                  ${linesHTML}
                </div>
              </div>
              <div class="picklist-controls">
                <button type="button" class="picklist-control-btn" data-action="add" data-area-index="${areaIndex}" title="Add">
                  <span class="material-symbols-rounded">arrow_forward</span>
                </button>
                <button type="button" class="picklist-control-btn" data-action="up" data-area-index="${areaIndex}" title="Move up">
                  <span class="material-symbols-rounded">arrow_upward</span>
                </button>
                <button type="button" class="picklist-control-btn" data-action="down" data-area-index="${areaIndex}" title="Move down">
                  <span class="material-symbols-rounded">arrow_downward</span>
                </button>
                <button type="button" class="picklist-control-btn danger" data-action="remove" data-area-index="${areaIndex}" title="Remove">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              </div>
              <div class="picklist-column">
                <div class="picklist-header form-hint">Selected Lines</div>
                <div class="area-selected-lines picklist-list" data-area-index="${areaIndex}" data-list="selected">
                  <!-- Selected lines populated here -->
                </div>
              </div>
            </div>
          </div>

            <div class="layouting-controls">
                <div class="layouting-field">
                  <label>Planting Date (Area)</label>
                  <input 
                    type="date" 
                    class="area-planting-date" 
                    value="${escapeHtml(area?.plantingDate || area?.layout?.plantingDate || "")}" 
                    data-area-index="${areaIndex}"
                  >
                </div>
                <div class="layouting-field">
                    <label>Number of Ranges</label>
                    <input 
                        type="number" 
                        class="area-num-ranges" 
                        min="1" 
                        value="1" 
                        data-area-index="${areaIndex}"
                    >
                </div>
                <div class="layouting-field">
                    <label>Number of Replications</label>
                    <input 
                        type="number" 
                        class="area-num-reps" 
                        min="1" 
                        value="1" 
                        data-area-index="${areaIndex}"
                    >
                </div>
                <div class="layouting-field">
                    <label>Direction</label>
                    <select 
                        class="area-direction" 
                        data-area-index="${areaIndex}"
                    >
                        <option value="serpentine">Serpentine (Snake pattern)</option>
                        <option value="straight">Straight (Top to bottom)</option>
                    </select>
                </div>
                <div class="layouting-field">
                    <label>Randomization</label>
                    <select 
                        class="area-randomization" 
                        data-area-index="${areaIndex}"
                    >
                        <option value="normal">Normal (first rep ordered, rest randomized)</option>
                        <option value="random">Random (all randomized)</option>
                    </select>
                </div>

            </div>
        </div>
        
        <div class="area-layout-result layouting-result" data-area-index="${areaIndex}">
            <!-- Layout tables will be rendered here -->
        </div>
    `;

  const searchInput = areaDiv.querySelector(".area-line-search");
  const availableList = areaDiv.querySelector(".area-lines-list");
  const selectedList = areaDiv.querySelector(".area-selected-lines");
  const controlButtons = areaDiv.querySelectorAll(
    `.picklist-control-btn[data-area-index="${areaIndex}"]`,
  );

  let selectedLineIds = Array.isArray(area.layout?.lines)
    ? area.layout.lines.map((line) => line.id)
    : [];

  const setSelection = (listEl, id) => {
    listEl.querySelectorAll(".picklist-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.id === id);
    });
    listEl.dataset.selectedId = id || "";
  };

  const renderAvailable = (searchTerm = "") => {
    if (!availableList) return;
    const filtered = matchingLines.filter((line) => {
      const match = line.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      return match && !selectedLineIds.includes(line.id);
    });

    if (filtered.length === 0) {
      availableList.innerHTML =
        '<p class="layouting-empty">No lines available for this crop.</p>';
      return;
    }

    availableList.innerHTML = filtered
      .map((line) => {
        const qty = line.quantity !== undefined ? line.quantity : "∞";
        const qtyClass =
          line.quantity !== undefined && line.quantity <= 0
            ? "line-qty-empty"
            : "";
        const disabled = line.quantity !== undefined && line.quantity <= 0;
        return `
          <div class="picklist-item ${qtyClass} ${disabled ? "disabled" : ""}" draggable="${!disabled}" data-id="${line.id}" data-name="${escapeHtml(line.name)}" data-disabled="${disabled}">
            <span>${escapeHtml(line.name)}</span>
            <span class="line-quantity-badge ${qtyClass}">${qty}</span>
          </div>
        `;
      })
      .join("");

    availableList.querySelectorAll(".picklist-item").forEach((item) => {
      if (item.dataset.disabled === "true") return;
      item.addEventListener("click", () => {
        setSelection(availableList, item.dataset.id);
        setSelection(selectedList, "");
      });
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", item.dataset.id);
        e.dataTransfer.setData("source", "available");
      });
    });
  };

  const renderSelected = () => {
    if (!selectedList) return;
    if (selectedLineIds.length === 0) {
      selectedList.innerHTML =
        '<p class="layouting-empty">No lines selected</p>';
      return;
    }

    selectedList.innerHTML = selectedLineIds
      .map((id) => {
        const line = matchingLines.find((l) => l.id === id);
        if (!line) return "";
        const qty = line.quantity !== undefined ? line.quantity : "∞";
        const qtyClass =
          line.quantity !== undefined && line.quantity <= 0
            ? "line-qty-empty"
            : "";
        return `
          <div class="picklist-item" draggable="true" data-id="${line.id}" data-name="${escapeHtml(line.name)}">
            <span>${escapeHtml(line.name)}</span>
            <span class="line-quantity-badge ${qtyClass}">${qty}</span>
          </div>
        `;
      })
      .join("");

    selectedList.querySelectorAll(".picklist-item").forEach((item) => {
      item.addEventListener("click", () => {
        setSelection(selectedList, item.dataset.id);
        setSelection(availableList, "");
      });
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", item.dataset.id);
        e.dataTransfer.setData("source", "selected");
      });
      item.addEventListener("dragover", (e) => e.preventDefault());
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        const source = e.dataTransfer.getData("source");
        if (!draggedId) return;
        if (source === "selected") {
          const fromIndex = selectedLineIds.indexOf(draggedId);
          const toIndex = selectedLineIds.indexOf(item.dataset.id);
          if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
            const [moved] = selectedLineIds.splice(fromIndex, 1);
            selectedLineIds.splice(toIndex, 0, moved);
            renderSelected();
            autoGenerateLayout();
          }
        } else if (source === "available") {
          if (!selectedLineIds.includes(draggedId)) {
            const toIndex = selectedLineIds.indexOf(item.dataset.id);
            selectedLineIds.splice(toIndex, 0, draggedId);
            renderSelected();
            renderAvailable(searchInput.value);
            autoGenerateLayout();
          }
        }
      });
    });
  };

  const addSelectedFromAvailable = () => {
    const selectedId = availableList?.dataset.selectedId;
    if (!selectedId) return;
    if (!selectedLineIds.includes(selectedId)) {
      selectedLineIds.push(selectedId);
      renderSelected();
      renderAvailable(searchInput.value);
      autoGenerateLayout();
    }
  };

  const removeSelectedFromSelected = () => {
    const selectedId = selectedList?.dataset.selectedId;
    if (!selectedId) return;
    selectedLineIds = selectedLineIds.filter((id) => id !== selectedId);
    renderSelected();
    renderAvailable(searchInput.value);
    autoGenerateLayout();
  };

  const moveSelected = (direction) => {
    const selectedId = selectedList?.dataset.selectedId;
    if (!selectedId) return;
    const currentIndex = selectedLineIds.indexOf(selectedId);
    if (currentIndex === -1) return;
    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= selectedLineIds.length) return;
    const [moved] = selectedLineIds.splice(currentIndex, 1);
    selectedLineIds.splice(newIndex, 0, moved);
    renderSelected();
    setSelection(selectedList, selectedId);
    autoGenerateLayout();
  };

  const handleListDrop = (targetList) => (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const source = e.dataTransfer.getData("source");
    if (!draggedId) return;

    if (targetList === "selected") {
      if (!selectedLineIds.includes(draggedId)) {
        selectedLineIds.push(draggedId);
        renderSelected();
        renderAvailable(searchInput.value);
        autoGenerateLayout();
      }
    }

    if (targetList === "available" && source === "selected") {
      selectedLineIds = selectedLineIds.filter((id) => id !== draggedId);
      renderSelected();
      renderAvailable(searchInput.value);
      autoGenerateLayout();
    }
  };

  if (availableList) {
    availableList.addEventListener("dragover", (e) => e.preventDefault());
    availableList.addEventListener("drop", handleListDrop("available"));
  }
  if (selectedList) {
    selectedList.addEventListener("dragover", (e) => e.preventDefault());
    selectedList.addEventListener("drop", handleListDrop("selected"));
  }

  controlButtons.forEach((btn) => {
    const action = btn.dataset.action;
    if (action === "add") btn.addEventListener("click", addSelectedFromAvailable);
    if (action === "remove") btn.addEventListener("click", removeSelectedFromSelected);
    if (action === "up") btn.addEventListener("click", () => moveSelected("up"));
    if (action === "down") btn.addEventListener("click", () => moveSelected("down"));
  });

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      renderAvailable(e.target.value);
    });
  }

  // Auto-generate layout on input change with debounce
  let layoutDebounceTimer;
  const autoGenerateLayout = () => {
    clearTimeout(layoutDebounceTimer);
    layoutDebounceTimer = setTimeout(() => {
      generateLayoutForArea(areaIndex);
    }, 500);
  };

  // Add event listeners for auto-generate
  areaDiv
    .querySelector(".area-num-ranges")
    .addEventListener("change", autoGenerateLayout);
  areaDiv
    .querySelector(".area-num-reps")
    .addEventListener("change", autoGenerateLayout);
  areaDiv
    .querySelector(".area-direction")
    .addEventListener("change", autoGenerateLayout);
  areaDiv
    .querySelector(".area-randomization")
    .addEventListener("change", autoGenerateLayout);

  const areaPlantingDateInput = areaDiv.querySelector(".area-planting-date");
  if (areaPlantingDateInput) {
    areaPlantingDateInput.addEventListener("change", (event) => {
      if (!trialState.currentAreas[areaIndex]) return;
      trialState.currentAreas[areaIndex].plantingDate = event.target.value || "";
    });
  }

  renderAvailable();
  renderSelected();

  // If editing and layout exists, pre-populate form
  if (area.layout && area.layout.lines) {
    const numRangesInput = areaDiv.querySelector(".area-num-ranges");
    const numRepsInput = areaDiv.querySelector(".area-num-reps");
    const directionSelect = areaDiv.querySelector(".area-direction");
    const randomizationSelect = areaDiv.querySelector(".area-randomization");
    const plantingDateInput = areaDiv.querySelector(".area-planting-date");

    if (numRangesInput) numRangesInput.value = area.layout.numRanges || 1;
    if (numRepsInput) numRepsInput.value = area.layout.numReps || 1;
    if (directionSelect)
      directionSelect.value = area.layout.direction || "serpentine";
    if (randomizationSelect)
      randomizationSelect.value = area.layout.randomization || "normal";
    if (plantingDateInput) {
      plantingDateInput.value = area?.plantingDate || area?.layout?.plantingDate || "";
    }

    // Render existing layout result
    if (area.layout.result) {
      renderLayoutResult(areaIndex, area.layout.result);
    }
  }

  return areaDiv;
}

// Generate layout for a specific area
function generateLayoutForArea(areaIndex) {
  const areaDiv = document.querySelector(`[data-area-index="${areaIndex}"]`);
  if (!areaDiv) return;

  // Get selected lines from picklist (ordered)
  const selectedItems = areaDiv.querySelectorAll(
    ".area-selected-lines .picklist-item",
  );
  const selectedLines = Array.from(selectedItems).map((item) => ({
    id: item.dataset.id,
    name: item.dataset.name || item.textContent.trim(),
  }));

  const resultContainer = document.querySelector(
    `.area-layout-result[data-area-index="${areaIndex}"]`,
  );

  // If no lines selected, show empty message
  if (selectedLines.length === 0) {
    if (resultContainer) {
      resultContainer.innerHTML =
        '<div class="td-no-items">Select lines to generate layout</div>';
    }
    return;
  }

  const numRanges =
    parseInt(areaDiv.querySelector(".area-num-ranges").value) || 1;
  const numReps = parseInt(areaDiv.querySelector(".area-num-reps").value) || 1;
  const direction = areaDiv.querySelector(".area-direction").value;
  const randomization = areaDiv.querySelector(".area-randomization").value;

  // Validate
  if (numRanges < 1 || numReps < 1) {
    return;
  }

  // Calculate layout
  const layouts = calculateLayout(
    selectedLines,
    numRanges,
    numReps,
    direction,
    randomization,
  );

  // Store layout in trial state
  if (!trialState.currentAreas[areaIndex].layout) {
    trialState.currentAreas[areaIndex].layout = {};
  }
  trialState.currentAreas[areaIndex].layout = {
    lines: selectedLines,
    numRanges: numRanges,
    numReps: numReps,
    direction: direction,
    randomization: randomization,
    result: layouts,
  };

  // Render layout
  renderLayoutResult(areaIndex, layouts);
}

// Calculate layout based on parameters
function calculateLayout(
  selectedLines,
  numRanges,
  numReps,
  direction,
  randomization,
) {
  const replicationLayouts = [];

  for (let rep = 0; rep < numReps; rep++) {
    let repLines = [...selectedLines];

    // Apply randomization
    if (randomization === "random" || (randomization === "normal" && rep > 0)) {
      // Fisher-Yates shuffle
      for (let i = repLines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [repLines[i], repLines[j]] = [repLines[j], repLines[i]];
      }
    }

    // Create grid
    const numColumns = Math.ceil(repLines.length / numRanges);
    const grid = [];

    // Distribute lines across grid
    let lineIndex = 0;

    if (direction === "serpentine") {
      // Serpentine: alternate top-to-bottom and bottom-to-top
      for (let col = 0; col < numColumns; col++) {
        const isReverseCol = col % 2 === 1;
        const rowOrder = isReverseCol
          ? Array.from({ length: numRanges }, (_, i) => numRanges - 1 - i)
          : Array.from({ length: numRanges }, (_, i) => i);

        rowOrder.forEach((row) => {
          if (!grid[row]) grid[row] = [];
          if (lineIndex < repLines.length) {
            grid[row][col] = repLines[lineIndex];
            lineIndex++;
          } else {
            grid[row][col] = null;
          }
        });
      }
    } else {
      // Straight: top to bottom in all columns
      for (let col = 0; col < numColumns; col++) {
        for (let row = 0; row < numRanges; row++) {
          if (!grid[row]) grid[row] = [];
          if (lineIndex < repLines.length) {
            grid[row][col] = repLines[lineIndex];
            lineIndex++;
          } else {
            grid[row][col] = null;
          }
        }
      }
    }

    replicationLayouts.push(grid);
  }

  return replicationLayouts;
}

// Render layout result as tables
function renderLayoutResult(areaIndex, layouts) {
  const resultContainer = document.querySelector(
    `.area-layout-result[data-area-index="${areaIndex}"]`,
  );
  if (!resultContainer) return;

  let html = "";

  layouts.forEach((grid, repIndex) => {
    html += `
            <div class="layouting-table-wrap">
                <div class="layouting-table-title">Replication ${repIndex + 1}</div>
                <table class="layouting-table">
                    <tbody>
                        ${grid
                          .map(
                            (row, rowIdx) => `
                            <tr>
                                <td class="layouting-row-header">Range ${rowIdx + 1}</td>
                                ${row
                                  .map(
                                    (cell) => `
                                    <td class="layouting-td">
                                        ${cell ? escapeHtml(cell.name) : "-"}
                                    </td>
                                `,
                                  )
                                  .join("")}
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        `;
  });

  resultContainer.innerHTML = html;
}

// Validate layouting section
function validateLayoutingSection() {
  // At least one area should have a layout defined
  const hasAnyLayout = trialState.currentAreas.some(
    (area) => area.layout && area.layout.result,
  );

  if (!hasAnyLayout) {
    showToast("Please generate layout for at least one area", "error");
    return false;
  }

  return true;
}

// ===========================
// RUN TRIAL FUNCTIONALITY
// ===========================

let runTrialState = {
  currentTrialId: null,
  currentTrial: null,
  currentAreaIndex: null,
  currentParamId: null,
  currentLineId: null,
  currentRepIndex: null,
  responses: {}, // { areaIndex: { paramId: { lineId_repIndex: { value, photos } } } }
  photoFiles: [], // Temporary photo storage
};

// ===========================
// AGRONOMY MONITORING
// ===========================

let agronomyMonitoringState = {
  currentTrialId: null,
  currentTrial: null,
  currentAreaIndex: null,
  currentItemId: null,
  responses: {}, // { areaIndex: { agronomyItemId: { applicationDate, photos, timestamp } } }
};

let agronomyAutoSaveInProgress = false;

// Get agronomy items for a trial, sorted by dapMin
function getTrialAgronomyItems(trial) {
  if (!trial || !trial.agronomyItems || !trial.agronomyItems.length) return [];
  return trial.agronomyItems
    .map(id => inventoryState.items.agronomy?.find(a => a.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.dapMin ?? 9999) - (b.dapMin ?? 9999));
}

// Build flat navigation list: [{areaIndex, itemId, areaName, itemName}]
function getAllAgronomyNavPositions() {
  const trial = agronomyMonitoringState.currentTrial;
  if (!trial) return [];
  const items = getTrialAgronomyItems(trial);
  const positions = [];
  (trial.areas || []).forEach((area, areaIndex) => {
    items.forEach(item => {
      positions.push({
        areaIndex,
        itemId: item.id,
        areaName: area.name || `Area ${areaIndex + 1}`,
        itemActivity: item.activity || item.name || "-",
      });
    });
  });
  return positions;
}

// Calculate agronomy monitoring progress
function calculateAgronomyProgress(trial) {
  const items = getTrialAgronomyItems(trial);
  const areas = trial.areas || [];
  const responses = trial.agronomyResponses || {};
  let total = 0, completed = 0;
  areas.forEach((_, areaIndex) => {
    items.forEach(item => {
      total++;
      const resp = responses[areaIndex]?.[item.id];
      if (resp && resp.applicationDate && resp.photos && resp.photos.length > 0) completed++;
    });
  });
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percentage };
}

// Combined Observation + Agronomy progress
function calculateCombinedTrialProgress(trial) {
  const obs = calculateTrialProgress(trial);
  const hasAgronomy = trial.agronomyMonitoring && trial.agronomyItems && trial.agronomyItems.length > 0;
  const agro = hasAgronomy ? calculateAgronomyProgress(trial) : { completed: 0, total: 0, percentage: 0 };
  const total = obs.total + agro.total;
  const completed = obs.completed + agro.completed;
  return {
    completed, total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    obs, agro,
  };
}

// Check if an agronomy item is complete
function isAgronomyItemComplete(areaIndex, itemId) {
  const resp = agronomyMonitoringState.responses[areaIndex]?.[itemId];
  return !!(resp && resp.applicationDate && resp.photos && resp.photos.length > 0);
}

// Calculate expected date for a DAP value
function getDapExpectedDate(trial, areaIndex, dapMin) {
  const plantingDate = getAreaPlantingDate(trial, areaIndex);
  if (!plantingDate || dapMin == null) return null;
  const planting = new Date(plantingDate + "T00:00:00");
  if (isNaN(planting.getTime())) return null;
  planting.setDate(planting.getDate() + Number(dapMin));
  return planting;
}

// Start Agronomy Monitoring
function startAgronomyMonitoring(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  agronomyMonitoringState.currentTrialId = trialId;
  agronomyMonitoringState.currentTrial = trial;
  agronomyMonitoringState.responses = trial.agronomyResponses || {};
  agronomyMonitoringState.currentAreaIndex = null;
  agronomyMonitoringState.currentItemId = null;

  // Hide trial list, show agronomy interface
  const mgmtPanel = document.getElementById("trialManagementPanel");
  const archivePanel = document.getElementById("archivedTrialManagementPanel");
  if (mgmtPanel) mgmtPanel.classList.add("hidden");
  if (archivePanel) archivePanel.classList.add("hidden");
  document.getElementById("agronomyMonitoringInterface").classList.remove("hidden");

  // Modify topbar
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");
  const syncButtons = document.querySelectorAll("#syncDownBtn, #runTrialNavBtn, #userMenu");

  if (topbar) topbar.classList.add("run-trial-mode");
  if (pageTitle) pageTitle.textContent = `${trial.name}`;
  if (menuToggle) {
    menuToggle.onclick = confirmExitAgronomyMonitoring;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">arrow_back</span>';
  }

  const runTrialNavBtn = document.getElementById("runTrialNavBtn");
  const runTrialSaveBtn = document.getElementById("runTrialSaveBtn");
  if (runTrialNavBtn) {
    runTrialNavBtn.style.display = "flex";
    runTrialNavBtn.classList.remove("hidden");
    runTrialNavBtn.onclick = openAgronomyMobileNav;
  }
  if (runTrialSaveBtn) {
    runTrialSaveBtn.style.display = "flex";
    runTrialSaveBtn.classList.remove("hidden");
    runTrialSaveBtn.onclick = manualSaveAgronomyProgress;
  }
  syncButtons.forEach(btn => {
    if (btn.id !== "runTrialNavBtn") btn.style.display = "none";
  });

  document.body.classList.add("run-trial-active", "sidebar-collapsed");

  renderAgronomyNavTree();
  renderAgronomyEmptyState();
}

// Exit Agronomy Monitoring
function exitAgronomyMonitoring() {
  agronomyMonitoringState.currentTrialId = null;
  agronomyMonitoringState.currentTrial = null;
  agronomyMonitoringState.responses = {};
  agronomyMonitoringState.currentAreaIndex = null;
  agronomyMonitoringState.currentItemId = null;

  const mgmtPanel = document.getElementById("trialManagementPanel");
  if (mgmtPanel) mgmtPanel.classList.remove("hidden");
  document.getElementById("agronomyMonitoringInterface").classList.add("hidden");
  renderTrials();

  // Restore topbar
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");
  const syncButtons = document.querySelectorAll("#syncDownBtn, #runTrialNavBtn, #userMenu");

  if (topbar) topbar.classList.remove("run-trial-mode");
  if (pageTitle) pageTitle.textContent = "Trial";
  if (menuToggle) {
    menuToggle.onclick = null;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">menu</span>';
  }
  const runTrialNavBtn = document.getElementById("runTrialNavBtn");
  const runTrialSaveBtn = document.getElementById("runTrialSaveBtn");
  if (runTrialNavBtn) { runTrialNavBtn.style.display = "none"; runTrialNavBtn.classList.add("hidden"); runTrialNavBtn.onclick = openMobileNav; }
  if (runTrialSaveBtn) { runTrialSaveBtn.style.display = "none"; runTrialSaveBtn.classList.add("hidden"); runTrialSaveBtn.onclick = () => manualSaveProgress(); }
  syncButtons.forEach(btn => {
    btn.style.display = "";
  });

  document.body.classList.remove("run-trial-active", "sidebar-collapsed");
}

function confirmExitAgronomyMonitoring() {
  const doExit = () => {
    saveAgronomyResponseSilent();
    autoSaveAgronomyProgress();
    exitAgronomyMonitoring();
  };
  if (typeof showConfirmModal === "function") {
    showConfirmModal(
      "Exit Agronomy Monitoring",
      "Are you sure you want to exit? Current progress will be saved automatically.",
      doExit,
      "Exit",
      "btn-primary",
    );
  } else if (window.confirm("Exit Agronomy Monitoring? Progress will be saved.")) {
    doExit();
  }
}

// Render empty state
function renderAgronomyEmptyState() {
  const container = document.getElementById("agronomyQuestionCard");
  if (!container) return;
  container.innerHTML = `
    <div class="run-empty-state">
      <span class="material-symbols-rounded">local_florist</span>
      <p>Select an agronomy item from the navigation to start monitoring</p>
    </div>
  `;
}

// Render navigation tree
function renderAgronomyNavTree() {
  const container = document.getElementById("agronomyNavTree");
  const trial = agronomyMonitoringState.currentTrial;
  if (!container || !trial) return;

  const items = getTrialAgronomyItems(trial);
  const areas = trial.areas || [];
  const progress = calculateAgronomyProgress(trial);

  let html = `
    <div class="run-nav-progress">
      <div class="run-nav-progress-bar">
        <div class="run-nav-progress-fill" style="width:${progress.percentage}%"></div>
      </div>
      <span class="run-nav-progress-text">${progress.completed}/${progress.total} (${progress.percentage}%)</span>
    </div>
  `;

  areas.forEach((area, areaIndex) => {
    const areaCompleted = items.filter(item => isAgronomyItemComplete(areaIndex, item.id)).length;
    const areaTotal = items.length;
    const isAreaActive = agronomyMonitoringState.currentAreaIndex === areaIndex;

    html += `
      <div class="run-nav-area ${isAreaActive ? 'active' : ''}">
        <div class="run-nav-area-header" onclick="toggleAgronomyNavArea(${areaIndex})">
          <span class="material-symbols-rounded run-nav-area-icon">location_on</span>
          <span class="run-nav-area-name">${escapeHtml(area.name || `Area ${areaIndex + 1}`)}</span>
          <span class="run-nav-area-count">${areaCompleted}/${areaTotal}</span>
          <span class="material-symbols-rounded run-nav-toggle-icon">expand_more</span>
        </div>
        <div class="run-nav-area-children ${isAreaActive ? '' : 'collapsed'}">
    `;

    items.forEach(item => {
      const isActive = agronomyMonitoringState.currentAreaIndex === areaIndex &&
                        agronomyMonitoringState.currentItemId === item.id;
      const isComplete = isAgronomyItemComplete(areaIndex, item.id);
      const dapLabel = item.dapMin != null ? `DAP ${item.dapMin}${item.dapMax != null && item.dapMax !== item.dapMin ? '-' + item.dapMax : ''}` : '';

      // Check if it's too early for this item
      const expectedDate = getDapExpectedDate(trial, areaIndex, item.dapMin);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isTooEarly = expectedDate && today < expectedDate && !isComplete;

      html += `
        <div class="run-nav-line ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''} ${isTooEarly ? 'agronomy-nav-early' : ''}"
             onclick="selectAgronomyItem(${areaIndex}, '${item.id}')">
          <span class="material-symbols-rounded run-nav-line-icon">
            ${isComplete ? 'check_circle' : isTooEarly ? 'schedule' : 'radio_button_unchecked'}
          </span>
          <div class="run-nav-line-text">
            <span class="run-nav-line-name">${escapeHtml(item.activity || item.name || '-')}</span>
            ${dapLabel ? `<span class="run-nav-line-meta">${dapLabel}</span>` : ''}
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;

  // Update mobile header progress
  const headerProgress = document.querySelector('#agronomyMonitoringInterface .nav-header-progress');
  if (headerProgress) {
    headerProgress.innerHTML = `
      <div class="run-nav-progress-bar">
        <div class="run-nav-progress-fill" style="width:${progress.percentage}%"></div>
      </div>
      <span class="run-nav-progress-text">${progress.completed}/${progress.total} (${progress.percentage}%)</span>
    `;
  }
}

function toggleAgronomyNavArea(areaIndex) {
  const container = document.getElementById("agronomyNavTree");
  const areas = container?.querySelectorAll(".run-nav-area");
  if (!areas || !areas[areaIndex]) return;
  const children = areas[areaIndex].querySelector(".run-nav-area-children");
  if (children) children.classList.toggle("collapsed");
}

// Select agronomy item
function selectAgronomyItem(areaIndex, itemId) {
  // Auto-save previous response
  saveAgronomyResponseSilent();

  agronomyMonitoringState.currentAreaIndex = areaIndex;
  agronomyMonitoringState.currentItemId = itemId;

  renderAgronomyNavTree();
  renderAgronomyQuestionCard();
  closeAgronomyMobileNav();
}

// Render the question card
function renderAgronomyQuestionCard() {
  const container = document.getElementById("agronomyQuestionCard");
  const trial = agronomyMonitoringState.currentTrial;
  const areaIndex = agronomyMonitoringState.currentAreaIndex;
  const itemId = agronomyMonitoringState.currentItemId;

  if (!container || !trial || areaIndex === null || !itemId) {
    renderAgronomyEmptyState();
    return;
  }

  const area = trial.areas[areaIndex];
  const item = inventoryState.items.agronomy?.find(a => a.id === itemId);
  if (!area || !item) { renderAgronomyEmptyState(); return; }

  // Get existing response
  const resp = agronomyMonitoringState.responses[areaIndex]?.[itemId] || {};
  const existingDate = resp.applicationDate || new Date().toISOString().split("T")[0];
  const existingPhotos = resp.photos || [];

  // DAP info & warning
  const expectedDate = getDapExpectedDate(trial, areaIndex, item.dapMin);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isTooEarly = expectedDate && today < expectedDate;
  const expectedDateStr = expectedDate ? expectedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

  // DAP label
  const dapLabel = item.dapMin != null
    ? (item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin
        ? `DAP ${item.dapMin}–${item.dapMax}`
        : `DAP ${item.dapMin}`)
    : null;

  // Build details chips
  const detailChips = [dapLabel, item.chemical, item.dose].filter(Boolean);

  // Navigation info
  const positions = getAllAgronomyNavPositions();
  const currentIdx = positions.findIndex(p => p.areaIndex === areaIndex && p.itemId === itemId);
  const isFirst = currentIdx <= 0;
  const isLast = currentIdx >= positions.length - 1;

  // Check if area boundary
  const prevPos = currentIdx > 0 ? positions[currentIdx - 1] : null;
  const nextPos = currentIdx < positions.length - 1 ? positions[currentIdx + 1] : null;
  const isPrevDifferentArea = prevPos && prevPos.areaIndex !== areaIndex;
  const isNextDifferentArea = nextPos && nextPos.areaIndex !== areaIndex;

  // Photo section
  const photoHTML = `
    <div class="run-photo-section">
      <div class="run-photo-label">
        <span class="material-symbols-rounded">photo_camera</span>
        Photo Documentation
      </div>
      <div class="run-photo-upload" id="agronomyPhotoContainer">
        ${existingPhotos.map((photo, idx) => `
          <div class="run-photo-preview" data-index="${idx}" onclick="openAgronomyPhotoPreview(${idx})">
            <img src="${photo}" alt="Photo ${idx + 1}">
            <button class="run-photo-remove" onclick="removeAgronomyPhoto(${idx}); event.stopPropagation();">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
        `).join("")}
        <label class="run-photo-add" onclick="showAgronomyPhotoUploadChoice(event)">
          <span class="material-symbols-rounded">add_a_photo</span>
          <span>Add</span>
        </label>
      </div>
    </div>
  `;

  container.innerHTML = `
    <div class="run-question-header">
      <div class="run-question-breadcrumb">
        ${escapeHtml(area.name || `Area ${areaIndex + 1}`)} › Agronomy Monitoring
      </div>
      <div class="run-question-title">${escapeHtml(item.activity || item.name || "-")}</div>
      ${detailChips.length > 0 ? `
        <div class="agronomy-detail-chips">
          ${detailChips.map(chip => `<span class="agronomy-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      ` : ''}
    </div>

    ${isTooEarly ? `
      <div class="agronomy-dap-warning">
        <span class="material-symbols-rounded">warning</span>
        <p><strong>Not yet due</strong> — scheduled for <strong>${expectedDateStr}</strong> (${dapLabel}), it may be too early to apply.</p>
      </div>
    ` : ''}

    ${item.remark ? `
      <div class="agronomy-remark-box">
        <span class="material-symbols-rounded">info</span>
        <p>${escapeHtml(item.remark)}</p>
      </div>
    ` : ''}

    <div class="run-question-body">
      <div class="run-input-group">
        <label class="run-input-label">
          Actual Application Date
        </label>
        <input type="date" class="run-input-field" id="agronomyDateInput" value="${existingDate}">
      </div>
      ${photoHTML}
    </div>

    <div class="run-question-footer">
      <div class="run-nav-buttons">
        <div class="run-line-nav">
          ${isPrevDifferentArea && !isFirst ? `
            <button class="btn btn-secondary" onclick="navigateAgronomyPrev()">
              <span class="material-symbols-rounded">arrow_back</span>
              Prev Area
            </button>
          ` : `
            <button class="btn btn-secondary" onclick="navigateAgronomyPrev()" ${isFirst ? 'disabled' : ''}>
              <span class="material-symbols-rounded">arrow_back</span>
              Previous
            </button>
          `}
          ${isLast ? `
            <button class="btn btn-primary" onclick="finishAgronomyMonitoring()">
              Finish
              <span class="material-symbols-rounded">check_circle</span>
            </button>
          ` : isNextDifferentArea ? `
            <button class="btn btn-primary" onclick="navigateAgronomyNext()">
              Next Area
              <span class="material-symbols-rounded">arrow_forward</span>
            </button>
          ` : `
            <button class="btn btn-primary" onclick="navigateAgronomyNext()">
              Next
              <span class="material-symbols-rounded">arrow_forward</span>
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

// Navigation
function navigateAgronomyPrev() {
  saveAgronomyResponseSilent();
  autoSaveAgronomyProgress();

  const positions = getAllAgronomyNavPositions();
  const currentIdx = positions.findIndex(p =>
    p.areaIndex === agronomyMonitoringState.currentAreaIndex &&
    p.itemId === agronomyMonitoringState.currentItemId
  );
  if (currentIdx > 0) {
    const prev = positions[currentIdx - 1];
    agronomyMonitoringState.currentAreaIndex = prev.areaIndex;
    agronomyMonitoringState.currentItemId = prev.itemId;
    renderAgronomyNavTree();
    renderAgronomyQuestionCard();
  }
}

function navigateAgronomyNext() {
  saveAgronomyResponseSilent();
  autoSaveAgronomyProgress();

  const positions = getAllAgronomyNavPositions();
  const currentIdx = positions.findIndex(p =>
    p.areaIndex === agronomyMonitoringState.currentAreaIndex &&
    p.itemId === agronomyMonitoringState.currentItemId
  );
  if (currentIdx < positions.length - 1) {
    const next = positions[currentIdx + 1];
    agronomyMonitoringState.currentAreaIndex = next.areaIndex;
    agronomyMonitoringState.currentItemId = next.itemId;
    renderAgronomyNavTree();
    renderAgronomyQuestionCard();
  }
}

// Save current response silently
function saveAgronomyResponseSilent() {
  const areaIndex = agronomyMonitoringState.currentAreaIndex;
  const itemId = agronomyMonitoringState.currentItemId;
  if (areaIndex === null || !itemId) return;

  const dateInput = document.getElementById("agronomyDateInput");
  const applicationDate = dateInput ? dateInput.value : "";

  if (!agronomyMonitoringState.responses[areaIndex]) {
    agronomyMonitoringState.responses[areaIndex] = {};
  }
  if (!agronomyMonitoringState.responses[areaIndex][itemId]) {
    agronomyMonitoringState.responses[areaIndex][itemId] = { applicationDate: "", photos: [], timestamp: "" };
  }

  agronomyMonitoringState.responses[areaIndex][itemId].applicationDate = applicationDate;
  agronomyMonitoringState.responses[areaIndex][itemId].timestamp = new Date().toISOString();
}

// Auto-save to storage and Drive
async function autoSaveAgronomyProgress() {
  if (agronomyAutoSaveInProgress) return;
  const trial = agronomyMonitoringState.currentTrial;
  if (!trial) return;

  agronomyAutoSaveInProgress = true;

  const saveIcon = document.querySelector('.run-save-icon');
  const saveIconSymbol = saveIcon?.querySelector('.material-symbols-rounded');
  if (saveIcon) { saveIcon.classList.add('saving'); saveIcon.disabled = true; }
  if (saveIconSymbol) { saveIconSymbol.textContent = 'cached'; }

  try {
    trial.agronomyResponses = agronomyMonitoringState.responses;
    trial.updatedAt = new Date().toISOString();

    const idx = trialState.trials.findIndex(t => t.id === trial.id);
    if (idx !== -1) trialState.trials[idx] = trial;

    if (typeof saveLocalCache === "function") {
      saveLocalCache("trials", { trials: trialState.trials });
    }

    // Save to Drive (full agronomy responses file)
    const areaIndex = agronomyMonitoringState.currentAreaIndex;
    const itemId = agronomyMonitoringState.currentItemId;

    if (areaIndex !== null && itemId) {
      const item = inventoryState.items.agronomy?.find(a => a.id === itemId);
      const area = trial.areas?.[areaIndex];
      const trialName = trial.name || "Trial";
      const areaName = area?.name || `Area ${areaIndex + 1}`;
      const itemName = item?.activity || "Item";

      enqueueSync({
        label: `Saving ${trialName} · ${areaName} · ${itemName}`,
        fileKey: `${trial.id}~agronomy~${areaIndex}~${itemId}`,
        run: () => saveAgronomyResponseToDrive(trial, areaIndex, itemId),
      });
    } else {
      enqueueSync({
        label: `Saving ${trial.name} agronomy`,
        run: () => saveAllAgronomyResponsesToDrive(trial),
      });
    }

    renderAgronomyNavTree();

    // Keep dashboard in sync even during agronomy monitoring
    renderDashboardTrialProgress();
    if (typeof refreshReminderViewsRealtime === "function") {
      refreshReminderViewsRealtime();
    }
  } finally {
    setTimeout(() => {
      agronomyAutoSaveInProgress = false;
      if (saveIcon) { saveIcon.classList.remove('saving'); saveIcon.disabled = false; }
      if (saveIconSymbol) { saveIconSymbol.textContent = 'save'; }
    }, 500);
  }
}

// Save single agronomy response to Drive
async function saveAgronomyResponseToDrive(trial, areaIndex, itemId) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);
  const agronomyFolderId = await getOrCreateFolder("agronomy", trialFolderId);

  const responseData = trial.agronomyResponses?.[areaIndex]?.[itemId];
  if (!responseData) return;

  const fileName = `${areaIndex}~${itemId}.json`;
  await uploadJsonFile(fileName, agronomyFolderId, responseData);
}

// Save all agronomy responses to Drive
async function saveAllAgronomyResponsesToDrive(trial) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);
  const agronomyFolderId = await getOrCreateFolder("agronomy", trialFolderId);

  const responses = trial.agronomyResponses || {};
  for (const areaIndex of Object.keys(responses)) {
    for (const itemId of Object.keys(responses[areaIndex])) {
      const responseData = responses[areaIndex][itemId];
      if (!responseData) continue;
      const fileName = `${areaIndex}~${itemId}.json`;
      await uploadJsonFile(fileName, agronomyFolderId, responseData);
    }
  }
}

// Manual save
function manualSaveAgronomyProgress() {
  saveAgronomyResponseSilent();
  autoSaveAgronomyProgress();
  showToast("Agronomy progress saved", "success");
}

// Photo upload
function showAgronomyPhotoUploadChoice(event) {
  event.preventDefault();
  event.stopPropagation();

  const existing = document.querySelector('.photo-upload-choice-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'photo-upload-choice-overlay';
  overlay.innerHTML = `
    <div class="photo-upload-choice">
      <div class="photo-upload-choice-header"><p>Add Photo</p></div>
      <div class="photo-upload-choice-options">
        <button class="photo-upload-choice-btn" id="agrPhotoCamera">
          <span class="material-symbols-rounded">photo_camera</span>
          Take Photo
        </button>
        <button class="photo-upload-choice-btn" id="agrPhotoFile">
          <span class="material-symbols-rounded">photo_library</span>
          Choose from Gallery
        </button>
      </div>
      <button class="photo-upload-choice-cancel" onclick="closePhotoUploadChoice()">Cancel</button>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) closePhotoUploadChoice(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  overlay.querySelector('#agrPhotoCamera').addEventListener('click', () => {
    closePhotoUploadChoice();
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = handleAgronomyPhotoUpload;
    input.click();
  });
  overlay.querySelector('#agrPhotoFile').addEventListener('click', () => {
    closePhotoUploadChoice();
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = handleAgronomyPhotoUpload;
    input.click();
  });
}

function handleAgronomyPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const photoData = e.target.result;
    const areaIndex = agronomyMonitoringState.currentAreaIndex;
    const itemId = agronomyMonitoringState.currentItemId;
    if (areaIndex === null || !itemId) return;

    if (!agronomyMonitoringState.responses[areaIndex]) {
      agronomyMonitoringState.responses[areaIndex] = {};
    }
    if (!agronomyMonitoringState.responses[areaIndex][itemId]) {
      agronomyMonitoringState.responses[areaIndex][itemId] = { applicationDate: "", photos: [], timestamp: "" };
    }

    agronomyMonitoringState.responses[areaIndex][itemId].photos.push(photoData);
    agronomyMonitoringState.responses[areaIndex][itemId].timestamp = new Date().toISOString();

    saveAgronomyResponseSilent();
    autoSaveAgronomyProgress();
    renderAgronomyQuestionCard();
  };
  reader.readAsDataURL(file);
  setTimeout(() => { event.target.value = ""; }, 100);
}

function removeAgronomyPhoto(idx) {
  const areaIndex = agronomyMonitoringState.currentAreaIndex;
  const itemId = agronomyMonitoringState.currentItemId;
  if (areaIndex === null || !itemId) return;

  const resp = agronomyMonitoringState.responses[areaIndex]?.[itemId];
  if (!resp || !resp.photos) return;
  resp.photos.splice(idx, 1);
  resp.timestamp = new Date().toISOString();

  autoSaveAgronomyProgress();
  renderAgronomyQuestionCard();
}

function openAgronomyPhotoPreview(idx) {
  const areaIndex = agronomyMonitoringState.currentAreaIndex;
  const itemId = agronomyMonitoringState.currentItemId;
  const resp = agronomyMonitoringState.responses[areaIndex]?.[itemId];
  if (!resp || !resp.photos || !resp.photos[idx]) return;

  // Reuse existing photo preview modal
  const modal = document.getElementById("photoPreviewModal");
  const img = modal?.querySelector("img");
  if (modal && img) {
    img.src = resp.photos[idx];
    modal.classList.remove("hidden");
    modal.classList.add("active");
  }
}

// Finish agronomy monitoring
function finishAgronomyMonitoring() {
  saveAgronomyResponseSilent();
  autoSaveAgronomyProgress();

  const trial = agronomyMonitoringState.currentTrial;
  const progress = calculateAgronomyProgress(trial);

  const existing = document.querySelector('.finish-trial-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'finish-trial-overlay';
  overlay.innerHTML = `
    <div class="finish-trial-popup">
      <div class="finish-trial-icon">
        <span class="material-symbols-rounded">check_circle</span>
      </div>
      <h3>Agronomy Monitoring Complete!</h3>
      <p>You have completed <strong>${progress.completed}/${progress.total}</strong> items (${progress.percentage}%). What would you like to do?</p>
      <div class="finish-trial-actions">
        <button class="btn btn-primary" onclick="closeFinishTrialPopup(); exitAgronomyMonitoring();">
          <span class="material-symbols-rounded">done_all</span>
          Finish & Back to Trials
        </button>
        <button class="btn btn-secondary" onclick="closeFinishTrialPopup(); navigateAgronomyFirst();">
          <span class="material-symbols-rounded">replay</span>
          Review from First Item
        </button>
        <button class="btn btn-secondary" onclick="closeFinishTrialPopup();">
          <span class="material-symbols-rounded">arrow_back</span>
          Continue Editing
        </button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeFinishTrialPopup(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function navigateAgronomyFirst() {
  const positions = getAllAgronomyNavPositions();
  if (positions.length > 0) {
    agronomyMonitoringState.currentAreaIndex = positions[0].areaIndex;
    agronomyMonitoringState.currentItemId = positions[0].itemId;
    renderAgronomyNavTree();
    renderAgronomyQuestionCard();
  }
}

// Mobile nav helpers
function openAgronomyMobileNav() {
  const container = document.querySelector('#agronomyMonitoringInterface .run-trial-container');
  const nav = document.querySelector('#agronomyMonitoringInterface .run-trial-nav');
  const scrim = document.getElementById('agronomyMobileNavScrim');
  const navBtn = document.getElementById('runTrialNavBtn');
  if (nav && nav.classList.contains('open')) { closeAgronomyMobileNav(); return; }
  if (nav) nav.classList.add('open');
  if (container) container.classList.add('mobile-nav-open');
  if (scrim) scrim.classList.add('open');
  document.body.classList.add('no-scroll', 'mobile-nav-active');
  if (navBtn) navBtn.querySelector('.material-symbols-rounded').textContent = 'close';
}

function closeAgronomyMobileNav() {
  const container = document.querySelector('#agronomyMonitoringInterface .run-trial-container');
  const nav = document.querySelector('#agronomyMonitoringInterface .run-trial-nav');
  const scrim = document.getElementById('agronomyMobileNavScrim');
  const navBtn = document.getElementById('runTrialNavBtn');
  if (nav) nav.classList.remove('open');
  if (container) container.classList.remove('mobile-nav-open');
  if (scrim) scrim.classList.remove('open');
  document.body.classList.remove('no-scroll', 'mobile-nav-active');
  if (navBtn) navBtn.querySelector('.material-symbols-rounded').textContent = 'menu';
}

// ===========================
// END AGRONOMY MONITORING
// ===========================

// Initialize Run Trial tab
function initializeRunTrial() {
  setupRunTrialEventListeners();
}

// Render list of trials that can be run
function renderRunTrialList() {
  const container = document.getElementById("runTrialList");
  const header = document.querySelector("#runTrialSelection .run-trial-header");
  if (!container) return;

  // Filter out archived trials from the run trial list
  const runnableTrials = trialState.trials.filter(
    (t) => !t.archived && t.areas && t.areas.length > 0 && t.areas.some((a) => a.layout?.result)
  );

  if (runnableTrials.length === 0) {
    if (header) header.classList.remove("hidden");
    container.innerHTML = `
      <div class="empty-state run-empty-grid">
        <span class="material-symbols-rounded">science</span>
        <p>No trials available to run. Create a trial with areas and layout first.</p>
      </div>
    `;
    return;
  }

  if (header) header.classList.add("hidden");

  container.innerHTML = runnableTrials
    .map((trial) => {
      const areaCount = trial.areas?.length || 0;
      const paramCount = getRunnableTrialParameters(trial).length;
      const totalLines = trial.areas?.reduce((sum, area) => {
        return sum + (area.layout?.lines?.length || 0);
      }, 0) || 0;

      // Calculate progress using the correct response format
      const progress = calculateCombinedTrialProgress(trial);
      const progressPercent = progress.percentage;
      const statusText = progressPercent === 0 ? 'Not Started' : progressPercent === 100 ? 'Completed' : 'In Progress';
      const statusColor = progressPercent === 0 ? 'var(--text-secondary)' : progressPercent === 100 ? 'var(--success)' : 'var(--warning)';

      return `
        <div class="run-trial-card" data-trial-id="${trial.id}">
          <div class="run-trial-card-header">
            <div class="run-trial-card-icon">
              <svg class="progress-circle" width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" class="progress-circle-bg"></circle>
                <circle cx="32" cy="32" r="28" class="progress-circle-fill" 
                        style="stroke-dasharray: ${progressPercent * 1.75} 175; stroke: ${getProgressGradientColor(progressPercent)}"></circle>
                <text x="32" y="37" class="progress-circle-text" text-anchor="middle">${progressPercent}%</text>
              </svg>
            </div>
            <div class="run-trial-card-body">
              <div class="run-trial-card-title">${escapeHtml(trial.name)}</div>
              <div class="run-trial-card-meta">${escapeHtml(trial.cropName || "")} · ${escapeHtml(trial.trialType || "")}</div>
            </div>
            <!--
            <div class="run-trial-card-right">
              <div class="run-trial-status-label" style="color: ${statusColor}">${statusText}</div>
              <div class="run-trial-status-percent">${progressPercent}%</div>
            </div>
            -->
          </div>
          <!--
          <div class="run-trial-card-stats">
            <div class="run-trial-stat">
              <span class="material-symbols-rounded">location_on</span>
              ${areaCount} area(s)
            </div>
            <div class="run-trial-stat">
              <span class="material-symbols-rounded">assignment</span>
              ${paramCount} param(s)
            </div>
            <div class="run-trial-stat">
              <span class="material-symbols-rounded">grass</span>
              ${totalLines} line(s)
            </div>
            <div class="run-trial-stat">
              <span class="material-symbols-rounded">check_circle</span>
              ${progress.completed}/${progress.total}
            </div>
          </div>
          -->
        </div>
      `;
    })
    .join("");

  // Add click listeners
  container.querySelectorAll(".run-trial-card").forEach((card) => {
    card.addEventListener("click", () => {
      const trialId = card.dataset.trialId;
      startRunTrial(trialId);
    });
  });
}

// Setup event listeners for Run Trial
function setupRunTrialEventListeners() {
  if (setupRunTrialEventListeners.initialized) return;
  setupRunTrialEventListeners.initialized = true;
  const backBtn = document.getElementById("runTrialBackBtn");

  if (backBtn) {
    backBtn.addEventListener("click", confirmExitRunTrial);
  }
  
  // Add keyboard navigation for run trial (arrow keys)
  document.addEventListener("keydown", handleRunTrialKeyboard);
}

// Handle keyboard navigation during run trial
function handleRunTrialKeyboard(e) {
  // Only handle if in run trial mode and not in an input field
  const isInRunTrialMode = document.body.classList.contains("run-trial-active");
  const isInInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
  
  if (!isInRunTrialMode || isInInput) return;
  
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    navigateNextLine();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    navigatePrevLine();
  }
}

// Start running a trial
function startRunTrial(trialId) {
  const trial = trialState.trials.find((t) => t.id === trialId);
  if (!trial) return;

  if (getRunnableTrialParameters(trial).length === 0) {
    showToast("This trial has no runnable observation parameters (formula parameters are excluded)", "warning");
    return;
  }

  runTrialState.currentTrialId = trialId;
  runTrialState.currentTrial = trial;
  runTrialState.responses = trial.responses || {};
  runTrialState.currentAreaIndex = null;
  runTrialState.currentParamId = null;
  runTrialState.currentLineId = null;
  runTrialState.currentRepIndex = null;

  // Hide trial list panels, show run interface
  const mgmtPanel = document.getElementById("trialManagementPanel");
  const archivePanel = document.getElementById("archivedTrialManagementPanel");
  if (mgmtPanel) mgmtPanel.classList.add("hidden");
  if (archivePanel) archivePanel.classList.add("hidden");
  document.getElementById("runTrialInterface").classList.remove("hidden");
  
  // Modify topbar for run trial mode
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");
  const syncButtons = document.querySelectorAll("#syncDownBtn, #runTrialNavBtn, #userMenu");
  
  if (topbar) topbar.classList.add("run-trial-mode");
  if (pageTitle) pageTitle.textContent = trial.name;
  if (menuToggle) {
    menuToggle.onclick = confirmExitRunTrial;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">arrow_back</span>';
  }
  const runTrialNavBtn = document.getElementById("runTrialNavBtn");
  const runTrialSaveBtn = document.getElementById("runTrialSaveBtn");
  if (runTrialNavBtn) { runTrialNavBtn.style.display = "flex"; runTrialNavBtn.classList.remove("hidden"); }
  if (runTrialSaveBtn) { runTrialSaveBtn.style.display = "flex"; runTrialSaveBtn.classList.remove("hidden"); }
  // Hide sync buttons in run trial mode
  syncButtons.forEach(btn => {
    if (btn.id !== "runTrialNavBtn") btn.style.display = "none";
  });

  document.body.classList.add("run-trial-active", "sidebar-collapsed");

  // Render navigation tree
  renderRunTrialNavTree();
  updateRunTrialProgress();

  // Show empty state initially
  renderEmptyQuestionState();
}

// Exit run trial mode
function exitRunTrial() {
  runTrialState.currentTrialId = null;
  runTrialState.currentTrial = null;
  runTrialState.responses = {};
  runTrialState.currentAreaIndex = null;
  runTrialState.currentParamId = null;
  runTrialState.currentLineId = null;
  runTrialState.currentRepIndex = null;

  // Show trial list panels, hide run interface
  const mgmtPanel = document.getElementById("trialManagementPanel");
  if (mgmtPanel) mgmtPanel.classList.remove("hidden");
  document.getElementById("runTrialInterface").classList.add("hidden");
  // Re-render to show updated progress
  renderTrials();

  // Restore topbar to normal state
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");
  const syncButtons = document.querySelectorAll("#syncDownBtn, #runTrialNavBtn, #userMenu");
  
  if (topbar) topbar.classList.remove("run-trial-mode");
  if (pageTitle) pageTitle.textContent = "Trial";
  if (menuToggle) {
    menuToggle.onclick = null;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">menu</span>';
  }
  const runTrialNavBtn = document.getElementById("runTrialNavBtn");
  const runTrialSaveBtn = document.getElementById("runTrialSaveBtn");
  if (runTrialNavBtn) { runTrialNavBtn.style.display = "none"; runTrialNavBtn.classList.add("hidden"); }
  if (runTrialSaveBtn) { runTrialSaveBtn.style.display = "none"; runTrialSaveBtn.classList.add("hidden"); }
  // Show sync buttons again
  syncButtons.forEach(btn => {
    btn.style.display = "";
  });

  document.body.classList.remove("run-trial-active", "sidebar-collapsed");
}

function confirmExitRunTrial() {
  const doExit = () => {
    if (hasResponseChanges()) {
      saveCurrentResponseSilent();
      autoSaveProgress();
    }
    exitRunTrial();
  };

  if (typeof showConfirmModal === "function") {
    showConfirmModal(
      "Exit Run Trial",
      "Are you sure you want to exit? Current progress will be saved automatically.",
      doExit,
      "Exit",
      "btn-primary",
    );
  } else if (window.confirm("Are you sure you want to exit? Current progress will be saved automatically.")) {
    doExit();
  }
}

// Render navigation tree
function renderRunTrialNavTree() {
  const container = document.getElementById("runTrialNavTree");
  const trial = runTrialState.currentTrial;
  if (!container || !trial) return;

  // Get runnable parameters (exclude formula type)
  const parameters = getRunnableTrialParameters(trial);

  // Calculate overall progress
  let overallTotal = 0;
  let overallCompleted = 0;
  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;
    parameters.forEach(param => {
      const numSamples = param.numberOfSamples || 1;
      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach(row => {
          row.forEach(cell => {
            if (cell) {
              overallTotal += numSamples;
              for (let si = 0; si < numSamples; si++) {
                const lineKey = `${cell.id}_${repIndex}_${si}`;
                if (hasResponse(areaIndex, param.id, lineKey)) overallCompleted++;
              }
            }
          });
        });
      });
    });
  });
  const overallPercentage = overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0;

  let html = `
    <div class="run-nav-progress">
      <div class="run-nav-progress-bar">
        <div class="run-nav-progress-fill" style="width:${overallPercentage}%"></div>
      </div>
      <span class="run-nav-progress-text">${overallCompleted}/${overallTotal} (${overallPercentage}%)</span>
    </div>
  `;

  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;

    const isAreaOpen = areaIndex === runTrialState.currentAreaIndex;
    const areaClass = isAreaOpen ? "" : "collapsed";

    html += `
      <div class="run-nav-area ${areaClass}" data-area-index="${areaIndex}">
        <div class="run-nav-area-header" onclick="toggleNavArea(${areaIndex})">
          <span class="material-symbols-rounded expand-icon">expand_more</span>
          <span class="material-symbols-rounded">location_on</span>
          <span>${escapeHtml(area.name || `Area ${areaIndex + 1}`)}</span>
        </div>
        <div class="run-nav-area-content">
    `;

    parameters.forEach((param) => {
      const isParamOpen =
        isAreaOpen && runTrialState.currentParamId === param.id;
      const paramClass = isParamOpen ? "" : "collapsed";
      
      const numberOfSamples = param.numberOfSamples || 1;
      
      // Count completed samples in this param for this area
      let paramCompleted = 0;
      let paramTotal = 0;
      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (cell) {
              paramTotal += numberOfSamples;
              for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
                const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
                if (hasResponse(areaIndex, param.id, lineKey)) {
                  paramCompleted += 1;
                }
              }
            }
          });
        });
      });

      html += `
        <div class="run-nav-param ${paramClass}" data-area-index="${areaIndex}" data-param-id="${param.id}">
          <div class="run-nav-param-header" onclick="toggleNavParam(${areaIndex}, '${param.id}')">
            <span class="material-symbols-rounded expand-icon">expand_more</span>
            <span>${escapeHtml(param.name)}</span>
            <span class="nav-param-initial">(${param.initial || ""})</span>
            <span class="nav-param-count">${paramCompleted}/${paramTotal}</span>
          </div>
          <div class="run-nav-reps">
      `;

      // Render replications from layout
      const layout = area.layout;
      layout.result.forEach((rep, repIndex) => {
        const isRepOpen =
          isParamOpen && runTrialState.currentRepIndex === repIndex;
        const repClass = isRepOpen ? "" : "collapsed";
        // Count lines in this replication
        let linesInRep = [];
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (cell) linesInRep.push(cell);
          });
        });

        // Check if all lines in rep are completed (all samples)
        const allCompleted = linesInRep.every((cell) => {
          for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
            const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
            if (!hasResponse(areaIndex, param.id, lineKey)) {
              return false;
            }
          }
          return true;
        });
        const someCompleted = linesInRep.some((cell) => {
          for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
            const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
            if (hasResponse(areaIndex, param.id, lineKey)) {
              return true;
            }
          }
          return false;
        });

        html += `
          <div class="run-nav-rep ${repClass} ${allCompleted ? 'completed' : someCompleted ? 'partial' : ''}" data-area-index="${areaIndex}" data-param-id="${param.id}" data-rep-index="${repIndex}">
            <div class="run-nav-rep-header" onclick="toggleNavRep(${areaIndex}, '${param.id}', ${repIndex})">
              <span class="material-symbols-rounded expand-icon">expand_more</span>
              <span>Replication ${repIndex + 1}</span>
              ${allCompleted ? '<span class="material-symbols-rounded rep-status rep-status-icon rep-status-success">check_circle</span>' : someCompleted ? '<span class="material-symbols-rounded rep-status rep-status-icon rep-status-warning">radio_button_partial</span>' : ''}
            </div>
            <div class="run-nav-lines">
        `;

        rep.forEach((row) => {
          row.forEach((cell) => {
            if (!cell) return;
            const uniqueKey = `${areaIndex}_${param.id}_${cell.id}_${repIndex}`;
            
            // Check if all samples are completed
            let allSamplesCompleted = true;
            let someSamplesCompleted = false;
            for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
              const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
              if (hasResponse(areaIndex, param.id, lineKey)) {
                someSamplesCompleted = true;
              } else {
                allSamplesCompleted = false;
              }
            }
            
            const isLineOpen =
              isRepOpen &&
              runTrialState.currentLineId === cell.id;
            const lineClass = isLineOpen ? "" : "collapsed";

            html += `
              <div class="run-nav-line ${lineClass} ${allSamplesCompleted ? "completed" : ""}" data-area-index="${areaIndex}" data-param-id="${param.id}" data-line-id="${cell.id}" data-rep-index="${repIndex}">
                <div class="run-nav-line-header" onclick="toggleNavLine(${areaIndex}, '${param.id}', '${cell.id}', ${repIndex})">
                  <span class="material-symbols-rounded expand-icon">expand_more</span>
                  <span>${escapeHtml(cell.name)}</span>
                  ${allSamplesCompleted ? '<span class="material-symbols-rounded line-status line-status-icon">check_circle</span>' : someSamplesCompleted ? '<span class="material-symbols-rounded line-status line-status-icon line-status-partial">radio_button_partial</span>' : ""}
                </div>
            `;

            // Always render samples (whether 1 or more)
            html += '<div class="run-nav-samples">';
            for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
              const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
              const isSampleCompleted = hasResponse(areaIndex, param.id, lineKey);
              const isSampleActive =
                runTrialState.currentAreaIndex === areaIndex &&
                runTrialState.currentParamId === param.id &&
                runTrialState.currentLineId === cell.id &&
                runTrialState.currentRepIndex === repIndex &&
                runTrialState.currentSampleIndex === sampleIndex;

              html += `
                <div class="run-nav-sample ${isSampleCompleted ? "completed" : ""} ${isSampleActive ? "active" : ""}"
                     onclick="selectLine(${areaIndex}, '${param.id}', '${cell.id}', ${repIndex}, ${sampleIndex})">
                  <span>${sampleIndex + 1}</span>
                </div>
              `;
            }
            html += '</div>';

            html += '</div>';
          });
        });

        html += `
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Update mobile header progress
  const headerProgress = document.querySelector('#runTrialInterface .nav-header-progress');
  if (headerProgress) {
    headerProgress.innerHTML = `
      <div class="run-nav-progress-bar">
        <div class="run-nav-progress-fill" style="width:${overallPercentage}%"></div>
      </div>
      <span class="run-nav-progress-text">${overallCompleted}/${overallTotal} (${overallPercentage}%)</span>
    `;
  }
}

// Toggle area collapse
function toggleNavArea(areaIndex) {
  const area = document.querySelector(`.run-nav-area[data-area-index="${areaIndex}"]`);
  if (area) area.classList.toggle("collapsed");
}

// Toggle param collapse
function toggleNavParam(areaIndex, paramId) {
  const param = document.querySelector(
    `.run-nav-param[data-area-index="${areaIndex}"][data-param-id="${paramId}"]`
  );
  if (param) param.classList.toggle("collapsed");
}

// Toggle replication collapse
function toggleNavRep(areaIndex, paramId, repIndex) {
  const rep = document.querySelector(
    `.run-nav-rep[data-area-index="${areaIndex}"][data-param-id="${paramId}"][data-rep-index="${repIndex}"]`
  );
  if (rep) rep.classList.toggle("collapsed");
}

// Toggle line collapse
function toggleNavLine(areaIndex, paramId, lineId, repIndex) {
  const line = document.querySelector(
    `.run-nav-line[data-area-index="${areaIndex}"][data-param-id="${paramId}"][data-line-id="${lineId}"][data-rep-index="${repIndex}"]`
  );
  if (line) line.classList.toggle("collapsed");
}

// Check if response exists
function hasResponse(areaIndex, paramId, lineKey) {
  const response = runTrialState.responses[areaIndex]?.[paramId]?.[lineKey];
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  const hasValue = response?.value !== undefined && response?.value !== "";
  
  // Check photos from photoKey (not lineKey)
  let hasPhotos = false;
  if (param?.requirePhoto) {
    const photoMode = param.photoMode || "per-sample";
    // Extract repIndex and sampleIndex from lineKey
    // lineKey format: lineId_repIndex_sampleIndex
    // Split from the end to handle lineId with underscores
    const parts = lineKey.split("_");
    const sampleIndex = parts[parts.length - 1];
    const repIndex = parts[parts.length - 2];
    const lineId = parts.slice(0, parts.length - 2).join("_");
    
    let photoKey;
    if (photoMode === "per-line") {
      // Per-line: photoKey = lineId_repIndex
      photoKey = `${lineId}_${repIndex}`;
    } else {
      // Per-sample: photoKey = lineId_repIndex_sampleIndex (same as lineKey)
      photoKey = lineKey;
    }
    
    const photoResponse = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey];
    hasPhotos = photoResponse?.photos?.length > 0;
  }

  // If photo is required, both value and photo must exist
  if (param?.requirePhoto) {
    return hasValue && hasPhotos;
  }

  return hasValue || hasPhotos;
}

// Select a line to answer
function selectLine(areaIndex, paramId, lineId, repIndex, sampleIndex = 0) {
  const isLineChange =
    runTrialState.currentAreaIndex !== null &&
    (runTrialState.currentAreaIndex !== areaIndex ||
      runTrialState.currentParamId !== paramId ||
      runTrialState.currentLineId !== lineId ||
      runTrialState.currentRepIndex !== repIndex);

  const proceed = () => {
    if (
      runTrialState.currentAreaIndex !== null &&
      runTrialState.currentParamId &&
      runTrialState.currentLineId
    ) {
      if (hasResponseChanges()) {
        saveCurrentResponseSilent();
        autoSaveProgress();
      }
    }

    runTrialState.currentAreaIndex = areaIndex;
    runTrialState.currentParamId = paramId;
    runTrialState.currentLineId = lineId;
    runTrialState.currentRepIndex = repIndex;
    runTrialState.currentSampleIndex = sampleIndex;

    // Re-render nav tree using current selection so the correct area/param/rep is expanded
    renderRunTrialNavTree();
    updateRunTrialProgress();
    
    // Update dashboard progress in real-time
    if (typeof renderDashboardTrialProgress === 'function') {
      renderDashboardTrialProgress();
    }

    // Close mobile nav if open
    closeMobileNav();

    renderQuestionCard();
  };

  if (isLineChange && runTrialState.currentLineId) {
    if (typeof showConfirmModal === "function") {
      showConfirmModal(
        "Change Line",
        "Are you sure you want to move to another line? Current progress will be saved automatically.",
        proceed,
        "Proceed",
        "btn-primary",
      );
    } else if (window.confirm("Are you sure you want to move to another line? Current progress will be saved automatically.")) {
      proceed();
    }
    return;
  }

  proceed();

}

// Render empty question state
function renderEmptyQuestionState() {
  const container = document.getElementById("runTrialQuestion");
  container.innerHTML = `
    <div class="run-empty-state">
      <span class="material-symbols-rounded">touch_app</span>
      <p>Select a line from the navigation to start recording data</p>
    </div>
  `;
}

// Render question card for current selection
function renderQuestionCard() {
  const container = document.getElementById("runTrialQuestion");
  const trial = runTrialState.currentTrial;
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;

  if (areaIndex === null || !paramId || !lineId) {
    renderEmptyQuestionState();
    return;
  }

  const area = trial.areas[areaIndex];
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  const line = area.layout.lines.find((l) => l.id === lineId);
  
  // Get parameter numberOfSamples to display sample indicator
  const numberOfSamples = param.numberOfSamples || 1;
  
  // Response key now includes sampleIndex
  const lineKey = `${lineId}_${repIndex}_${sampleIndex}`;

  if (!param || !line) {
    renderEmptyQuestionState();
    return;
  }

  const lines = getAllLinesList();
  const currentIdx = lines.findIndex(
    (l) =>
      l.areaIndex === areaIndex &&
      l.paramId === paramId &&
      l.lineId === lineId &&
      l.repIndex === repIndex &&
      l.sampleIndex === sampleIndex
  );

  const isFirstInArea = currentIdx >= 0 && (currentIdx === 0 || lines[currentIdx - 1].areaIndex !== areaIndex);
  const isLastInArea = currentIdx >= 0 && (currentIdx === lines.length - 1 || lines[currentIdx + 1].areaIndex !== areaIndex);
  const isLastOverall = currentIdx >= 0 && currentIdx === lines.length - 1;
  const nextLineButtonClass = isLastOverall ? "btn btn-primary" : "btn btn-secondary";
  const nextLineButtonLabel = isLastOverall ? "Finish" : "Next Line";
  const nextLineButtonIcon = isLastOverall ? "check" : "arrow_forward";
  const nextLineButtonHandler = isLastOverall ? "finishRunTrialLastQuestion()" : "navigateNextLine()";

  // Get existing response for this sample
  const existingResponse = runTrialState.responses[areaIndex]?.[paramId]?.[lineKey] || {};
  const existingValue = existingResponse.value ?? "";
  
  // Get photos from photoKey (not lineKey)
  const photoMode = param.photoMode || "per-sample";
  const photoKey = photoMode === "per-line" 
    ? `${lineId}_${repIndex}` 
    : `${lineId}_${repIndex}_${sampleIndex}`;
  const existingPhotos = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos || [];
  
  // Store current state for change detection
  runTrialState.lastSavedValue = existingValue;
  runTrialState.lastSavedPhotosCount = existingPhotos.length;

  let inputHTML = "";

  // Render input based on parameter type
  switch (param.type) {
    case "text":
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">
            Enter value ${param.unit ? `<span class="run-input-hint">(${param.unit})</span>` : ""}
          </label>
          <input type="text" class="run-input-text" id="runInputValue" value="${escapeHtml(existingValue)}" placeholder="Enter your answer...">
        </div>
      `;
      break;

    case "number":
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">
            Enter number ${param.unit ? `<span class="run-input-hint">(${param.unit})</span>` : ""}
          </label>
          <input type="number" class="run-input-number" id="runInputValue" value="${existingValue}" placeholder="0">
        </div>
      `;
      break;

    case "range":
      const rangeDef = param.rangeDefinition || "1-10";
      const [minVal, maxVal] = rangeDef.split("-").map(Number);
      const currentVal = existingValue || minVal;
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">
            Select value ${param.unit ? `<span class="run-input-hint">(${param.unit})</span>` : ""}
          </label>
          <div class="run-range-container">
            <div class="run-range-dual">
              <input type="range" class="run-range-input" id="runInputRange" 
                     min="${minVal}" max="${maxVal}" value="${currentVal}"
                     oninput="syncRangeInputs(this.value, 'range')">
              <input type="number" class="run-range-number" id="runInputValue" 
                     min="${minVal}" max="${maxVal}" value="${currentVal}"
                     oninput="syncRangeInputs(this.value, 'number')">
            </div>
            <div class="run-range-labels">
              <span>${minVal}</span>
              <span>${maxVal}</span>
            </div>
          </div>
        </div>
      `;
      break;

    case "radio":
      const radioOptions = (param.radioOptions || "").split(",").map((o) => o.trim()).filter(Boolean);
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">Select one option</label>
          <div class="run-options-list">
            ${radioOptions
              .map(
                (opt, idx) => `
              <label class="run-option-item ${existingValue === opt ? "selected" : ""}" onclick="selectRadioOption(this, '${escapeHtml(opt)}')">
                <input type="radio" name="runRadio" value="${escapeHtml(opt)}" ${existingValue === opt ? "checked" : ""}>
                <span>${escapeHtml(opt)}</span>
              </label>
            `
              )
              .join("")}
          </div>
        </div>
      `;
      break;

    case "checkbox":
      const checkOptions = (param.checkboxOptions || "").split(",").map((o) => o.trim()).filter(Boolean);
      const selectedChecks = existingValue ? existingValue.split(",") : [];
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">Select all that apply</label>
          <div class="run-options-list">
            ${checkOptions
              .map(
                (opt) => `
              <label class="run-option-item ${selectedChecks.includes(opt) ? "selected" : ""}" onclick="toggleCheckboxOption(this)">
                <input type="checkbox" name="runCheckbox" value="${escapeHtml(opt)}" ${selectedChecks.includes(opt) ? "checked" : ""}>
                <span>${escapeHtml(opt)}</span>
              </label>
            `
              )
              .join("")}
          </div>
        </div>
      `;
      break;

    default:
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">
            Enter value ${param.unit ? `<span class="run-input-hint">(${param.unit})</span>` : ""}
          </label>
          <textarea class="run-input-textarea" id="runInputValue" placeholder="Enter your observation...">${escapeHtml(existingValue)}</textarea>
        </div>
      `;
  }

  // Photo upload section
  let photoHTML = "";
  if (param.requirePhoto) {
    // Determine photo key based on photoMode
    const photoMode = param.photoMode || "per-sample";
    const photoKey = photoMode === "per-line" 
      ? `${lineId}_${repIndex}` // Per-line: same for all samples
      : `${lineId}_${repIndex}_${sampleIndex}`; // Per-sample: unique per sample
    
    // Get photos from appropriate key
    const photoResponse = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey] || {};
    const photoList = photoResponse.photos || [];
    
    const modeLabel = photoMode === "per-line" ? "(1 photo for all samples)" : "(per sample)";
    
    photoHTML = `
      <div class="run-photo-section">
        <div class="run-photo-label">
          <span class="material-symbols-rounded">photo_camera</span>
          Photo Upload ${numberOfSamples > 1 ? `<span class="run-photo-mode-hint">${modeLabel}</span>` : ''}
          <span class="run-photo-required">* Required</span>
        </div>
        <div class="run-photo-upload" id="runPhotoContainer">
          ${photoList
            .map(
              (photo, idx) => `
            <div class="run-photo-preview" data-index="${idx}" onclick="openPhotoPreview(${idx})">
              <img src="${photo}" alt="Photo ${idx + 1}">
              <button class="run-photo-remove" onclick="removePhoto(${idx}); event.stopPropagation();">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
          `
            )
            .join("")}
          <label class="run-photo-add" onclick="showPhotoUploadChoice(event)">
            <span class="material-symbols-rounded">add_a_photo</span>
            <span>Add</span>
          </label>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="run-question-header">
      <div class="run-question-breadcrumb">
        ${escapeHtml(area.name || `Area ${areaIndex + 1}`)} › ${escapeHtml(param.name)} › Rep ${repIndex + 1}
      </div>
      <div class="run-question-title">${escapeHtml(line.name)}</div>
      <div class="run-question-subtitle">${escapeHtml(param.name)} (${escapeHtml(param.initial || "")})</div>
      ${numberOfSamples > 1 ? `
        <div class="run-sample-indicator">
          Sample ${sampleIndex + 1} of ${numberOfSamples}
        </div>
      ` : ''}
    </div>
    <div class="run-question-body">
      ${inputHTML}
      ${photoHTML}
    </div>
    <div class="run-question-footer">
      <div class="run-nav-buttons">
        ${numberOfSamples > 1 ? `
          <div class="run-sample-nav">
            <button class="btn btn-secondary" onclick="navigatePrevSample()" ${sampleIndex === 0 ? 'disabled' : ''}>
              <span class="material-symbols-rounded">arrow_back</span>
              Prev Sample
            </button>
            <button class="btn btn-secondary" onclick="navigateNextSample()" ${sampleIndex === numberOfSamples - 1 ? 'disabled' : ''}>
              Next Sample
              <span class="material-symbols-rounded">arrow_forward</span>
            </button>
          </div>
          <hr class="run-nav-divider">
        ` : ''}
        <div class="run-line-nav">
          <button class="btn btn-secondary" id="runPrevAreaBtn" onclick="navigatePrevArea()" style="display: none;">
            <span class="material-symbols-rounded">arrow_back</span>
            Previous Area
          </button>
          <button class="btn btn-secondary" id="runPrevLineBtn" onclick="navigatePrevLine()">
            <span class="material-symbols-rounded">arrow_back</span>
            Previous Line
          </button>
          <button class="${nextLineButtonClass}" id="runNextLineBtn" onclick="${nextLineButtonHandler}">
            ${nextLineButtonLabel}
            <span class="material-symbols-rounded">${nextLineButtonIcon}</span>
          </button>
          <button class="btn btn-secondary" id="runNextAreaBtn" onclick="navigateNextArea()" style="display: none;">
            Next Area
            <span class="material-symbols-rounded">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  `;
  
  const prevLineBtn = document.getElementById("runPrevLineBtn");
  const nextLineBtn = document.getElementById("runNextLineBtn");
  const prevAreaBtn = document.getElementById("runPrevAreaBtn");
  const nextAreaBtn = document.getElementById("runNextAreaBtn");
  
  if (isFirstInArea) {
    if (prevLineBtn) prevLineBtn.disabled = true;
    if (prevAreaBtn && areaIndex > 0) prevAreaBtn.style.display = "flex";
  }
  
  if (isLastInArea) {
    if (nextLineBtn && !isLastOverall) nextLineBtn.disabled = true;
    if (nextAreaBtn && areaIndex < trial.areas.length - 1) nextAreaBtn.style.display = "flex";
  }
}

function finishRunTrialLastQuestion() {
  // Save current answer first
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
  }
  autoSaveProgress();
  
  // Calculate progress
  const lines = getAllLinesList();
  const completed = lines.filter((l) => {
    const lineKey = `${l.lineId}_${l.repIndex}_${l.sampleIndex}`;
    return hasResponse(l.areaIndex, l.paramId, lineKey);
  }).length;
  const total = lines.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Show finish overlay
  const existing = document.querySelector('.finish-trial-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'finish-trial-overlay';
  overlay.innerHTML = `
    <div class="finish-trial-popup">
      <div class="finish-trial-icon">
        <span class="material-symbols-rounded">check_circle</span>
      </div>
      <h3>Observation Complete!</h3>
      <p>You have completed <strong>${completed}/${total}</strong> observations (${percentage}%). What would you like to do?</p>
      <div class="finish-trial-actions">
        <button class="btn btn-primary" onclick="confirmFinishRunTrial()">
          <span class="material-symbols-rounded">done_all</span>
          Finish & Back to Trials
        </button>
        <button class="btn btn-secondary" onclick="reviewFromFirstQuestion()">
          <span class="material-symbols-rounded">replay</span>
          Review from First Question
        </button>
        <button class="btn btn-secondary" onclick="closeFinishTrialPopup()">
          <span class="material-symbols-rounded">arrow_back</span>
          Continue Editing
        </button>
      </div>
    </div>
  `;
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFinishTrialPopup();
  });
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function closeFinishTrialPopup() {
  const overlay = document.querySelector('.finish-trial-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  }
}

function confirmFinishRunTrial() {
  closeFinishTrialPopup();
  saveRunTrialProgress();
  exitRunTrial();
}

function reviewFromFirstQuestion() {
  closeFinishTrialPopup();
  const lines = getAllLinesList();
  if (lines.length > 0) {
    const first = lines[0];
    selectLine(first.areaIndex, first.paramId, first.lineId, first.repIndex, first.sampleIndex);
  }
}

// Radio option selection
function selectRadioOption(el, value) {
  document.querySelectorAll(".run-option-item").forEach((item) => item.classList.remove("selected"));
  el.classList.add("selected");
  el.querySelector("input").checked = true;
}

// Checkbox toggle
function toggleCheckboxOption(el) {
  el.classList.toggle("selected");
  el.querySelector("input").checked = el.classList.contains("selected");
}

// Sync range slider and number input
function syncRangeInputs(value, source) {
  const rangeInput = document.getElementById("runInputRange");
  const numberInput = document.getElementById("runInputValue");
  
  if (source === 'range' && numberInput) {
    numberInput.value = value;
  } else if (source === 'number' && rangeInput) {
    rangeInput.value = value;
  }
}

// Mobile nav toggle functions
function openMobileNav() {
  const container = document.querySelector('#runTrialInterface .run-trial-container');
  const nav = document.querySelector('#runTrialInterface .run-trial-nav');
  const scrim = document.getElementById('mobileNavScrim');
  const navBtn = document.getElementById('runTrialNavBtn');
  if (nav && nav.classList.contains('open')) { closeMobileNav(); return; }
  if (nav) nav.classList.add('open');
  if (container) container.classList.add('mobile-nav-open');
  if (scrim) scrim.classList.add('open');
  document.body.classList.add('no-scroll', 'mobile-nav-active');
  if (navBtn) navBtn.querySelector('.material-symbols-rounded').textContent = 'close';
}

function closeMobileNav() {
  const container = document.querySelector('#runTrialInterface .run-trial-container');
  const nav = document.querySelector('#runTrialInterface .run-trial-nav');
  const scrim = document.getElementById('mobileNavScrim');
  const navBtn = document.getElementById('runTrialNavBtn');
  if (nav) nav.classList.remove('open');
  if (container) container.classList.remove('mobile-nav-open');
  if (scrim) scrim.classList.remove('open');
  document.body.classList.remove('no-scroll', 'mobile-nav-active');
  if (navBtn) navBtn.querySelector('.material-symbols-rounded').textContent = 'menu';
}

// Show photo upload choice popup (camera vs file)
function showPhotoUploadChoice(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // Remove any existing overlay
  const existing = document.querySelector('.photo-upload-choice-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'photo-upload-choice-overlay';
  overlay.innerHTML = `
    <div class="photo-upload-choice">
      <div class="photo-upload-choice-header">
        <p>Add Photo</p>
      </div>
      <div class="photo-upload-choice-options">
        <button class="photo-upload-choice-btn" id="photoChoiceCamera">
          <span class="material-symbols-rounded">photo_camera</span>
          Take Photo
        </button>
        <button class="photo-upload-choice-btn" id="photoChoiceFile">
          <span class="material-symbols-rounded">photo_library</span>
          Choose from Gallery
        </button>
      </div>
      <button class="photo-upload-choice-cancel" onclick="closePhotoUploadChoice()">Cancel</button>
    </div>
  `;
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePhotoUploadChoice();
  });
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  
  // Camera option
  overlay.querySelector('#photoChoiceCamera').addEventListener('click', () => {
    closePhotoUploadChoice();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = handlePhotoUpload;
    input.click();
  });
  
  // File/gallery option
  overlay.querySelector('#photoChoiceFile').addEventListener('click', () => {
    closePhotoUploadChoice();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = handlePhotoUpload;
    input.click();
  });
}

function closePhotoUploadChoice() {
  const overlay = document.querySelector('.photo-upload-choice-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  }
}

// Handle photo upload
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const photoData = e.target.result;
    
    // Get current context
    const areaIndex = runTrialState.currentAreaIndex;
    const paramId = runTrialState.currentParamId;
    const lineId = runTrialState.currentLineId;
    const repIndex = runTrialState.currentRepIndex;
    const sampleIndex = runTrialState.currentSampleIndex || 0;
    
    if (areaIndex === null || !paramId || !lineId || repIndex === null) return;
    
    const param = inventoryState.items.parameters.find((p) => p.id === paramId);
    if (!param) return;
    
    // Determine photo key based on photoMode
    const photoMode = param.photoMode || "per-sample";
    const photoKey = photoMode === "per-line" 
      ? `${lineId}_${repIndex}` 
      : `${lineId}_${repIndex}_${sampleIndex}`;
    
    // Initialize response structure
    if (!runTrialState.responses[areaIndex]) {
      runTrialState.responses[areaIndex] = {};
    }
    if (!runTrialState.responses[areaIndex][paramId]) {
      runTrialState.responses[areaIndex][paramId] = {};
    }
    if (!runTrialState.responses[areaIndex][paramId][photoKey]) {
      runTrialState.responses[areaIndex][paramId][photoKey] = {
        value: "",
        photos: [],
        timestamp: new Date().toISOString(),
      };
    }
    
    // Add photo to response
    runTrialState.responses[areaIndex][paramId][photoKey].photos.push(photoData);
    runTrialState.responses[areaIndex][paramId][photoKey].timestamp = new Date().toISOString();
    
    // Save current input value to lineKey to prevent data loss
    saveCurrentResponseSilent();
    
    // Trigger auto-save to sync queue
    autoSaveProgress();
    
    // Re-render to show the new photo
    renderQuestionCard();
  };
  
  reader.readAsDataURL(file);
  
  // Clear input value after reading starts
  setTimeout(() => {
    event.target.value = "";
  }, 100);
}

// Remove photo
function removePhoto(idx) {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (areaIndex === null || !paramId || !lineId) return;
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return;
  
  // Determine photo key based on photoMode
  const photoMode = param.photoMode || "per-sample";
  const photoKey = photoMode === "per-line" 
    ? `${lineId}_${repIndex}` 
    : `${lineId}_${repIndex}_${sampleIndex}`;
  
  // Get current photos from response
  const response = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey];
  if (response && response.photos) {
    // Remove photo at index
    response.photos.splice(idx, 1);
    
    // Update timestamp
    response.timestamp = new Date().toISOString();
    
    // If no photos left, we can keep the empty array or remove the response
    // Let's keep it to maintain the structure
  }
  
  renderQuestionCard();
}

// Photo preview state
let photoPreviewState = {
  photos: [],
  currentIndex: 0,
};

// Open photo preview modal
function openPhotoPreview(photoIndex = 0) {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (areaIndex === null || !paramId || !lineId) return;
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return;
  
  // Determine photo key based on photoMode
  const photoMode = param.photoMode || "per-sample";
  const photoKey = photoMode === "per-line" 
    ? `${lineId}_${repIndex}` 
    : `${lineId}_${repIndex}_${sampleIndex}`;
  
  const photos = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos || [];
  if (photos.length === 0) return;
  
  photoPreviewState.photos = photos;
  photoPreviewState.currentIndex = Math.min(photoIndex, photos.length - 1);
  
  // Update modal
  const modal = document.getElementById("photoPreviewModal");
  const image = document.getElementById("photoPreviewImage");
  const counter = document.getElementById("photoCounter");
  const prevBtn = document.getElementById("prevPhotoBtn");
  const nextBtn = document.getElementById("nextPhotoBtn");
  
  if (modal && image && counter) {
    image.src = photos[photoPreviewState.currentIndex];
    counter.textContent = `${photoPreviewState.currentIndex + 1} / ${photos.length}`;
    prevBtn.disabled = photoPreviewState.currentIndex === 0;
    nextBtn.disabled = photoPreviewState.currentIndex === photos.length - 1;
    modal.classList.remove("hidden");
  }
}

// Close photo preview modal
function closePhotoPreview() {
  const modal = document.getElementById("photoPreviewModal");
  if (modal) {
    modal.classList.add("hidden");
  }
  photoPreviewState.photos = [];
  photoPreviewState.currentIndex = 0;
}

// Navigate photos in preview
function navigatePhotos(direction) {
  const photos = photoPreviewState.photos;
  if (photos.length === 0) return;
  
  if (direction === "prev" && photoPreviewState.currentIndex > 0) {
    photoPreviewState.currentIndex--;
  } else if (direction === "next" && photoPreviewState.currentIndex < photos.length - 1) {
    photoPreviewState.currentIndex++;
  }
  
  const image = document.getElementById("photoPreviewImage");
  const counter = document.getElementById("photoCounter");
  const prevBtn = document.getElementById("prevPhotoBtn");
  const nextBtn = document.getElementById("nextPhotoBtn");
  
  if (image && counter) {
    image.src = photos[photoPreviewState.currentIndex];
    counter.textContent = `${photoPreviewState.currentIndex + 1} / ${photos.length}`;
    prevBtn.disabled = photoPreviewState.currentIndex === 0;
    nextBtn.disabled = photoPreviewState.currentIndex === photos.length - 1;
  }
}

// Check if current response has changes from last saved state
function hasResponseChanges() {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (areaIndex === null || !paramId || !lineId) return false;
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return false;

  // Get current value
  let currentValue = "";
  if (param.type === "radio") {
    const checked = document.querySelector('input[name="runRadio"]:checked');
    currentValue = checked ? checked.value : "";
  } else if (param.type === "checkbox") {
    const checked = document.querySelectorAll('input[name="runCheckbox"]:checked');
    currentValue = Array.from(checked).map((c) => c.value).join(",");
  } else {
    const input = document.getElementById("runInputValue");
    currentValue = input ? input.value : "";
  }
  
  // Get current photos count
  const photoMode = param.photoMode || "per-sample";
  const photoKey = photoMode === "per-line" 
    ? `${lineId}_${repIndex}` 
    : `${lineId}_${repIndex}_${sampleIndex}`;
  const currentPhotosCount = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos?.length || 0;
  
  // Compare with last saved state
  const valueChanged = currentValue !== (runTrialState.lastSavedValue || "");
  const photosChanged = currentPhotosCount !== (runTrialState.lastSavedPhotosCount || 0);
  
  return valueChanged || photosChanged;
}

// Save current response silently (for auto-save)
function saveCurrentResponseSilent() {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (areaIndex === null || !paramId || !lineId) return true;
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return true;

  // Response key includes sampleIndex
  const lineKey = `${lineId}_${repIndex}_${sampleIndex}`;

  // Get value based on input type
  let value = "";
  if (param.type === "radio") {
    const checked = document.querySelector('input[name="runRadio"]:checked');
    value = checked ? checked.value : "";
  } else if (param.type === "checkbox") {
    const checked = document.querySelectorAll('input[name="runCheckbox"]:checked');
    value = Array.from(checked).map((c) => c.value).join(",");
  } else {
    const input = document.getElementById("runInputValue");
    value = input ? input.value : "";
  }

  // Handle photos based on photoMode (photos are already saved in handlePhotoUpload)
  let photos = [];
  if (param.requirePhoto) {
    const photoMode = param.photoMode || "per-sample";
    const photoKey = photoMode === "per-line" 
      ? `${lineId}_${repIndex}` // Per-line: same key for all samples
      : `${lineId}_${repIndex}_${sampleIndex}`; // Per-sample: unique key
    
    // Just get existing photos, don't append photoFiles (already saved)
    photos = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos || [];
    
    // Ensure photo key exists in response structure
    if (!runTrialState.responses[areaIndex]) {
      runTrialState.responses[areaIndex] = {};
    }
    if (!runTrialState.responses[areaIndex][paramId]) {
      runTrialState.responses[areaIndex][paramId] = {};
    }
    
    // Update photo key timestamp if it exists
    if (runTrialState.responses[areaIndex][paramId][photoKey]) {
      runTrialState.responses[areaIndex][paramId][photoKey].timestamp = new Date().toISOString();
    }
  }

  // Always save lineKey response with value (photos stored separately in photoKey)
  if (!runTrialState.responses[areaIndex]) {
    runTrialState.responses[areaIndex] = {};
  }
  if (!runTrialState.responses[areaIndex][paramId]) {
    runTrialState.responses[areaIndex][paramId] = {};
  }
  
  // Preserve existing lineKey response or create new one
  const existingLineResponse = runTrialState.responses[areaIndex][paramId][lineKey] || {};
  
  // IMPORTANT: When photoKey === lineKey (per-sample mode), preserve existing photos
  const existingPhotos = existingLineResponse.photos || [];
  runTrialState.responses[areaIndex][paramId][lineKey] = {
    value,
    photos: existingPhotos, // Preserve photos that may have been saved by handlePhotoUpload
    timestamp: new Date().toISOString(),
  };

  return true;
}

// Navigate to previous line (skip all samples, go directly to previous line)
function navigatePrevLine() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const lines = getAllLinesList();
  const currentLineId = runTrialState.currentLineId;
  const currentRepIndex = runTrialState.currentRepIndex;
  
  // Find first sample of current line
  const currentLineFirstSampleIdx = lines.findIndex(
    (l) =>
      l.areaIndex === runTrialState.currentAreaIndex &&
      l.paramId === runTrialState.currentParamId &&
      l.lineId === currentLineId &&
      l.repIndex === currentRepIndex &&
      l.sampleIndex === 0
  );
  
  if (currentLineFirstSampleIdx > 0) {
    // Go to previous entry (which is the last sample of previous line)
    const prev = lines[currentLineFirstSampleIdx - 1];
    // But we want first sample of that previous line, so find it
    const prevLineFirstSampleIdx = lines.findIndex(
      (l) =>
        l.areaIndex === prev.areaIndex &&
        l.paramId === prev.paramId &&
        l.lineId === prev.lineId &&
        l.repIndex === prev.repIndex &&
        l.sampleIndex === 0
    );
    
    if (prevLineFirstSampleIdx >= 0) {
      const target = lines[prevLineFirstSampleIdx];
      selectLine(target.areaIndex, target.paramId, target.lineId, target.repIndex, 0);
    }
  }
}

// Navigate to previous sample of the same line
function navigatePrevSample() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  if (sampleIndex > 0) {
    selectLine(
      runTrialState.currentAreaIndex,
      runTrialState.currentParamId,
      runTrialState.currentLineId,
      runTrialState.currentRepIndex,
      sampleIndex - 1
    );
  }
}

// Navigate to next sample of the same line
function navigateNextSample() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const param = inventoryState.items.parameters.find((p) => p.id === runTrialState.currentParamId);
  const numberOfSamples = param?.numberOfSamples || 1;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (sampleIndex < numberOfSamples - 1) {
    selectLine(
      runTrialState.currentAreaIndex,
      runTrialState.currentParamId,
      runTrialState.currentLineId,
      runTrialState.currentRepIndex,
      sampleIndex + 1
    );
  }
}

// Navigate to previous area (go to last line of previous area)
function navigatePrevArea() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const currentAreaIndex = runTrialState.currentAreaIndex;
  if (currentAreaIndex <= 0) return;
  
  const lines = getAllLinesList();
  const prevAreaLines = lines.filter(l => l.areaIndex === currentAreaIndex - 1);
  
  if (prevAreaLines.length > 0) {
    const lastLine = prevAreaLines[prevAreaLines.length - 1];
    selectLine(lastLine.areaIndex, lastLine.paramId, lastLine.lineId, lastLine.repIndex, lastLine.sampleIndex);
  }
}

// Navigate to next area (go to first line of next area)
function navigateNextArea() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const trial = runTrialState.currentTrial;
  const currentAreaIndex = runTrialState.currentAreaIndex;
  if (currentAreaIndex >= trial.areas.length - 1) return;
  
  const lines = getAllLinesList();
  const nextAreaLines = lines.filter(l => l.areaIndex === currentAreaIndex + 1);
  
  if (nextAreaLines.length > 0) {
    const firstLine = nextAreaLines[0];
    selectLine(firstLine.areaIndex, firstLine.paramId, firstLine.lineId, firstLine.repIndex, firstLine.sampleIndex);
  }
}

// Navigate to next line (skip all samples, go directly to next line)
function navigateNextLine() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const lines = getAllLinesList();
  const currentLineId = runTrialState.currentLineId;
  const currentRepIndex = runTrialState.currentRepIndex;
  const currentParamId = runTrialState.currentParamId;
  const currentAreaIndex = runTrialState.currentAreaIndex;
  
  // Find last sample of current line
  const param = inventoryState.items.parameters.find((p) => p.id === currentParamId);
  const numberOfSamples = param?.numberOfSamples || 1;
  
  const currentLineLastSampleIdx = lines.findIndex(
    (l) =>
      l.areaIndex === currentAreaIndex &&
      l.paramId === currentParamId &&
      l.lineId === currentLineId &&
      l.repIndex === currentRepIndex &&
      l.sampleIndex === numberOfSamples - 1
  );
  
  if (currentLineLastSampleIdx >= 0 && currentLineLastSampleIdx < lines.length - 1) {
    // Next entry after last sample of current line is first sample of next line
    const next = lines[currentLineLastSampleIdx + 1];
    selectLine(next.areaIndex, next.paramId, next.lineId, next.repIndex, 0);
  } else {
    // At last question - check if 100% complete
    const completed = lines.filter((l) => {
      const lineKey = `${l.lineId}_${l.repIndex}_${l.sampleIndex}`;
      return hasResponse(l.areaIndex, l.paramId, lineKey);
    }).length;
    
    const isComplete = completed === lines.length && lines.length > 0;
    
    if (isComplete) {
      // Auto-save and exit to run trial selection
      saveRunTrialProgress();
      setTimeout(() => {
        exitRunTrial();
      }, 500);
    } else {
      // Show completion state with option to loop back to first
      renderCompletionState(isComplete, lines);
    }
  }
}

// Render completion state when at end of questions
function renderCompletionState(isComplete, lines) {
  const container = document.getElementById("runTrialQuestion");
  
  if (isComplete) {
    container.innerHTML = `
      <div class="run-empty-state">
        <span class="material-symbols-rounded completion-icon-success">check_circle</span>
        <h3>Trial Complete!</h3>
        <p>All questions have been answered. Saving progress...</p>
      </div>
    `;
  } else {
    const completed = lines.filter((l) => {
      const lineKey = `${l.lineId}_${l.repIndex}`;
      return hasResponse(l.areaIndex, l.paramId, lineKey);
    }).length;
    const percentage = Math.round((completed / lines.length) * 100);
    
    container.innerHTML = `
      <div class="run-empty-state">
        <span class="material-symbols-rounded completion-icon-default">assignment</span>
        <h3>End of Questions</h3>
        <button class="btn btn-primary completion-restart-btn" onclick="navigateToFirstLine()">
          <span class="material-symbols-rounded">restart_alt</span>
          <span>Start from Beginning</span>
        </button>
      </div>
    `;
  }
}

// Navigate to first line
function navigateToFirstLine() {
  const lines = getAllLinesList();
  if (lines.length > 0) {
    const first = lines[0];
    selectLine(first.areaIndex, first.paramId, first.lineId, first.repIndex, first.sampleIndex);
  }
}

// Get all lines as flat list (including samples for each line)
function getAllLinesList() {
  const trial = runTrialState.currentTrial;
  const lines = [];

  const parameters = getRunnableTrialParameters(trial);

  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;

    parameters.forEach((param) => {
      const numberOfSamples = param.numberOfSamples || 1;
      
      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (!cell) return;
            
            // Add entry for each sample
            for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
              lines.push({
                areaIndex,
                paramId: param.id,
                lineId: cell.id,
                lineName: cell.name,
                repIndex,
                sampleIndex,
                numberOfSamples,
              });
            }
          });
        });
      });
    });
  });

  return lines;
}

// Update progress display
function updateRunTrialProgress() {
  const lines = getAllLinesList();
  const completed = lines.filter((l) => {
    const lineKey = `${l.lineId}_${l.repIndex}`;
    return hasResponse(l.areaIndex, l.paramId, lineKey);
  }).length;

  // const percentage = lines.length > 0 ? Math.round((completed / lines.length) * 100) : 0;
  // document.getElementById("runTrialProgress").textContent = `${completed} / ${lines.length} · ${percentage}%`;
}

// Save run trial progress
async function saveRunTrialProgress() {
  // Save current answer first
  saveCurrentResponseSilent();
  
  const trial = runTrialState.currentTrial;
  if (!trial) return;

  // Update trial with responses (no validation - allow saving anytime)
  trial.responses = runTrialState.responses;
  trial.updatedAt = new Date().toISOString();

  // Update in state
  const idx = trialState.trials.findIndex((t) => t.id === trial.id);
  if (idx !== -1) {
    trialState.trials[idx] = trial;
  }

  if (typeof saveLocalCache === "function") {
    saveLocalCache("trials", { trials: trialState.trials });
  }

  // Save responses to Google Drive (targeted — per line file, deduplicated by fileKey)
  const saveAreaIndex = runTrialState.currentAreaIndex;
  const saveParamId = runTrialState.currentParamId;
  const saveLineId = runTrialState.currentLineId;
  const saveRepIndex = runTrialState.currentRepIndex;

  if (saveAreaIndex !== null && saveParamId && saveLineId !== null && saveRepIndex !== null) {
    enqueueSync({
      label: `Save Responses: ${trial.name}`,
      fileKey: `${trial.id}~${saveAreaIndex}~${saveParamId}~${saveRepIndex}~${saveLineId}`,
      run: () => saveTrialLineToDrive(trial, saveAreaIndex, saveParamId, saveRepIndex, saveLineId),
    });
  } else {
    // Fallback: full backup if current line context is unknown
    enqueueSync({
      label: `Save Responses: ${trial.name}`,
      run: () => saveTrialResponsesToDrive(trial),
    });
  }

  // Update nav and progress display
  renderRunTrialNavTree();
  updateRunTrialProgress();
  
  // Show success feedback
  if (typeof showSuccessMessage === "function") {
    showSuccessMessage("Progress saved");
  }
}

// Auto save in background (without feedback message)
let autoSaveInProgress = false;

async function autoSaveProgress() {
  if (autoSaveInProgress) return; // Prevent multiple simultaneous saves
  
  const trial = runTrialState.currentTrial;
  if (!trial) return;
  
  autoSaveInProgress = true;
  
  // Update icon to saving state
  const saveIcon = document.querySelector('.run-save-icon');
  const saveIconSymbol = saveIcon?.querySelector('.material-symbols-rounded');
  if (saveIcon) {
    saveIcon.classList.add('saving');
    saveIcon.disabled = true;
  }
  if (saveIconSymbol) {
    saveIconSymbol.textContent = 'cached';
  }
  
  try {
    // Update trial with responses
    trial.responses = runTrialState.responses;
    trial.updatedAt = new Date().toISOString();

    // Update in state
    const idx = trialState.trials.findIndex((t) => t.id === trial.id);
    if (idx !== -1) {
      trialState.trials[idx] = trial;
    }

    if (typeof saveLocalCache === "function") {
      saveLocalCache("trials", { trials: trialState.trials });
    }

    // Save to Drive in background (targeted: only current line, deduplicated by fileKey)
    const saveAreaIndex = runTrialState.currentAreaIndex;
    const saveParamId = runTrialState.currentParamId;
    const saveLineId = runTrialState.currentLineId;
    const saveRepIndex = runTrialState.currentRepIndex;
    const saveSampleIndex = runTrialState.currentSampleIndex || 0;

    if (saveAreaIndex !== null && saveParamId && saveLineId !== null && saveRepIndex !== null) {
      // Build detailed label: trial > area > param > rep > line > sample
      const area = trial.areas[saveAreaIndex];
      const param = inventoryState.items.parameters.find((p) => p.id === saveParamId);
      const line = area?.layout?.lines?.find((l) => l.id === saveLineId);
      const numberOfSamples = param?.numberOfSamples || 1;
      
      const trialName = trial.name || "Trial";
      const areaName = area?.name || `Area ${saveAreaIndex + 1}`;
      const paramName = param?.name || "Param";
      const repLabel = `Rep ${saveRepIndex + 1}`;
      const lineName = line?.name || `Line ${saveLineId}`;
      const sampleLabel = numberOfSamples > 1 ? ` · S${saveSampleIndex + 1}` : "";
      
      enqueueSync({
        label: `Saving ${trialName} · ${areaName} · ${paramName} · ${repLabel} · ${lineName}${sampleLabel}`,
        fileKey: `${trial.id}~${saveAreaIndex}~${saveParamId}~${saveRepIndex}~${saveLineId}`,
        run: () => saveTrialLineToDrive(trial, saveAreaIndex, saveParamId, saveRepIndex, saveLineId),
      });
    } else {
      // Fallback: full backup if current line context is unknown
      enqueueSync({
        label: `Saving ${trial.name}`,
        run: () => saveTrialResponsesToDrive(trial),
      });
    }

    // Update nav and progress display
    renderRunTrialNavTree();
    updateRunTrialProgress();

    // Keep dashboard in sync even during run trial
    renderDashboardTrialProgress();
    if (typeof refreshReminderViewsRealtime === "function") {
      refreshReminderViewsRealtime();
    }
  } finally {
    // Remove saving state after short delay
    setTimeout(() => {
      autoSaveInProgress = false;
      if (saveIcon) {
        saveIcon.classList.remove('saving');
        saveIcon.disabled = false;
      }
      if (saveIconSymbol) {
        saveIconSymbol.textContent = 'save';
      }
    }, 500);
  }
}

// Manual save with feedback
async function manualSaveProgress() {
  if (autoSaveInProgress) return;
  
  await autoSaveProgress();
  
  // Show success feedback for manual saves
  if (typeof showSuccessMessage === "function") {
    showSuccessMessage("Progress saved");
  }
}

// ===========================
// DASHBOARD TRIAL PROGRESS
// ===========================

function calculateTrialProgress(trial) {
  if (!trial.areas || !trial.parameters) return { completed: 0, total: 0, percentage: 0 };
  
  const parameters = getRunnableTrialParameters(trial).map((param) => param.id);
  const responses = trial.responses || {};
  let total = 0;
  let completed = 0;

  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;
    
    area.layout.result.forEach((rep, repIndex) => {
      rep.forEach((row) => {
        row.forEach((cell) => {
          if (!cell) return;
          parameters.forEach((paramId) => {
            const param = inventoryState.items.parameters.find((p) => p.id === paramId);
            const numberOfSamples = param?.numberOfSamples || 1;
            const photoMode = param?.photoMode || "per-sample";

            // For each sample in this line
            for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
              total++;
              
              // Response key for this specific sample
              const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
              const response = responses[areaIndex]?.[paramId]?.[lineKey];
              const hasValue = response?.value !== undefined && response?.value !== "";

              // Check photos
              let hasPhotos = false;
              if (param?.requirePhoto) {
                const photoKey = photoMode === "per-line" 
                  ? `${cell.id}_${repIndex}` 
                  : `${cell.id}_${repIndex}_${sampleIndex}`;
                const photoResponse = responses[areaIndex]?.[paramId]?.[photoKey];
                hasPhotos = photoResponse?.photos?.length > 0;
              }

              if (param?.requirePhoto) {
                if (hasValue && hasPhotos) completed++;
              } else if (hasValue || hasPhotos) {
                completed++;
              }
            }
          });
        });
      });
    });
  });

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

// Helper: Get progress color based on percentage (red to green gradient)
function getProgressGradientColor(percentage) {
  if (percentage === 0) return '#999999'; // Gray for not started
  if (percentage === 100) return '#22c55e'; // Green for completed
  
  // Red to Green gradient: #ef4444 (0%) -> #fbbf24 (50%) -> #22c55e (100%)
  if (percentage <= 50) {
    // Red to Yellow: 0% to 50%
    const ratio = percentage / 50;
    const r = Math.round(239 - (239 - 251) * ratio);
    const g = Math.round(68 + (191 - 68) * ratio);
    const b = Math.round(68 - 68 * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to Green: 50% to 100%
    const ratio = (percentage - 50) / 50;
    const r = Math.round(251 - (251 - 34) * ratio);
    const g = Math.round(191 + (197 - 191) * ratio);
    const b = Math.round(36 + (94 - 36) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function renderDashboardTrialProgress() {
  // Kept for backwards compat – now delegates to the new summary renderer
  renderDashboardTrialSummary();
}

function renderDashboardTrialSummary() {
  const container = document.getElementById('dashboardTrialSummary');
  if (!container) return;

  const activeTrials = trialState.trials.filter(
    (t) => !t.archived && t.areas && t.areas.length > 0 && t.areas.some((a) => a.layout?.result)
  );

  if (activeTrials.length === 0) {
    container.classList.add("empty-grid");
    container.innerHTML = `
      <div class="empty-state-small">
        <span class="material-symbols-rounded">science</span>
        <p>No active trials</p>
      </div>
    `;
    return;
  } else {
    container.classList.remove("empty-grid");
  }

  container.innerHTML = activeTrials.map((trial) => {
    // Observation progress
    const obs = calculateTrialProgress(trial);
    const obsColor = obs.percentage === 100 ? 'var(--success)'
      : obs.percentage > 50 ? 'var(--primary)'
      : obs.percentage > 0 ? 'var(--warning)'
      : 'var(--text-tertiary)';

    // Agronomy progress
    const hasAgronomy = trial.agronomyMonitoring && trial.agronomyItems && trial.agronomyItems.length > 0;
    const agro = hasAgronomy ? calculateAgronomyProgress(trial) : null;
    const agroColor = agro
      ? (agro.percentage === 100 ? 'var(--success)'
        : agro.percentage > 50 ? 'var(--primary)'
        : agro.percentage > 0 ? 'var(--warning)'
        : 'var(--text-tertiary)')
      : 'var(--text-tertiary)';

    // Overall status badge
    const overallPct = agro
      ? Math.round(((obs.completed + agro.completed) / Math.max(obs.total + agro.total, 1)) * 100)
      : obs.percentage;
    const badgeClass = overallPct === 100 ? 'complete' : overallPct > 0 ? 'in-progress' : 'not-started';
    const badgeText = overallPct === 100 ? 'Complete' : overallPct > 0 ? 'In Progress' : 'Not Started';

    const cropName = trial.cropName || 'Unknown Crop';
    const plantDate = getTrialPlantingDateSummary(trial);

    return `
      <div class="dash-trial-card" data-trial-id="${trial.id}">
        <div class="dash-trial-top">
          <div class="dash-trial-info">
            <span class="dash-trial-name">${escapeHtml(trial.name)}</span>
            <span class="dash-trial-meta">${escapeHtml(cropName)} · ${trial.areas.length} area(s) · Planted ${plantDate}</span>
          </div>
          <span class="dash-trial-status-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="dash-trial-progress-rows">
          <div class="dash-progress-row">
            <span class="dash-progress-label">
              <span class="material-symbols-rounded">visibility</span> Observation
            </span>
            <div class="dash-progress-bar">
              <div class="dash-progress-bar-fill" style="width:${obs.percentage}%; background:${obsColor}"></div>
            </div>
            <span class="dash-progress-text">${obs.completed}/${obs.total} (${obs.percentage}%)</span>
          </div>
          ${hasAgronomy ? `
          <div class="dash-progress-row">
            <span class="dash-progress-label">
              <span class="material-symbols-rounded">local_florist</span> Agronomy
            </span>
            <div class="dash-progress-bar">
              <div class="dash-progress-bar-fill" style="width:${agro.percentage}%; background:${agroColor}"></div>
            </div>
            <span class="dash-progress-text">${agro.completed}/${agro.total} (${agro.percentage}%)</span>
          </div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Click handler – navigate to trial page
  container.querySelectorAll('.dash-trial-card[data-trial-id]').forEach(card => {
    card.addEventListener('click', () => {
      const trialId = card.dataset.trialId;
      if (typeof switchPage === 'function') switchPage('trial');
      // Small delay so the page switches first
      setTimeout(() => {
        if (typeof showTrialActionPopup === 'function') {
          showTrialActionPopup(new Event('click'), trialId);
        }
      }, 100);
    });
  });
}

// Show trial action popup when clicking a trial card
function showTrialActionPopup(event, trialId) {
  event.stopPropagation();
  
  // Remove any existing popup
  const existingPopup = document.querySelector('.trial-action-popup-overlay');
  if (existingPopup) existingPopup.remove();
  
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;
  
  const hasLayout = trial.areas && trial.areas.length > 0 && trial.areas.some(a => a.layout?.result);
  
  const hasAgronomy = trial.agronomyMonitoring && trial.agronomyItems && trial.agronomyItems.length > 0 && !trial.archived;
  
  const overlay = document.createElement('div');
  overlay.className = 'trial-action-popup-overlay';
  overlay.innerHTML = `
    <div class="trial-action-popup">
      <div class="trial-action-popup-header">
        <h4>${escapeHtml(trial.name)}</h4>
        <button class="btn-icon-close" onclick="closeTrialActionPopup()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="trial-action-popup-options">
        <button class="trial-action-option" onclick="closeTrialActionPopup(); showTrialDetail('${trialId}');">
          <span class="material-symbols-rounded">info</span>
          <div class="trial-action-option-text">
            <span class="trial-action-option-title">Detail</span>
            <span class="trial-action-option-desc">View trial information and settings</span>
          </div>
        </button>
        <button class="trial-action-option ${!hasLayout || trial.archived ? 'disabled' : ''}" 
                onclick="${hasLayout && !trial.archived ? `closeTrialActionPopup(); startRunTrial('${trialId}');` : ''}" 
                ${!hasLayout || trial.archived ? 'disabled' : ''}>
          <span class="material-symbols-rounded">visibility</span>
          <div class="trial-action-option-text">
            <span class="trial-action-option-title">Run Observation</span>
            <span class="trial-action-option-desc">${!hasLayout ? 'No layout available' : trial.archived ? 'Trial is archived' : 'Start or continue observations'}</span>
          </div>
        </button>
        <button class="trial-action-option ${!hasAgronomy ? 'disabled' : ''}" 
                onclick="${hasAgronomy ? `closeTrialActionPopup(); startAgronomyMonitoring('${trialId}');` : ''}"
                ${!hasAgronomy ? 'disabled' : ''}>
          <span class="material-symbols-rounded">local_florist</span>
          <div class="trial-action-option-text">
            <span class="trial-action-option-title">Agronomy Monitoring</span>
            <span class="trial-action-option-desc">${!hasAgronomy ? (trial.archived ? 'Trial is archived' : 'No agronomy items assigned') : 'Start or continue agronomy monitoring'}</span>
          </div>
        </button>
        <button class="trial-action-option" onclick="closeTrialActionPopup(); showTrialReport('${trialId}');">
          <span class="material-symbols-rounded">description</span>
          <div class="trial-action-option-text">
            <span class="trial-action-option-title">Report</span>
            <span class="trial-action-option-desc">Preview and download trial report (Excel)</span>
          </div>
        </button>
      </div>
    </div>
  `;
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTrialActionPopup();
  });
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function closeTrialActionPopup() {
  const overlay = document.querySelector('.trial-action-popup-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  }
}

let trialReportState = {
  currentTrialId: null,
  trialName: "",
  sheets: [],
  activeSheetName: "",
  filters: {},
  sort: {},
  columnMenusBound: false,
};

function showTrialReport(trialId) {
  const trial = trialState.trials.find((t) => t.id === trialId);
  if (!trial) return;

  const reportInterface = document.getElementById("trialReportInterface");
  if (!reportInterface) return;

  const reportData = buildTrialReportWorkbookData(trial);
  trialReportState.currentTrialId = trial.id;
  trialReportState.trialName = trial.name || "Trial";
  trialReportState.sheets = reportData.sheets;
  trialReportState.activeSheetName = reportData.sheets[0]?.name || "";
  trialReportState.filters = {};
  trialReportState.sort = {};

  renderTrialReportSheetSelect();
  renderTrialReportPreview();

  toggleTrialReportInterface(true, trialReportState.trialName);
}

function closeTrialReportModal() {
  toggleTrialReportInterface(false);
}

function toggleTrialReportInterface(show, title) {
  const reportInterface = document.getElementById("trialReportInterface");
  const panel = document.getElementById("trialManagementPanel");
  const archive = document.getElementById("archivedTrialManagementPanel");

  if (!reportInterface || !panel) return;

  if (show) {
    reportInterface.classList.add("active");
    panel.classList.add("hidden");
    if (archive) archive.classList.add("hidden");
    enterTrialFullscreenMode({
      title: title || trialReportState.trialName || "Trial",
      onClose: closeTrialReportModal,
    });
    setTrialReportTopbarControls(true);
  } else {
    reportInterface.classList.remove("active");
    panel.classList.remove("hidden");
    if (archive) archive.classList.remove("hidden");
    setTrialReportTopbarControls(false);
    exitTrialFullscreenMode();
  }
}

function setTrialReportTopbarControls(show) {
  const sheetSelect = document.getElementById("trialReportSheetSelect");
  const downloadBtn = document.getElementById("trialReportTopbarDownloadBtn");

  if (show) {
    renderTrialReportSheetSelect();
    if (sheetSelect) {
      sheetSelect.classList.remove("hidden");
      sheetSelect.style.display = "";
    }
    if (downloadBtn) {
      downloadBtn.classList.remove("hidden");
      downloadBtn.style.display = "flex";
    }
  } else {
    if (sheetSelect) {
      sheetSelect.classList.add("hidden");
      sheetSelect.style.display = "none";
    }
    if (downloadBtn) {
      downloadBtn.classList.add("hidden");
      downloadBtn.style.display = "none";
    }
  }
}

function renderTrialReportSheetSelect() {
  const selectEl = document.getElementById("trialReportSheetSelect");
  if (!selectEl) return;

  const sheets = trialReportState.sheets || [];
  if (sheets.length === 0) {
    selectEl.innerHTML = "";
    return;
  }

  selectEl.innerHTML = sheets
    .map((sheet) => {
      const selected = sheet.name === trialReportState.activeSheetName ? "selected" : "";
      return `<option value="${escapeHtml(sheet.name)}" ${selected}>${escapeHtml(sheet.name)}</option>`;
    })
    .join("");
}

function handleTrialReportSheetSelect(sheetName) {
  selectTrialReportSheet(sheetName);
}

function selectTrialReportSheet(sheetName) {
  trialReportState.activeSheetName = sheetName;
  closeTrialReportColumnMenus();
  renderTrialReportSheetSelect();
  renderTrialReportPreview();
}

function bindTrialReportMenuGlobalClose() {
  if (trialReportState.columnMenusBound) return;
  document.addEventListener("click", (event) => {
    const insideMenu = event.target.closest(".trial-report-column-menu-container");
    const insideHeaderButton = event.target.closest(".trial-report-th-btn");
    if (!insideMenu && !insideHeaderButton) {
      closeTrialReportColumnMenus();
    }
  });
  trialReportState.columnMenusBound = true;
}

function getTrialReportSheetData() {
  const sheet = (trialReportState.sheets || []).find((s) => s.name === trialReportState.activeSheetName);
  if (!sheet || !Array.isArray(sheet.rows) || sheet.rows.length === 0) {
    return { sheet: null, header: [], bodyRows: [] };
  }
  return {
    sheet,
    header: sheet.rows[0] || [],
    bodyRows: sheet.rows.slice(1),
  };
}

function normalizeTrialReportFilterValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "__BLANK__";
  return text;
}

function getTrialReportFilterLabel(filterValue) {
  return filterValue === "__BLANK__" ? "(blank)" : filterValue;
}

function getTrialReportColumnFilterSetting(sheetName, colIndex) {
  if (!trialReportState.filters[sheetName]) {
    trialReportState.filters[sheetName] = {};
  }
  if (!trialReportState.filters[sheetName][colIndex]) {
    trialReportState.filters[sheetName][colIndex] = {
      mode: "default",
      selectedValues: [],
    };
  }
  return trialReportState.filters[sheetName][colIndex];
}

function getTrialReportUniqueColumnValues(rows, colIndex) {
  const unique = new Set();
  rows.forEach((row) => {
    unique.add(normalizeTrialReportFilterValue(row?.[colIndex]));
  });
  return Array.from(unique).sort((a, b) =>
    getTrialReportFilterLabel(a).localeCompare(getTrialReportFilterLabel(b), undefined, { numeric: true, sensitivity: "base" }),
  );
}

function applyTrialReportFilters(rows, sheetName) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const sheetFilters = trialReportState.filters?.[sheetName] || {};
  const hasCustomFilter = Object.values(sheetFilters).some((setting) => setting?.mode === "custom");
  if (!hasCustomFilter) return rows;

  return rows.filter((row) => {
    return Object.entries(sheetFilters).every(([colIdxText, setting]) => {
      if (!setting || setting.mode !== "custom") return true;
      const selected = Array.isArray(setting.selectedValues) ? setting.selectedValues : [];
      if (selected.length === 0) return false;
      const colIdx = Number(colIdxText);
      const value = normalizeTrialReportFilterValue(row?.[colIdx]);
      return selected.includes(value);
    });
  });
}

function applyTrialReportSort(rows, sheetName) {
  const sortSetting = trialReportState.sort?.[sheetName];
  if (!sortSetting || sortSetting.mode === "default") return rows;

  const colIndex = Number(sortSetting.colIndex);
  const direction = sortSetting.mode === "desc" ? -1 : 1;
  const sorted = [...rows];

  sorted.sort((left, right) => {
    const a = String(left?.[colIndex] ?? "");
    const b = String(right?.[colIndex] ?? "");
    const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    return cmp * direction;
  });

  return sorted;
}

function setTrialReportColumnSort(colIndex, mode) {
  const sheetName = trialReportState.activeSheetName;
  if (!sheetName) return;
  if (mode === "default") {
    delete trialReportState.sort[sheetName];
  } else {
    trialReportState.sort[sheetName] = {
      colIndex,
      mode,
    };
  }
  closeTrialReportColumnMenus();
  renderTrialReportPreview();
}

function resetTrialReportColumnSetting(colIndex) {
  const sheetName = trialReportState.activeSheetName;
  if (!sheetName) return;
  const setting = getTrialReportColumnFilterSetting(sheetName, colIndex);
  setting.mode = "default";
  setting.selectedValues = [];

  const sortSetting = trialReportState.sort?.[sheetName];
  if (sortSetting && Number(sortSetting.colIndex) === Number(colIndex)) {
    delete trialReportState.sort[sheetName];
  }

  closeTrialReportColumnMenus();
  renderTrialReportPreview();
}

function setTrialReportColumnCustomMode(colIndex) {
  const { sheet, bodyRows } = getTrialReportSheetData();
  if (!sheet) return;

  const setting = getTrialReportColumnFilterSetting(sheet.name, colIndex);
  const allValues = getTrialReportUniqueColumnValues(bodyRows, colIndex);
  setting.mode = "custom";
  if (!Array.isArray(setting.selectedValues) || setting.selectedValues.length === 0) {
    setting.selectedValues = [...allValues];
  }
  renderTrialReportPreview();
  openTrialReportColumnMenuByIndex(colIndex, true);
}

function clearAllTrialReportCustomValues(colIndex) {
  const sheetName = trialReportState.activeSheetName;
  if (!sheetName) return;
  const setting = getTrialReportColumnFilterSetting(sheetName, colIndex);
  setting.mode = "custom";
  setting.selectedValues = [];
  renderTrialReportPreview();
  openTrialReportColumnMenuByIndex(colIndex, true);
}

function toggleTrialReportCustomValue(colIndex, value, checked) {
  const sheetName = trialReportState.activeSheetName;
  if (!sheetName) return;

  const setting = getTrialReportColumnFilterSetting(sheetName, colIndex);
  setting.mode = "custom";
  const selectedSet = new Set(Array.isArray(setting.selectedValues) ? setting.selectedValues : []);
  if (checked) selectedSet.add(value);
  else selectedSet.delete(value);
  setting.selectedValues = Array.from(selectedSet);

  renderTrialReportPreview();
  openTrialReportColumnMenuByIndex(colIndex, true);
}

function toggleTrialReportCustomValueEncoded(colIndex, encodedValue, checked) {
  const decoded = decodeURIComponent(String(encodedValue || ""));
  toggleTrialReportCustomValue(colIndex, decoded, checked);
}

function closeTrialReportColumnMenus() {
  document.querySelectorAll(".trial-report-column-menu-container").forEach((el) => el.remove());
}

function openTrialReportColumnMenuByIndex(colIndex, forceCustom) {
  const headerButton = document.querySelector(`.trial-report-th-btn[data-col-index="${colIndex}"]`);
  if (!headerButton) return;
  const fakeEvent = { currentTarget: headerButton, stopPropagation: () => {} };
  openTrialReportColumnMenu(fakeEvent, colIndex, !!forceCustom);
}

function openTrialReportColumnMenu(event, colIndex, openCustomSubmenu = false) {
  event.stopPropagation();
  bindTrialReportMenuGlobalClose();

  const { sheet, bodyRows } = getTrialReportSheetData();
  if (!sheet) return;

  const target = event.currentTarget;
  if (!target) return;

  closeTrialReportColumnMenus();

  const setting = getTrialReportColumnFilterSetting(sheet.name, colIndex);
  const sortSetting = trialReportState.sort?.[sheet.name];
  const currentSort = sortSetting && Number(sortSetting.colIndex) === Number(colIndex) ? sortSetting.mode : "default";

  const menu = document.createElement("div");
  menu.className = "trial-report-column-menu-container";
  menu.innerHTML = `
    <div class="trial-report-column-menu" onclick="event.stopPropagation()">
      <button type="button" class="trial-report-menu-item ${currentSort === "asc" ? "active" : ""}" onclick="setTrialReportColumnSort(${colIndex}, 'asc')">Ascending</button>
      <button type="button" class="trial-report-menu-item ${currentSort === "desc" ? "active" : ""}" onclick="setTrialReportColumnSort(${colIndex}, 'desc')">Descending</button>
      <button type="button" class="trial-report-menu-item ${setting.mode === "custom" ? "active" : ""}" onclick="setTrialReportColumnCustomMode(${colIndex})">Custom</button>
      <button type="button" class="trial-report-menu-item" onclick="resetTrialReportColumnSetting(${colIndex})">Default</button>
      <div class="trial-report-custom-submenu ${openCustomSubmenu || setting.mode === "custom" ? "active" : ""}">
        <div class="trial-report-custom-actions">
          <button type="button" class="trial-report-menu-item subtle" onclick="clearAllTrialReportCustomValues(${colIndex})">Clear all</button>
        </div>
        <div class="trial-report-custom-list">
          ${getTrialReportUniqueColumnValues(bodyRows, colIndex)
            .map((value) => {
              const selected = Array.isArray(setting.selectedValues) && setting.selectedValues.includes(value);
              const encodedValue = encodeURIComponent(value);
              return `
                <label class="trial-report-custom-item">
                  <input type="checkbox" ${selected ? "checked" : ""} onchange="toggleTrialReportCustomValueEncoded(${colIndex}, '${encodedValue}', this.checked)">
                  <span>${escapeHtml(getTrialReportFilterLabel(value))}</span>
                </label>
              `;
            })
            .join("")}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(menu);

  const rect = target.getBoundingClientRect();
  const top = rect.bottom + 4;
  const left = rect.left;
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function getTrialReportColumnMode(sheetName, colIndex) {
  const setting = trialReportState.filters?.[sheetName]?.[colIndex];
  const sortSetting = trialReportState.sort?.[sheetName];
  if (sortSetting && Number(sortSetting.colIndex) === Number(colIndex)) {
    return sortSetting.mode;
  }
  return setting?.mode || "default";
}

function renderTrialReportPreview() {
  const tableEl = document.getElementById("trialReportPreviewTable");
  if (!tableEl) return;

  closeTrialReportColumnMenus();

  const { sheet, header, bodyRows } = getTrialReportSheetData();
  if (!sheet || header.length === 0) {
    tableEl.innerHTML = "";
    return;
  }

  const filteredRows = applyTrialReportFilters(bodyRows, sheet.name);
  const finalRows = applyTrialReportSort(filteredRows, sheet.name);

  const headHtml = `
    <thead>
      <tr>
        ${header
          .map((cell, colIdx) => {
            const mode = getTrialReportColumnMode(sheet.name, colIdx);
            const marker = mode === "asc"
              ? "▲"
              : mode === "desc"
                ? "▼"
                : mode === "custom"
                  ? "●"
                  : "";
            const isFirstCol = colIdx === 0;
            const displayText = isFirstCol ? "" : String(cell ?? "");
            return `
              <th class="${isFirstCol ? "trial-report-col-first" : ""}">
                <button type="button" class="trial-report-th-btn ${isFirstCol ? "trial-report-th-btn-first" : ""}" data-col-index="${colIdx}" onclick="openTrialReportColumnMenu(event, ${colIdx})">
                  <span class="trial-report-th-text">${escapeHtml(displayText)}</span>
                  <span class="material-symbols-rounded trial-report-th-marker ">filter_alt</span>
                </button>
              </th>
            `;
          })
          .join("")}
      </tr>
    </thead>
  `;
  const bodyHtml = finalRows.length > 0
    ? `<tbody>${finalRows
      .map((row) => `<tr>${header.map((_, idx) => `<td class="${idx === 0 ? "trial-report-col-first" : ""}">${escapeHtml(String(row[idx] ?? ""))}</td>`).join("")}</tr>`)
      .join("")}</tbody>`
    : `<tbody><tr><td colspan="${Math.max(header.length, 1)}" class="trial-report-empty">No rows</td></tr></tbody>`;

  tableEl.innerHTML = `${headHtml}${bodyHtml}`;
}

function downloadTrialReportExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  const sheets = trialReportState.sheets || [];
  if (sheets.length === 0) {
    showToast("No report data available", "error");
    return;
  }

  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const ws = XLSX.utils.aoa_to_sheet(rows);

    if (rows.length > 0) {
      const maxScanRows = Math.min(rows.length, 300);
      const maxCols = rows.reduce((acc, row) => Math.max(acc, row.length || 0), 0);
      const widths = [];
      for (let col = 0; col < maxCols; col++) {
        let maxLen = 8;
        for (let r = 0; r < maxScanRows; r++) {
          const value = String(rows[r]?.[col] ?? "");
          if (value.length > maxLen) maxLen = value.length;
        }
        widths.push({ wch: Math.min(maxLen + 2, 45) });
      }
      ws["!cols"] = widths;
    }

    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  });

  const safeName = (trialReportState.trialName || "Trial")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_") || "Trial";

  XLSX.writeFile(workbook, `${safeName}_Report.xlsx`);
  showToast("Report exported successfully", "success");
}

function buildTrialReportWorkbookData(trial) {
  const usedNames = new Set();
  const sheets = [];

  const addSheet = (baseName, rows) => {
    const name = makeUniqueReportSheetName(baseName, usedNames);
    sheets.push({ name, rows: Array.isArray(rows) ? rows : [] });
  };

  addSheet("General", buildTrialGeneralSheetRows(trial));

  const trialParameters = (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter(Boolean);

  (trial.areas || []).forEach((area, areaIndex) => {
    const areaLabel = (area?.name || `Area ${areaIndex + 1}`).trim() || `Area ${areaIndex + 1}`;
    addSheet(`${areaLabel}_Observation`, buildTrialObservationSheetRows(trial, area, areaIndex, trialParameters));
    addSheet(`${areaLabel}_Agronomy`, buildTrialAgronomySheetRows(trial, area, areaIndex));
  });

  return { sheets };
}

function makeUniqueReportSheetName(baseName, usedNames) {
  const fallback = "Sheet";
  let cleaned = String(baseName || fallback)
    .replace(/[\\/?*\[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) cleaned = fallback;
  cleaned = cleaned.slice(0, 31);

  let name = cleaned;
  let counter = 2;
  while (usedNames.has(name)) {
    const suffix = `_${counter}`;
    const stem = cleaned.slice(0, Math.max(31 - suffix.length, 1));
    name = `${stem}${suffix}`;
    counter += 1;
  }

  usedNames.add(name);
  return name;
}

function buildTrialGeneralSheetRows(trial) {
  const rows = [["Field", "Value"]];

  const location = inventoryState.items.locations?.find((l) => l.id === trial.locationId);
  const progress = calculateCombinedTrialProgress(trial);
  const trialParameters = (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter(Boolean);
  const formulaParams = trialParameters.filter((p) => (p.type || "").toLowerCase() === "formula");
  const nonFormulaParams = trialParameters.filter((p) => (p.type || "").toLowerCase() !== "formula");
  const agronomyItems = getTrialAgronomyItems(trial);

  rows.push(["Trial Name", trial.name || ""]);
  rows.push(["Description", trial.description || ""]);
  rows.push(["Crop", trial.cropName || ""]);
  rows.push(["Type of Pollination", trial.pollination || ""]);
  rows.push(["Trial Type", trial.trialType || ""]);
  rows.push(["Planting Season", trial.plantingSeason || ""]);
  rows.push(["Experimental Design", trial.expDesign || ""]);
  const factorDefinitions = normalizeTrialFactorDefinitions(trial);
  rows.push(["No. of Factors", String(normalizeTrialFactorsCount(trial.trialFactors))]);
  rows.push([
    "Factor Names",
    factorDefinitions.map((factor) => factor.name).filter(Boolean).join("; "),
  ]);
  factorDefinitions.forEach((factor, index) => {
    rows.push([`Factor ${index + 1} Name`, factor.name || ""]);
    rows.push([`Factor ${index + 1} Treatments`, (factor.treatments || []).join("; ")]);
  });
  rows.push(["Planting Window", `${trial.plantingStart || ""} - ${trial.plantingEnd || ""}`.trim()]);
  rows.push(["Planting Dates (Per Area)", getTrialPlantingDates(trial).join("; ")]);
  rows.push(["Location", location?.name || ""]);
  rows.push(["Areas", String((trial.areas || []).length)]);
  rows.push(["Observation Progress", `${progress.obs.completed}/${progress.obs.total} (${progress.obs.percentage}%)`]);
  rows.push(["Agronomy Progress", `${progress.agro.completed}/${progress.agro.total} (${progress.agro.percentage}%)`]);
  rows.push(["Overall Progress", `${progress.completed}/${progress.total} (${progress.percentage}%)`]);
  rows.push(["Observation Parameters", String(nonFormulaParams.length)]);
  rows.push([
    "Observation Parameter List",
    nonFormulaParams.map((p) => `${p.name || ""}${p.initial ? ` (${p.initial})` : ""}`).join("; "),
  ]);
  rows.push(["Formula Parameters", String(formulaParams.length)]);
  rows.push([
    "Formula Parameter List",
    formulaParams.map((p) => `${p.name || ""}${p.formula ? ` = ${p.formula}` : ""}`).join("; "),
  ]);
  rows.push(["Agronomy Items", String(agronomyItems.length)]);
  rows.push([
    "Agronomy Item List",
    agronomyItems.map((item) => item.activity || item.name || "").join("; "),
  ]);
  // Plot specification rows
  if (trial.trialType === 'Micropilot') {
    rows.push(["Panel", trial.mpPanel != null ? String(trial.mpPanel) : ""]);
    rows.push(["Ratio Female", trial.ratioFemale != null ? String(trial.ratioFemale) : ""]);
    rows.push(["Ratio Male", trial.ratioMale != null ? String(trial.ratioMale) : ""]);
    rows.push(["Name Female Lines", trial.mpFemaleLineNames || ""]);
    rows.push(["Total Female Rows", trial.mpTotalFemaleRows != null ? String(trial.mpTotalFemaleRows) : ""]);
    rows.push(["Name Male Lines", trial.mpMaleLineNames || ""]);
    rows.push(["Total Male Rows", trial.mpTotalMaleRows != null ? String(trial.mpTotalMaleRows) : ""]);
    rows.push(["Plot Length (m)", trial.mpPlotLength != null ? String(trial.mpPlotLength) : ""]);
    rows.push(["Plant Spacing Width (cm)", trial.mpSpacingWidth != null ? String(trial.mpSpacingWidth) : ""]);
    rows.push(["Plant Spacing Height (cm)", trial.mpSpacingHeight != null ? String(trial.mpSpacingHeight) : ""]);
    rows.push(["Plot Area (m²)", trial.mpPlotArea != null ? trial.mpPlotArea.toFixed(2) : ""]);
    rows.push(["Female Population/plot", trial.mpExpectedFemale != null ? String(Math.round(trial.mpExpectedFemale)) : ""]);
    rows.push(["Male Population/plot", trial.mpExpectedMale != null ? String(Math.round(trial.mpExpectedMale)) : ""]);
    rows.push(["Female Population/ha", trial.mpPopFemale != null ? String(Math.round(trial.mpPopFemale)) : ""]);
    rows.push(["Male Population/ha", trial.mpPopMale != null ? String(Math.round(trial.mpPopMale)) : ""]);
  } else {
    rows.push(["Rows per Plot", trial.rowsPerPlot != null ? String(trial.rowsPerPlot) : ""]);
    rows.push(["Plot Length (m)", trial.plotLength != null ? String(trial.plotLength) : ""]);
    rows.push(["Plant Spacing Width (cm)", trial.plantSpacingWidth != null ? String(trial.plantSpacingWidth) : ""]);
    rows.push(["Plant Spacing Height (cm)", trial.plantSpacingHeight != null ? String(trial.plantSpacingHeight) : ""]);
    rows.push(["Plot Area (m²)", trial.plotArea != null ? trial.plotArea.toFixed(2) : ""]);
    rows.push(["Exp. Plants per Plot", trial.expectedPlantsPerPlot != null ? String(Math.round(trial.expectedPlantsPerPlot)) : ""]);
    rows.push(["Population per Hectare", trial.populationPerHa != null ? String(Math.round(trial.populationPerHa)) : ""]);
  }

  rows.push(["Created At", formatReportTimestamp(trial.createdAt)]);
  rows.push(["Updated At", formatReportTimestamp(trial.updatedAt)]);

  (trial.areas || []).forEach((area, areaIndex) => {
    const areaName = area?.name || `Area ${areaIndex + 1}`;
    let lineCount = 0;
    if (area?.layout?.result) {
      area.layout.result.forEach((rep) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (cell) lineCount += 1;
          });
        });
      });
    }
    rows.push([`Area ${areaIndex + 1} Name`, areaName]);
    rows.push([`Area ${areaIndex + 1} Address`, area?.address || ""]);
    rows.push([`Area ${areaIndex + 1} Size (ha)`, area?.areaSize?.hectares ?? ""]);
    rows.push([`Area ${areaIndex + 1} Plot Count`, String(lineCount)]);
  });

  return rows;
}

function buildTrialObservationSheetRows(trial, area, areaIndex, trialParameters) {
  const rows = [[
    "Nomor",
    "Area",
    "Replication",
    "Line",
    "Sample",
    "Parameter",
    "Value",
    "Unit",
    "Timestamp",
  ]];

  if (!area?.layout?.result || !Array.isArray(trialParameters) || trialParameters.length === 0) {
    return rows;
  }

  const areaName = area.name || `Area ${areaIndex + 1}`;
  const formulaParams = trialParameters.filter((p) => (p.type || "").toLowerCase() === "formula");
  const nonFormulaParams = trialParameters.filter((p) => (p.type || "").toLowerCase() !== "formula");
  let rowNumber = 1;

  area.layout.result.forEach((rep, repIndex) => {
    rep.forEach((row) => {
      row.forEach((cell) => {
        if (!cell) return;

        nonFormulaParams.forEach((param) => {
          const sampleCount = Math.max(1, Number(param.numberOfSamples || 1));
          for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
            const observation = getObservationReportEntry(
              trial,
              areaIndex,
              param,
              cell.id,
              repIndex,
              sampleIndex,
            );

            rows.push([
              rowNumber++,
              areaName,
              repIndex + 1,
              cell.name || "",
              sampleIndex + 1,
              param.name || "",
              observation.value,
              param.unit || "",
              formatReportTimestamp(observation.timestamp),
            ]);
          }
        });

        if (formulaParams.length > 0) {
          const formulaContext = buildFormulaObservationContext(
            trial,
            areaIndex,
            cell.id,
            repIndex,
            nonFormulaParams,
          );

          formulaParams.forEach((formulaParam) => {
            const formulaResult = evaluateFormulaForReport(formulaParam.formula, formulaContext.values);
            const value = formulaResult.ok ? formulaResult.value : "";

            rows.push([
              rowNumber++,
              areaName,
              repIndex + 1,
              cell.name || "",
              1,
              formulaParam.name || "",
              value,
              formulaParam.unit || "",
              "",
            ]);
          });
        }
      });
    });
  });

  return rows;
}

function buildTrialAgronomySheetRows(trial, area, areaIndex) {
  const rows = [[
    "Area",
    "Activity",
    "DAP Min",
    "DAP Max",
    "Chemical",
    "Dose",
    "Remark",
    "Application Date",
    "Timestamp",
  ]];

  const items = getTrialAgronomyItems(trial);
  const areaName = area?.name || `Area ${areaIndex + 1}`;

  if (items.length === 0) return rows;

  items.forEach((item) => {
    const response = trial.agronomyResponses?.[areaIndex]?.[item.id] || {};

    rows.push([
      areaName,
      item.activity || item.name || "",
      item.dapMin ?? "",
      item.dapMax ?? "",
      item.chemical || "",
      item.dose || "",
      item.remark || "",
      formatReportTimestamp(response.applicationDate),
      formatReportTimestamp(response.timestamp),
    ]);
  });

  return rows;
}

function getObservationReportEntry(trial, areaIndex, param, lineId, repIndex, sampleIndex) {
  const areaResponses = trial.responses?.[areaIndex]?.[param.id] || {};
  const sampleKey = `${lineId}_${repIndex}_${sampleIndex}`;
  const legacyKey = `${lineId}_${repIndex}`;

  const valueEntry = areaResponses[sampleKey] || (sampleIndex === 0 ? areaResponses[legacyKey] : null) || {};
  const value = valueEntry?.value ?? "";

  let photoKey = sampleKey;
  const photoMode = param.photoMode || "per-sample";
  if (photoMode === "per-line") {
    photoKey = `${lineId}_${repIndex}`;
  }

  const photoEntry = areaResponses[photoKey] || {};
  const photoList = Array.isArray(photoEntry.photos) ? photoEntry.photos : [];
  const timestamp = valueEntry.timestamp || photoEntry.timestamp || "";

  return {
    value,
    hasPhoto: photoList.length > 0,
    photoCount: photoList.length,
    timestamp,
  };
}

function formatReportTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function buildFormulaObservationContext(trial, areaIndex, lineId, repIndex, nonFormulaParams) {
  const values = {};

  nonFormulaParams.forEach((param) => {
    const numeric = getNumericObservationAggregate(trial, areaIndex, param, lineId, repIndex);
    if (numeric === null) return;

    const tokens = [];
    if (param.initial) tokens.push(String(param.initial).trim());
    if (param.name) tokens.push(String(param.name).trim().replace(/\s+/g, "_"));

    tokens.forEach((token) => {
      if (!token) return;
      values[token] = numeric;
    });
  });

  return { values };
}

function getNumericObservationAggregate(trial, areaIndex, param, lineId, repIndex) {
  const sampleCount = Math.max(1, Number(param.numberOfSamples || 1));
  const nums = [];

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const entry = getObservationReportEntry(trial, areaIndex, param, lineId, repIndex, sampleIndex);
    const parsed = parseReportNumber(entry.value);
    if (parsed !== null) nums.push(parsed);
  }

  if (nums.length === 0) return null;
  const sum = nums.reduce((acc, val) => acc + val, 0);
  return Number((sum / nums.length).toFixed(6));
}

function parseReportNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/,/g, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function evaluateFormulaForReport(formula, contextValues) {
  const source = String(formula || "").trim();
  if (!source) return { ok: false, value: "", references: [] };

  const compact = source.replace(/\s+/g, "");
  const tokens = compact.match(/([A-Za-z_][A-Za-z0-9_]*|\d*\.?\d+|[()+\-*/])/g);
  if (!tokens || tokens.join("") !== compact) {
    return { ok: false, value: "", references: [] };
  }

  const references = [];
  let expression = "";

  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      references.push(token);
      const value = contextValues[token];
      if (value === undefined || value === null || !Number.isFinite(Number(value))) {
        return { ok: false, value: "", references };
      }
      expression += `(${Number(value)})`;
    } else {
      expression += token;
    }
  }

  if (!/^[0-9()+\-*/.\s]+$/.test(expression)) {
    return { ok: false, value: "", references };
  }

  try {
    const result = Function(`"use strict"; return (${expression});`)();
    if (!Number.isFinite(result)) {
      return { ok: false, value: "", references };
    }
    return { ok: true, value: Number(result.toFixed(6)), references };
  } catch (_) {
    return { ok: false, value: "", references };
  }
}

function getTrialPlantingYear(trial) {
  const source = String(
    getTrialPrimaryPlantingDate(trial) || trial?.plantingStart || trial?.plantingEnd || "",
  ).trim();
  const match = source.match(/^(\d{4})/);
  return match ? match[1] : "";
}

const databaseViewState = {
  initialized: false,
  menusBound: false,
  filtersLoaded: false,
  filters: {},
  sort: null,
  freezeUntilColKey: null,
  visibleColumnKeys: null,
  columns: {
    fixed: [],
    extra: [],
    params: [],
    all: [],
  },
  rows: [],
};

function getDatabaseFilterStorageKey() {
  const email = getCurrentUser?.()?.email || "anonymous";
  return `advanta_database_filters_${email}`;
}

function loadDatabaseFiltersFromStorage() {
  if (databaseViewState.filtersLoaded) return;
  databaseViewState.filtersLoaded = true;

  try {
    const raw = localStorage.getItem(getDatabaseFilterStorageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    if (parsed.filters && typeof parsed.filters === "object") {
      databaseViewState.filters = parsed.filters;
    }
    if (parsed.sort && typeof parsed.sort === "object") {
      databaseViewState.sort = parsed.sort;
    }
    databaseViewState.freezeUntilColKey = parsed.freezeUntilColKey
      ? String(parsed.freezeUntilColKey)
      : null;
  } catch (error) {
    console.warn("Failed to load database filters:", error);
  }
}

function saveDatabaseFiltersToStorage() {
  try {
    localStorage.setItem(
      getDatabaseFilterStorageKey(),
      JSON.stringify({
        filters: databaseViewState.filters,
        sort: databaseViewState.sort,
        freezeUntilColKey: databaseViewState.freezeUntilColKey,
      }),
    );
  } catch (error) {
    console.warn("Failed to save database filters:", error);
  }
}

function ensureDatabaseControls() {
  loadDatabaseFiltersFromStorage();
  if (databaseViewState.initialized) return;

  databaseViewState.initialized = true;
}

function normalizeDatabaseFilterValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "__BLANK__";
  return text;
}

function getDatabaseFilterLabel(filterValue) {
  return filterValue === "__BLANK__" ? "(blank)" : filterValue;
}

function getDatabaseAllColumns() {
  if (Array.isArray(databaseViewState.columns.all) && databaseViewState.columns.all.length > 0) {
    return databaseViewState.columns.all;
  }

  return [
    ...(databaseViewState.columns.fixed || []).map((column) => ({
      key: column.key,
      label: column.label,
    })),
    ...(databaseViewState.columns.params || []).map((param) => ({
      key: `param_${param.id}`,
      label: param.name || "Parameter",
    })),
  ];
}

function getDatabaseDefaultVisibleColumnKeys(allColumns = null) {
  const columns = Array.isArray(allColumns) && allColumns.length > 0
    ? allColumns
    : getDatabaseAllColumns();
  return columns
    .filter((column) => column.defaultVisible)
    .map((column) => column.key);
}

function getDatabaseVisibleColumns(allColumns = null) {
  const columns = Array.isArray(allColumns) && allColumns.length > 0
    ? allColumns
    : getDatabaseAllColumns();

  if (!Array.isArray(databaseViewState.visibleColumnKeys) || databaseViewState.visibleColumnKeys.length === 0) {
    const defaults = new Set(getDatabaseDefaultVisibleColumnKeys(columns));
    const preferred = columns.filter((column) => defaults.has(column.key));
    return preferred.length > 0 ? preferred : columns;
  }

  const allowed = new Set(databaseViewState.visibleColumnKeys);
  const visible = columns.filter((column) => allowed.has(column.key));
  return visible.length > 0 ? visible : columns;
}

function setDatabaseVisibleColumns(columnKeys, options = {}) {
  const allColumns = getDatabaseAllColumns();
  const hasColumns = Array.isArray(allColumns) && allColumns.length > 0;
  const allKeys = new Set(allColumns.map((column) => column.key));
  const normalized = Array.isArray(columnKeys)
    ? Array.from(
      new Set(
        columnKeys
          .map((key) => String(key))
          .filter((key) => (hasColumns ? allKeys.has(key) : !!key)),
      ),
    )
    : [];

  databaseViewState.visibleColumnKeys = normalized.length > 0
    ? normalized
    : null;

  if (!options.skipRender) {
    const databaseContent = document.getElementById("databaseContent");
    if (databaseContent?.classList.contains("active")) {
      renderDatabaseTable();
    }
  }
}

function getDatabaseColumnOptionsForSettings() {
  const dataset = buildDatabaseDataset();
  const allColumns = [
    ...dataset.fixedColumns.map((column) => ({ key: column.key, label: column.label })),
    ...dataset.parameterColumns.map((param) => ({ key: `param_${param.id}`, label: param.name || "Parameter" })),
  ];

  databaseViewState.columns.fixed = dataset.fixedColumns;
  databaseViewState.columns.params = dataset.parameterColumns;
  databaseViewState.columns.all = allColumns;

  const visible = new Set(getDatabaseVisibleColumns(allColumns).map((column) => column.key));
  return allColumns.map((column) => ({
    key: column.key,
    label: column.label,
    visible: visible.has(column.key),
  }));
}

function getDatabaseColumnFilterSetting(colKey) {
  if (!databaseViewState.filters[colKey]) {
    databaseViewState.filters[colKey] = {
      mode: "default",
      selectedValues: [],
    };
  }
  return databaseViewState.filters[colKey];
}

function getDatabaseUniqueColumnValues(rows, colKey) {
  const unique = new Set();
  (rows || []).forEach((row) => {
    unique.add(normalizeDatabaseFilterValue(row?.[colKey]));
  });
  return Array.from(unique).sort((a, b) =>
    getDatabaseFilterLabel(a).localeCompare(getDatabaseFilterLabel(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function applyDatabaseFilters(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const hasCustomFilter = Object.values(databaseViewState.filters || {}).some(
    (setting) => setting?.mode === "custom",
  );
  if (!hasCustomFilter) return rows;

  return rows.filter((row) =>
    Object.entries(databaseViewState.filters || {}).every(([colKey, setting]) => {
      if (!setting || setting.mode !== "custom") return true;
      const selected = Array.isArray(setting.selectedValues)
        ? setting.selectedValues
        : [];
      if (selected.length === 0) return false;
      const value = normalizeDatabaseFilterValue(row?.[colKey]);
      return selected.includes(value);
    }),
  );
}

function applyDatabaseSort(rows) {
  const sortSetting = databaseViewState.sort;
  if (!sortSetting || sortSetting.mode === "default") return rows;

  const colKey = String(sortSetting.colKey || "");
  const direction = sortSetting.mode === "desc" ? -1 : 1;
  const sorted = [...rows];

  sorted.sort((left, right) => {
    const a = String(left?.[colKey] ?? "");
    const b = String(right?.[colKey] ?? "");
    const cmp = a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return cmp * direction;
  });

  return sorted;
}

function closeDatabaseColumnMenus() {
  document
    .querySelectorAll(".trial-report-column-menu-container.database-column-menu")
    .forEach((el) => el.remove());
}

function bindDatabaseMenuGlobalClose() {
  if (databaseViewState.menusBound) return;
  document.addEventListener("click", (event) => {
    const insideMenu = event.target.closest(".trial-report-column-menu-container.database-column-menu");
    const insideHeaderButton = event.target.closest(".trial-report-th-btn.database-th-btn");
    if (!insideMenu && !insideHeaderButton) {
      closeDatabaseColumnMenus();
    }
  });
  databaseViewState.menusBound = true;
}

function getDatabaseColumnMode(colKey) {
  if (
    databaseViewState.sort &&
    String(databaseViewState.sort.colKey || "") === String(colKey)
  ) {
    return databaseViewState.sort.mode;
  }
  return databaseViewState.filters?.[colKey]?.mode || "default";
}

function openDatabaseColumnMenuByKeyEncoded(encodedColKey, forceCustom) {
  const colKey = decodeURIComponent(String(encodedColKey || ""));
  const headerButton = Array.from(
    document.querySelectorAll(".trial-report-th-btn.database-th-btn"),
  ).find((button) => button.dataset.colKey === colKey);
  if (!headerButton) return;
  const fakeEvent = { currentTarget: headerButton, stopPropagation: () => {} };
  openDatabaseColumnMenu(fakeEvent, colKey, !!forceCustom);
}

function setDatabaseColumnSortEncoded(encodedColKey, mode) {
  const colKey = decodeURIComponent(String(encodedColKey || ""));
  if (mode === "default") {
    databaseViewState.sort = null;
  } else {
    databaseViewState.sort = { colKey, mode };
  }
  saveDatabaseFiltersToStorage();
  closeDatabaseColumnMenus();
  renderDatabaseTable();
}

function setDatabaseFreezeUntilEncoded(encodedColKey) {
  const colKey = decodeURIComponent(String(encodedColKey || ""));
  databaseViewState.freezeUntilColKey = colKey;
  saveDatabaseFiltersToStorage();
  closeDatabaseColumnMenus();
  renderDatabaseTable();
}

function clearDatabaseFreeze() {
  databaseViewState.freezeUntilColKey = null;
  saveDatabaseFiltersToStorage();
  closeDatabaseColumnMenus();
  renderDatabaseTable();
}

function resetDatabaseColumnSettingEncoded(encodedColKey) {
  const colKey = decodeURIComponent(String(encodedColKey || ""));
  const setting = getDatabaseColumnFilterSetting(colKey);
  setting.mode = "default";
  setting.selectedValues = [];

  if (
    databaseViewState.sort &&
    String(databaseViewState.sort.colKey || "") === String(colKey)
  ) {
    databaseViewState.sort = null;
  }
  if (String(databaseViewState.freezeUntilColKey || "") === String(colKey)) {
    databaseViewState.freezeUntilColKey = null;
  }

  saveDatabaseFiltersToStorage();
  closeDatabaseColumnMenus();
  renderDatabaseTable();
}

function setDatabaseColumnCustomModeEncoded(encodedColKey) {
  const colKey = decodeURIComponent(String(encodedColKey || ""));
  const setting = getDatabaseColumnFilterSetting(colKey);
  const allValues = getDatabaseUniqueColumnValues(databaseViewState.rows || [], colKey);
  setting.mode = "custom";
  if (!Array.isArray(setting.selectedValues) || setting.selectedValues.length === 0) {
    setting.selectedValues = [...allValues];
  }
  saveDatabaseFiltersToStorage();
  renderDatabaseTable();
  openDatabaseColumnMenuByKeyEncoded(encodedColKey, true);
}

function clearAllDatabaseCustomValuesEncoded(encodedColKey) {
  const colKey = decodeURIComponent(String(encodedColKey || ""));
  const setting = getDatabaseColumnFilterSetting(colKey);
  setting.mode = "custom";
  setting.selectedValues = [];
  saveDatabaseFiltersToStorage();
  renderDatabaseTable();
  openDatabaseColumnMenuByKeyEncoded(encodedColKey, true);
}

function toggleDatabaseCustomValueEncoded(encodedColKey, encodedValue, checked) {
  const colKey = decodeURIComponent(String(encodedColKey || ""));
  const value = decodeURIComponent(String(encodedValue || ""));

  const setting = getDatabaseColumnFilterSetting(colKey);
  setting.mode = "custom";
  const selectedSet = new Set(
    Array.isArray(setting.selectedValues) ? setting.selectedValues : [],
  );
  if (checked) selectedSet.add(value);
  else selectedSet.delete(value);
  setting.selectedValues = Array.from(selectedSet);

  saveDatabaseFiltersToStorage();
  renderDatabaseTable();
  openDatabaseColumnMenuByKeyEncoded(encodedColKey, true);
}

function openDatabaseColumnMenuEncoded(event, encodedColKey, openCustomSubmenu = false) {
  const colKey = decodeURIComponent(String(encodedColKey || ""));
  openDatabaseColumnMenu(event, colKey, openCustomSubmenu);
}

function openDatabaseColumnMenu(event, colKey, openCustomSubmenu = false) {
  event.stopPropagation();
  bindDatabaseMenuGlobalClose();

  const target = event.currentTarget;
  if (!target) return;

  closeDatabaseColumnMenus();

  const setting = getDatabaseColumnFilterSetting(colKey);
  const currentSort =
    databaseViewState.sort && String(databaseViewState.sort.colKey || "") === String(colKey)
      ? databaseViewState.sort.mode
      : "default";
  const isFrozenToThis =
    String(databaseViewState.freezeUntilColKey || "") === String(colKey);
  const encodedColKey = encodeURIComponent(String(colKey));

  const menu = document.createElement("div");
  menu.className = "trial-report-column-menu-container database-column-menu";
  menu.innerHTML = `
    <div class="trial-report-column-menu" onclick="event.stopPropagation()">
      <button type="button" class="trial-report-menu-item ${currentSort === "asc" ? "active" : ""}" onclick="setDatabaseColumnSortEncoded('${encodedColKey}', 'asc')">Ascending</button>
      <button type="button" class="trial-report-menu-item ${currentSort === "desc" ? "active" : ""}" onclick="setDatabaseColumnSortEncoded('${encodedColKey}', 'desc')">Descending</button>
      <button type="button" class="trial-report-menu-item ${isFrozenToThis ? "active" : ""}" onclick="setDatabaseFreezeUntilEncoded('${encodedColKey}')">Freeze up to this</button>
      <button type="button" class="trial-report-menu-item" onclick="clearDatabaseFreeze()">Unfreeze</button>
      <button type="button" class="trial-report-menu-item ${setting.mode === "custom" ? "active" : ""}" onclick="setDatabaseColumnCustomModeEncoded('${encodedColKey}')">Custom</button>
      <button type="button" class="trial-report-menu-item" onclick="resetDatabaseColumnSettingEncoded('${encodedColKey}')">Default</button>
      <div class="trial-report-custom-submenu ${openCustomSubmenu || setting.mode === "custom" ? "active" : ""}">
        <div class="trial-report-custom-actions">
          <button type="button" class="trial-report-menu-item subtle" onclick="clearAllDatabaseCustomValuesEncoded('${encodedColKey}')">Clear all</button>
        </div>
        <div class="trial-report-custom-list">
          ${getDatabaseUniqueColumnValues(databaseViewState.rows || [], colKey)
            .map((value) => {
              const selected =
                Array.isArray(setting.selectedValues) && setting.selectedValues.includes(value);
              const encodedValue = encodeURIComponent(value);
              return `
                <label class="trial-report-custom-item">
                  <input type="checkbox" ${selected ? "checked" : ""} onchange="toggleDatabaseCustomValueEncoded('${encodedColKey}', '${encodedValue}', this.checked)">
                  <span>${escapeHtml(getDatabaseFilterLabel(value))}</span>
                </label>
              `;
            })
            .join("")}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(menu);

  const rect = target.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
}

function applyDatabaseFreezeColumns(tableEl, visibleColumns) {
  if (!tableEl) return;

  tableEl.querySelectorAll("th, td").forEach((cell) => {
    cell.style.position = "";
    cell.style.left = "";
    cell.style.zIndex = "";
  });

  const freezeKey = databaseViewState.freezeUntilColKey;
  if (!freezeKey) return;

  const freezeIndex = visibleColumns.findIndex(
    (column) => String(column.key) === String(freezeKey),
  );
  if (freezeIndex < 0) return;

  const headCells = Array.from(tableEl.querySelectorAll("thead th"));
  let left = 0;

  for (let colIndex = 0; colIndex <= freezeIndex; colIndex++) {
    const headCell = headCells[colIndex];
    if (!headCell) continue;

    const width =
      headCell.offsetWidth || headCell.getBoundingClientRect().width || 0;

    headCell.style.position = "sticky";
    headCell.style.left = `${left}px`;
    headCell.style.zIndex = "7";

    tableEl.querySelectorAll("tbody tr").forEach((row) => {
      const bodyCell = row.children[colIndex];
      if (!bodyCell) return;
      bodyCell.style.position = "sticky";
      bodyCell.style.left = `${left}px`;
      bodyCell.style.zIndex = "4";
    });

    left += width;
  }
}

function buildDatabaseDataset() {
  const trials = (trialState.trials || []).filter(
    (trial) =>
      trial &&
      trial.areas &&
      trial.areas.length > 0 &&
      trial.areas.some((area) => area.layout?.result),
  );

  const allParameters = inventoryState.items.parameters || [];
  const lines = inventoryState.items.lines || [];
  const locations = inventoryState.items.locations || [];

  const linesById = new Map(lines.map((line) => [String(line.id), line]));
  const locationsById = new Map(
    locations.map((location) => [String(location.id), location]),
  );

  const parameterIdsUsed = new Set();
  trials.forEach((trial) => {
    (trial.parameters || []).forEach((paramId) =>
      parameterIdsUsed.add(String(paramId)),
    );
  });

  const parameterColumns = allParameters.filter((param) =>
    parameterIdsUsed.has(String(param.id)),
  );

  const headerColumns = [
    { key: "no", label: "No", source: "fixed", defaultVisible: true },
    { key: "season", label: "Season", source: "fixed", defaultVisible: true },
    { key: "location", label: "Location", source: "fixed", defaultVisible: true },
    { key: "year", label: "Year", source: "fixed", defaultVisible: true },
    { key: "parentCode", label: "Parent Code", source: "fixed", defaultVisible: true },
    { key: "sprCode", label: "SPR Code", source: "fixed", defaultVisible: true },
    { key: "hybridCode", label: "Hybrid Code", source: "fixed", defaultVisible: true },
    { key: "replication", label: "Replication", source: "fixed", defaultVisible: true },
  ];

  const extraColumns = [
    { key: "trialName", label: "Trial", source: "extra", defaultVisible: false },
    { key: "crop", label: "Crop", source: "extra", defaultVisible: false },
    { key: "pollination", label: "Pollination", source: "extra", defaultVisible: false },
    { key: "trialType", label: "Trial Type", source: "extra", defaultVisible: false },
    { key: "expDesign", label: "Exp Design", source: "extra", defaultVisible: false },
    { key: "plantingDate", label: "Planting Date", source: "extra", defaultVisible: false },
    { key: "line", label: "Line", source: "extra", defaultVisible: false },
    { key: "lineRole", label: "Line Role", source: "extra", defaultVisible: false },
    { key: "lineStage", label: "Line Stage", source: "extra", defaultVisible: false },
    { key: "lineQty", label: "Line Qty", source: "extra", defaultVisible: false },
    { key: "area", label: "Area", source: "extra", defaultVisible: false },
    { key: "range", label: "Range", source: "extra", defaultVisible: false },
    { key: "row", label: "Row", source: "extra", defaultVisible: false },
    { key: "sample", label: "Sample", source: "extra", defaultVisible: false },
  ];

  const rows = [];
  let rowNo = 1;

  trials.forEach((trial) => {
    const cropName =
      inventoryState.items.crops?.find((crop) => String(crop.id) === String(trial.cropId || ""))
        ?.name ||
      trial.cropName ||
      "";
    const season = trial.plantingSeason || "";
    const locationName =
      locationsById.get(String(trial.locationId || ""))?.name || "";
    const year = getTrialPlantingYear(trial);

    const trialParams = (trial.parameters || [])
      .map((paramId) =>
        allParameters.find((param) => String(param.id) === String(paramId)),
      )
      .filter(Boolean);

    const nonFormulaParams = trialParams.filter(
      (param) => (param.type || "").toLowerCase() !== "formula",
    );
    const formulaParams = trialParams.filter(
      (param) => (param.type || "").toLowerCase() === "formula",
    );

    (trial.areas || []).forEach((area, areaIndex) => {
      const result = area?.layout?.result;
      if (!result) return;

      result.forEach((rep, repIndex) => {
        rep.forEach((layoutRow) => {
          layoutRow.forEach((cell) => {
            if (!cell) return;

            const lineRef =
              linesById.get(String(cell.id || "")) ||
              lines.find(
                (line) => String(line.name || "") === String(cell.name || ""),
              );

            const maxSampleCount = Math.max(
              1,
              ...nonFormulaParams.map((param) =>
                Math.max(1, Number(param.numberOfSamples || 1)),
              ),
            );

            for (
              let sampleIndex = 0;
              sampleIndex < maxSampleCount;
              sampleIndex++
            ) {
              const row = {
                no: rowNo++,
                season,
                location: locationName,
                year,
                trialName: trial.name || "",
                crop: cropName,
                pollination: trial.pollination || "",
                trialType: trial.trialType || "",
                expDesign: trial.expDesign || "",
                plantingDate: getAreaPlantingDate(trial, areaIndex) || "",
                line: lineRef?.name || cell.name || "",
                lineRole: lineRef?.role || "",
                lineStage: lineRef?.stage || "",
                lineQty: lineRef?.quantity ?? "",
                area: area?.name || `Area ${areaIndex + 1}`,
                range: layoutRow?.rangeIndex != null ? layoutRow.rangeIndex + 1 : "",
                row: layoutRow?.rowIndex != null ? layoutRow.rowIndex + 1 : "",
                sample: sampleIndex + 1,
                parentCode: lineRef?.parentCode || "",
                sprCode: lineRef?.sprCode || "",
                hybridCode: lineRef?.hybridCode || "",
                replication: repIndex + 1,
              };

              parameterColumns.forEach((param) => {
                row[`param_${param.id}`] = "";
              });

              nonFormulaParams.forEach((param) => {
                const sampleCount = Math.max(1, Number(param.numberOfSamples || 1));
                if (sampleIndex >= sampleCount) return;
                const entry = getObservationReportEntry(
                  trial,
                  areaIndex,
                  param,
                  cell.id,
                  repIndex,
                  sampleIndex,
                );
                row[`param_${param.id}`] = entry.value;
              });

              if (sampleIndex === 0 && formulaParams.length > 0) {
                const formulaContext = buildFormulaObservationContext(
                  trial,
                  areaIndex,
                  cell.id,
                  repIndex,
                  nonFormulaParams,
                );

                formulaParams.forEach((formulaParam) => {
                  const resultValue = evaluateFormulaForReport(
                    formulaParam.formula,
                    formulaContext.values,
                  );
                  row[`param_${formulaParam.id}`] = resultValue.ok
                    ? resultValue.value
                    : "";
                });
              }

              rows.push(row);
            }
          });
        });
      });
    });
  });

  return {
    fixedColumns: headerColumns,
    extraColumns,
    parameterColumns,
    rows,
  };
}

function renderDatabaseTable() {
  ensureDatabaseControls();

  const tableEl = document.getElementById("databaseTable");
  if (!tableEl) return;

  const rowCountEl = document.getElementById("databaseRowCount");

  closeDatabaseColumnMenus();

  const dataset = buildDatabaseDataset();

  databaseViewState.columns.fixed = dataset.fixedColumns;
  databaseViewState.columns.extra = dataset.extraColumns || [];
  databaseViewState.columns.params = dataset.parameterColumns;
  databaseViewState.columns.all = [
    ...dataset.fixedColumns.map((column) => ({
      key: column.key,
      label: column.label,
      source: column.source || "fixed",
      defaultVisible: !!column.defaultVisible,
    })),
    ...(dataset.extraColumns || []).map((column) => ({
      key: column.key,
      label: column.label,
      source: column.source || "extra",
      defaultVisible: !!column.defaultVisible,
    })),
    ...dataset.parameterColumns.map((param) => ({
      key: `param_${param.id}`,
      label: param.name || "Parameter",
      source: "param",
      defaultVisible: true,
    })),
  ];
  databaseViewState.rows = dataset.rows;

  const allColumns = getDatabaseAllColumns();
  const visibleColumns = getDatabaseVisibleColumns(allColumns);
  const rows = applyDatabaseSort(applyDatabaseFilters(dataset.rows));

  if (rows.length === 0) {
    tableEl.innerHTML = `
      <thead>
        <tr>
          ${visibleColumns
            .map(
              (column, colIndex) => `
                <th>
                  <button type="button" class="trial-report-th-btn database-th-btn ${column.source === "param" ? "database-param-th" : ""}" data-col-key="${escapeHtml(column.key)}" data-col-index="${colIndex}" onclick="openDatabaseColumnMenuEncoded(event, '${encodeURIComponent(column.key)}')">
                    <span class="trial-report-th-text">${escapeHtml(column.label)}</span>
                    <span class="material-symbols-rounded trial-report-th-marker ${getDatabaseColumnMode(column.key) !== "default" ? "active" : ""}">filter_alt</span>
                  </button>
                </th>
              `,
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="${visibleColumns.length}" class="trial-report-empty">No rows</td></tr>
      </tbody>
    `;
    if (rowCountEl) rowCountEl.textContent = "0 rows";
    return;
  }

  const headerHtml = `
    <thead>
      <tr>
        ${visibleColumns
          .map(
            (column, colIndex) => `
              <th>
                <button type="button" class="trial-report-th-btn database-th-btn ${column.source === "param" ? "database-param-th" : ""}" data-col-key="${escapeHtml(column.key)}" data-col-index="${colIndex}" onclick="openDatabaseColumnMenuEncoded(event, '${encodeURIComponent(column.key)}')">
                  <span class="trial-report-th-text">${escapeHtml(column.label)}</span>
                  <span class="material-symbols-rounded trial-report-th-marker ${getDatabaseColumnMode(column.key) !== "default" ? "active" : ""}">filter_alt</span>
                </button>
              </th>
            `,
          )
          .join("")}
      </tr>
    </thead>
  `;

  const bodyHtml = `
    <tbody>
      ${rows
        .map((row) => {
          const cells = visibleColumns
            .map((column) => `<td class="${column.source === "param" ? "database-param-td" : ""}">${escapeHtml(String(row[column.key] ?? ""))}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("")}
    </tbody>
  `;

  tableEl.innerHTML = `${headerHtml}${bodyHtml}`;
  applyDatabaseFreezeColumns(tableEl, visibleColumns);
  if (rowCountEl) rowCountEl.textContent = `${rows.length.toLocaleString()} rows`;
}

function downloadDatabaseExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  const allColumns = getDatabaseVisibleColumns(getDatabaseAllColumns());
  const filteredRows = applyDatabaseSort(
    applyDatabaseFilters(databaseViewState.rows || []),
  );

  if (filteredRows.length === 0) {
    showToast("No database rows to export", "error");
    return;
  }

  const header = [
    ...allColumns.map((column) => column.label),
  ];

  const aoa = [
    header,
    ...filteredRows.map((row) => [
      ...allColumns.map((column) => row[column.key] ?? ""),
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  const maxScanRows = Math.min(aoa.length, 300);
  const widths = header.map((_, colIndex) => {
    let maxLen = 8;
    for (let rowIndex = 0; rowIndex < maxScanRows; rowIndex++) {
      const value = String(aoa[rowIndex]?.[colIndex] ?? "");
      if (value.length > maxLen) maxLen = value.length;
    }
    return { wch: Math.min(maxLen + 2, 45) };
  });
  worksheet["!cols"] = widths;

  XLSX.utils.book_append_sheet(workbook, worksheet, "Database");
  XLSX.writeFile(workbook, "Database_Report.xlsx");
  showToast(`Exported ${filteredRows.length.toLocaleString()} rows`, "success");
}

window.getDatabaseColumnOptionsForSettings = getDatabaseColumnOptionsForSettings;
window.getDatabaseVisibleColumnKeys = function getDatabaseVisibleColumnKeys() {
  return (getDatabaseVisibleColumns(getDatabaseAllColumns()) || []).map((column) => column.key);
};
window.setDatabaseVisibleColumns = setDatabaseVisibleColumns;

function buildTrialDetailLayoutResultHtml(area) {
  const layouts = Array.isArray(area?.layout?.result) ? area.layout.result : [];

  if (layouts.length === 0) {
    return `
      <div class='td-area-lines'>
        <div class='td-icon'>
          <span class="material-symbols-rounded">table_view</span>
        </div>
        <div class='td-content'>
          <div class='td-label'>Layouting Result:</div>
          <div class='td-value'>-</div>
        </div>
      </div>
    `;
  }

  return `
    <div class='td-area-lines'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">table_view</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Layouting Result:</div>
        ${layouts
          .map((grid, repIndex) => {
            const rows = Array.isArray(grid) ? grid : [];
            return `
              <div class="layouting-table-wrap">
                <div class="layouting-table-title">Replication ${repIndex + 1}</div>
                <table class="layouting-table">
                  <tbody>
                    ${rows
                      .map((row, rowIdx) => {
                        const cells = Array.isArray(row) ? row : [];
                        return `
                          <tr>
                            <td class="layouting-row-header">Range ${rowIdx + 1}</td>
                            ${cells
                              .map((cell) => `
                                <td class="layouting-td">${cell ? escapeHtml(cell.name) : "-"}</td>
                              `)
                              .join("")}
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

// Show trial detail modal
function showTrialDetail(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  const modal = document.getElementById('trialDetailModal');
  if (!modal) return;

  // Store current trial for editing/deleting
  window.currentDetailTrialId = trialId;

  const archiveBtn = document.getElementById('trialDetailArchiveBtn');
  const editBtn = document.getElementById('trialDetailEditBtn');

  if (archiveBtn) {
    if (trial.archived) {
      archiveBtn.innerHTML = '<span class="material-symbols-rounded">unarchive</span><span>Unarchive</span>';
      archiveBtn.onclick = unarchiveTrialFromDetail;
    } else {
      archiveBtn.innerHTML = '<span class="material-symbols-rounded">archive</span><span>Archive</span>';
      archiveBtn.onclick = archiveTrialFromDetail;
    }
    archiveBtn.style.display = '';
  }
  if (editBtn) {
    editBtn.style.display = trial.archived ? 'none' : '';
  }

  // Set header info
  document.getElementById('trialDetailTitle').textContent = trial.name;

  // Build comprehensive body content
  const body = document.getElementById('trialDetailBody');
  if (!body) return;

  // Resolve parameters
  const paramDetails = (trial.parameters || []).map(paramId => {
    return inventoryState.items.parameters.find(p => p.id === paramId);
  }).filter(Boolean);

  // Resolve location
  const location = inventoryState.items.locations?.find(l => l.id === trial.locationId);

  // Progress (combined observation + agronomy)
  const progress = calculateCombinedTrialProgress(trial);
  const progressColor = progress.percentage === 100 ? 'var(--success)' 
                      : progress.percentage > 50 ? 'var(--primary)' 
                      : progress.percentage > 0 ? 'var(--warning)' 
                      : 'var(--text-tertiary)';

  // Areas summary
  const areaCount = trial.areas ? trial.areas.length : 0;
  const factorCount = normalizeTrialFactorsCount(trial.trialFactors);
  const factorDefinitions = normalizeTrialFactorDefinitions(trial);
  const totalLines = trial.areas?.reduce((sum, area) => {
    if (area.layout?.result) {
      let count = 0;
      area.layout.result.forEach(rep => rep.forEach(row => row.forEach(cell => { if (cell) count++; })));
      return sum + count;
    }
    return sum + (area.layout?.lines?.length || 0);
  }, 0) || 0;

  // Calculate total samples (lines × parameters × numberOfSamples)
  const totalSamples = trial.areas?.reduce((sum, area) => {
    if (area.layout?.result) {
      let count = 0;
      // Count cells (lines)
      area.layout.result.forEach(rep => rep.forEach(row => row.forEach(cell => { if (cell) count++; })));
      // Multiply by number of parameters and their samples
      const paramSampleCount = (trial.parameters || []).reduce((paramSum, paramId) => {
        const param = inventoryState.items.parameters.find((p) => p.id === paramId);
        const numberOfSamples = param?.numberOfSamples || 1;
        return paramSum + numberOfSamples;
      }, 0);
      return sum + (count * paramSampleCount);
    }
    return sum;
  }, 0) || 0;

  // Detailed progress text
  const obsText = `${progress.obs.completed}/${progress.obs.total} observations`;
  const agroText = progress.agro.total > 0 ? ` · ${progress.agro.completed}/${progress.agro.total} agronomy` : '';

  body.innerHTML = `

  <div class='td-container grid-2 td-intro'>

    <div class='td-section td-progress'>
      <svg class="td-progress-circle" width="120" height="120" viewBox="0 0 64 64"> <circle cx="32" cy="32" r="28" class="progress-circle-bg"></circle> <circle cx="32" cy="32" r="28" class="progress-circle-fill" style="stroke-dasharray: ${progress.percentage * 1.75} 175; stroke: ${getProgressGradientColor(progress.percentage)}"></circle> <text x="32" y="37" class="progress-circle-text" text-anchor="middle">${progress.percentage}%</text> </svg>
    </div>

    <div class='td-section td-description'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-section-icon">description</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Description</div>
        <div class='td-value'>${escapeHtml(trial.description)}</div>
        <div class='td-text'>${obsText}${agroText} completed</div>
      </div>
    </div>

  </div>

  <div class='td-title'>
    <p>General</p>
  </div>

  <div class='td-container grid-4'>

    <div class='td-section td-crop'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">psychiatry</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Crop</div>
        <div class='td-value'>${escapeHtml(trial.cropName || "-")}</div>
      </div>
    </div>
  
    <div class='td-section td-pollination'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">spa</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Type of Pollination</div>
        <div class='td-value'>${escapeHtml(trial.pollination || "-")}</div>
      </div>
    </div>

    <div class='td-section td-type'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Trial Type</div>
        <div class='td-value'>${escapeHtml(trial.trialType || "-")}</div>
      </div>
    </div>

    <div class='td-section td-planting-window'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">calendar_month</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Planting Window</div>
        <div class='td-value'>${trial.plantingStart ? formatMonthYear(trial.plantingStart) : "-"} — ${trial.plantingEnd ? formatMonthYear(trial.plantingEnd) : "-"}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">wb_sunny</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Planting Season</div>
        <div class='td-value'>${escapeHtml(trial.plantingSeason || "-")}</div>
      </div>
    </div>

    <div class='td-section' style='grid-column: 2 / span 2;'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">dashboard_customize</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Experimental Design</div>
        <div class='td-value'>${escapeHtml(trial.expDesign ? ({CRD:'Completely Randomized Design (CRD)',RBD:'Randomized Block Design (RBD)',LSD:'Latin Square Design (LSD)'}[trial.expDesign] || trial.expDesign) : "-")}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">category</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>No. of Factors</div>
        <div class='td-value'>${factorCount}</div>
      </div>
    </div>

  </div>

  <div class='td-container'>
    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-section-icon">manufacturing</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Factors & Treatments</div>
        ${factorDefinitions.length > 0 ? `
          <div class='td-grid'>
            ${factorDefinitions.map((factor, index) => `
              <div class='td-item' style='display:block;'>
                <div style='font-weight:600; margin-bottom:0.25rem;'>Factor ${index + 1}: ${escapeHtml(factor.name || "-")}</div>
                <div class='td-param-name'>${factor.treatments.length > 0 ? escapeHtml(factor.treatments.join(", ")) : "-"}</div>
              </div>
            `).join("")}
          </div>
        ` : `<div class='td-value'>-</div>`}
      </div>
    </div>
  </div>

  <div class='td-container'>

    <div class='td-section td-param'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-section-icon">biotech</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Observation Parameters</div>
        ${paramDetails.length > 0 ? `
        <div class='td-grid grid-4'>
          ${paramDetails.map((param) => `
            <div class='td-item'>
              <span class="material-symbols-rounded td-param-icon">${getParamIcon(param.type)}</span>
              <span class="td-param-name">${escapeHtml(param.name)}</span>
            </div>
          `,).join("")}
        </div>
        ` : `No parameters assigned.`}
      </div>
    </div>

    ${trial.agronomyMonitoring ? (() => {
      const agronomyDetails = (trial.agronomyItems || []).map(itemId => {
        return inventoryState.items.agronomy?.find(a => a.id === itemId);
      }).filter(Boolean);
      return `
    <div class='td-section td-agronomy'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-section-icon">local_florist</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Agronomy Monitoring</div>
        ${agronomyDetails.length > 0 ? `
        <div class='td-grid grid-4'>
          ${agronomyDetails.map(item => {
            const dap = item.dapMin != null && item.dapMax != null && item.dapMax !== '' && item.dapMax !== item.dapMin
              ? item.dapMin + '-' + item.dapMax + ' DAP'
              : item.dapMin != null ? item.dapMin + ' DAP' : '';
            const meta = [dap, item.chemical, item.dose].filter(Boolean).join(' · ');
            return `
            <div class='td-item'>
              <span class="material-symbols-rounded td-param-icon">radio_button_checked</span>
              <span class="td-param-name">${escapeHtml(item.activity || item.name || '-')}</span>
            </div>`;
          }).join('')}
        </div>
        ` : `No agronomy items assigned.`}
      </div>
    </div>
`;
    })() : ''}

  </div>

  <div class='td-title'>
    <p>Plot Specifications</p>
  </div>

  ${trial.trialType === 'Micropilot' ? `
  <div class='td-container grid-2'>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">dashboard</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Panel</div>
        <div class='td-value'>${trial.mpPanel ?? '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">female</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Ratio Female : Male</div>
        <div class='td-value'>${trial.ratioFemale ?? '-'} : ${trial.ratioMale ?? '-'}</div>
      </div>
    </div>

  </div>

  <div class='td-container grid-3'>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">straighten</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plot Length</div>
        <div class='td-value'>${trial.mpPlotLength != null ? trial.mpPlotLength + ' m' : '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">space_dashboard</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plant Spacing</div>
        <div class='td-value'>${trial.mpSpacingWidth ?? '-'} × ${trial.mpSpacingHeight ?? '-'} cm</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plot Area</div>
        <div class='td-value'>${trial.mpPlotArea != null ? trial.mpPlotArea.toFixed(2) + ' m²' : '-'}</div>
      </div>
    </div>

  </div>

  <div class='td-container grid-4'>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">badge</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Name Female Lines</div>
        <div class='td-value'>${escapeHtml(trial.mpFemaleLineNames || '-')}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">view_agenda</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Total Female Rows</div>
        <div class='td-value'>${trial.mpTotalFemaleRows ?? '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Female Population/plot</div>
        <div class='td-value'>${trial.mpExpectedFemale != null ? Math.round(trial.mpExpectedFemale).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Female Population/ha</div>
        <div class='td-value'>${trial.mpPopFemale != null ? Math.round(trial.mpPopFemale).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

  </div>

  <div class='td-container grid-4'>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">badge</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Name Male Lines</div>
        <div class='td-value'>${escapeHtml(trial.mpMaleLineNames || '-')}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">view_agenda</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Total Male Rows</div>
        <div class='td-value'>${trial.mpTotalMaleRows ?? '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Male Population/plot</div>
        <div class='td-value'>${trial.mpExpectedMale != null ? Math.round(trial.mpExpectedMale).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Male Population/ha</div>
        <div class='td-value'>${trial.mpPopMale != null ? Math.round(trial.mpPopMale).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

  </div>
  ` : `
  <div class='td-container grid-3'>

    <div class='td-section td-no-rows'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">view_agenda</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>No. of Rows per Plot</div>
        <div class='td-value'>${trial.rowsPerPlot} rows</div>
      </div>
    </div>

    <div class='td-section td-plot-length'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">straighten</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plot Length</div>
        <div class='td-value'>${trial.plotLength} m</div>
      </div>
    </div>

    <div class='td-section td-expected-plant'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Exp. No. of Plants per Plot</div>
        <div class='td-value'>${trial.expectedPlantsPerPlot != null ? Math.round(trial.expectedPlantsPerPlot).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

    <div class='td-section td-spacing'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">space_dashboard</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plant Spacing</div>
        <div class='td-value'>${trial.plantSpacingWidth} × ${trial.plantSpacingHeight} cm</div>
      </div>
    </div>

    <div class='td-section td-plot-area'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plot Area</div>
        <div class='td-value'>${trial.plotArea != null ? trial.plotArea.toFixed(2) + ' m²' : '-'}</div>
      </div>
    </div>

    <div class='td-section td-population'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Population per Hectare</div>
        <div class='td-value'>${trial.populationPerHa != null ? Math.round(trial.populationPerHa).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

  </div>
  `}

  <div class='td-title'>
    <p>Trial Areas</p>
  </div>

  <div class='td-container'>

    ${trial.areas && trial.areas.length > 0 ? trial.areas.map((area, areaIdx) => {
      // Collect unique lines from layout result
      const uniqueLines = [];
      const seenIds = new Set();
      if (area.layout?.result) {
        area.layout.result.forEach(rep => {
          rep.forEach(row => {
            row.forEach(cell => {
              if (cell && !seenIds.has(cell.id)) {
                seenIds.add(cell.id);
                uniqueLines.push(cell);
              }
            });
          });
        });
      } else if (area.layout?.lines) {
        area.layout.lines.forEach(line => {
          if (!seenIds.has(line.id)) {
            seenIds.add(line.id);
            uniqueLines.push(line);
          }
        });
      }
      
      return `
    <div class='td-section td-area'>
      <div class='td-area-header td-grid grid-4'>
        <div class='td-area-map' id='detailAreaMap${areaIdx}'>
        </div>
        <div class='td-area-head-info'>
          <div class='td-area-title'>
            <p>${escapeHtml(area.name || `Area ${areaIdx + 1}`)}</p>
          </div>
          <div class='td-area-size'>
            <span class="material-symbols-rounded"> straighten </span>
            <p>${area.areaSize.hectares.toFixed(2)} ha</p>
          </div>
          <div class='td-area-address'>
            <span class="material-symbols-rounded"> location_on </span>
            <p>${escapeHtml(area.address)}</p>
          </div>
          <div class='td-area-ranges'>
            <span class="material-symbols-rounded">grid_3x3</span>
            <p>Ranges: ${area.layout.numRanges || 0}</p>
          </div>
          <div class='td-area-replication'>
            <span class="material-symbols-rounded">repeat</span>
            <p>Reps: ${area.layout.result?.length || 0}</p>
          </div>
          <div class='td-area-direction'>
            <span class="material-symbols-rounded">compare_arrows</span>
            <p>Direction: ${escapeHtml(area.layout.direction === "serpentine" ? "Serpentine" : "Straight")}</p>
          </div>
          <div class='td-area-randomization'>
            <span class="material-symbols-rounded">shuffle</span>
            <p>Randomization: ${escapeHtml(area.layout.randomization === "random" ? "Random" : "Normal")}</p>
          </div>
          <div class='td-area-planting-date'>
            <span class="material-symbols-rounded">event</span>
            <p>Planting Date: ${area?.plantingDate ? new Date(area.plantingDate + 'T00:00:00').toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '-'}</p>
          </div>
        </div>
      </div>
      ${uniqueLines.length > 0 ? `
      <div class='td-area-lines'>
        <div class='td-icon'>
          <span class="material-symbols-rounded">grass</span>
        </div>
        <div class='td-content'>
          <div class='td-label'>Lines used (${uniqueLines.length}):</div>
          <div class='td-lines-flex'>
            ${uniqueLines.map(line => `<div class='td-item'><span class="td-param-name">${escapeHtml(line.name)}</span></div>`).join('')}
          </div>
        </div>
      </div>
      ` : ''}
      ${buildTrialDetailLayoutResultHtml(area)}
    </div>
    `;}).join("") : ``}

  </div>

    <div class="td-timestamps">
      ${
        trial.createdAt
          ? `
      <div class="td-timestamp">
        <span class="material-symbols-rounded">schedule</span>
        Created: ${new Date(trial.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
      </div>`
          : ""
      }
      ${
        trial.updatedAt
          ? `
      <div class="td-timestamp">
        <span class="material-symbols-rounded">update</span>
        Updated: ${new Date(trial.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
      </div>`
          : ""
      }
    </div>
  `;

  // Show modal first, then initialize maps after a tick (so container is visible)
  modal.classList.add('active');

  // Initialize area maps after modal is fully laid out
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initializeTrialDetailAreaMaps(trial);
    });
  });
}

// Helper: Get icon name for parameter type
function getParamIcon(type) {
  const icons = {
    'number': 'pin',
    'text': 'text_fields',
    'radio': 'radio_button_checked',
    'checkbox': 'check_box',
    'range': 'linear_scale',
    'date': 'calendar_today',
    'photo': 'photo_camera',
  };
  return icons[type] || 'science';
}

// Close trial detail modal
function closeTrialDetailModal() {
  const modal = document.getElementById('trialDetailModal');
  if (modal) {
    modal.classList.remove('active');
    // Clean up all area preview maps
    if (window.trialDetailAreaMaps) {
      Object.values(window.trialDetailAreaMaps).forEach(map => {
        if (map) map.remove();
      });
      window.trialDetailAreaMaps = null;
    }
  }
}

async function downloadTrialDetailPdf() {
  const detailBody = document.getElementById('trialDetailBody');
  if (!detailBody) {
    showToast('Trial detail not found', 'error');
    return;
  }

  if (typeof html2canvas === 'undefined' || !window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF library not loaded. Please try again.', 'error');
    return;
  }

  const exportWidth = 1200;
  const trialTitle = (document.getElementById('trialDetailTitle')?.textContent || 'Trial Detail').trim();
  const safeName = trialTitle.replace(/[^a-z0-9_\- ]/gi, '').replace(/\s+/g, '_') || 'Trial_Detail';

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-20000px';
  wrapper.style.top = '0';
  wrapper.style.width = `${exportWidth}px`;
  wrapper.style.background = '#ffffff';
  wrapper.style.padding = '24px';
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.zIndex = '-1';

  const header = document.createElement('div');
  header.className = 'library-detail-header';
  header.style.marginBottom = '16px';
  header.innerHTML = `
    <div class="library-detail-info">
      <h3 style="margin:0;">${escapeHtml(trialTitle)}</h3>
    </div>
  `;

  const clone = detailBody.cloneNode(true);
  clone.style.width = '100%';
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';

  const defaultTrialAreasTitle = Array.from(clone.querySelectorAll('.td-title')).find((titleEl) => {
    const text = titleEl.querySelector('p')?.textContent || '';
    return String(text).trim().toLowerCase() === 'trial areas';
  });
  let exportTrialAreasTitle = null;
  if (defaultTrialAreasTitle) {
    exportTrialAreasTitle = document.createElement('div');
    exportTrialAreasTitle.className = 'library-detail-header';
    exportTrialAreasTitle.style.marginBottom = '16px';
    exportTrialAreasTitle.innerHTML = `
      <div class="library-detail-info">
        <h3 style="margin:0;">Trial Areas</h3>
      </div>
    `;
    defaultTrialAreasTitle.replaceWith(exportTrialAreasTitle);
  }

  clone.querySelectorAll('.td-progress svg').forEach((svgEl) => {
    svgEl.style.transform = 'none';
    svgEl.querySelectorAll('.progress-circle-fill').forEach((circle) => {
      circle.setAttribute('transform', 'rotate(-90 32 32)');
    });
    svgEl.querySelectorAll('.progress-circle-text').forEach((textEl) => {
      textEl.style.transform = 'none';
      textEl.removeAttribute('transform');
    });
  });

  wrapper.appendChild(header);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  const originalBtn = document.getElementById('trialDetailDownloadBtn');
  if (originalBtn) {
    originalBtn.disabled = true;
    originalBtn.classList.add('loading');
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: Math.max(1.5, window.devicePixelRatio || 1),
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: exportWidth,
      width: exportWidth,
      height: Math.ceil(wrapper.scrollHeight),
    });

    const pdf = new window.jspdf.jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    });

    const pageWidthPt = pdf.internal.pageSize.getWidth();
    const pageHeightPt = pdf.internal.pageSize.getHeight();
    const marginPt = 1;
    const printableWidthPt = pageWidthPt - (marginPt * 2);
    const printableHeightPt = pageHeightPt - (marginPt * 2);

    const scalePtPerPx = printableWidthPt / canvas.width;
    const pageSliceHeightPx = Math.max(1, Math.floor(printableHeightPt / scalePtPerPx));

    const wrapperRect = wrapper.getBoundingClientRect();
    const trialAreasTitle = exportTrialAreasTitle
      || Array.from(clone.querySelectorAll('.td-title p')).find(
        (el) => String(el.textContent || '').trim().toLowerCase() === 'trial areas',
      )?.closest('.td-title');
    const forcedBreaksPx = [];
    if (trialAreasTitle) {
      const titleRect = trialAreasTitle.getBoundingClientRect();
      const relativeTopCssPx = Math.max(0, titleRect.top - wrapperRect.top);
      const captureScale = canvas.width / Math.max(1, wrapper.scrollWidth);
      const breakAtPx = Math.round(relativeTopCssPx * captureScale);
      if (breakAtPx > 0 && breakAtPx < canvas.height) {
        forcedBreaksPx.push(breakAtPx);
      }
    }

    let offsetYpx = 0;
    let pageIndex = 0;
    let breakIndex = 0;

    while (offsetYpx < canvas.height) {
      const remaining = canvas.height - offsetYpx;
      let sliceHeightPx = Math.min(pageSliceHeightPx, remaining);

      const nextBreakPx = forcedBreaksPx[breakIndex];
      if (
        Number.isFinite(nextBreakPx) &&
        nextBreakPx > offsetYpx + 8 &&
        nextBreakPx < offsetYpx + sliceHeightPx - 8
      ) {
        sliceHeightPx = nextBreakPx - offsetYpx;
        breakIndex += 1;
      } else if (Number.isFinite(nextBreakPx) && nextBreakPx <= offsetYpx + 8) {
        breakIndex += 1;
      }

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeightPx;
      const pageCtx = pageCanvas.getContext('2d');
      if (!pageCtx) break;

      pageCtx.fillStyle = '#ffffff';
      pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageCtx.drawImage(
        canvas,
        0,
        offsetYpx,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx,
      );

      const pageImgData = pageCanvas.toDataURL('image/png');
      const renderHeightPt = sliceHeightPx * scalePtPerPx;

      if (pageIndex > 0) {
        pdf.addPage('a4', 'portrait');
      }

      pdf.addImage(
        pageImgData,
        'PNG',
        marginPt,
        marginPt,
        printableWidthPt,
        renderHeightPt,
        undefined,
        'FAST',
      );

      offsetYpx += sliceHeightPx;
      pageIndex += 1;
    }

    pdf.save(`${safeName}.pdf`);
    showToast('Trial detail downloaded', 'success');
  } catch (error) {
    console.error('Failed to export trial detail PDF:', error);
    showToast('Failed to download PDF', 'error');
  } finally {
    if (originalBtn) {
      originalBtn.disabled = false;
      originalBtn.classList.remove('loading');
    }
    wrapper.remove();
  }
}

// Initialize separate maps for each trial area in detail view
function initializeTrialDetailAreaMaps(trial) {
  // Initialize storage for maps
  if (!window.trialDetailAreaMaps) {
    window.trialDetailAreaMaps = {};
  } else {
    // Clean up old maps
    Object.values(window.trialDetailAreaMaps).forEach(map => {
      if (map) map.remove();
    });
    window.trialDetailAreaMaps = {};
  }

  const areas = trial.areas || [];
  if (areas.length === 0) return;

  // Render map into each area's container
  requestAnimationFrame(() => {
    areas.forEach((area, index) => {
      renderDetailAreaMap(area, index);
    });
  });
}

// Render individual area map in trial detail
function renderDetailAreaMap(area, index) {
  const mapContainer = document.getElementById(`detailAreaMap${index}`);
  if (!mapContainer) return;

  // Check container has dimensions — if not, wait until it does
  if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
    const ro = new ResizeObserver((entries, observer) => {
      if (mapContainer.offsetWidth > 0 && mapContainer.offsetHeight > 0) {
        observer.disconnect();
        renderDetailAreaMap(area, index);
      }
    });
    ro.observe(mapContainer);
    return;
  }

  // Collect polygon coordinates first
  let latlngs = [];
  if (area.coordinates && area.coordinates.length > 0) {
    latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
  } else if (area.polygon && area.polygon.length > 0) {
    latlngs = area.polygon.map(coord => [coord.lat, coord.lng]);
  }

  // Compute initial view from polygon so map starts at the right place
  let initCenter = [-6.2, 106.8];
  let initZoom = 12;
  if (latlngs.length > 0) {
    const bounds = L.latLngBounds(latlngs);
    initCenter = bounds.getCenter();
    initZoom = 16; // a reasonable default, fitBounds will correct it
  }

  // Create map instance
  const map = L.map(mapContainer, {
    zoomControl: false,
    attributionControl: false,
    fadeAnimation: false,
    zoomAnimation: false
  }).setView(initCenter, initZoom);

  // Add satellite layer
  L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', {
    maxNativeZoom: 20,
    maxZoom: 25
  }).addTo(map);

  // Add labels layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
    maxNativeZoom: 20,
    maxZoom: 25,
    pane: 'shadowPane'
  }).addTo(map);

  // Disable all interactions
  map.dragging.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.scrollWheelZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  if (map.tap) map.tap.disable();

  // Draw polygon and fit bounds
  if (latlngs.length > 0) {
    L.polygon(latlngs, {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.3,
      weight: 2
    }).addTo(map);

    map.fitBounds(latlngs, { padding: [20, 20], animate: false });
  }

  // Store map instance
  window.trialDetailAreaMaps[index] = map;

  // Force a reliable invalidateSize after rendering is complete
  setTimeout(() => {
    map.invalidateSize({ animate: false });
    if (latlngs.length > 0) {
      map.fitBounds(latlngs, { padding: [20, 20], animate: false });
    }
  }, 300);
}

// Edit trial from detail modal
function editTrialFromDetail() {
  if (window.currentDetailTrialId) {
    closeTrialDetailModal();
    openEditTrialModal(window.currentDetailTrialId);
  }
}

// Run trial from detail modal
function runTrialFromDetail() {
  if (window.currentDetailTrialId) {
    closeTrialDetailModal();
    startRunTrial(window.currentDetailTrialId);
  }
}

// Archive trial from detail modal
function archiveTrialFromDetail() {
  if (window.currentDetailTrialId) {
    closeTrialDetailModal();
    archiveTrial(window.currentDetailTrialId);
  }
}

// Unarchive trial from detail modal
function unarchiveTrialFromDetail() {
  if (window.currentDetailTrialId) {
    closeTrialDetailModal();
    unarchiveTrial(window.currentDetailTrialId);
  }
}

// Delete trial from detail modal
function deleteTrialFromDetail() {
  if (window.currentDetailTrialId) {
    const trial = trialState.trials.find(t => t.id === window.currentDetailTrialId);
    if (trial) {
      showConfirmModal(
        "Delete Trial",
        "Are you sure you want to delete this trial? This action cannot be undone.",
        () => {
          closeTrialDetailModal();
          deleteTrialById(window.currentDetailTrialId);
          showToast("Trial deleted", "success");
        }
      );
    }
  }
}

// Helper to delete trial by ID
function deleteTrialById(trialId) {
  trialState.trials = trialState.trials.filter(t => t.id !== trialId);
  renderTrials();
  
  if (typeof saveLocalCache === 'function') {
    saveLocalCache('trials', { trials: trialState.trials });
  }

  enqueueSync({
    label: 'Delete Trial',
    run: () => deleteTrialFromGoogleDrive(trialId),
  });
}
