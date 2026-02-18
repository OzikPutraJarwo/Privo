// Trial Management
let trialState = {
  trials: [],
  editingTrialId: null,
  currentAreas: [],
  isDrawing: false,
  currentPolygon: null,
  currentSection: "general", // Track current section
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
      renderDashboardTrialProgress();

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
            renderDashboardTrialProgress();

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
        renderDashboardTrialProgress();

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

  if (activeTrials.length === 0 && archivedTrials.length === 0) {
    activeContainer.classList.add("empty-trial");
    activeContainer.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">science</span>
        <p>No trials yet. Create your first trial to get started.</p>
      </div>
    `;
    if (archivedPanel) archivedPanel.style.display = "none";
    return;
  } else {
    activeContainer.classList.remove("empty-trial");
  }
  
  const renderTrialItem = (trial) => {
    const startDate = trial.plantingStart
      ? formatMonthYear(trial.plantingStart)
      : "-";
    const endDate = trial.plantingEnd
      ? formatMonthYear(trial.plantingEnd)
      : "-";
    const areaCount = trial.areas ? trial.areas.length : 0;
    const progress = calculateTrialProgress(trial);
    const progressColor = progress.percentage === 100 ? 'var(--success)' 
                        : progress.percentage > 0 ? 'var(--warning)' 
                        : 'var(--text-tertiary)';

    return `
      <div class="inventory-item trial-list-item" onclick="showTrialDetail('${trial.id}')">
        <div class="trial-item-row">
          <div class="trial-item-icon">
            <span class="material-symbols-rounded">science</span>
          </div>
          <div class="item-meta">
            <div class="item-name">${escapeHtml(trial.name)}</div>
            <div class="item-subtext trial-meta-row">
              <span class="material-symbols-rounded">eco</span>${escapeHtml(trial.cropName || trial.cropType || "-")}
              <span class="meta-separator">·</span>
              <span class="material-symbols-rounded">calendar_month</span>${startDate} — ${endDate}
            </div>
            <div class="item-subtext trial-meta-row">
              <span class="material-symbols-rounded">map</span>${areaCount} area(s)
              <span class="meta-separator">·</span>
              <span class="material-symbols-rounded">assignment</span>${trial.parameters ? trial.parameters.length : 0} param(s)
              <span class="meta-separator">·</span>
              <span class="trial-progress-badge" style="color: ${progressColor}">${progress.percentage}%</span>
            </div>
          </div>
        </div>
        <div class="item-actions">
          <button class="edit-btn" data-id="${trial.id}" title="Edit" onclick="event.stopPropagation();">
            <span class="material-symbols-rounded">edit</span>
          </button>
          <button class="archive-btn" data-id="${trial.id}" title="Archive" onclick="event.stopPropagation();">
            <span class="material-symbols-rounded">archive</span>
          </button>
          <button class="delete-btn" data-id="${trial.id}" title="Delete" onclick="event.stopPropagation();">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>
    `;
  };

  const renderArchivedTrialItem = (trial) => {
    const startDate = trial.plantingStart
      ? formatMonthYear(trial.plantingStart)
      : "-";
    const endDate = trial.plantingEnd
      ? formatMonthYear(trial.plantingEnd)
      : "-";
    const areaCount = trial.areas ? trial.areas.length : 0;
    const progress = calculateTrialProgress(trial);
    const progressColor = progress.percentage === 100 ? 'var(--success)' 
                        : progress.percentage > 0 ? 'var(--warning)' 
                        : 'var(--text-tertiary)';

    return `
      <div class="inventory-item trial-list-item trial-archived" onclick="showTrialDetail('${trial.id}')">
        <div class="trial-item-row">
          <div class="trial-item-icon">
            <span class="material-symbols-rounded">science</span>
          </div>
          <div class="item-meta">
            <div class="item-name">${escapeHtml(trial.name)}</div>
            <div class="item-subtext trial-meta-row">
              <span class="material-symbols-rounded">eco</span>${escapeHtml(trial.cropName || trial.cropType || "-")}
              <span class="meta-separator">·</span>
              <span class="material-symbols-rounded">calendar_month</span>${startDate} — ${endDate}
            </div>
            <div class="item-subtext trial-meta-row">
              <span class="material-symbols-rounded">map</span>${areaCount} area(s)
              <span class="meta-separator">·</span>
              <span class="material-symbols-rounded">assignment</span>${trial.parameters ? trial.parameters.length : 0} param(s)
              <span class="meta-separator">·</span>
              <span class="trial-progress-badge" style="color: ${progressColor}">${progress.percentage}%</span>
            </div>
          </div>
        </div>
        <div class="item-actions">
          <button class="unarchive-btn" data-id="${trial.id}" title="Unarchive" onclick="event.stopPropagation();">
            <span class="material-symbols-rounded">unarchive</span>
          </button>
          <button class="delete-btn" data-id="${trial.id}" title="Delete" onclick="event.stopPropagation();">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>
    `;
  };
  
  // Render active trials
  if (activeTrials.length > 0) {
    activeContainer.innerHTML = activeTrials.map(renderTrialItem).join("");
  } else {
    activeContainer.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">science</span>
        <p>No active trials yet. Create your first trial to get started.</p>
      </div>
    `;
  }
  
  // Render archived trials
  if (archivedTrials.length > 0) {
    if (archivedPanel) archivedPanel.style.display = "block";
    archivedContainer.innerHTML = archivedTrials.map(renderArchivedTrialItem).join("");
  } else {
    if (archivedPanel) archivedPanel.style.display = "none";
  }

  // Add event listeners for active trials
  activeContainer.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditTrialModal(btn.dataset.id);
    });
  });

  activeContainer.querySelectorAll(".archive-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      archiveTrial(btn.dataset.id);
    });
  });

  activeContainer.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTrial(btn.dataset.id);
    });
  });

  // Add event listeners for archived trials
  archivedContainer.querySelectorAll(".unarchive-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      unarchiveTrial(btn.dataset.id);
    });
  });
  
  archivedContainer.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTrial(btn.dataset.id);
    });
  });
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

