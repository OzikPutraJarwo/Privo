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

    // Load trials from Google Drive (in background via sync queue)
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
  } catch (error) {
    console.error("Error initializing trials:", error);
    if (!hasCache) {
      alert("Error loading trials data. Please refresh the page.");
    }
  }
}

// Render trials list
function renderTrials() {
  const container = document.getElementById("trialList");

  if (trialState.trials.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-rounded">science</span>
                <p>No trials yet. Create your first trial to get started.</p>
            </div>
        `;
    return;
  }

  container.innerHTML = trialState.trials
    .map((trial) => {
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
            <div class="inventory-item" onclick="showTrialDetail('${trial.id}')" style="cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0;">
                  <div style="width: 40px; height: 40px; border-radius: var(--radius); background: var(--primary-soft); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <span class="material-symbols-rounded" style="font-size: 1.25rem; color: var(--primary);">science</span>
                  </div>
                  <div class="item-meta" style="min-width: 0;">
                    <div class="item-name">${escapeHtml(trial.name)}</div>
                    <div class="item-subtext" style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                      <span class="material-symbols-rounded" style="font-size: 0.85rem;">eco</span>${escapeHtml(trial.cropName || trial.cropType || "-")}
                      <span style="opacity: 0.4;">·</span>
                      <span class="material-symbols-rounded" style="font-size: 0.85rem;">calendar_month</span>${startDate} — ${endDate}
                    </div>
                    <div class="item-subtext" style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                      <span class="material-symbols-rounded" style="font-size: 0.85rem;">map</span>${areaCount} area(s)
                      <span style="opacity: 0.4;">·</span>
                      <span class="material-symbols-rounded" style="font-size: 0.85rem;">assignment</span>${trial.parameters ? trial.parameters.length : 0} param(s)
                      <span style="opacity: 0.4;">·</span>
                      <span style="color: ${progressColor}; font-weight: 600; font-size: 0.8rem;">${progress.percentage}%</span>
                    </div>
                  </div>
                </div>
                <div class="item-actions">
                    <button class="edit-btn" data-id="${trial.id}" title="Edit" onclick="event.stopPropagation();">
                        <span class="material-symbols-rounded">edit</span>
                    </button>
                    <button class="delete-btn" data-id="${trial.id}" title="Delete" onclick="event.stopPropagation();">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                </div>
            </div>
        `;
    })
    .join("");

  // Add event listeners
  container.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditTrialModal(btn.dataset.id);
    });
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
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
  document.getElementById("areasList").style.display = "none";
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
    panel.style.display = "none";
  } else {
    editor.classList.remove("active");
    panel.style.display = "block";
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
    prevBtn.style.display = "none";
    nextBtn.style.display = "block";
    saveBtn.style.display = "none";
  } else if (sectionName === "location") {
    prevBtn.style.display = "block";
    nextBtn.style.display = "block";
    saveBtn.style.display = "none";
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
    prevBtn.style.display = "block";
    nextBtn.style.display = "none";
    saveBtn.style.display = "block";
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
    alert("Please enter trial name");
    return false;
  }
  if (!plantingStart || !plantingEnd) {
    alert("Please enter planting window dates");
    return false;
  }
  if (!cropId) {
    alert("Please select crop");
    return false;
  }
  if (!trialType) {
    alert("Please select trial type");
    return false;
  }
  if (selectedParams === 0) {
    alert("Please select at least one observation parameter");
    return false;
  }

  return true;
}