// Toggle archived trials visibility
function toggleArchivedTrials() {
  const archivedPanel = document.getElementById("archivedTrialManagementPanel");
  const archivedList = document.getElementById("archivedTrialList");
  const toggle = document.querySelector(".archived-header-toggle");
  
  if (!archivedPanel) return;
  
  archivedList.classList.toggle("collapsed");
  toggle.classList.toggle("collapsed");
}

// Open add trial modal
function openAddTrialModal() {
  trialState.editingTrialId = null;
  trialState.currentAreas = [];
  trialState.currentSection = "general";

  document.getElementById("trialModalTitle").textContent = "Create New Trial";
  document.getElementById("trialForm").reset();

  // Show general section
  showTrialSection("general");

  // Populate crops from inventory
  populateTrialCrops();

  // Populate locations
  populateTrialLocations();

  // Populate parameters
  populateTrialParameters();

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
      // Only allow navigation to completed or current section
      // For now, allow free navigation during development
      showTrialSection(targetSection);
    };
  });
}

// Open edit trial modal
function openEditTrialModal(trialId) {
  trialState.editingTrialId = trialId;
  trialState.currentSection = "general";
  const trial = trialState.trials.find((t) => t.id === trialId);

  if (!trial) return;

  document.getElementById("trialModalTitle").textContent = "Edit Trial";
  document.getElementById("trialName").value = trial.name;
  document.getElementById("trialDescription").value = trial.description || "";
  document.getElementById("trialPlantingStart").value =
    trial.plantingStart || "";
  document.getElementById("trialPlantingEnd").value = trial.plantingEnd || "";
  document.getElementById("trialType").value = trial.trialType || "";

  // Populate dropdowns
  populateTrialCrops();
  document.getElementById("trialCrops").value = trial.cropId || "";

  populateTrialLocations();
  const trialLocationSelect = document.getElementById("trialLocation");
  if (trialLocationSelect) trialLocationSelect.value = trial.locationId || "";

  populateTrialParameters(trial.parameters);

  // Load areas
  trialState.currentAreas = trial.areas || [];

  // Show general section
  showTrialSection("general");

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
  trialState.currentSection = "general";
  destroyTrialMap();
}

function toggleTrialEditor(show) {
  const editor = document.getElementById("trialEditor");
  const panel = document.getElementById("trialManagementPanel");
  if (!editor || !panel) return;

  if (show) {
    editor.classList.add("active");
    panel.classList.add("hidden");
  } else {
    editor.classList.remove("active");
    panel.classList.remove("hidden");
  }
}

function switchTrialTab(tabName) {
  const tabs = ["management", "run"];
  const target = tabs.includes(tabName) ? tabName : "management";

  if (target !== "management") {
    toggleTrialEditor(false);
  }

  document.querySelectorAll(".trial-tab-content").forEach((panel) => {
    panel.classList.remove("active");
  });

  const targetPanel = document.getElementById(
    target === "management" ? "trialManagementContent" : "trialRunContent",
  );
  if (targetPanel) {
    targetPanel.classList.add("active");
  }

  document.querySelectorAll(".trial-submenu-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.trialTab === target);
  });

  document
    .querySelectorAll('.nav-subitem[data-parent="trial"]')
    .forEach((item) => {
      item.classList.toggle("active", item.dataset.trialTab === target);
    });

  // Initialize Run Trial when switching to run tab
  if (target === "run") {
    initializeRunTrial();
  }
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
    general: "trialSectionGeneral",
    location: "trialSectionLocation",
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

  if (sectionName === "general") {
    prevBtn.classList.add("hidden");
    nextBtn.classList.remove("hidden");
    saveBtn.classList.add("hidden");
  } else if (sectionName === "location") {
    prevBtn.classList.remove("hidden");
    nextBtn.classList.remove("hidden");
    saveBtn.classList.add("hidden");
    // Initialize map when entering location section
    if (!trialMapInstance) {
      const trial = trialState.editingTrialId
        ? trialState.trials.find((t) => t.id === trialState.editingTrialId)
        : null;
      initializeTrialMap(trial?.locationCoordinates);

      // Render saved areas if editing
      if (trial && trialState.currentAreas.length > 0) {
        trialState.currentAreas.forEach((area, index) => {
          drawSavedArea(area, index);
        });
        renderAreasList();
      }
    }
  } else if (sectionName === "layouting") {
    prevBtn.classList.remove("hidden");
    nextBtn.classList.add("hidden");
    saveBtn.classList.remove("hidden");
    // Initialize layouting section
    initializeLayoutingSection();
  }
}

// Navigate to next section
function nextTrialSection() {
  const sections = ["general", "location", "layouting"];
  const currentIndex = sections.indexOf(trialState.currentSection);

  // Validate current section
  if (trialState.currentSection === "general") {
    if (!validateGeneralSection()) return;
  } else if (trialState.currentSection === "location") {
    if (!validateLocationSection()) return;
  }

  if (currentIndex < sections.length - 1) {
    showTrialSection(sections[currentIndex + 1]);
  }
}

// Navigate to previous section
function prevTrialSection() {
  const sections = ["general", "location", "layouting"];
  const currentIndex = sections.indexOf(trialState.currentSection);

  if (currentIndex > 0) {
    showTrialSection(sections[currentIndex - 1]);
  }
}

// Validate general section
function validateGeneralSection() {
  const name = document.getElementById("trialName").value.trim();
  const plantingStart = document.getElementById("trialPlantingStart").value;
  const plantingEnd = document.getElementById("trialPlantingEnd").value;
  const cropId = document.getElementById("trialCrops").value;
  const trialType = document.getElementById("trialType").value;
  const selectedParams = document.querySelectorAll(
    '#parameterList input[type=\"checkbox\"]:checked',
  ).length;

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
  if (!trialType) {
    showToast("Please select trial type", "error");
    return false;
  }
  if (selectedParams === 0) {
    showToast("Please select at least one observation parameter", "error");
    return false;
  }

  return true;
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
  const container = document.getElementById("parameterList");
  const searchInput = document.getElementById("parameterSearch");
  const parameters = inventoryState.items.parameters || [];

  function renderParameters(searchTerm = "") {
    const filtered = parameters.filter(
      (param) =>
        param.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (param.initial || "").toLowerCase().includes(searchTerm.toLowerCase()),
    );

    if (filtered.length === 0) {
      container.innerHTML =
        '<p class="param-no-results">No parameters found</p>';
      return;
    }

    container.innerHTML = filtered
      .map((param) => {
        const isChecked = selectedIds.includes(param.id);
        return `
                <label class="param-checkbox-label">
                    <input type="checkbox" value="${param.id}" ${isChecked ? "checked" : ""} 
                           class="param-checkbox-input" 
                           onchange="updateSelectedParamCount()">
                    <div class="param-checkbox-info">
                        <div class="param-checkbox-name">${escapeHtml(param.name)}</div>
                        <div class="param-checkbox-meta">
                            ${escapeHtml(param.initial || "")} · ${escapeHtml(param.type || "")} · ${escapeHtml(param.unit || "")}
                        </div>
                    </div>
                </label>
            `;
      })
      .join("");

    updateSelectedParamCount();
  }

  // Initial render
  renderParameters();

  // Search listener
  searchInput.removeEventListener("input", searchInput._searchHandler);
  searchInput._searchHandler = (e) => renderParameters(e.target.value);
  searchInput.addEventListener("input", searchInput._searchHandler);
}

// Update selected parameter count
function updateSelectedParamCount() {
  const checkboxes = document.querySelectorAll(
    '#parameterList input[type="checkbox"]:checked',
  );
  document.getElementById("selectedParamCount").textContent = checkboxes.length;
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
  let center = [-6.2, 106.8];
  let zoom = 5;

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
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      maxNativeZoom: 19,
      maxZoom: 25,
    },
  ).addTo(trialMapInstance);

  // Add labels layer on top of satellite
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap contributors, &copy; CartoDB",
      maxNativeZoom: 19,
      maxZoom: 25,
      pane: "shadowPane",
    },
  ).addTo(trialMapInstance);

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
                    <div class="area-list-info">
                        <strong>Points:</strong> ${area.coordinates.length}
                    </div>
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
  if (window[`areaPreviewMap${index}`]) {
    window[`areaPreviewMap${index}`].remove();
  }

  // Create map instance (with no zoom control)
  const map = L.map(mapContainer, {
    zoomControl: false,
    attributionControl: false
  }).setView([-6.2, 106.8], 12);
  
  // Add satellite layer
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '',
    maxNativeZoom: 19,
    maxZoom: 25
  }).addTo(map);

  // Add labels layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
    attribution: '',
    maxNativeZoom: 19,
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
  
  // Fix map size
  setTimeout(() => map.invalidateSize(), 100);
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
  const cropSelect = document.getElementById("trialCrops");
  const cropId = cropSelect.value;
  const cropName =
    cropSelect.options[cropSelect.selectedIndex].dataset.name || "";
  const trialType = document.getElementById("trialType").value;
  const locationEl = document.getElementById("trialLocation");
  const locationId = locationEl ? locationEl.value : (trialState.editingTrialId ? trialState.trials.find(t => t.id === trialState.editingTrialId)?.locationId : "");

  // Get selected parameters
  const selectedParams = Array.from(
    document.querySelectorAll('#parameterList input[type="checkbox"]:checked'),
  ).map((cb) => cb.value);

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
  if (!trialType) {
    showToast("Please select trial type", "error");
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
        trial.cropId = cropId;
        trial.cropName = cropName;
        trial.trialType = trialType;
        trial.locationId = locationId;
        trial.locationCoordinates = locationCoords;
        trial.parameters = selectedParams;
        trial.areas = trialState.currentAreas;
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
        cropId: cropId,
        cropName: cropName,
        trialType: trialType,
        locationId: locationId,
        locationCoordinates: locationCoords,
        parameters: selectedParams,
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
//            Advanta/Trials/{trialId}/responses/{areaIndex}_{paramId}.json
// Each area+param combo = separate file → no multi-device conflicts
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
              // File name format: {areaIndex}_{paramId}.json
              const key = respFile.name.replace(".json", "");
              const sepIdx = key.indexOf("_");
              if (sepIdx === -1) continue;

              const areaIndex = key.substring(0, sepIdx);
              const paramId = key.substring(sepIdx + 1);

              if (!responses[areaIndex]) responses[areaIndex] = {};
              responses[areaIndex][paramId] = respData;
            } catch (e) {
              console.error(`Error loading response ${respFile.name}:`, e);
            }
          }
          trial.responses = responses;
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

  await uploadJsonFile("meta.json", trialFolderId, meta);
}