// Validate location section
function validateLocationSection() {
  const locationEl = document.getElementById("trialLocation");
  const locationId = locationEl ? locationEl.value : null;

  if (locationEl && !locationId) {
    alert("Please select location");
    return false;
  }
  if (trialState.currentAreas.length === 0) {
    alert("Please draw at least one trial area");
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
        '<p style="color: var(--text-tertiary); font-size: 0.875rem;">No parameters found</p>';
      return;
    }

    container.innerHTML = filtered
      .map((param) => {
        const isChecked = selectedIds.includes(param.id);
        return `
                <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; cursor: pointer; border-radius: 6px; transition: var(--transition);" 
                       onmouseover="this.style.backgroundColor='var(--bg-tertiary)'" 
                       onmouseout="this.style.backgroundColor='transparent'">
                    <input type="checkbox" value="${param.id}" ${isChecked ? "checked" : ""} 
                           style="width: auto; cursor: pointer;" 
                           onchange="updateSelectedParamCount()">
                    <div style="flex: 1;">
                        <div style="font-weight: 500;">${escapeHtml(param.name)}</div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
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
  startBtn.style.backgroundColor = "var(--danger)";

  // Show zone info panel
  const zonePanel = document.getElementById("zoneInfoPanel");
  if (zonePanel) {
    zonePanel.style.display = "flex";
  }

  // Add click listener to map
  trialMapInstance.on("click", handleMapClickForDrawing);

  // Change cursor
  trialMapInstance.getContainer().style.cursor = "crosshair";

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
  startBtn.style.backgroundColor = "";

  // Remove click listener
  trialMapInstance.off("click", handleMapClickForDrawing);

  // Remove keyboard listener
  document.removeEventListener("keydown", handleDrawingKeyboard);

  // Restore cursor
  trialMapInstance.getContainer().style.cursor = "";

  // Hide zone info panel
  const zonePanel = document.getElementById("zoneInfoPanel");
  if (zonePanel) {
    zonePanel.style.display = "none";
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
    zonePanel.style.display = "block";
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
  dialog.style.display = "block";
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
      alert("Please enter area name");
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
    dialog.style.display = "none";
    input.value = "";

    // Update areas list
    renderAreasList();

    // Resolve address in background
    const areaIndex = trialState.currentAreas.length - 1;
    resolveAreaAddress(areaIndex);
  });

  // Cancel handler
  newCancelBtn.addEventListener("click", () => {
    dialog.style.display = "none";
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
        `<div style="font-size: 0.75rem;">Point ${i + 1}: ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}</div>`,
    )
    .join("");

  const address = area.address || "Unknown address";

  return `
        <div style="min-width: 220px;">
            <strong style="font-size: 0.95rem;">${escapeHtml(area.name)}</strong>
            <div style="margin-top: 0.5rem; font-size: 0.875rem;">
                <strong>Area:</strong> ${areaSize} hectares
            </div>
            <div style="margin-top: 0.5rem; font-size: 0.875rem;">
                <strong>Address:</strong> ${escapeHtml(address)}
            </div>
            <div style="margin-top: 0.5rem; max-height: 150px; overflow-y: auto;">
                <strong style="font-size: 0.875rem;">Coordinates:</strong>
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
    listDiv.style.display = "none";
    return;
  }

  listDiv.style.display = "block";

  container.innerHTML = trialState.currentAreas
    .map((area, index) => {
      const areaSize = area.areaSize
        ? area.areaSize.hectares.toFixed(2)
        : "0.00";
      const address = area.address || "Unknown address";
      const coordsList = area.coordinates
        .map(
          (coord, i) =>
            `<div style="font-size: 0.8rem; color: var(--text-secondary);">  • Point ${i + 1}: ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}</div>`,
        )
        .join("");

      return `
            <div style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: 6px; margin-bottom: 0.75rem; display: flex; gap: 0.75rem;">
                <div id="areaPreviewMap${index}" style="width: 80px; height: 80px; border-radius: 4px; border: 1px solid var(--border); flex-shrink: 0; background: var(--bg-secondary);"></div>
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                        <strong style="font-size: 0.95rem;">${escapeHtml(area.name)}</strong>
                        <button type="button" onclick="removeArea(${index})" class="btn btn-sm" style="background: var(--danger); color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 6px; cursor: pointer; font-size: 0.875rem; display: flex; align-items: center; gap: 0.25rem;">
                            <span class="material-symbols-rounded" style="font-size: 1rem;">delete</span>
                            <span>Remove</span>
                        </button>
                    </div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
                        <strong>Area:</strong> ${areaSize} hectares (${(areaSize * 10000).toFixed(0)} m²)
                    </div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
                        <strong>Address:</strong> ${escapeHtml(address)}
                    </div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
                        <strong>Points:</strong> ${area.coordinates.length}
                    </div>
                    <details style="margin-top: 0.5rem;">
                        <summary style="cursor: pointer; font-size: 0.875rem; color: var(--text-secondary);">View Coordinates</summary>
                        <div style="margin-top: 0.5rem; max-height: 120px; overflow-y: auto;">
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
    alert("Please enter trial name");
    return;
  }
  if (!plantingStart || !plantingEnd) {
    alert("Please enter planting window dates");
    return;
  }
  if (!cropId) {
    alert("Please select crop");
    return;
  }
  if (!trialType) {
    alert("Please select trial type");
    return;
  }
  if (selectedParams.length === 0) {
    alert("Please select at least one observation parameter");
    return;
  }
  if (trialState.currentAreas.length === 0) {
    alert("Please draw at least one trial area");
    return;
  }

  try {
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

    if (trialState.editingTrialId) {
      // Update existing trial
      trial = trialState.trials.find((t) => t.id === trialState.editingTrialId);
      if (trial) {
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
        trial.updatedAt = new Date().toISOString();
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      trialState.trials.push(trial);
    }

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

// Delete trial
async function deleteTrial(trialId) {
  if (
    !confirm(
      "Are you sure you want to delete this trial? This action cannot be undone.",
    )
  ) {
    return;
  }

  try {
    const trialIndex = trialState.trials.findIndex((t) => t.id === trialId);
    const removedTrial = trialState.trials[trialIndex];

    if (trialIndex >= 0) {
      trialState.trials.splice(trialIndex, 1);
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
  } catch (error) {
    console.error("Error deleting trial:", error);
    alert("Error deleting trial. Please try again.");
  }
}

// Load trials from Google Drive
async function loadTrialsFromGoogleDrive() {
  try {
    const folderId = await getOrCreateFolder(
      "Trials",
      driveState.inventoryFolderId,
    );
    const files = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1000,
    });

    const trials = [];
    for (const file of files.result.files) {
      const content = await getFileContent(file.id);
      trials.push(content);
    }

    return trials;
  } catch (error) {
    console.error("Error loading trials:", error);
    return [];
  }
}

// Save trial to Google Drive
async function saveTrialToGoogleDrive(trial) {
  const folderId = await getOrCreateFolder(
    "Trials",
    driveState.inventoryFolderId,
  );
  const fileName = `${trial.id}.json`;
  const content = JSON.stringify(trial, null, 2);

  const existingFile = await findFile(fileName, folderId);

  const metadata = {
    name: fileName,
    mimeType: "application/json",
    parents: existingFile ? undefined : [folderId],
  };

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const multipartRequestBody =
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
    body: multipartRequestBody,
  });

  await request;
}

// Delete trial from Google Drive
async function deleteTrialFromGoogleDrive(trialId) {
  const folderId = await getOrCreateFolder(
    "Trials",
    driveState.inventoryFolderId,
  );
  const fileName = `${trialId}.json`;
  const file = await findFile(fileName, folderId);

  if (file) {
    await gapi.client.drive.files.delete({ fileId: file.id });
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
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
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
      (line, idx) => `
        <label class="layouting-line-item">
            <input type="checkbox" name="area${areaIndex}_lines" value="${line.id}" data-line-name="${line.name}">
            <span>${escapeHtml(line.name)}</span>
        </label>
    `,
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
      label.style.display = text.includes(query) ? "flex" : "none";
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
        '<div style="padding: 1rem; text-align: center; color: var(--text-tertiary);">Select lines to generate layout</div>';
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
            <div class="layouting-table-wrap" style="margin-bottom: 1.5rem;">
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
    alert("Please generate layout for at least one area");
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
      <div class="empty-state" style="grid-column: 1 / -1;">
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
            <div style="flex: 1;">
              <div class="run-trial-card-title">${escapeHtml(trial.name)}</div>
              <div class="run-trial-card-meta">${escapeHtml(trial.cropName || "")} · ${escapeHtml(trial.trialType || "")}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: ${statusColor}; font-weight: 600;">${statusText}</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: var(--primary);">${progressPercent}%</div>
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
  const saveBtn = document.getElementById("runTrialSaveBtn");

  if (backBtn) {
    backBtn.addEventListener("click", exitRunTrial);
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", saveRunTrialProgress);
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
  document.getElementById("runTrialSelection").style.display = "none";
  document.getElementById("runTrialInterface").style.display = "block";
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

  document.getElementById("runTrialSelection").style.display = "block";
  document.getElementById("runTrialInterface").style.display = "none";

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
          <span id="area-progress-${areaIndex}" style="font-size: 0.7rem; color: var(--text-secondary); margin-left: auto;"></span>
        </div>
        <div class="run-nav-area-content">
    `;

    parameters.forEach((param) => {
      const isParamOpen =
        isAreaOpen && runTrialState.currentParamId === param.id;
      const paramClass = isParamOpen ? "" : "collapsed";
      
      // Count completed lines in this param for this area
      let paramCompleted = 0;
      let paramTotal = 0;
      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (cell) {
              paramTotal += 1;
              const lineKey = `${cell.id}_${repIndex}`;
              if (hasResponse(areaIndex, param.id, lineKey)) {
                paramCompleted += 1;
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
            <span style="font-size: 0.7rem; color: var(--text-tertiary);">(${param.initial || ""})</span>
            <span style="font-size: 0.7rem; color: var(--text-secondary); margin-left: auto;">${paramCompleted}/${paramTotal}</span>
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

        // Check if all lines in rep are completed
        const allCompleted = linesInRep.every((cell) => {
          const lineKey = `${cell.id}_${repIndex}`;
          return hasResponse(areaIndex, param.id, lineKey);
        });
        const someCompleted = linesInRep.some((cell) => {
          const lineKey = `${cell.id}_${repIndex}`;
          return hasResponse(areaIndex, param.id, lineKey);
        });

        html += `
          <div class="run-nav-rep ${repClass} ${allCompleted ? 'completed' : someCompleted ? 'partial' : ''}" data-area-index="${areaIndex}" data-param-id="${param.id}" data-rep-index="${repIndex}">
            <div class="run-nav-rep-header" onclick="toggleNavRep(${areaIndex}, '${param.id}', ${repIndex})">
              <span class="material-symbols-rounded expand-icon">expand_more</span>
              <span>Replication ${repIndex + 1}</span>
              ${allCompleted ? '<span class="material-symbols-rounded rep-status" style="color: var(--success); font-size: 14px; margin-left: auto;">check_circle</span>' : someCompleted ? '<span class="material-symbols-rounded rep-status" style="color: var(--warning); font-size: 14px; margin-left: auto;">radio_button_partial</span>' : ''}
            </div>
            <div class="run-nav-lines">
        `;

        rep.forEach((row) => {
          row.forEach((cell) => {
            if (!cell) return;
            const lineKey = `${cell.id}_${repIndex}`;
            const uniqueKey = `${areaIndex}_${param.id}_${cell.id}_${repIndex}`;
            const isCompleted = hasResponse(areaIndex, param.id, lineKey);
            const isActive =
              runTrialState.currentAreaIndex === areaIndex &&
              runTrialState.currentParamId === param.id &&
              runTrialState.currentLineId === cell.id &&
              runTrialState.currentRepIndex === repIndex;

            html += `
              <div class="run-nav-line ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}"
                   onclick="selectLine(${areaIndex}, '${param.id}', '${cell.id}', ${repIndex})"
                   data-unique-key="${uniqueKey}">
                <span>${escapeHtml(cell.name)}</span>
                ${isCompleted ? '<span class="material-symbols-rounded line-status" style="color: var(--success);">check_circle</span>' : ""}
              </div>
            `;
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

// Check if response exists
function hasResponse(areaIndex, paramId, lineKey) {
  const response = runTrialState.responses[areaIndex]?.[paramId]?.[lineKey];
  if (!response) return false;

  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  const hasValue = response.value !== undefined && response.value !== "";
  const hasPhotos = response.photos?.length > 0;

  if (param?.requirePhoto) {
    return hasPhotos;
  }

  return hasValue || hasPhotos;
}

// Select a line to answer
function selectLine(areaIndex, paramId, lineId, repIndex) {
  // Save current response before switching (auto-save)
  if (runTrialState.currentAreaIndex !== null && runTrialState.currentParamId && runTrialState.currentLineId) {
    saveCurrentResponseSilent();
  }

  runTrialState.currentAreaIndex = areaIndex;
  runTrialState.currentParamId = paramId;
  runTrialState.currentLineId = lineId;
  runTrialState.currentRepIndex = repIndex;
  runTrialState.photoFiles = [];

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

  if (areaIndex === null || !paramId || !lineId) {
    renderEmptyQuestionState();
    return;
  }

  const area = trial.areas[areaIndex];
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  const line = area.layout.lines.find((l) => l.id === lineId);
  const lineKey = `${lineId}_${repIndex}`;

  if (!param || !line) {
    renderEmptyQuestionState();
    return;
  }

  // Get existing response
  const existingResponse = runTrialState.responses[areaIndex]?.[paramId]?.[lineKey] || {};
  const existingValue = existingResponse.value ?? "";
  const existingPhotos = existingResponse.photos || [];

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
    photoHTML = `
      <div class="run-photo-section">
        <div class="run-photo-label">
          <span class="material-symbols-rounded">photo_camera</span>
          Photo Upload
          <span class="run-photo-required">* Required</span>
        </div>
        <div class="run-photo-upload" id="runPhotoContainer">
          ${existingPhotos
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
            <input type="file" accept="image/*" capture="environment" style="display: none;" onchange="handlePhotoUpload(event)">
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
    </div>
    <div class="run-question-body">
      ${inputHTML}
      ${photoHTML}
    </div>
    <div class="run-question-footer">
      <div class="run-nav-buttons">
        <button class="btn btn-secondary" onclick="navigatePrevLine()">
          <span class="material-symbols-rounded">arrow_back</span>
          Previous
        </button>
        <button class="btn btn-secondary" onclick="navigateNextLine()">
          Next
          <span class="material-symbols-rounded">arrow_forward</span>
        </button>
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
  document.body.style.overflow = 'hidden';
}

function closeMobileNav() {
  const nav = document.querySelector('.run-trial-nav');
  const overlay = document.getElementById('mobileNavOverlay');
  if (nav) nav.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// Handle photo upload
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const photoData = e.target.result;
    runTrialState.photoFiles.push(photoData);

    // Add preview
    const container = document.getElementById("runPhotoContainer");
    const addBtn = container.querySelector(".run-photo-add");
    const idx = runTrialState.photoFiles.length - 1;

    const preview = document.createElement("div");
    preview.className = "run-photo-preview";
    preview.dataset.index = idx;
    preview.innerHTML = `
      <img src="${photoData}" alt="Photo ${idx + 1}">
      <button class="run-photo-remove" onclick="removePhoto(${idx})">
        <span class="material-symbols-rounded">close</span>
      </button>
    `;
    container.insertBefore(preview, addBtn);
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

// Remove photo
function removePhoto(idx) {
  runTrialState.photoFiles.splice(idx, 1);
  renderQuestionCard();
}

// Save current response silently (for auto-save)
function saveCurrentResponseSilent() {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  
  if (areaIndex === null || !paramId || !lineId) return true;
  
  const lineKey = `${lineId}_${repIndex}`;

  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return true;

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

  // Get photos
  const existingPhotos = runTrialState.responses[areaIndex]?.[paramId]?.[lineKey]?.photos || [];
  const photos = [...existingPhotos, ...runTrialState.photoFiles];

  // Skip if nothing to save
  if (!value && photos.length === 0) return true;

  // Save response
  if (!runTrialState.responses[areaIndex]) {
    runTrialState.responses[areaIndex] = {};
  }
  if (!runTrialState.responses[areaIndex][paramId]) {
    runTrialState.responses[areaIndex][paramId] = {};
  }
  runTrialState.responses[areaIndex][paramId][lineKey] = {
    value,
    photos,
    timestamp: new Date().toISOString(),
  };

  return true;
}

// Navigate to previous line
function navigatePrevLine() {
  const lines = getAllLinesList();
  const currentIdx = lines.findIndex(
    (l) =>
      l.areaIndex === runTrialState.currentAreaIndex &&
      l.paramId === runTrialState.currentParamId &&
      l.lineId === runTrialState.currentLineId &&
      l.repIndex === runTrialState.currentRepIndex
  );

  if (currentIdx > 0) {
    const prev = lines[currentIdx - 1];
    selectLine(prev.areaIndex, prev.paramId, prev.lineId, prev.repIndex);
  }
}

// Navigate to next line
function navigateNextLine() {
  const lines = getAllLinesList();
  const currentIdx = lines.findIndex(
    (l) =>
      l.areaIndex === runTrialState.currentAreaIndex &&
      l.paramId === runTrialState.currentParamId &&
      l.lineId === runTrialState.currentLineId &&
      l.repIndex === runTrialState.currentRepIndex
  );

  if (currentIdx < lines.length - 1) {
    const next = lines[currentIdx + 1];
    selectLine(next.areaIndex, next.paramId, next.lineId, next.repIndex);
  } else {
    // At last question - check if 100% complete
    const completed = lines.filter((l) => {
      const lineKey = `${l.lineId}_${l.repIndex}`;
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
        <span class="material-symbols-rounded" style="color: var(--success); font-size: 72px;">check_circle</span>
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
        <span class="material-symbols-rounded" style="font-size: 72px;">assignment</span>
        <h3>End of Questions</h3>
        <p>Progress: ${completed} / ${lines.length} (${percentage}%)</p>
        <p>You've reached the last question. Continue to review from the beginning.</p>
        <button class="btn btn-primary" onclick="navigateToFirstLine()" style="margin-top: 1rem;">
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
    selectLine(first.areaIndex, first.paramId, first.lineId, first.repIndex);
  }
}

// Get all lines as flat list
function getAllLinesList() {
  const trial = runTrialState.currentTrial;
  const lines = [];

  const parameters = (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter(Boolean);

  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;

    parameters.forEach((param) => {
      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (!cell) return;
            lines.push({
              areaIndex,
              paramId: param.id,
              lineId: cell.id,
              lineName: cell.name,
              repIndex,
            });
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

  // Save to Google Drive
  enqueueSync({
    label: `Save Trial Progress: ${trial.name}`,
    run: () => saveTrialToGoogleDrive(trial),
  });

  // Update nav and progress display
  renderRunTrialNavTree();
  updateRunTrialProgress();
  
  // Show success feedback
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
            ? `<span class="material-symbols-rounded" style="color: var(--success);">check_circle</span>
               <span class="param-value">${escapeHtml(response.value || '')}${response.photos?.length ? ` + ${response.photos.length} photo(s)` : ''}</span>`
            : '<span class="material-symbols-rounded" style="color: var(--text-tertiary);">radio_button_unchecked</span>'
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
    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="material-symbols-rounded" style="color: ${progressColor}; font-size: 1.25rem;">donut_large</span>
          <span style="font-weight: 600; color: var(--text-primary);">Trial Progress</span>
        </div>
        <span style="font-weight: 700; font-size: 1.1rem; color: ${progressColor};">${progress.percentage}%</span>
      </div>
      <div style="height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden;">
        <div style="height: 100%; width: ${progress.percentage}%; background: ${progressColor}; border-radius: 4px; transition: width 0.3s ease;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
        <span>${progress.completed} of ${progress.total} observations completed</span>
        <span>${progress.percentage === 100 ? 'Completed' : progress.percentage > 0 ? 'In Progress' : 'Not Started'}</span>
      </div>
    </div>

    <!-- Info Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
      <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
        <span class="material-symbols-rounded" style="color: var(--primary); font-size: 1.3rem; margin-top: 2px;">eco</span>
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 0.15rem;">Crop</div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(trial.cropName || '-')}</div>
        </div>
      </div>
      <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
        <span class="material-symbols-rounded" style="color: var(--primary); font-size: 1.3rem; margin-top: 2px;">science</span>
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 0.15rem;">Trial Type</div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(trial.trialType || '-')}</div>
        </div>
      </div>
      <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
        <span class="material-symbols-rounded" style="color: var(--primary); font-size: 1.3rem; margin-top: 2px;">calendar_month</span>
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 0.15rem;">Planting Window</div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${trial.plantingStart ? formatMonthYear(trial.plantingStart) : '-'} — ${trial.plantingEnd ? formatMonthYear(trial.plantingEnd) : '-'}</div>
        </div>
      </div>
      <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
        <span class="material-symbols-rounded" style="color: var(--primary); font-size: 1.3rem; margin-top: 2px;">location_on</span>
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 0.15rem;">Location</div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${location ? escapeHtml(location.name) : (trial.locationId ? 'Unknown' : 'Not set')}</div>
        </div>
      </div>
    </div>

    <!-- Stats Row -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem;">
      <div style="text-align: center; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
        <span class="material-symbols-rounded" style="font-size: 1.5rem; color: var(--primary); display: block; margin-bottom: 0.25rem;">map</span>
        <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${areaCount}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">Areas</div>
      </div>
      <div style="text-align: center; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
        <span class="material-symbols-rounded" style="font-size: 1.5rem; color: var(--primary); display: block; margin-bottom: 0.25rem;">grass</span>
        <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${totalLines}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">Lines</div>
      </div>
      <div style="text-align: center; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
        <span class="material-symbols-rounded" style="font-size: 1.5rem; color: var(--primary); display: block; margin-bottom: 0.25rem;">assignment</span>
        <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${paramDetails.length}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">Parameters</div>
      </div>
      <div style="text-align: center; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
        <span class="material-symbols-rounded" style="font-size: 1.5rem; color: ${progressColor}; display: block; margin-bottom: 0.25rem;">check_circle</span>
        <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${progress.completed}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">Answered</div>
      </div>
    </div>

    ${trial.description ? `
    <!-- Description -->
    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border);">
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
        <span class="material-symbols-rounded" style="font-size: 1.1rem; color: var(--text-secondary);">description</span>
        <span style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);">Description</span>
      </div>
      <p style="color: var(--text-primary); line-height: 1.6; margin: 0; font-size: 0.9rem;">${escapeHtml(trial.description)}</p>
    </div>
    ` : ''}

    <!-- Parameters Section -->
    <div style="margin-bottom: 1.5rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
        <span class="material-symbols-rounded" style="font-size: 1.1rem; color: var(--text-secondary);">biotech</span>
        <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Observation Parameters</span>
        <span style="background: var(--primary-soft); color: var(--primary); font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px;">${paramDetails.length}</span>
      </div>
      ${paramDetails.length > 0 ? `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.5rem;">
        ${paramDetails.map(param => `
          <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); border: 1px solid var(--border); font-size: 0.875rem;">
            <span class="material-symbols-rounded" style="font-size: 1rem; color: var(--primary);">${getParamIcon(param.type)}</span>
            <span style="color: var(--text-primary); flex: 1;">${escapeHtml(param.name)}</span>
            <span style="color: var(--text-tertiary); font-size: 0.75rem;">${escapeHtml(param.type || '')}</span>
            ${param.unit ? `<span style="color: var(--text-tertiary); font-size: 0.75rem; background: var(--bg-secondary); padding: 0.1rem 0.4rem; border-radius: 4px;">${escapeHtml(param.unit)}</span>` : ''}
            ${param.requirePhoto ? '<span class="material-symbols-rounded" style="font-size: 0.9rem; color: var(--warning);" title="Photo required">photo_camera</span>' : ''}
          </div>
        `).join('')}
      </div>
      ` : `<div style="color: var(--text-tertiary); padding: 0.5rem;">No parameters assigned.</div>`}
    </div>

    <!-- Trial Areas Section -->
    <div>
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
        <span class="material-symbols-rounded" style="font-size: 1.1rem; color: var(--text-secondary);">map</span>
        <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Trial Areas</span>
        <span style="background: var(--primary-soft); color: var(--primary); font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px;">${areaCount}</span>
      </div>
      <div id="trialDetailAreaMaps" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
        <!-- Area maps will be rendered here -->
      </div>
    </div>

    <!-- Timestamps -->
    <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); display: flex; gap: 1.5rem; flex-wrap: wrap;">
      ${trial.createdAt ? `
      <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: var(--text-tertiary);">
        <span class="material-symbols-rounded" style="font-size: 0.9rem;">schedule</span>
        Created: ${new Date(trial.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
      </div>` : ''}
      ${trial.updatedAt ? `
      <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: var(--text-tertiary);">
        <span class="material-symbols-rounded" style="font-size: 0.9rem;">update</span>
        Updated: ${new Date(trial.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
      </div>` : ''}
    </div>
  `;

  // Show modal first, then initialize maps after a tick (so container is visible)
  modal.classList.add('active');

  // Initialize area maps after modal is visible
  setTimeout(() => {
    initializeTrialDetailAreaMaps(trial);
  }, 50);
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
      <div style="color: var(--text-tertiary); padding: 2rem; text-align: center; grid-column: 1 / -1;">
        <span class="material-symbols-rounded" style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem; opacity: 0.4;">map</span>
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
      <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-primary); box-shadow: var(--shadow-sm);">
        <div id="detailAreaMap${index}" style="height: 250px; width: 100%;"></div>
        <div style="padding: 0.75rem 1rem; border-top: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span class="material-symbols-rounded" style="font-size: 1.1rem; color: var(--primary);">pentagon</span>
            <h5 style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary); margin: 0;">${escapeHtml(area.name || 'Area ' + (index + 1))}</h5>
          </div>
          <div style="display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.8rem; color: var(--text-secondary);">
            <span style="display: flex; align-items: center; gap: 0.25rem;">
              <span class="material-symbols-rounded" style="font-size: 0.9rem;">straighten</span>
              ${areaSize}
            </span>
            <span style="display: flex; align-items: center; gap: 0.25rem;">
              <span class="material-symbols-rounded" style="font-size: 0.9rem;">radio_button_checked</span>
              ${pointCount} pts
            </span>
            <span style="display: flex; align-items: center; gap: 0.25rem;">
              <span class="material-symbols-rounded" style="font-size: 0.9rem;">grass</span>
              ${lineCount} lines
            </span>
            <span style="display: flex; align-items: center; gap: 0.25rem;">
              <span class="material-symbols-rounded" style="font-size: 0.9rem;">repeat</span>
              ${repCount} rep(s)
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Initialize map for each area with a slight delay to ensure DOM is ready
  setTimeout(() => {
    areas.forEach((area, index) => {
      renderDetailAreaMap(area, index);
    });
  }, 100);
}

// Render individual area map in trial detail
function renderDetailAreaMap(area, index) {
  const mapContainer = document.getElementById(`detailAreaMap${index}`);
  if (!mapContainer) return;

  // Check container has dimensions
  if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
    // Retry after a bit if container isn't visible yet
    setTimeout(() => renderDetailAreaMap(area, index), 200);
    return;
  }

  // Create map instance
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
  let latlngs = [];
  if (area.coordinates && area.coordinates.length > 0) {
    latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
  } else if (area.polygon && area.polygon.length > 0) {
    latlngs = area.polygon.map(coord => [coord.lat, coord.lng]);
  }

  if (latlngs.length > 0) {
    L.polygon(latlngs, {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.3,
      weight: 2
    }).addTo(map);

    // Fit bounds to area
    map.fitBounds(latlngs, { padding: [20, 20] });
  }

  // Store map instance
  window.trialDetailAreaMaps[index] = map;

  // Fix map size
  setTimeout(() => {
    map.invalidateSize();
    if (latlngs.length > 0) {
      map.fitBounds(latlngs, { padding: [20, 20] });
    }
  }, 150);
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
    if (trial && confirm('Are you sure you want to delete this trial?')) {
      closeTrialDetailModal();
      deleteTrialById(window.currentDetailTrialId);
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
    run: async () => {
      const file = await gapi.client.drive.files.get({ fileId: trialId, fields: 'trashed' });
      await gapi.client.drive.files.delete({ fileId: trialId });
    },
  });
}