// Save only the responses for a specific area+param to Drive
async function saveTrialResponsesToDrive(trial) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);
  const responsesFolderId = await getOrCreateFolder("responses", trialFolderId);

  const responses = trial.responses || {};

  // Save each area+param combo as a separate file
  for (const areaIndex of Object.keys(responses)) {
    for (const paramId of Object.keys(responses[areaIndex])) {
      const fileName = `${areaIndex}_${paramId}.json`;
      const data = responses[areaIndex][paramId];
      await uploadJsonFile(fileName, responsesFolderId, data);
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
    .map(
      (line, idx) => {
        const qty = line.quantity !== undefined ? line.quantity : '∞';
        const qtyClass = line.quantity !== undefined && line.quantity <= 0 ? 'line-qty-empty' : '';
        return `
        <label class="layouting-line-item ${qtyClass}">
            <input type="checkbox" name="area${areaIndex}_lines" value="${line.id}" data-line-name="${line.name}" ${line.quantity !== undefined && line.quantity <= 0 ? 'disabled' : ''}>
            <span>${escapeHtml(line.name)}</span>
            <span class="line-quantity-badge ${qtyClass}">${qty}</span>
        </label>
    `;
      },
    )
    .join("");

  if (matchingLines.length === 0) {
    linesHTML =
      '<p class="layouting-empty">No lines available for this crop.</p>';
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
                <div class="layouting-search">
                    <span class="material-symbols-rounded">search</span>
                    <input 
                        type="text" 
                        class="area-line-search" 
                        placeholder="Search lines..." 
                        data-area-index="${areaIndex}"
                    >
                </div>
                <div class="area-lines-list layouting-lines-list" data-area-index="${areaIndex}">
                    ${linesHTML}
                </div>
            </div>

            <div class="layouting-controls">
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

  // Add search functionality
  const searchInput = areaDiv.querySelector(".area-line-search");
  const linesList = areaDiv.querySelector(".area-lines-list");

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    const labels = linesList.querySelectorAll("label");
    labels.forEach((label) => {
      const text = label.textContent.toLowerCase();
      label.classList.toggle("hidden", !text.includes(query));
    });
  });

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

  // Add listener to line checkboxes
  areaDiv.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", autoGenerateLayout);
  });

  // If editing and layout exists, pre-populate form
  if (area.layout && area.layout.lines) {
    const numRangesInput = areaDiv.querySelector(".area-num-ranges");
    const numRepsInput = areaDiv.querySelector(".area-num-reps");
    const directionSelect = areaDiv.querySelector(".area-direction");
    const randomizationSelect = areaDiv.querySelector(".area-randomization");

    if (numRangesInput) numRangesInput.value = area.layout.numRanges || 1;
    if (numRepsInput) numRepsInput.value = area.layout.numReps || 1;
    if (directionSelect)
      directionSelect.value = area.layout.direction || "serpentine";
    if (randomizationSelect)
      randomizationSelect.value = area.layout.randomization || "normal";

    // Check the selected lines
    area.layout.lines.forEach((line) => {
      const checkbox = areaDiv.querySelector(
        `input[name="area${areaIndex}_lines"][value="${line.id}"]`,
      );
      if (checkbox) checkbox.checked = true;
    });

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

  // Get selected lines
  const selectedCheckboxes = areaDiv.querySelectorAll(
    `input[name="area${areaIndex}_lines"]:checked`,
  );
  const selectedLines = Array.from(selectedCheckboxes).map((cb) => ({
    id: cb.value,
    name: cb.dataset.lineName,
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
                <table class="layouting-table">
                    <tbody>
                        ${grid
                          .map(
                            (row, rowIdx) => `
                            <tr>
                                <td class="layouting-row-header">R${rowIdx + 1}</td>
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

// Initialize Run Trial tab
function initializeRunTrial() {
  renderRunTrialList();
  setupRunTrialEventListeners();
}

// Render list of trials that can be run
function renderRunTrialList() {
  const container = document.getElementById("runTrialList");
  const header = document.querySelector("#runTrialSelection .run-trial-header");
  if (!container) return;

  const runnableTrials = trialState.trials.filter(
    (t) => t.areas && t.areas.length > 0 && t.areas.some((a) => a.layout?.result)
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
      const paramCount = trial.parameters?.length || 0;
      const totalLines = trial.areas?.reduce((sum, area) => {
        return sum + (area.layout?.lines?.length || 0);
      }, 0) || 0;

      // Calculate progress using the correct response format
      const progress = calculateTrialProgress(trial);
      const progressPercent = progress.percentage;
      const statusText = progressPercent === 0 ? 'Not Started' : progressPercent === 100 ? 'Completed' : 'In Progress';
      const statusColor = progressPercent === 0 ? 'var(--text-secondary)' : progressPercent === 100 ? 'var(--success)' : 'var(--warning)';

      return `
        <div class="run-trial-card" data-trial-id="${trial.id}">
          <div class="run-trial-card-header">
            <div class="run-trial-card-icon">
              <span class="material-symbols-rounded">play_circle</span>
            </div>
            <div class="run-trial-card-body">
              <div class="run-trial-card-title">${escapeHtml(trial.name)}</div>
              <div class="run-trial-card-meta">${escapeHtml(trial.cropName || "")} · ${escapeHtml(trial.trialType || "")}</div>
            </div>
            <div class="run-trial-card-right">
              <div class="run-trial-status-label" style="color: ${statusColor}">${statusText}</div>
              <div class="run-trial-status-percent">${progressPercent}%</div>
            </div>
          </div>
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
    backBtn.addEventListener("click", exitRunTrial);
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

  runTrialState.currentTrialId = trialId;
  runTrialState.currentTrial = trial;
  runTrialState.responses = trial.responses || {};
  runTrialState.currentAreaIndex = null;
  runTrialState.currentParamId = null;
  runTrialState.currentLineId = null;
  runTrialState.currentRepIndex = null;

  // Show run interface
  document.getElementById("runTrialSelection").classList.add("hidden");
  document.getElementById("runTrialInterface").classList.remove("hidden");
  document.getElementById("runTrialName").textContent = trial.name;

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

  document.getElementById("runTrialSelection").classList.remove("hidden");
  document.getElementById("runTrialInterface").classList.add("hidden");

  document.body.classList.remove("run-trial-active", "sidebar-collapsed");

  renderRunTrialList();
}

// Render navigation tree
function renderRunTrialNavTree() {
  const container = document.getElementById("runTrialNavTree");
  const trial = runTrialState.currentTrial;
  if (!container || !trial) return;

  // Get parameters info
  const parameters = (trial.parameters || []).map((paramId) => {
    return inventoryState.items.parameters.find((p) => p.id === paramId);
  }).filter(Boolean);

  let html = "";

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
          <span id="area-progress-${areaIndex}" class="nav-progress-text"></span>
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
  
  // Calculate and display area progress
  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;
    
    let areaTotal = 0;
    let areaCompleted = 0;
    
    area.layout.result.forEach((rep, repIndex) => {
      rep.forEach((row) => {
        row.forEach((cell) => {
          if (cell) {
            areaTotal += 1;
            parameters.forEach((param) => {
              const lineKey = `${cell.id}_${repIndex}`;
              if (hasResponse(areaIndex, param.id, lineKey)) {
                areaCompleted += 1;
              }
            });
          }
        });
      });
    });
    
    const progressEl = document.getElementById(`area-progress-${areaIndex}`);
    if (progressEl) {
      const paramCount = parameters.length;
      progressEl.textContent = `${areaCompleted}/${areaTotal * paramCount}`;
    }
  });
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
  // Save current response before switching (auto-save) only if there are changes
  if (runTrialState.currentAreaIndex !== null && runTrialState.currentParamId && runTrialState.currentLineId) {
    if (hasResponseChanges()) {
      saveCurrentResponseSilent();
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
            <div class="run-photo-preview" data-index="${idx}">
              <img src="${photo}" alt="Photo ${idx + 1}">
              <button class="run-photo-remove" onclick="removePhoto(${idx})">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
          `
            )
            .join("")}
          <label class="run-photo-add">
            <input type="file" accept="image/*" capture="environment" class="photo-upload-input" onchange="handlePhotoUpload(event)">
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
          <button class="btn btn-secondary" onclick="navigatePrevLine()">
            <span class="material-symbols-rounded">arrow_back</span>
            Previous Line
          </button>
          <button class="btn btn-secondary" onclick="navigateNextLine()">
            Next Line
            <span class="material-symbols-rounded">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  `;
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
  const nav = document.querySelector('.run-trial-nav');
  const overlay = document.getElementById('mobileNavOverlay');
  if (nav) nav.classList.add('open');
  if (overlay) overlay.classList.add('open');
  document.body.classList.add('no-scroll');
}

function closeMobileNav() {
  const nav = document.querySelector('.run-trial-nav');
  const overlay = document.getElementById('mobileNavOverlay');
  if (nav) nav.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('no-scroll');
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
    
    if (areaIndex === null || !paramId || !lineId) return;
    
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
    
    // Re-render to show the new photo
    renderQuestionCard();
  };
  reader.readAsDataURL(file);
  event.target.value = "";
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

  // Skip if nothing to save
  if (!value && photos.length === 0) return true;

  // Save response at lineKey (always includes sampleIndex)
  if (!runTrialState.responses[areaIndex]) {
    runTrialState.responses[areaIndex] = {};
  }
  if (!runTrialState.responses[areaIndex][paramId]) {
    runTrialState.responses[areaIndex][paramId] = {};
  }
  runTrialState.responses[areaIndex][paramId][lineKey] = {
    value,
    photos: param.requirePhoto ? [] : photos, // Don't duplicate photos in lineKey if using photoKey
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
        <p>Progress: ${completed} / ${lines.length} (${percentage}%)</p>
        <p>You've reached the last question. Continue to review from the beginning.</p>
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

  const parameters = (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter(Boolean);

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

  const percentage = lines.length > 0 ? Math.round((completed / lines.length) * 100) : 0;
  document.getElementById("runTrialProgress").textContent = `${completed} / ${lines.length} · ${percentage}%`;
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

  // Save responses to Google Drive (granular — per area+param file)
  enqueueSync({
    label: `Save Responses: ${trial.name}`,
    run: () => saveTrialResponsesToDrive(trial),
  });

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

    // Save to Drive in background
    enqueueSync({
      label: `Auto-save: ${trial.name}`,
      run: () => saveTrialResponsesToDrive(trial),
    });

    // Update nav and progress display
    renderRunTrialNavTree();
    updateRunTrialProgress();
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
// VIEW PROGRESS FUNCTIONALITY
// ===========================

function showViewProgress() {
  const modal = document.getElementById('viewProgressModal');
  if (modal) {
    modal.classList.add('active');
    renderViewProgress();
  }
}

function closeViewProgress() {
  const modal = document.getElementById('viewProgressModal');
  if (modal) {
    modal.classList.remove('active');
  }
  closeLineProgressDetail();
}

function renderViewProgress() {
  const container = document.getElementById('viewProgressContent');
  const trial = runTrialState.currentTrial;
  if (!container || !trial) return;

  const parameters = (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter(Boolean);

  let html = '';

  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;

    html += `
      <div class="progress-area">
        <div class="progress-area-header">
          <span class="material-symbols-rounded">location_on</span>
          <span>${escapeHtml(area.name || `Area ${areaIndex + 1}`)}</span>
        </div>
    `;

    // For each replication
    area.layout.result.forEach((rep, repIndex) => {
      const maxCols = rep.reduce((max, row) => {
        if (!row) return max;
        return Math.max(max, row.length);
      }, 0);

      html += `
        <div class="progress-rep">
          <div class="progress-rep-header">Replication ${repIndex + 1}</div>
          <div class="progress-layout-grid">
      `;

      // Render grid
      rep.forEach((row) => {
        html += `<div class="progress-layout-row">`;
        // Iterate through row by index to ensure we handle sparse arrays properly
        for (let colIdx = 0; colIdx < maxCols; colIdx++) {
          const cell = row?.[colIdx];
          if (!cell) {
            html += `<div class="progress-layout-cell empty"></div>`;
            continue;
          }

          // Check completion status across all params
          let completedParams = 0;
          let totalParams = parameters.length;
          parameters.forEach((param) => {
            const lineKey = `${cell.id}_${repIndex}`;
            if (hasResponse(areaIndex, param.id, lineKey)) {
              completedParams++;
            }
          });

          let statusClass = 'none';
          if (completedParams === totalParams && totalParams > 0) {
            statusClass = 'complete';
          } else if (completedParams > 0) {
            statusClass = 'partial';
          }

          html += `
            <div class="progress-layout-cell ${statusClass}" 
                 onclick="showLineProgress(${areaIndex}, '${cell.id}', ${repIndex})"
                 data-cell-id="${cell.id}">
              <span class="cell-name">${escapeHtml(cell.name)}</span>
              <span class="cell-status">${completedParams}/${totalParams}</span>
            </div>
          `;
        }
        html += `</div>`;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  container.innerHTML = html;
}

function showLineProgress(areaIndex, lineId, repIndex) {
  const trial = runTrialState.currentTrial;
  const area = trial.areas[areaIndex];
  const line = area.layout.lines.find((l) => l.id === lineId);
  const parameters = (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter(Boolean);

  let html = `
    <div class="line-progress-header">
      <div>
        <h4>${escapeHtml(line?.name || 'Line')}</h4>
        <span>Rep ${repIndex + 1} · ${escapeHtml(area.name || `Area ${areaIndex + 1}`)}</span>
      </div>
      <button class="btn-icon-close line-progress-close" onclick="closeLineProgressDetail()">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
    <div class="line-progress-params">
  `;

  parameters.forEach((param) => {
    const lineKey = `${lineId}_${repIndex}`;
    const response = runTrialState.responses[areaIndex]?.[param.id]?.[lineKey];
    const isAnswered = hasResponse(areaIndex, param.id, lineKey);

    html += `
      <div class="line-progress-param ${isAnswered ? 'answered' : ''}">
        <div class="param-info">
          <span class="param-name">${escapeHtml(param.name)}</span>
          <span class="param-initial">(${param.initial || ''})</span>
        </div>
        <div class="param-status">
          ${isAnswered 
            ? `<span class="material-symbols-rounded status-icon-success">check_circle</span>
               <span class="param-value">${escapeHtml(response.value || '')}${response.photos?.length ? ` + ${response.photos.length} photo(s)` : ''}</span>`
            : '<span class="material-symbols-rounded status-icon-muted">radio_button_unchecked</span>'
          }
        </div>
      </div>
    `;
  });

  html += `
    </div>
    <button class="btn btn-primary" onclick="goToLine(${areaIndex}, '${lineId}', ${repIndex})">
      <span class="material-symbols-rounded">edit</span>
      Edit Responses
    </button>
  `;

  const detail = document.getElementById('lineProgressDetail');
  if (detail) {
    detail.innerHTML = html;
    detail.classList.add('active');
  }
}

function closeLineProgressDetail() {
  const detail = document.getElementById('lineProgressDetail');
  if (detail) {
    detail.classList.remove('active');
  }
}

function goToLine(areaIndex, lineId, repIndex) {
  closeViewProgress();
  // Get first param to start with
  const trial = runTrialState.currentTrial;
  const firstParamId = trial.parameters?.[0];
  if (firstParamId) {
    selectLine(areaIndex, firstParamId, lineId, repIndex);
  }
}

// ===========================
// DASHBOARD TRIAL PROGRESS
// ===========================

function calculateTrialProgress(trial) {
  if (!trial.areas || !trial.parameters) return { completed: 0, total: 0, percentage: 0 };
  
  const parameters = trial.parameters;
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
            total++;
            const lineKey = `${cell.id}_${repIndex}`;
            const response = responses[areaIndex]?.[paramId]?.[lineKey];
            const param = inventoryState.items.parameters.find((p) => p.id === paramId);
            const hasValue = response?.value !== undefined && response?.value !== "";
            const hasPhotos = response?.photos?.length > 0;

            if (param?.requirePhoto) {
              if (hasPhotos) completed++;
            } else if (hasValue || hasPhotos) {
              completed++;
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

function renderDashboardTrialProgress() {
  const container = document.getElementById('dashboardTrialProgress');
  if (!container) return;

  const runnableTrials = trialState.trials.filter(
    (t) => t.areas && t.areas.length > 0 && t.areas.some((a) => a.layout?.result)
  );

  if (runnableTrials.length === 0) {
    container.innerHTML = `
      <div class="empty-state-small">
        <span class="material-symbols-rounded">science</span>
        <p>No active trials</p>
      </div>
    `;
    return;
  }

  container.innerHTML = runnableTrials.map((trial) => {
    const progress = calculateTrialProgress(trial);
    const progressColor = progress.percentage === 100 ? 'var(--success)' 
                        : progress.percentage > 50 ? 'var(--primary)' 
                        : progress.percentage > 0 ? 'var(--warning)' 
                        : 'var(--text-tertiary)';

    return `
      <div class="dashboard-trial-item">
        <div class="trial-item-info">
          <span class="trial-item-name">${escapeHtml(trial.name)}</span>
          <span class="trial-item-meta">${trial.areas?.length || 0} area(s) · ${trial.parameters?.length || 0} param(s)</span>
        </div>
        <div class="trial-item-progress">
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${progress.percentage}%; background: ${progressColor};"></div>
          </div>
          <span class="progress-text">${progress.percentage}%</span>
        </div>
      </div>
    `;
  }).join('');
}

// Show trial detail modal
function showTrialDetail(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  const modal = document.getElementById('trialDetailModal');
  if (!modal) return;

  // Store current trial for editing/deleting
  window.currentDetailTrialId = trialId;

  // Set header info
  document.getElementById('trialDetailTitle').textContent = trial.name;
  const trialDetailMeta = document.getElementById('trialDetailMeta');
  if (trialDetailMeta) {
    const progress = calculateTrialProgress(trial);
    trialDetailMeta.textContent = `${trial.cropName || trial.trialType || 'Trial'} · ${progress.percentage}% completed`;
  }

  // Build comprehensive body content
  const body = document.getElementById('trialDetailBody');
  if (!body) return;

  // Resolve parameters
  const paramDetails = (trial.parameters || []).map(paramId => {
    return inventoryState.items.parameters.find(p => p.id === paramId);
  }).filter(Boolean);

  // Resolve location
  const location = inventoryState.items.locations?.find(l => l.id === trial.locationId);

  // Progress
  const progress = calculateTrialProgress(trial);
  const progressColor = progress.percentage === 100 ? 'var(--success)' 
                      : progress.percentage > 50 ? 'var(--primary)' 
                      : progress.percentage > 0 ? 'var(--warning)' 
                      : 'var(--text-tertiary)';

  // Areas summary
  const areaCount = trial.areas ? trial.areas.length : 0;
  const totalLines = trial.areas?.reduce((sum, area) => {
    if (area.layout?.result) {
      let count = 0;
      area.layout.result.forEach(rep => rep.forEach(row => row.forEach(cell => { if (cell) count++; })));
      return sum + count;
    }
    return sum + (area.layout?.lines?.length || 0);
  }, 0) || 0;

  body.innerHTML = `
    <!-- Progress Bar -->
    <div class="td-section td-card">
      <div class="td-row">
        <div class="td-flex">
          <span class="material-symbols-rounded td-progress-fill" style="color: ${progressColor};">donut_large</span>
          <span class="td-info-label">Trial Progress</span>
        </div>
        <span class="td-progress-summary" style="color: ${progressColor};">${progress.percentage}%</span>
      </div>
      <div class="td-progress-track">
        <div class="td-progress-fill" style="width: ${progress.percentage}%; background: ${progressColor};"></div>
      </div>
      <div class="td-progress-summary">
        <span>${progress.completed} of ${progress.total} observations completed</span>
        <span>${progress.percentage === 100 ? 'Completed' : progress.percentage > 0 ? 'In Progress' : 'Not Started'}</span>
      </div>
    </div>

    <!-- Info Grid -->
    <div class="td-info-grid">
      <div class="td-info-item">
        <span class="material-symbols-rounded td-info-icon">eco</span>
        <div>
          <div class="td-info-label">Crop</div>
          <div class="td-info-value">${escapeHtml(trial.cropName || '-')}</div>
        </div>
      </div>
      <div class="td-info-item">
        <span class="material-symbols-rounded td-info-icon">science</span>
        <div>
          <div class="td-info-label">Trial Type</div>
          <div class="td-info-value">${escapeHtml(trial.trialType || '-')}</div>
        </div>
      </div>
      <div class="td-info-item">
        <span class="material-symbols-rounded td-info-icon">calendar_month</span>
        <div>
          <div class="td-info-label">Planting Window</div>
          <div class="td-info-value">${trial.plantingStart ? formatMonthYear(trial.plantingStart) : '-'} — ${trial.plantingEnd ? formatMonthYear(trial.plantingEnd) : '-'}</div>
        </div>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="td-stats-grid">
      <div class="td-stat-item">
        <span class="material-symbols-rounded td-stat-icon">map</span>
        <div class="td-stat-value">${areaCount}</div>
        <div class="td-stat-label">Areas</div>
      </div>
      <div class="td-stat-item">
        <span class="material-symbols-rounded td-stat-icon">grass</span>
        <div class="td-stat-value">${totalLines}</div>
        <div class="td-stat-label">Lines</div>
      </div>
      <div class="td-stat-item">
        <span class="material-symbols-rounded td-stat-icon">assignment</span>
        <div class="td-stat-value">${paramDetails.length}</div>
        <div class="td-stat-label">Parameters</div>
      </div>
      <div class="td-stat-item">
        <span class="material-symbols-rounded td-stat-icon" style="color: ${progressColor};">check_circle</span>
        <div class="td-stat-value">${progress.completed}</div>
        <div class="td-stat-label">Answered</div>
      </div>
    </div>

    ${trial.description ? `
    <!-- Description -->
    <div class="td-section td-card">
      <div class="td-section-header">
        <span class="material-symbols-rounded td-section-icon">description</span>
        <span class="td-desc-label">Description</span>
      </div>
      <p class="td-description">${escapeHtml(trial.description)}</p>
    </div>
    ` : ''}

    <!-- Parameters Section -->
    <div class="td-section">
      <div class="td-section-header">
        <span class="material-symbols-rounded td-section-icon">biotech</span>
        <span class="td-section-title">Observation Parameters</span>
        <span class="td-section-count">${paramDetails.length}</span>
      </div>
      ${paramDetails.length > 0 ? `
      <div class="td-params-grid">
        ${paramDetails.map(param => `
          <div class="td-param-item">
            <span class="material-symbols-rounded td-param-icon">${getParamIcon(param.type)}</span>
            <span class="td-param-name">${escapeHtml(param.name)}</span>
            <span class="td-param-type">${escapeHtml(param.type || '')}</span>
            ${param.unit ? `<span class="td-param-unit">${escapeHtml(param.unit)}</span>` : ''}
            ${param.requirePhoto ? '<span class="material-symbols-rounded td-param-photo" title="Photo required">photo_camera</span>' : ''}
          </div>
        `).join('')}
      </div>
      ` : `<div class="td-no-items">No parameters assigned.</div>`}
    </div>

    <!-- Trial Areas Section -->
    <div>
      <div class="td-section-header">
        <span class="material-symbols-rounded td-section-icon">map</span>
        <span class="td-section-title">Trial Areas</span>
        <span class="td-section-count">${areaCount}</span>
      </div>
      <div id="trialDetailAreaMaps" class="td-area-maps-grid">
        <!-- Area maps will be rendered here -->
      </div>
    </div>

    <!-- Timestamps -->
    <div class="td-timestamps">
      ${trial.createdAt ? `
      <div class="td-timestamp">
        <span class="material-symbols-rounded">schedule</span>
        Created: ${new Date(trial.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
      </div>` : ''}
      ${trial.updatedAt ? `
      <div class="td-timestamp">
        <span class="material-symbols-rounded">update</span>
        Updated: ${new Date(trial.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
      </div>` : ''}
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

// Initialize separate maps for each trial area in detail view
function initializeTrialDetailAreaMaps(trial) {
  const container = document.getElementById('trialDetailAreaMaps');
  if (!container) return;

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

  // Get areas
  const areas = trial.areas || [];

  if (areas.length === 0) {
    container.innerHTML = `
      <div class="td-no-areas">
        <span class="material-symbols-rounded">map</span>
        <p>No areas defined for this trial.</p>
      </div>`;
    return;
  }

  // Create HTML for each area map
  container.innerHTML = areas.map((area, index) => {
    const areaSize = area.areaSize ? `${area.areaSize.hectares.toFixed(2)} ha` : '-';
    const pointCount = area.coordinates ? area.coordinates.length : (area.polygon ? area.polygon.length : 0);
    const lineCount = area.layout?.result ? (() => { let c = 0; area.layout.result.forEach(rep => rep.forEach(row => row.forEach(cell => { if (cell) c++; }))); return c; })() : (area.layout?.lines?.length || 0);
    const repCount = area.layout?.replications || area.layout?.result?.length || 1;

    return `
      <div class="td-area-card">
        <div id="detailAreaMap${index}" class="td-area-map"></div>
        <div class="td-area-info">
          <div class="td-area-name-row">
            <span class="material-symbols-rounded td-area-name-icon">pentagon</span>
            <h5 class="td-area-name">${escapeHtml(area.name || 'Area ' + (index + 1))}</h5>
          </div>
          <div class="td-area-stats">
            <span class="td-area-stat">
              <span class="material-symbols-rounded">straighten</span>
              ${areaSize}
            </span>
            <span class="td-area-stat">
              <span class="material-symbols-rounded">radio_button_checked</span>
              ${pointCount} pts
            </span>
            <span class="td-area-stat">
              <span class="material-symbols-rounded">grass</span>
              ${lineCount} lines
            </span>
            <span class="td-area-stat">
              <span class="material-symbols-rounded">repeat</span>
              ${repCount} rep(s)
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Initialize map for each area after DOM is ready
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
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: 19,
    maxZoom: 25
  }).addTo(map);

  // Add labels layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
    maxNativeZoom: 19,
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
