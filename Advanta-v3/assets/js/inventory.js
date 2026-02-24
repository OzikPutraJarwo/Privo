// Inventory Management
let inventoryState = {
  currentCategory: "crops",
  items: {
    crops: [],
    lines: [],
    locations: [],
    parameters: [],
    agronomy: [],
  },
  editingItemId: null,
  filterCrop: "",
  sortBy: "name",
};

function toggleCropFields(show) {
  const group = document.getElementById("cropTypeGroup");
  const input = document.getElementById("cropType");
  if (!group || !input) return;

  if (show) {
    group.classList.remove("hidden");
    input.setAttribute("required", "required");
  } else {
    group.classList.add("hidden");
    input.removeAttribute("required");
    input.value = "";
  }
}

function toggleLineFields(show) {
  const groups = [
    "lineCropGroup",
    "lineQuantityGroup",
    "lineStageGroup",
    "lineSeedOriginGroup",
    "lineArrivalDateGroup",
    "lineRegisteredDateGroup",
    "lineParentCodeGroup",
    "lineHybridCodeGroup",
    "lineSprCodeGroup",
    "lineRoleGroup",
  ];

  groups.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;
    if (show) {
      group.classList.remove("hidden");
    } else {
      group.classList.add("hidden");
    }
  });
}

function toggleLocationFields(show) {
  const groups = ["locationCoordGroup"];

  groups.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;
    if (show) {
      group.classList.remove("hidden");
    } else {
      group.classList.add("hidden");
    }
  });
}

function toggleParameterFields(show) {
  const groups = [
    "paramInitialGroup",
    "paramTypeGroup",
    "paramUnitGroup",
    "paramQuantityGroup",
    "paramPhotoGroup",
  ];

  groups.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;
    if (show) {
      group.classList.remove("hidden");
    } else {
      group.classList.add("hidden");
    }
  });

  // Show/hide DoO side panel
  const dooPanel = document.getElementById('modalDooPanel');
  const modal = document.getElementById('itemModal');
  if (dooPanel && modal) {
    if (show) {
      dooPanel.classList.remove('hidden');
      modal.classList.add('has-doo-panel');
    } else {
      dooPanel.classList.add('hidden');
      modal.classList.remove('has-doo-panel');
    }
  }

  // Hide conditional fields initially
  if (show) {
    handleParameterTypeChange();
  } else {
    const conditionalGroups = [
      "paramRangeGroup",
      "paramRadioGroup",
      "paramCheckboxGroup",
    ];
    conditionalGroups.forEach((id) => {
      const group = document.getElementById(id);
      if (group) group.classList.add("hidden");
    });
  }
}

function handleParameterTypeChange() {
  const typeSelect = document.getElementById("paramType");
  if (!typeSelect) return;

  const type = typeSelect.value;

  // Hide all conditional fields first
  document.getElementById("paramRangeGroup")?.classList.add("hidden");
  document.getElementById("paramRadioGroup")?.classList.add("hidden");
  document.getElementById("paramCheckboxGroup")?.classList.add("hidden");

  // Show relevant field based on type
  if (type === "range") {
    document.getElementById("paramRangeGroup")?.classList.remove("hidden");
  } else if (type === "radio") {
    document.getElementById("paramRadioGroup")?.classList.remove("hidden");
  } else if (type === "checkbox") {
    document.getElementById("paramCheckboxGroup")?.classList.remove("hidden");
  }
}

function togglePhotoModeGroup() {
  const photoCheckbox = document.getElementById("paramPhoto");
  const photoModeGroup = document.getElementById("paramPhotoModeGroup");
  if (!photoCheckbox || !photoModeGroup) return;
  
  if (photoCheckbox.checked) {
    photoModeGroup.classList.remove("hidden");
  } else {
    photoModeGroup.classList.add("hidden");
  }
}

function toggleAgronomyFields(show) {
  const groups = [
    "agronomyActivityGroup",
    "agronomyDapGroup",
    "agronomyChemicalGroup",
    "agronomyDoseGroup",
    "agronomyRemarkGroup",
  ];

  groups.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;
    if (show) {
      group.classList.remove("hidden");
    } else {
      group.classList.add("hidden");
    }
  });

  // Hide the generic name field for agronomy (activity IS the name)
  const nameField = document.getElementById("itemName");
  const nameGroup = nameField?.closest(".form-group");
  if (nameGroup) nameGroup.classList.toggle("hidden", show);

  // Show/hide Agronomy Crops side panel
  const agroCropsPanel = document.getElementById('modalAgroCropsPanel');
  const modal = document.getElementById('itemModal');
  if (agroCropsPanel && modal) {
    if (show) {
      agroCropsPanel.classList.remove('hidden');
      modal.classList.add('has-agro-crops-panel');
    } else {
      agroCropsPanel.classList.add('hidden');
      modal.classList.remove('has-agro-crops-panel');
    }
  }

  // Populate crop picklist when showing
  if (show) {
    populateAgronomyCropPicklist();
  }
}

// ---- Agronomy Crops Dual-Picklist Side Panel ----
let _agroCropSelected = []; // Array of selected crop IDs (in order)

function populateAgronomyCropPicklist(selectedCropIds = []) {
  _agroCropSelected = [...selectedCropIds];
  const searchInput = document.getElementById('agroCropSearch');
  const availableList = document.getElementById('agroCropAvailable');
  const selectedList = document.getElementById('agroCropSelected');
  const summary = document.getElementById('agroCropSummary');
  if (!availableList || !selectedList) return;

  const crops = inventoryState.items.crops || [];

  // Remove old listeners
  if (searchInput && searchInput._agroSearch) {
    searchInput.removeEventListener('input', searchInput._agroSearch);
  }

  function renderAvailable(searchTerm = '') {
    const term = searchTerm.toLowerCase();
    const available = crops.filter(c => !_agroCropSelected.includes(c.id) &&
      (!term || c.name.toLowerCase().includes(term)));

    if (available.length === 0) {
      availableList.innerHTML = '<div style="padding:0.5rem;text-align:center;font-size:0.75rem;color:var(--text-tertiary)">' +
        (crops.length === 0 ? 'No crops' : 'None') + '</div>';
    } else {
      availableList.innerHTML = available.map(c =>
        `<div class="agro-crop-item" draggable="true" data-id="${c.id}">${escapeHtml(c.name)}</div>`
      ).join('');
    }

    // Attach drag + click on available items
    availableList.querySelectorAll('.agro-crop-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (!_agroCropSelected.includes(id)) {
          _agroCropSelected.push(id);
          renderAvailable(searchInput?.value || '');
          renderSelected();
          updateSummary();
        }
      });
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
  }

  function renderSelected() {
    if (_agroCropSelected.length === 0) {
      selectedList.innerHTML = '<div style="padding:0.5rem;text-align:center;font-size:0.75rem;color:var(--text-tertiary)">Drag or click to add</div>';
    } else {
      selectedList.innerHTML = _agroCropSelected.map(id => {
        const crop = crops.find(c => c.id === id);
        if (!crop) return '';
        return `<div class="agro-crop-item" draggable="true" data-id="${id}">${escapeHtml(crop.name)}</div>`;
      }).join('');
    }

    // Attach drag + click on selected items
    selectedList.querySelectorAll('.agro-crop-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        _agroCropSelected = _agroCropSelected.filter(x => x !== id);
        renderAvailable(searchInput?.value || '');
        renderSelected();
        updateSummary();
      });
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      // Reorder drag-over within selected list
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const dragId = e.dataTransfer.getData('text/plain');
        const targetId = el.dataset.id;
        if (dragId === targetId) return;
        // If from available → add before target
        if (!_agroCropSelected.includes(dragId)) {
          const idx = _agroCropSelected.indexOf(targetId);
          _agroCropSelected.splice(idx, 0, dragId);
        } else {
          // Reorder within selected
          _agroCropSelected = _agroCropSelected.filter(x => x !== dragId);
          const idx = _agroCropSelected.indexOf(targetId);
          _agroCropSelected.splice(idx, 0, dragId);
        }
        renderAvailable(searchInput?.value || '');
        renderSelected();
        updateSummary();
      });
    });
  }

  function updateSummary() {
    if (!summary) return;
    summary.textContent = `${_agroCropSelected.length} crop(s) selected`;
  }

  // List-level drop handlers (drop on empty area)
  [availableList, selectedList].forEach(list => {
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!e.target.classList.contains('agro-crop-item')) {
        list.classList.add('drag-over-list');
      }
    });
    list.addEventListener('dragleave', (e) => {
      if (!list.contains(e.relatedTarget)) {
        list.classList.remove('drag-over-list');
      }
    });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      list.classList.remove('drag-over-list');
      if (e.target.classList.contains('agro-crop-item')) return; // handled by item drop
      const dragId = e.dataTransfer.getData('text/plain');
      const isSelected = list.dataset.list === 'selected';
      if (isSelected) {
        if (!_agroCropSelected.includes(dragId)) {
          _agroCropSelected.push(dragId);
        }
      } else {
        _agroCropSelected = _agroCropSelected.filter(x => x !== dragId);
      }
      renderAvailable(searchInput?.value || '');
      renderSelected();
      updateSummary();
    });
  });

  // Search handler
  if (searchInput) {
    searchInput.value = '';
    searchInput._agroSearch = () => renderAvailable(searchInput.value);
    searchInput.addEventListener('input', searchInput._agroSearch);
  }

  renderAvailable();
  renderSelected();
  updateSummary();
}

function getAgroCropSelectedIds() {
  return [..._agroCropSelected];
}

// Legacy alias (backwards compat)
function populateAgronomyCropCheckboxes(selectedCropIds = []) {
  populateAgronomyCropPicklist(selectedCropIds);
}

// Populate Days of Observation panel: crop select + range inputs
let _dooTempData = {}; // Temporary store for DoO values while editing

function populateParamDoo(existingDoo = {}) {
  _dooTempData = {};
  const cropSelect = document.getElementById('dooCropSelect');
  const minInput = document.getElementById('dooRangeMin');
  const maxInput = document.getElementById('dooRangeMax');
  const summary = document.getElementById('dooSummary');
  if (!cropSelect || !minInput || !maxInput) return;

  const crops = inventoryState.items.crops || [];

  // Normalize existing data: support both number and {min,max} formats
  crops.forEach(crop => {
    const val = existingDoo[crop.id];
    if (val != null) {
      if (typeof val === 'object' && val.min != null) {
        _dooTempData[crop.id] = { min: val.min, max: val.max ?? val.min };
      } else {
        _dooTempData[crop.id] = { min: Number(val), max: Number(val) };
      }
    }
  });

  // Populate crop select
  cropSelect.innerHTML = '<option value="">Select crop</option>' +
    crops.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  cropSelect.value = '';
  minInput.value = '';
  maxInput.value = '';

  // Remove old listeners
  cropSelect.removeEventListener('change', cropSelect._dooChange);
  minInput.removeEventListener('input', minInput._dooInput);
  maxInput.removeEventListener('input', maxInput._dooInput);

  // Crop select change: load saved values for that crop
  cropSelect._dooChange = () => {
    const cid = cropSelect.value;
    if (!cid) { minInput.value = ''; maxInput.value = ''; return; }
    const saved = _dooTempData[cid];
    minInput.value = saved ? saved.min : '';
    maxInput.value = saved ? saved.max : '';
  };
  cropSelect.addEventListener('change', cropSelect._dooChange);

  // Save on input change
  const saveCurrent = () => {
    const cid = cropSelect.value;
    if (!cid) return;
    const vMin = minInput.value.trim();
    const vMax = maxInput.value.trim();
    if (vMin !== '' || vMax !== '') {
      _dooTempData[cid] = { min: vMin !== '' ? Number(vMin) : 0, max: vMax !== '' ? Number(vMax) : (vMin !== '' ? Number(vMin) : 0) };
    } else {
      delete _dooTempData[cid];
    }
    renderDooSummary();
  };
  minInput._dooInput = saveCurrent;
  maxInput._dooInput = saveCurrent;
  minInput.addEventListener('input', minInput._dooInput);
  maxInput.addEventListener('input', maxInput._dooInput);

  renderDooSummary();
}

function renderDooSummary() {
  const summary = document.getElementById('dooSummary');
  if (!summary) return;
  const crops = inventoryState.items.crops || [];
  const entries = Object.entries(_dooTempData);
  if (entries.length === 0) {
    summary.innerHTML = '<span style="font-size:0.75rem;color:var(--text-tertiary)">No DoO set</span>';
    return;
  }
  summary.innerHTML = entries.map(([cid, val]) => {
    const crop = crops.find(c => c.id === cid);
    const name = crop ? escapeHtml(crop.name) : 'Unknown';
    const display = val.min === val.max ? `${val.min}` : `${val.min}–${val.max}`;
    return `<div class="modal-doo-summary-row"><span class="modal-doo-summary-crop" title="${name}">${name}</span><span class="modal-doo-summary-val">${display}</span></div>`;
  }).join('');
}

// Collect DoO values from temp store
function collectParamDoo() {
  return { ..._dooTempData };
}

// Update inventory filter controls based on current category
function updateInventoryFilters() {
  const container = document.getElementById('inventoryFilterContainer');
  const cropSelect = document.getElementById('inventoryFilterCrop');
  const sortSelect = document.getElementById('inventorySortBy');
  if (!container) return;

  const cat = inventoryState.currentCategory;
  // Show filters for parameters and agronomy
  if (cat === 'parameters' || cat === 'agronomy') {
    container.style.display = 'flex';
    // Populate crop filter
    const crops = inventoryState.items.crops || [];
    cropSelect.innerHTML = '<option value="">All Crops</option>' +
      crops.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    cropSelect.value = inventoryState.filterCrop || '';
    sortSelect.value = inventoryState.sortBy || 'name';
  } else {
    container.style.display = 'none';
  }
}

function updateLineCropOptions() {
  const select = document.getElementById("lineCrop");
  if (!select) return;

  const crops = inventoryState.items.crops || [];

  select.innerHTML = [
    '<option value="">Select crop</option>',
    ...crops.map(
      (crop) => `<option value="${crop.id}">${escapeHtml(crop.name)}</option>`,
    ),
  ].join("");
}

function updateCropTypeSuggestions() {
  const datalist = document.getElementById("cropTypeList");
  if (!datalist) return;

  const types = inventoryState.items.crops
    .map((item) => (item.cropType || "").trim())
    .filter((type) => type.length > 0);

  const uniqueTypes = Array.from(new Set(types)).sort((a, b) =>
    a.localeCompare(b),
  );

  datalist.innerHTML = uniqueTypes
    .map((type) => `<option value="${escapeHtml(type)}"></option>`)
    .join("");
}

// Initialize inventory
async function initializeInventory(options = {}) {
  const onProgress = options.onProgress;
  let hasCache = false;

  try {
    const cached = typeof loadLocalCache === "function"
      ? loadLocalCache("inventory")
      : null;

    if (cached?.items) {
      inventoryState.items = cached.items;
      // Ensure agronomy array exists (migration for older caches)
      if (!inventoryState.items.agronomy) {
        inventoryState.items.agronomy = [];
      }
      hasCache = true;

      // Migrate lines - ensure cropId is set from crop field if missing
      if (inventoryState.items.lines && inventoryState.items.crops) {
        inventoryState.items.lines.forEach((line) => {
          if (!line.cropId && line.crop) {
            line.cropId = line.crop;
          }
        });
      }

      updateDashboardCounts();
      inventoryState.currentCategory = inventoryState.currentCategory || "crops";
      switchCategory(inventoryState.currentCategory);
      updateCropTypeSuggestions();

      if (onProgress) {
        onProgress(0.15, "Loaded inventory from device");
      }
    }

    // Load items for all categories from Drive (skip for guest)
    const isGuest = typeof getCurrentUser === 'function' && getCurrentUser()?.isGuest;
    if (!isGuest) {
      const total = CATEGORIES.length;
      let done = 0;
      for (const category of CATEGORIES) {
        const key = category.toLowerCase();
        
        // Add to sync queue for visibility
        if (typeof enqueueSync === 'function') {
          enqueueSync({
            label: `Load ${category}`,
            run: async () => {
              inventoryState.items[key] = await loadItemsFromGoogleDrive(category);
              done += 1;
              if (onProgress) {
                onProgress(done / total, `Syncing ${category}...`);
              }
              
              // Update UI after each category
              updateDashboardCounts();
              if (inventoryState.currentCategory === key) {
                switchCategory(inventoryState.currentCategory);
              }
              updateCropTypeSuggestions();
              
              if (typeof saveLocalCache === 'function') {
                saveLocalCache('inventory', { items: inventoryState.items });
              }
            }
          });
        } else {
          inventoryState.items[key] = await loadItemsFromGoogleDrive(category);
          done += 1;
          if (onProgress) {
            onProgress(done / total, `Syncing ${category}...`);
          }
        }
      }
    }

    // Migrate lines - ensure cropId is set from crop field if missing
    if (inventoryState.items.lines && inventoryState.items.crops) {
      inventoryState.items.lines.forEach((line) => {
        if (!line.cropId && line.crop) {
          line.cropId = line.crop;
        }
      });
    }

    updateDashboardCounts();
    inventoryState.currentCategory = inventoryState.currentCategory || "crops";
    switchCategory(inventoryState.currentCategory);
    updateCropTypeSuggestions();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("inventory", { items: inventoryState.items });
    }

    if (onProgress) {
      onProgress(1, "Inventory synced");
    }
  } catch (error) {
    console.error("Error initializing inventory:", error);
    if (!hasCache) {
      showToast("Error loading inventory data. Please refresh the page.", "error");
    }
  }
}

// Switch category
function switchCategory(category) {
  const key = category.toLowerCase();
  // Don't allow switching to 'lines' - it's merged with crops
  if (key === "lines") {
    return;
  }
  inventoryState.currentCategory = key;

  if (typeof syncInventoryNavState === "function") {
    syncInventoryNavState(key);
  }

  // Update title
  const categoryTitle = {
    crops: "Crops",
    locations: "Locations",
    parameters: "Parameters",
    agronomy: "Agronomy",
  };
  document.getElementById("categoryTitle").textContent = categoryTitle[key];

  toggleCropFields(key === "crops");
  toggleLineFields(key === "crops"); // Show line fields when editing lines from crops
  toggleLocationFields(key === "locations");
  toggleParameterFields(key === "parameters");
  toggleAgronomyFields(key === "agronomy");
  if (key === "crops") {
    updateCropTypeSuggestions();
    updateLineCropOptions();
  }

  // Update inventory filters
  updateInventoryFilters();

  // Update import/export buttons visibility
  updateImportExportVisibility();

  // Render items
  renderInventoryItems();
}

// Render inventory items
function renderInventoryItems() {
  const container = document.getElementById("inventoryList");
  let items = [...(inventoryState.items[inventoryState.currentCategory] || [])];
  const isCrops = inventoryState.currentCategory === "crops";
  const isLocations = inventoryState.currentCategory === "locations";
  const isParameters = inventoryState.currentCategory === "parameters";
  const isAgronomy = inventoryState.currentCategory === "agronomy";

  // Apply filters for parameters and agronomy
  if ((isParameters || isAgronomy) && inventoryState.filterCrop) {
    const cropId = inventoryState.filterCrop;
    if (isParameters) {
      items = items.filter(p => {
        if (!p.daysOfObservation) return false;
        const val = p.daysOfObservation[cropId];
        if (val == null) return false;
        return typeof val === 'object' ? (val.min != null || val.max != null) : true;
      });
    } else if (isAgronomy) {
      items = items.filter(a => a.cropIds && a.cropIds.includes(cropId));
    }
  }

  // Apply sorting
  if ((isParameters || isAgronomy) && inventoryState.sortBy === 'updatedAt') {
    items.sort((a, b) => {
      const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return db - da; // newest first
    });
  } else if ((isParameters || isAgronomy) && inventoryState.sortBy === 'name') {
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  // Toggle agronomy-view class for full-width table layout
  container.classList.toggle("agronomy-view", isAgronomy);

  if (items.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-rounded">inbox</span>
                <p>No items yet. Create your first item to get started.</p>
            </div>
        `;
    return;
  }

  // Special rendering for Crops with nested Lines
  if (isCrops) {
    container.innerHTML = items
      .map((crop, idx) => {
        const relatedLines = inventoryState.items.lines.filter((line) => {
          // Match by cropId (new way)
          if (line.cropId === crop.id) {
            return true;
          }
          // Match by crop field (legacy way)
          if (line.crop === crop.id) {
            return true;
          }

          return false;
        });

        return `
                <div class="inventory-item-group">
                    <div class="inventory-item" data-crop-id="${crop.id}">
                        <div class="item-meta">
                            <div class="item-name">${escapeHtml(crop.name)}</div>
                            <div class="item-subtext">Type: ${crop.cropType ? `${escapeHtml(crop.cropType)}` : "-"}</div>
                            <div class="item-subtext">Lines: ${relatedLines.length > 0 ? `${relatedLines.length}` : "-"}</div>
                        </div>
                        <div class="item-actions">
                            <button class="expand-crop-btn" data-crop-id="${crop.id}" title="View Lines">
                                <span class="material-symbols-rounded">visibility</span>
                            </button>
                            <button class="edit-btn" data-id="${crop.id}" title="Edit">
                                <span class="material-symbols-rounded">edit</span>
                            </button>
                            <button class="delete-btn" data-id="${crop.id}" title="Delete">
                                <span class="material-symbols-rounded">delete</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
      })
      .join("");

    // Add event listeners for crops
    container.querySelectorAll(".expand-crop-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cropId = btn.dataset.cropId;
        showCropLinesPopup(cropId);
      });
    });

    container.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        const category = btn.dataset.category || "crops";
        const prevCategory = inventoryState.currentCategory;
        inventoryState.currentCategory = category;
        openEditModal(itemId);
        setTimeout(() => {
          inventoryState.currentCategory = prevCategory;
        }, 0);
      });
    });

    container.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        const category = btn.dataset.category || "crops";
        const prevCategory = inventoryState.currentCategory;
        inventoryState.currentCategory = category;
        deleteItem(itemId);
        inventoryState.currentCategory = prevCategory;
      });
    });
  } else if (isAgronomy) {
    // Table rendering for Agronomy
    const resolveCropNames = (cropIds) => {
      if (!cropIds || !Array.isArray(cropIds)) return "-";
      return cropIds.map(id => {
        const crop = inventoryState.items.crops.find(c => c.id === id);
        return crop ? escapeHtml(crop.name) : "Unknown";
      }).join(", ") || "-";
    };

    const formatDap = (item) => {
      if (item.dapMin != null && item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin) {
        return `${item.dapMin}-${item.dapMax}`;
      }
      return item.dapMin != null ? `${item.dapMin}` : "-";
    };

    container.innerHTML = `
      <div class="agronomy-table-wrapper">
        <table class="agronomy-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Crops</th>
              <th>DAP</th>
              <th>Chemical</th>
              <th>Dose</th>
              <th>Remark</th>
              <th class="agronomy-table-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td class="agronomy-cell-activity">${escapeHtml(item.activity || item.name || "-")}</td>
                <td>${resolveCropNames(item.cropIds)}</td>
                <td class="agronomy-cell-dap">${formatDap(item)}</td>
                <td>${escapeHtml(item.chemical || "-")}</td>
                <td>${escapeHtml(item.dose || "-")}</td>
                <td class="agronomy-cell-remark">${escapeHtml(item.remark || "-")}</td>
                <td class="agronomy-table-actions">
                  <button class="edit-btn" data-id="${item.id}" title="Edit">
                    <span class="material-symbols-rounded">edit</span>
                  </button>
                  <button class="delete-btn" data-id="${item.id}" title="Delete">
                    <span class="material-symbols-rounded">delete</span>
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    // Add event listeners
    container.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(btn.dataset.id);
      });
    });
    container.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteItem(btn.dataset.id);
      });
    });
  } else {
    // Standard rendering for Locations and Parameters
    container.innerHTML = items
      .map((item) => {
        const locationMeta = "";

        const paramMeta = isParameters
          ? `
                <div class="item-subtext">Type: ${escapeHtml(item.type || "-")} · Initial: ${escapeHtml(item.initial || "-")} · Unit: ${escapeHtml(item.unit || "-")}</div>${item.updatedAt ? `<div class="item-subtext item-updated">Last updated: ${new Date(item.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>` : ''}
            `
          : "";

        // Add map preview for locations
        const mapPreview = isLocations
          ? `<div id="locationPreviewMap${item.id}" class="location-preview-map"></div>`
          : "";

        return `
                <div class="inventory-item${isLocations ? ' location-item' : ''}">
                    ${mapPreview}
                    <div class="item-meta">
                        <div class="item-name">${escapeHtml(item.name)}</div>
                        ${locationMeta || paramMeta}
                    </div>
                    <div class="item-actions">
                        <button class="edit-btn" data-id="${item.id}" title="Edit">
                            <span class="material-symbols-rounded">edit</span>
                        </button>
                        <button class="delete-btn" data-id="${item.id}" title="Delete">
                            <span class="material-symbols-rounded">delete</span>
                        </button>
                    </div>
                </div>
            `;
      })
      .join("");

    // Initialize location preview maps
    if (isLocations) {
      items.forEach((location) => {
        renderLocationPreviewMap(location);
      });
    }

    // Add event listeners
    container.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        openEditModal(itemId);
      });
    });

    container.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        deleteItem(itemId);
      });
    });
  }
}

// Open add item modal
function openAddModal() {
  inventoryState.editingItemId = null;
  document.getElementById("modalTitle").textContent = "Add New Item";
  document.getElementById("itemName").value = "";
  document.getElementById("itemForm").reset();
  toggleCropFields(inventoryState.currentCategory === "crops");
  if (inventoryState.currentCategory === "crops") {
    updateCropTypeSuggestions();
    document.getElementById("cropType").value = "";
  }
  toggleLineFields(inventoryState.currentCategory === "lines");
  if (inventoryState.currentCategory === "lines") {
    updateLineCropOptions();
    // Make sure lineCropGroup is visible for normal "Add Line" modal
    const lineCropGroup = document.getElementById("lineCropGroup");
    if (lineCropGroup) {
      lineCropGroup.classList.remove("hidden");
    }
    document.getElementById("lineCrop").value = "";
    document.getElementById("lineQuantity").value = "";
    document.getElementById("lineStage").value = "";
    document.getElementById("lineSeedOrigin").value = "";
    document.getElementById("lineArrivalDate").value = "";
    document.getElementById("lineRegisteredDate").value = "";
    document.getElementById("lineParentCode").value = "";
    document.getElementById("lineHybridCode").value = "";
    document.getElementById("lineSprCode").value = "";
    document.getElementById("lineRole").value = "";
  }
  toggleLocationFields(inventoryState.currentCategory === "locations");
  if (inventoryState.currentCategory === "locations") {
    document.getElementById("locationCoord").value = "";
    initializeLocationMap();
  }
  toggleParameterFields(inventoryState.currentCategory === "parameters");
  if (inventoryState.currentCategory === "parameters") {
    document.getElementById("paramInitial").value = "";
    document.getElementById("paramType").value = "";
    document.getElementById("paramRangeMin").value = "";
    document.getElementById("paramRangeMax").value = "";
    document.getElementById("paramRadio").value = "";
    document.getElementById("paramCheckbox").value = "";
    document.getElementById("paramUnit").value = "";
    document.getElementById("paramQuantity").value = "1";
    document.getElementById("paramPhoto").checked = false;
    
    // Reset photo mode
    const photoModeRadios = document.querySelectorAll('input[name="photoMode"]');
    if (photoModeRadios.length > 0) photoModeRadios[0].checked = true;
    
    // Hide photo mode group initially
    togglePhotoModeGroup();
    
    // Setup photo checkbox listener
    const photoCheckbox = document.getElementById("paramPhoto");
    if (photoCheckbox) {
      photoCheckbox.removeEventListener("change", togglePhotoModeGroup);
      photoCheckbox.addEventListener("change", togglePhotoModeGroup);
    }
    
    // Setup type change listener
    const typeSelect = document.getElementById("paramType");
    if (typeSelect) {
      typeSelect.removeEventListener("change", handleParameterTypeChange);
      typeSelect.addEventListener("change", handleParameterTypeChange);
    }
    
    // Populate DoO inputs
    populateParamDoo();
  }
  toggleAgronomyFields(inventoryState.currentCategory === "agronomy");
  if (inventoryState.currentCategory === "agronomy") {
    document.getElementById("agronomyActivity").value = "";
    document.getElementById("agronomyDapMin").value = "";
    document.getElementById("agronomyDapMax").value = "";
    document.getElementById("agronomyChemical").value = "";
    document.getElementById("agronomyDose").value = "";
    document.getElementById("agronomyRemark").value = "";
    populateAgronomyCropCheckboxes();
  }
  document.getElementById("itemModal").classList.add("active");
  document.getElementById("itemName").focus();
}

// Show crop lines popup (library-preview-modal style)
function showCropLinesPopup(cropId) {
  const crop = inventoryState.items.crops.find((c) => c.id === cropId);
  if (!crop) return;

  const relatedLines = inventoryState.items.lines.filter((line) => {
    return line.cropId === crop.id || line.crop === crop.id;
  });

  // Remove existing popup if any
  const existing = document.getElementById("cropLinesPopup");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.id = "cropLinesPopup";
  popup.className = "library-preview-modal active crop-lines-popup";
  popup.innerHTML = `
    <div class="library-preview-modal-content crop-lines-popup-content">
      <div class="library-detail-header">
        <div class="library-detail-info">
          <h3>${escapeHtml(crop.name)} — Lines</h3>
          <p class="library-detail-meta">${crop.cropType ? escapeHtml(crop.cropType) + ' · ' : ''}${relatedLines.length} line(s)</p>
        </div>
        <div class="library-detail-actions">
          <button class="btn btn-primary" id="cropLinesAddBtn">
            <span class="material-symbols-rounded">add</span>
            <span>Add Line</span>
          </button>
          <button class="btn btn-secondary" id="cropLinesCloseBtn">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
      </div>
      <div class="library-preview crop-lines-preview">
        ${relatedLines.length === 0
          ? `<div class="crop-lines-empty">
              <span class="material-symbols-rounded">eco</span>
              <p>No lines yet for this crop.</p>
            </div>`
          : `<div class="crop-lines-list">
              ${relatedLines.map((line) => {
                const metaParts = [];
                if (line.stage) metaParts.push('Stage: ' + escapeHtml(line.stage));
                if (line.quantity != null && line.quantity !== '') metaParts.push('Qty: ' + line.quantity);
                if (line.seedOrigin) metaParts.push('Seed: ' + escapeHtml(line.seedOrigin));
                if (line.role) metaParts.push('Role: ' + escapeHtml(line.role));
                if (line.sprCode) metaParts.push('SPR: ' + escapeHtml(line.sprCode));
                if (line.parentCode) metaParts.push('Parent: ' + escapeHtml(line.parentCode));
                if (line.hybridCode) metaParts.push('Hybrid: ' + escapeHtml(line.hybridCode));
                if (line.arrivalDate) metaParts.push('Arrival: ' + escapeHtml(line.arrivalDate));
                if (line.registeredDate) metaParts.push('Reg: ' + escapeHtml(line.registeredDate));
                const metaLine1 = metaParts.slice(0, 4).join(' · ');
                const metaLine2 = metaParts.slice(4).join(' · ');
                return `
                <div class="inventory-item">
                  <div class="item-meta">
                    <div class="item-name crop-line-name">${escapeHtml(line.name)}</div>
                    ${metaLine1 ? `<div class="item-subtext">${metaLine1}</div>` : `<div class="item-subtext">No details</div>`}
                    ${metaLine2 ? `<div class="item-subtext">${metaLine2}</div>` : ''}
                  </div>
                  <div class="item-actions">
                    <button class="popup-line-edit-btn" data-id="${line.id}" title="Edit">
                      <span class="material-symbols-rounded">edit</span>
                    </button>
                    <button class="popup-line-delete-btn" data-id="${line.id}" title="Delete">
                      <span class="material-symbols-rounded">delete</span>
                    </button>
                  </div>
                </div>`;
              }).join("")}
            </div>`
        }
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Close button
  popup.querySelector("#cropLinesCloseBtn").addEventListener("click", () => {
    popup.remove();
  });

  // Click backdrop to close
  popup.addEventListener("click", (e) => {
    if (e.target === popup) popup.remove();
  });

  // Add line button
  popup.querySelector("#cropLinesAddBtn").addEventListener("click", () => {
    popup.remove();
    openAddLineForCropModal(crop);
  });

  // Edit line buttons
  popup.querySelectorAll(".popup-line-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const lineId = btn.dataset.id;
      popup.remove();
      const prevCategory = inventoryState.currentCategory;
      inventoryState.currentCategory = "lines";
      openEditModal(lineId);
      setTimeout(() => {
        inventoryState.currentCategory = prevCategory;
      }, 0);
    });
  });

  // Delete line buttons
  popup.querySelectorAll(".popup-line-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const lineId = btn.dataset.id;
      const prevCategory = inventoryState.currentCategory;
      inventoryState.currentCategory = "lines";
      deleteItem(lineId);
      inventoryState.currentCategory = prevCategory;
      popup.remove();
    });
  });
}

// Open add line for crop modal
function openAddLineForCropModal(crop) {
  inventoryState.editingItemId = null;
  inventoryState.currentCategory = "lines"; // Set category to lines for saving

  document.getElementById("modalTitle").textContent =
    `Add Line to ${escapeHtml(crop.name)}`;
  document.getElementById("itemName").value = "";

  // Hide crops fields, show lines fields
  toggleCropFields(false);
  toggleLineFields(true);

  // Make sure line crop options are loaded
  updateLineCropOptions();

  // Hide the crop select field since we already know the crop
  const lineCropGroup = document.getElementById("lineCropGroup");
  if (lineCropGroup) {
    lineCropGroup.classList.add("hidden");
  }

  // Pre-fill the crop - do this AFTER updateLineCropOptions
  const lineCropSelect = document.getElementById("lineCrop");
  if (lineCropSelect) {
    lineCropSelect.value = crop.id;
  }

  // Reset other line fields (but not lineCrop)
  document.getElementById("lineQuantity").value = "";
  document.getElementById("lineStage").value = "";
  document.getElementById("lineSeedOrigin").value = "";
  document.getElementById("lineArrivalDate").value = "";
  document.getElementById("lineRegisteredDate").value = "";
  document.getElementById("lineParentCode").value = "";
  document.getElementById("lineHybridCode").value = "";
  document.getElementById("lineSprCode").value = "";
  document.getElementById("lineRole").value = "";

  document.getElementById("itemModal").classList.add("active");
  document.getElementById("itemName").focus();
}

// Open edit item modal
function openEditModal(itemId) {
  inventoryState.editingItemId = itemId;
  const item = inventoryState.items[inventoryState.currentCategory].find(
    (i) => i.id === itemId,
  );

  if (!item) return;

  document.getElementById("modalTitle").textContent = "Edit Item";
  document.getElementById("itemName").value = item.name;
  toggleCropFields(inventoryState.currentCategory === "crops");
  if (inventoryState.currentCategory === "crops") {
    updateCropTypeSuggestions();
    document.getElementById("cropType").value = item.cropType || "";
  }
  toggleLineFields(inventoryState.currentCategory === "lines");
  if (inventoryState.currentCategory === "lines") {
    updateLineCropOptions();
    document.getElementById("lineCrop").value = item.cropId || item.crop || "";
    document.getElementById("lineQuantity").value = item.quantity ?? "";
    document.getElementById("lineStage").value = item.stage || "";
    document.getElementById("lineSeedOrigin").value = item.seedOrigin || "";
    document.getElementById("lineArrivalDate").value = item.arrivalDate || "";
    document.getElementById("lineRegisteredDate").value =
      item.registeredDate || "";
    document.getElementById("lineParentCode").value = item.parentCode || "";
    document.getElementById("lineHybridCode").value = item.hybridCode || "";
    document.getElementById("lineSprCode").value = item.sprCode || "";
    document.getElementById("lineRole").value = item.role || "";
  }
  toggleLocationFields(inventoryState.currentCategory === "locations");
  if (inventoryState.currentCategory === "locations") {
    document.getElementById("locationCoord").value = item.coordinates || "";
    initializeLocationMap(item.coordinates);
  }
  toggleParameterFields(inventoryState.currentCategory === "parameters");
  if (inventoryState.currentCategory === "parameters") {
    document.getElementById("paramInitial").value = item.initial || "";
    document.getElementById("paramType").value = item.type || "";
    
    // Handle new range fields with backward compatibility
    if (item.rangeMin !== undefined && item.rangeMax !== undefined) {
      document.getElementById("paramRangeMin").value = item.rangeMin;
      document.getElementById("paramRangeMax").value = item.rangeMax;
    } else if (item.rangeDefinition) {
      // Parse legacy format "min-max"
      const parts = item.rangeDefinition.split("-");
      if (parts.length === 2) {
        document.getElementById("paramRangeMin").value = parts[0].trim();
        document.getElementById("paramRangeMax").value = parts[1].trim();
      }
    }
    
    document.getElementById("paramRadio").value = item.radioOptions || "";
    document.getElementById("paramCheckbox").value = item.checkboxOptions || "";
    document.getElementById("paramUnit").value = item.unit || "";
    document.getElementById("paramQuantity").value = item.numberOfSamples ?? item.quantity ?? 1;
    document.getElementById("paramPhoto").checked = item.requirePhoto || false;
    
    // Set photo mode radio buttons
    const photoMode = item.photoMode || 'per-sample';
    const photoModeRadio = document.querySelector(`input[name="photoMode"][value="${photoMode}"]`);
    if (photoModeRadio) photoModeRadio.checked = true;
    
    // Show/hide photo mode based on requirePhoto
    togglePhotoModeGroup();

    // Setup type change listener
    const typeSelect = document.getElementById("paramType");
    if (typeSelect) {
      typeSelect.removeEventListener("change", handleParameterTypeChange);
      typeSelect.addEventListener("change", handleParameterTypeChange);
      handleParameterTypeChange(); // Trigger to show correct conditional field
    }
    
    // Setup photo checkbox listener
    const photoCheckbox = document.getElementById("paramPhoto");
    if (photoCheckbox) {
      photoCheckbox.removeEventListener("change", togglePhotoModeGroup);
      photoCheckbox.addEventListener("change", togglePhotoModeGroup);
    }
    
    // Populate DoO inputs with existing data
    populateParamDoo(item.daysOfObservation || {});
  }
  toggleAgronomyFields(inventoryState.currentCategory === "agronomy");
  if (inventoryState.currentCategory === "agronomy") {
    document.getElementById("agronomyActivity").value = item.activity || "";
    document.getElementById("agronomyDapMin").value = item.dapMin ?? "";
    document.getElementById("agronomyDapMax").value = item.dapMax ?? "";
    document.getElementById("agronomyChemical").value = item.chemical || "";
    document.getElementById("agronomyDose").value = item.dose || "";
    document.getElementById("agronomyRemark").value = item.remark || "";
    populateAgronomyCropCheckboxes(item.cropIds || []);
  }
  document.getElementById("itemModal").classList.add("active");
  document.getElementById("itemName").focus();
}

// Close modal
function closeModal() {
  document.getElementById("itemModal").classList.remove("active");
  inventoryState.editingItemId = null;
  document.getElementById("itemForm").reset();
  const cropTypeInput = document.getElementById("cropType");
  if (cropTypeInput) {
    cropTypeInput.value = "";
  }
  const lineFields = [
    "lineCrop",
    "lineQuantity",
    "lineStage",
    "lineSeedOrigin",
    "lineArrivalDate",
    "lineRegisteredDate",
    "lineParentCode",
    "lineHybridCode",
    "lineSprCode",
    "lineRole",
  ];
  lineFields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });
  const locationFields = ["locationCoord"];
  locationFields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });
  const paramFields = [
    "paramInitial",
    "paramType",
    "paramRangeMin",
    "paramRangeMax",
    "paramRadio",
    "paramCheckbox",
    "paramUnit",
    "paramQuantity",
  ];
  paramFields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });
  const paramPhoto = document.getElementById("paramPhoto");
  if (paramPhoto) paramPhoto.checked = false;

  // Reset DoO panel
  _dooTempData = {};
  const dooPanel = document.getElementById('modalDooPanel');
  const modal = document.getElementById('itemModal');
  if (dooPanel) dooPanel.classList.add('hidden');
  if (modal) modal.classList.remove('has-doo-panel');
  const dooCropSelect = document.getElementById('dooCropSelect');
  if (dooCropSelect) dooCropSelect.innerHTML = '';
  const dooMin = document.getElementById('dooRangeMin');
  const dooMax = document.getElementById('dooRangeMax');
  if (dooMin) dooMin.value = '';
  if (dooMax) dooMax.value = '';
  const dooSummary = document.getElementById('dooSummary');
  if (dooSummary) dooSummary.innerHTML = '';

  // Reset photo mode
  const photoModeRadios = document.querySelectorAll('input[name="photoMode"]');
  if (photoModeRadios.length > 0) photoModeRadios[0].checked = true;
  
  // Reset agronomy fields
  const agronomyFields = [
    "agronomyActivity",
    "agronomyDapMin",
    "agronomyDapMax",
    "agronomyChemical",
    "agronomyDose",
    "agronomyRemark",
  ];
  agronomyFields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });

  // Reset agronomy crops panel
  _agroCropSelected = [];
  const agroCropsPanel = document.getElementById('modalAgroCropsPanel');
  if (agroCropsPanel) agroCropsPanel.classList.add('hidden');
  if (modal) modal.classList.remove('has-agro-crops-panel');
  const agroCropSearch = document.getElementById('agroCropSearch');
  if (agroCropSearch) agroCropSearch.value = '';
  const agroCropAvailable = document.getElementById('agroCropAvailable');
  if (agroCropAvailable) agroCropAvailable.innerHTML = '';
  const agroCropSel = document.getElementById('agroCropSelected');
  if (agroCropSel) agroCropSel.innerHTML = '';
  const agroCropSummary = document.getElementById('agroCropSummary');
  if (agroCropSummary) agroCropSummary.textContent = '';
  
  destroyLocationMap();
}

// Save item
async function saveItem() {
  let name = document.getElementById("itemName").value.trim();
  const isCrops = inventoryState.currentCategory === "crops";
  const isLines = inventoryState.currentCategory === "lines";
  const isLocations = inventoryState.currentCategory === "locations";
  const isParameters = inventoryState.currentCategory === "parameters";
  const isAgronomy = inventoryState.currentCategory === "agronomy";

  // For agronomy, activity IS the item name
  if (isAgronomy) {
    const activityVal = document.getElementById("agronomyActivity")?.value.trim() || "";
    name = activityVal;
  }

  const cropTypeInput = document.getElementById("cropType");
  const cropType = isCrops && cropTypeInput ? cropTypeInput.value.trim() : "";

  const lineCrop = isLines
    ? document.getElementById("lineCrop")?.value.trim()
    : "";
  const lineQuantity = isLines
    ? document.getElementById("lineQuantity")?.value.trim()
    : "";
  const lineStage = isLines
    ? document.getElementById("lineStage")?.value.trim()
    : "";
  const lineSeedOrigin = isLines
    ? document.getElementById("lineSeedOrigin")?.value.trim()
    : "";
  const lineArrivalDate = isLines
    ? document.getElementById("lineArrivalDate")?.value
    : "";
  const lineRegisteredDate = isLines
    ? document.getElementById("lineRegisteredDate")?.value
    : "";
  const lineParentCode = isLines
    ? document.getElementById("lineParentCode")?.value.trim()
    : "";
  const lineHybridCode = isLines
    ? document.getElementById("lineHybridCode")?.value.trim()
    : "";
  const lineSprCode = isLines
    ? document.getElementById("lineSprCode")?.value.trim()
    : "";
  const lineRole = isLines
    ? document.getElementById("lineRole")?.value.trim()
    : "";

  const locationCoord = isLocations
    ? document.getElementById("locationCoord")?.value.trim()
    : "";

  const paramInitial = isParameters
    ? document.getElementById("paramInitial")?.value.trim()
    : "";
  const paramType = isParameters
    ? document.getElementById("paramType")?.value.trim()
    : "";
  const paramRangeMin = isParameters
    ? document.getElementById("paramRangeMin")?.value.trim()
    : "";
  const paramRangeMax = isParameters
    ? document.getElementById("paramRangeMax")?.value.trim()
    : "";
  const paramRadio = isParameters
    ? document.getElementById("paramRadio")?.value.trim()
    : "";
  const paramCheckbox = isParameters
    ? document.getElementById("paramCheckbox")?.value.trim()
    : "";
  const paramUnit = isParameters
    ? document.getElementById("paramUnit")?.value.trim()
    : "";
  const paramQuantity = isParameters
    ? document.getElementById("paramQuantity")?.value.trim()
    : "";
  const paramPhoto = isParameters
    ? document.getElementById("paramPhoto")?.checked
    : false;
  const paramPhotoMode = isParameters && paramPhoto
    ? document.querySelector('input[name="photoMode"]:checked')?.value || 'per-sample'
    : undefined;
  const paramDoo = isParameters ? collectParamDoo() : {};

  // Agronomy fields
  const agronomyCropIds = isAgronomy
    ? getAgroCropSelectedIds()
    : [];
  const agronomyActivity = isAgronomy
    ? document.getElementById("agronomyActivity")?.value.trim()
    : "";
  const agronomyDapMin = isAgronomy
    ? document.getElementById("agronomyDapMin")?.value.trim()
    : "";
  const agronomyDapMax = isAgronomy
    ? document.getElementById("agronomyDapMax")?.value.trim()
    : "";
  const agronomyChemical = isAgronomy
    ? document.getElementById("agronomyChemical")?.value.trim()
    : "";
  const agronomyDose = isAgronomy
    ? document.getElementById("agronomyDose")?.value.trim()
    : "";
  const agronomyRemark = isAgronomy
    ? document.getElementById("agronomyRemark")?.value.trim()
    : "";

  if (!name) {
    showToast("Please enter an item name", "error");
    return;
  }

  if (isCrops && !cropType) {
    showToast("Please enter a crop type", "error");
    return;
  }

  if (isLines) {
    if (!lineCrop) {
      showToast("Please select a crop", "error");
      return;
    }
    if (!lineQuantity) {
      showToast("Please enter quantity", "error");
      return;
    }
    if (!lineStage) {
      showToast("Please select a stage", "error");
      return;
    }
    if (!lineRole) {
      showToast("Please select a role", "error");
      return;
    }
  }

  if (isLocations) {
    if (!locationCoord) {
      showToast("Please select a location on the map", "error");
      return;
    }
  }

  if (isParameters) {
    if (!paramInitial) {
      showToast("Please enter parameter initial", "error");
      return;
    }
    if (!paramType) {
      showToast("Please select a type", "error");
      return;
    }
    if (paramType === "range" && (!paramRangeMin || !paramRangeMax)) {
      showToast("Please enter both minimum and maximum values for range", "error");
      return;
    }
    if (paramType === "range" && Number(paramRangeMin) >= Number(paramRangeMax)) {
      showToast("Minimum value must be less than maximum value", "error");
      return;
    }
    if (paramType === "radio" && !paramRadio) {
      showToast("Please enter radio options", "error");
      return;
    }
    if (paramType === "checkbox" && !paramCheckbox) {
      showToast("Please enter checkbox options", "error");
      return;
    }
  }

  if (isAgronomy) {
    if (agronomyCropIds.length === 0) {
      showToast("Please select at least one crop", "error");
      return;
    }
    if (!agronomyActivity) {
      showToast("Please enter an activity", "error");
      return;
    }
  }

  try {
    const category = inventoryState.currentCategory;
    let item;

    if (inventoryState.editingItemId) {
      // Update existing item
      item = inventoryState.items[category].find(
        (i) => i.id === inventoryState.editingItemId,
      );
      if (item) {
        item.name = name;
        if (isCrops) {
          item.cropType = cropType;
        }
        if (isLines) {
          item.crop = lineCrop;
          item.cropId = lineCrop;
          item.quantity = Number(lineQuantity);
          item.stage = lineStage;
          item.seedOrigin = lineSeedOrigin;
          item.arrivalDate = lineArrivalDate;
          item.registeredDate = lineRegisteredDate;
          item.parentCode = lineParentCode;
          item.hybridCode = lineHybridCode;
          item.sprCode = lineSprCode;
          item.role = lineRole;
        }
        if (isLocations) {
          item.coordinates = locationCoord;
        }
        if (isParameters) {
          item.initial = paramInitial;
          item.type = paramType;
          item.rangeMin = paramType === "range" ? Number(paramRangeMin) : undefined;
          item.rangeMax = paramType === "range" ? Number(paramRangeMax) : undefined;
          // Keep legacy rangeDefinition for backward compatibility
          item.rangeDefinition = paramType === "range" ? `${paramRangeMin}-${paramRangeMax}` : undefined;
          item.radioOptions = paramType === "radio" ? paramRadio : undefined;
          item.checkboxOptions =
            paramType === "checkbox" ? paramCheckbox : undefined;
          item.unit = paramUnit;
          item.numberOfSamples = paramQuantity ? Number(paramQuantity) : 1;
          item.requirePhoto = paramPhoto;
          item.photoMode = paramPhotoMode;
          item.daysOfObservation = paramDoo;
        }
        if (isAgronomy) {
          item.cropIds = agronomyCropIds;
          item.activity = agronomyActivity;
          item.dapMin = agronomyDapMin ? Number(agronomyDapMin) : null;
          item.dapMax = agronomyDapMax ? Number(agronomyDapMax) : null;
          item.chemical = agronomyChemical;
          item.dose = agronomyDose;
          item.remark = agronomyRemark;
        }
        item.updatedAt = new Date().toISOString();
      }
    } else {
      // Create new item
      item = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name,
        cropType: isCrops ? cropType : undefined,
        cropId: isLines ? lineCrop : undefined,
        crop: isLines ? lineCrop : undefined,
        quantity: isLines
          ? Number(lineQuantity)
          : isParameters && paramQuantity
            ? Number(paramQuantity)
            : undefined,
        stage: isLines ? lineStage : undefined,
        seedOrigin: isLines ? lineSeedOrigin : undefined,
        arrivalDate: isLines ? lineArrivalDate : undefined,
        registeredDate: isLines ? lineRegisteredDate : undefined,
        parentCode: isLines ? lineParentCode : undefined,
        hybridCode: isLines ? lineHybridCode : undefined,
        sprCode: isLines ? lineSprCode : undefined,
        role: isLines ? lineRole : undefined,
        coordinates: isLocations ? locationCoord : undefined,
        initial: isParameters ? paramInitial : undefined,
        type: isParameters ? paramType : undefined,
        rangeMin:
          isParameters && paramType === "range" ? Number(paramRangeMin) : undefined,
        rangeMax:
          isParameters && paramType === "range" ? Number(paramRangeMax) : undefined,
        rangeDefinition:
          isParameters && paramType === "range" ? `${paramRangeMin}-${paramRangeMax}` : undefined,
        radioOptions:
          isParameters && paramType === "radio" ? paramRadio : undefined,
        checkboxOptions:
          isParameters && paramType === "checkbox" ? paramCheckbox : undefined,
        unit: isParameters ? paramUnit : undefined,
        numberOfSamples: isParameters && paramQuantity ? Number(paramQuantity) : 1,
        requirePhoto: isParameters ? paramPhoto : undefined,
        photoMode: isParameters ? paramPhotoMode : undefined,
        daysOfObservation: isParameters ? paramDoo : undefined,
        cropIds: isAgronomy ? agronomyCropIds : undefined,
        activity: isAgronomy ? agronomyActivity : undefined,
        dapMin: isAgronomy && agronomyDapMin ? Number(agronomyDapMin) : undefined,
        dapMax: isAgronomy && agronomyDapMax ? Number(agronomyDapMax) : undefined,
        chemical: isAgronomy ? agronomyChemical : undefined,
        dose: isAgronomy ? agronomyDose : undefined,
        remark: isAgronomy ? agronomyRemark : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      inventoryState.items[category].push(item);
    }

    if (!item) {
      throw new Error("Failed to create/update item object");
    }

    // Save to Google Drive
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    console.log(`Queueing save - Category: ${categoryName}, Item:`, item);
    enqueueSync({
      label: `Save ${categoryName}: ${item.name}`,
      run: () => saveItemToGoogleDrive(categoryName, item),
    });

    // Update dashboard
    updateDashboardCounts();

    if (isCrops) {
      updateCropTypeSuggestions();
    }
    if (isLines) {
      updateLineCropOptions();
      // Switch back to crops view after adding a line
      inventoryState.currentCategory = "crops";
    }

    // Render items
    renderInventoryItems();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("inventory", { items: inventoryState.items });
    }

    // Close modal
    closeModal();

    // Show success message
    showSuccessMessage("Item saved locally. Syncing in background.");
  } catch (error) {
    console.error("Error saving item:", error);
    showErrorMessage(`Error saving item: ${error.message}`);
  }
}

// Delete item
function deleteItem(itemId) {
  showConfirmModal(
    "Delete Item",
    "Are you sure you want to delete this item? This action cannot be undone.",
    async () => {
      try {
        const category = inventoryState.currentCategory;
        const itemIndex = inventoryState.items[category].findIndex(
          (i) => i.id === itemId,
        );
        const removedItem = inventoryState.items[category][itemIndex];

        if (itemIndex >= 0) {
          inventoryState.items[category].splice(itemIndex, 1);
        }

        // Delete from Google Drive
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        enqueueSync({
          label: `Delete ${categoryName}: ${removedItem?.name || itemId}`,
          run: () => deleteItemFromGoogleDrive(categoryName, itemId),
        });

        // Update dashboard
        updateDashboardCounts();

        if (category === "crops") {
          updateCropTypeSuggestions();
        }

        // Render items
        renderInventoryItems();

        if (typeof saveLocalCache === "function") {
          saveLocalCache("inventory", { items: inventoryState.items });
        }
        
        showToast("Item deleted", "success");
      } catch (error) {
        console.error("Error deleting item:", error);
        showToast("Error deleting item. Please try again.", "error");
      }
    }
  );
}

// Update dashboard counts
async function updateDashboardCounts() {
  try {
    for (const category of CATEGORIES) {
      const key = category.toLowerCase();
      const count = inventoryState.items[key].length;
      const elementId = `${key}Count`;
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = `${count} ${count === 1 ? "item" : "items"}`;
      }
    }
    
    // Also update trial progress on dashboard
    if (typeof renderDashboardTrialProgress === 'function') {
      renderDashboardTrialProgress();
    }

    // Also update dashboard reminders
    if (typeof renderDashboardReminders === 'function') {
      renderDashboardReminders();
    }
  } catch (error) {
    console.error("Error updating dashboard counts:", error);
  }
}

// Render location preview map
function renderLocationPreviewMap(location) {
  const mapContainer = document.getElementById(`locationPreviewMap${location.id}`);
  if (!mapContainer) return;

  // Remove old map if exists
  if (window[`locationMap${location.id}`]) {
    window[`locationMap${location.id}`].remove();
  }

  // Parse coordinates
  let center = [-6.2, 106.8];
  if (location.coordinates) {
    try {
      // Try parsing as JSON object first
      let coords = location.coordinates;
      if (typeof coords === 'string') {
        coords = JSON.parse(coords);
      }
      if (coords && coords.lat && coords.lng) {
        center = [coords.lat, coords.lng];
      }
    } catch (e) {
      // Try parsing as "lat,lng" string format
      try {
        const parts = location.coordinates.split(',').map(p => parseFloat(p.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          center = [parts[0], parts[1]];
        }
      } catch (e2) {
        console.log('Could not parse coordinates:', location.coordinates);
      }
    }
  }

  // Create map (with no zoom control)
  const map = L.map(mapContainer, {
    zoomControl: false,
    attributionControl: false
  }).setView(center, 13);

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

  // Add marker
  L.marker(center, {
    icon: L.icon({
      iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41]
    })
  }).addTo(map);

  // Disable all interactions
  map.dragging.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.scrollWheelZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  if (map.tap) map.tap.disable();

  // Store map instance
  window[`locationMap${location.id}`] = map;

  // Fix map size
  setTimeout(() => map.invalidateSize(), 100);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===========================
// IMPORT / EXPORT
// ===========================

let importState = {
  step: 1,
  fileData: null,    // parsed rows (array of arrays)
  headers: null,     // first row headers
  mapping: {},       // { appField: fileColumnIndex }
  parsedItems: [],   // mapped data ready to import
  duplicates: [],    // indices of duplicate rows
};

// --- Field definitions per category ---
function getImportFields(category) {
  switch (category) {
    case "locations":
      return [
        { key: "name", label: "Location Name", icon: "label", required: true },
        { key: "latitude", label: "Latitude", icon: "explore", required: true },
        { key: "longitude", label: "Longitude", icon: "explore", required: true },
      ];
    case "crops":
      return [
        { key: "name", label: "Crop Name", icon: "label", required: true },
        { key: "cropType", label: "Crop Type", icon: "category", required: true },
      ];
    case "parameters":
      return [
        { key: "name", label: "Parameter Name", icon: "label", required: true },
        { key: "initial", label: "Initial", icon: "abc", required: true },
        { key: "type", label: "Type", icon: "tune", required: true, hint: "text / range / radio / checkbox / date / formula" },
        { key: "rangeMin", label: "Range Min", icon: "arrow_downward", required: false },
        { key: "rangeMax", label: "Range Max", icon: "arrow_upward", required: false },
        { key: "radioOptions", label: "Radio Options", icon: "radio_button_checked", required: false, hint: "comma-separated" },
        { key: "checkboxOptions", label: "Checkbox Options", icon: "check_box", required: false, hint: "comma-separated" },
        { key: "unit", label: "Unit", icon: "straighten", required: false },
        { key: "numberOfSamples", label: "Number of Samples", icon: "tag", required: false },
        { key: "requirePhoto", label: "Require Photo", icon: "photo_camera", required: false, hint: "true / false" },
        { key: "photoMode", label: "Photo Mode", icon: "burst_mode", required: false, hint: "per-sample / per-line" },
      ];
    case "agronomy":
      return [
        { key: "activity", label: "Activity", icon: "agriculture", required: true },
        { key: "cropNames", label: "Crop Names", icon: "eco", required: false, hint: "comma-separated crop names" },
        { key: "dapMin", label: "DAP From", icon: "event", required: false },
        { key: "dapMax", label: "DAP To", icon: "event", required: false },
        { key: "chemical", label: "Chemical", icon: "science", required: false },
        { key: "dose", label: "Dose", icon: "medication", required: false },
        { key: "remark", label: "Remark", icon: "notes", required: false },
      ];
    default:
      return [];
  }
}

// --- Show/Hide IO buttons based on category ---
function updateImportExportVisibility() {
  const ioBtns = document.getElementById("inventoryIoBtns");
  if (!ioBtns) return;
  const cat = inventoryState.currentCategory;
  const supported = ["locations", "crops", "parameters", "agronomy"];
  ioBtns.style.display = supported.includes(cat) ? "flex" : "none";
}

// ===========================
// EXPORT
// ===========================

function exportInventoryData() {
  const cat = inventoryState.currentCategory;
  const items = inventoryState.items[cat] || [];
  if (items.length === 0) {
    showToast("No data to export", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  let rows = [];
  if (cat === "locations") {
    rows.push(["Location Name", "Latitude", "Longitude"]);
    items.forEach(item => {
      let lat = "", lng = "";
      if (item.coordinates) {
        try {
          let coords = item.coordinates;
          if (typeof coords === "string") {
            try {
              coords = JSON.parse(coords);
            } catch (_) {
              const parts = coords.split(",").map(p => p.trim());
              if (parts.length === 2) {
                coords = { lat: parts[0], lng: parts[1] };
              }
            }
          }
          if (coords && coords.lat !== undefined) {
            lat = coords.lat;
            lng = coords.lng;
          }
        } catch (_) {}
      }
      rows.push([item.name || "", lat, lng]);
    });
  } else if (cat === "crops") {
    rows.push(["Crop Name", "Crop Type"]);
    items.forEach(item => {
      rows.push([item.name || "", item.cropType || ""]);
    });
  } else if (cat === "parameters") {
    rows.push(["Parameter Name", "Initial", "Type", "Range Min", "Range Max",
      "Radio Options", "Checkbox Options", "Unit", "Number of Samples",
      "Require Photo", "Photo Mode"]);
    items.forEach(item => {
      rows.push([
        item.name || "",
        item.initial || "",
        item.type || "",
        item.rangeMin ?? "",
        item.rangeMax ?? "",
        item.radioOptions || "",
        item.checkboxOptions || "",
        item.unit || "",
        item.numberOfSamples ?? 1,
        item.requirePhoto ? "true" : "false",
        item.photoMode || "",
      ]);
    });
  } else if (cat === "agronomy") {
    rows.push(["Activity", "Crop Names", "DAP From", "DAP To", "Chemical", "Dose", "Remark"]);
    const allCrops = inventoryState.items.crops || [];
    items.forEach(item => {
      // Resolve cropIds to crop names
      const cropNames = (item.cropIds || []).map(cid => {
        const c = allCrops.find(cr => cr.id === cid);
        return c ? c.name : cid;
      }).join(", ");
      rows.push([
        item.activity || item.name || "",
        cropNames,
        item.dapMin ?? "",
        item.dapMax ?? "",
        item.chemical || "",
        item.dose || "",
        item.remark || "",
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Auto-fit column widths
  const colWidths = rows[0].map((_, colIdx) => {
    let max = 10;
    rows.forEach(row => {
      const val = String(row[colIdx] || "");
      if (val.length > max) max = val.length;
    });
    return { wch: Math.min(max + 2, 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
  XLSX.utils.book_append_sheet(wb, ws, catName);
  XLSX.writeFile(wb, `${catName}_Export.xlsx`);
  showToast(`Exported ${items.length} ${catName.toLowerCase()} to Excel`, "success");
}

// ===========================
// IMPORT
// ===========================

function openImportModal() {
  const cat = inventoryState.currentCategory;
  const fields = getImportFields(cat);
  if (fields.length === 0) {
    showToast("Import not supported for this category", "error");
    return;
  }

  importState = { step: 1, fileData: null, headers: null, mapping: {}, parsedItems: [], duplicates: [] };
  const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
  document.getElementById("importModalTitle").textContent = `Import ${catName}`;

  // Reset UI
  document.getElementById("importStep1").classList.remove("hidden");
  document.getElementById("importStep2").classList.add("hidden");
  document.getElementById("importStep3").classList.add("hidden");
  document.getElementById("importFileInfo").classList.add("hidden");
  document.getElementById("importDropzone").style.display = "";
  document.getElementById("importBackBtn").style.display = "none";
  document.getElementById("importNextBtn").disabled = true;
  document.getElementById("importNextLabel").textContent = "Next";
  document.getElementById("importNextIcon").textContent = "arrow_forward";
  document.getElementById("importModal").classList.remove("hidden");

  // Setup drag-and-drop
  setupImportDropzone();
}

function closeImportModal() {
  document.getElementById("importModal").classList.add("hidden");
  importState = { step: 1, fileData: null, headers: null, mapping: {}, parsedItems: [], duplicates: [] };
}

function setupImportDropzone() {
  const dropzone = document.getElementById("importDropzone");
  const fileInput = document.getElementById("importFileInput");

  // Remove old listeners by replacing node
  const newDropzone = dropzone.cloneNode(true);
  dropzone.parentNode.replaceChild(newDropzone, dropzone);
  const newFileInput = newDropzone.querySelector("#importFileInput") || document.getElementById("importFileInput");

  newDropzone.addEventListener("click", () => newFileInput.click());
  newDropzone.addEventListener("dragover", (e) => { e.preventDefault(); newDropzone.classList.add("dragover"); });
  newDropzone.addEventListener("dragleave", () => newDropzone.classList.remove("dragover"));
  newDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    newDropzone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) handleInventoryImportFile(file);
  });
  newFileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleInventoryImportFile(e.target.files[0]);
  });
}

function handleInventoryImportFile(file) {
  const validTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    ".xlsx", ".xls", ".csv"
  ];
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    showToast("Please upload an Excel (.xlsx/.xls) or CSV (.csv) file", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  document.getElementById("importFileName").textContent = file.name;
  document.getElementById("importFileInfo").classList.remove("hidden");
  document.getElementById("importDropzone").style.display = "none";

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });

      // Filter out empty rows
      const rows = jsonData.filter(row => row.some(cell => cell !== "" && cell !== null && cell !== undefined));
      if (rows.length < 2) {
        showToast("File must have a header row and at least one data row", "error");
        clearImportFile();
        return;
      }

      importState.headers = rows[0].map(h => String(h).trim());
      importState.fileData = rows.slice(1);
      document.getElementById("importNextBtn").disabled = false;
    } catch (err) {
      console.error("Error parsing file:", err);
      showToast("Failed to parse file. Please check the format.", "error");
      clearImportFile();
    }
  };
  reader.readAsArrayBuffer(file);
}

function clearImportFile() {
  importState.fileData = null;
  importState.headers = null;
  document.getElementById("importFileInfo").classList.add("hidden");
  document.getElementById("importDropzone").style.display = "";
  document.getElementById("importNextBtn").disabled = true;
  const fileInput = document.getElementById("importFileInput");
  if (fileInput) fileInput.value = "";
}

function importStepNext() {
  if (importState.step === 1) {
    // Go to Step 2: Column Mapping
    importState.step = 2;
    renderImportColumnMapping();
    document.getElementById("importStep1").classList.add("hidden");
    document.getElementById("importStep2").classList.remove("hidden");
    document.getElementById("importBackBtn").style.display = "";
    document.getElementById("importNextBtn").disabled = false;
    document.getElementById("importNextLabel").textContent = "Preview";
    document.getElementById("importNextIcon").textContent = "visibility";
  } else if (importState.step === 2) {
    // Validate mapping
    if (!validateImportMapping()) return;
    // Go to Step 3: Preview
    importState.step = 3;
    renderImportPreview();
    document.getElementById("importStep2").classList.add("hidden");
    document.getElementById("importStep3").classList.remove("hidden");
    document.getElementById("importNextLabel").textContent = "Import";
    document.getElementById("importNextIcon").textContent = "check";
  } else if (importState.step === 3) {
    // Execute import
    executeImport();
  }
}

function importStepBack() {
  if (importState.step === 2) {
    importState.step = 1;
    document.getElementById("importStep2").classList.add("hidden");
    document.getElementById("importStep1").classList.remove("hidden");
    document.getElementById("importBackBtn").style.display = "none";
    document.getElementById("importNextLabel").textContent = "Next";
    document.getElementById("importNextIcon").textContent = "arrow_forward";
    document.getElementById("importNextBtn").disabled = !importState.fileData;
  } else if (importState.step === 3) {
    importState.step = 2;
    document.getElementById("importStep3").classList.add("hidden");
    document.getElementById("importStep2").classList.remove("hidden");
    document.getElementById("importNextLabel").textContent = "Preview";
    document.getElementById("importNextIcon").textContent = "visibility";
  }
}

// --- Step 2: Column Mapping ---
function renderImportColumnMapping() {
  const container = document.getElementById("importColumnMapping");
  const cat = inventoryState.currentCategory;
  const fields = getImportFields(cat);

  // Auto-detect mapping from headers
  const headerLower = importState.headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  fields.forEach(field => {
    let bestIdx = -1;
    // Try to match
    const fieldKey = field.key.toLowerCase();
    const fieldLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, "");
    headerLower.forEach((h, idx) => {
      if (h === fieldKey || h === fieldLabel || h.includes(fieldKey)) {
        if (bestIdx === -1) bestIdx = idx;
      }
    });
    importState.mapping[field.key] = bestIdx >= 0 ? bestIdx : -1;
  });

  let html = "";
  fields.forEach(field => {
    const options = importState.headers.map((h, idx) =>
      `<option value="${idx}" ${importState.mapping[field.key] === idx ? "selected" : ""}>${escapeHtml(h)}</option>`
    ).join("");

    html += `
      <div class="import-map-row">
        <div class="import-map-field">
          <span class="material-symbols-rounded">${field.icon}</span>
          <div>
            ${escapeHtml(field.label)}${field.required ? ' <span style="color:var(--danger)">*</span>' : ''}
            ${field.hint ? `<small class="import-map-hint">${escapeHtml(field.hint)}</small>` : ''}
          </div>
        </div>
        <span class="material-symbols-rounded import-map-arrow">arrow_forward</span>
        <select class="import-map-select" data-field="${field.key}" onchange="updateImportMapping(this)">
          <option value="-1">-- Skip --</option>
          ${options}
        </select>
      </div>
    `;
  });

  container.innerHTML = html;
}

function updateImportMapping(select) {
  const field = select.dataset.field;
  importState.mapping[field] = parseInt(select.value);
}

function validateImportMapping() {
  const cat = inventoryState.currentCategory;
  const fields = getImportFields(cat);
  const required = fields.filter(f => f.required);

  for (const field of required) {
    if (importState.mapping[field.key] === -1 || importState.mapping[field.key] === undefined) {
      showToast(`Please map the "${field.label}" field`, "error");
      return false;
    }
  }
  return true;
}

// --- Step 3: Preview ---
function renderImportPreview() {
  const cat = inventoryState.currentCategory;
  const fields = getImportFields(cat);
  const mapping = importState.mapping;
  const existingItems = inventoryState.items[cat] || [];

  importState.parsedItems = [];
  importState.duplicates = [];

  // Parse rows based on mapping
  importState.fileData.forEach((row, rowIdx) => {
    const item = {};
    let hasData = false;
    fields.forEach(field => {
      const colIdx = mapping[field.key];
      if (colIdx >= 0 && colIdx < row.length) {
        const val = String(row[colIdx] ?? "").trim();
        item[field.key] = val;
        if (val) hasData = true;
      } else {
        item[field.key] = "";
      }
    });
    if (hasData) {
      importState.parsedItems.push(item);
    }
  });

  // Detect duplicates
  importState.parsedItems.forEach((item, idx) => {
    let isDup = false;
    if (cat === "locations") {
      isDup = existingItems.some(existing => {
        const nameMatch = (existing.name || "").toLowerCase().trim() === (item.name || "").toLowerCase().trim();
        if (!nameMatch) return false;
        let exLat = "", exLng = "";
        if (existing.coordinates) {
          try {
            let coords = existing.coordinates;
            if (typeof coords === "string") {
              try { coords = JSON.parse(coords); } catch (_) {
                const parts = coords.split(",").map(p => p.trim());
                if (parts.length === 2) coords = { lat: parts[0], lng: parts[1] };
              }
            }
            if (coords && coords.lat !== undefined) {
              exLat = String(coords.lat);
              exLng = String(coords.lng);
            }
          } catch (_) {}
        }
        return exLat === item.latitude && exLng === item.longitude;
      });
    } else if (cat === "crops") {
      isDup = existingItems.some(existing =>
        (existing.name || "").toLowerCase().trim() === (item.name || "").toLowerCase().trim() &&
        (existing.cropType || "").toLowerCase().trim() === (item.cropType || "").toLowerCase().trim()
      );
    } else if (cat === "parameters") {
      isDup = existingItems.some(existing =>
        (existing.name || "").toLowerCase().trim() === (item.name || "").toLowerCase().trim() &&
        (existing.initial || "").toLowerCase().trim() === (item.initial || "").toLowerCase().trim() &&
        (existing.type || "").toLowerCase().trim() === (item.type || "").toLowerCase().trim()
      );
    } else if (cat === "agronomy") {
      isDup = existingItems.some(existing =>
        (existing.activity || existing.name || "").toLowerCase().trim() === (item.activity || "").toLowerCase().trim()
      );
    }
    if (isDup) importState.duplicates.push(idx);
  });

  // Render preview table
  const table = document.getElementById("importPreviewTable");
  let html = "<thead><tr><th>#</th>";
  fields.forEach(f => { html += `<th>${escapeHtml(f.label)}</th>`; });
  html += "</tr></thead><tbody>";

  importState.parsedItems.forEach((item, idx) => {
    const isDup = importState.duplicates.includes(idx);
    html += `<tr class="${isDup ? 'duplicate-row' : ''}"><td>${idx + 1}</td>`;
    fields.forEach(f => { html += `<td>${escapeHtml(item[f.key] || "-")}</td>`; });
    html += "</tr>";
  });
  html += "</tbody>";
  table.innerHTML = html;

  // Update count
  document.getElementById("importPreviewCount").textContent =
    `${importState.parsedItems.length} item(s) to import`;

  // Duplicate warning
  const dupWarning = document.getElementById("importDuplicateWarning");
  if (importState.duplicates.length > 0) {
    document.getElementById("importDuplicateCount").textContent = importState.duplicates.length;
    dupWarning.classList.remove("hidden");
  } else {
    dupWarning.classList.add("hidden");
  }

  document.getElementById("importNextBtn").disabled = importState.parsedItems.length === 0;
}

// --- Execute Import ---
async function executeImport() {
  const cat = inventoryState.currentCategory;
  const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
  const items = importState.parsedItems;
  const duplicateAction = document.querySelector('input[name="duplicateAction"]:checked')?.value || "skip";

  if (items.length === 0) {
    showToast("No items to import", "error");
    return;
  }

  // Disable button during import
  const btn = document.getElementById("importNextBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-rounded spin">sync</span> Importing...';

  try {
    let imported = 0;
    let skipped = 0;
    let replaced = 0;
    const existingItems = inventoryState.items[cat] || [];

    for (let idx = 0; idx < items.length; idx++) {
      const rawItem = items[idx];
      const isDup = importState.duplicates.includes(idx);

      if (isDup) {
        if (duplicateAction === "skip") {
          skipped++;
          continue;
        } else if (duplicateAction === "replace") {
          const existingIdx = findExistingDuplicate(cat, existingItems, rawItem);
          if (existingIdx >= 0) {
            const existing = existingItems[existingIdx];
            applyImportUpdate(cat, existing, rawItem);
            existing.updatedAt = new Date().toISOString();
            enqueueSync({
              label: `Save ${catName}: ${existing.name || existing.activity}`,
              run: () => saveItemToGoogleDrive(catName, existing),
            });
            replaced++;
            continue;
          }
        }
        // duplicateAction === "add" falls through to create new
      }

      // Create new item
      const newItem = buildNewItem(cat, rawItem, idx);

      if (newItem) {
        inventoryState.items[cat].push(newItem);
        enqueueSync({
          label: `Save ${catName}: ${newItem.name}`,
          run: () => saveItemToGoogleDrive(catName, newItem),
        });
        imported++;
      }
    }

    // Update UI
    renderInventoryItems();
    updateDashboardCounts();

    let msg = `Imported ${imported} new item(s)`;
    if (replaced > 0) msg += `, replaced ${replaced}`;
    if (skipped > 0) msg += `, skipped ${skipped} duplicate(s)`;
    showToast(msg, "success");

    closeImportModal();
  } catch (err) {
    console.error("Import error:", err);
    showToast("Import failed: " + err.message, "error");
    btn.disabled = false;
    btn.innerHTML = '<span id="importNextLabel">Import</span><span class="material-symbols-rounded" id="importNextIcon">check</span>';
  }
}

// --- Import helpers: find duplicate, apply update, build new item ---

function findExistingDuplicate(cat, existingItems, rawItem) {
  if (cat === "locations") {
    return existingItems.findIndex(existing => {
      const nameMatch = (existing.name || "").toLowerCase().trim() === (rawItem.name || "").toLowerCase().trim();
      if (!nameMatch) return false;
      let exLat = "", exLng = "";
      if (existing.coordinates) {
        try {
          let coords = existing.coordinates;
          if (typeof coords === "string") {
            try { coords = JSON.parse(coords); } catch (_) {
              const parts = coords.split(",").map(p => p.trim());
              if (parts.length === 2) coords = { lat: parts[0], lng: parts[1] };
            }
          }
          if (coords && coords.lat !== undefined) { exLat = String(coords.lat); exLng = String(coords.lng); }
        } catch (_) {}
      }
      return exLat === rawItem.latitude && exLng === rawItem.longitude;
    });
  } else if (cat === "crops") {
    return existingItems.findIndex(ex =>
      (ex.name || "").toLowerCase().trim() === (rawItem.name || "").toLowerCase().trim() &&
      (ex.cropType || "").toLowerCase().trim() === (rawItem.cropType || "").toLowerCase().trim()
    );
  } else if (cat === "parameters") {
    return existingItems.findIndex(ex =>
      (ex.name || "").toLowerCase().trim() === (rawItem.name || "").toLowerCase().trim() &&
      (ex.initial || "").toLowerCase().trim() === (rawItem.initial || "").toLowerCase().trim() &&
      (ex.type || "").toLowerCase().trim() === (rawItem.type || "").toLowerCase().trim()
    );
  } else if (cat === "agronomy") {
    return existingItems.findIndex(ex =>
      (ex.activity || ex.name || "").toLowerCase().trim() === (rawItem.activity || "").toLowerCase().trim()
    );
  }
  return -1;
}

function applyImportUpdate(cat, existing, rawItem) {
  if (cat === "locations") {
    existing.name = rawItem.name;
    existing.coordinates = `${rawItem.latitude},${rawItem.longitude}`;
  } else if (cat === "crops") {
    existing.name = rawItem.name;
    existing.cropType = rawItem.cropType;
  } else if (cat === "parameters") {
    existing.name = rawItem.name;
    existing.initial = rawItem.initial;
    existing.type = rawItem.type;
    if (rawItem.rangeMin) existing.rangeMin = Number(rawItem.rangeMin);
    if (rawItem.rangeMax) existing.rangeMax = Number(rawItem.rangeMax);
    if (rawItem.rangeMin && rawItem.rangeMax) existing.rangeDefinition = `${rawItem.rangeMin}-${rawItem.rangeMax}`;
    if (rawItem.radioOptions) existing.radioOptions = rawItem.radioOptions;
    if (rawItem.checkboxOptions) existing.checkboxOptions = rawItem.checkboxOptions;
    if (rawItem.unit) existing.unit = rawItem.unit;
    if (rawItem.numberOfSamples) existing.numberOfSamples = Number(rawItem.numberOfSamples) || 1;
    existing.requirePhoto = rawItem.requirePhoto === "true";
    if (rawItem.photoMode) existing.photoMode = rawItem.photoMode;
  } else if (cat === "agronomy") {
    existing.activity = rawItem.activity;
    existing.name = rawItem.activity;
    existing.cropIds = resolveCropNames(rawItem.cropNames);
    if (rawItem.dapMin) existing.dapMin = Number(rawItem.dapMin) || null;
    if (rawItem.dapMax) existing.dapMax = Number(rawItem.dapMax) || null;
    if (rawItem.chemical !== undefined) existing.chemical = rawItem.chemical;
    if (rawItem.dose !== undefined) existing.dose = rawItem.dose;
    if (rawItem.remark !== undefined) existing.remark = rawItem.remark;
  }
}

function buildNewItem(cat, rawItem, idx) {
  const now = new Date().toISOString();
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${idx}`;

  if (cat === "locations") {
    return {
      id, name: rawItem.name || "Unnamed",
      coordinates: `${rawItem.latitude},${rawItem.longitude}`,
      createdAt: now, updatedAt: now,
    };
  } else if (cat === "crops") {
    return {
      id, name: rawItem.name || "Unnamed",
      cropType: rawItem.cropType || "",
      createdAt: now, updatedAt: now,
    };
  } else if (cat === "parameters") {
    const type = (rawItem.type || "text").toLowerCase().trim();
    const item = {
      id, name: rawItem.name || "Unnamed",
      initial: rawItem.initial || "",
      type: type,
      unit: rawItem.unit || "",
      numberOfSamples: Number(rawItem.numberOfSamples) || 1,
      requirePhoto: rawItem.requirePhoto === "true",
      photoMode: rawItem.photoMode || "",
      daysOfObservation: {},
      createdAt: now, updatedAt: now,
    };
    if (type === "range") {
      item.rangeMin = Number(rawItem.rangeMin) || 0;
      item.rangeMax = Number(rawItem.rangeMax) || 0;
      item.rangeDefinition = `${item.rangeMin}-${item.rangeMax}`;
    }
    if (type === "radio" && rawItem.radioOptions) item.radioOptions = rawItem.radioOptions;
    if (type === "checkbox" && rawItem.checkboxOptions) item.checkboxOptions = rawItem.checkboxOptions;
    return item;
  } else if (cat === "agronomy") {
    return {
      id, name: rawItem.activity || "Unnamed",
      activity: rawItem.activity || "Unnamed",
      cropIds: resolveCropNames(rawItem.cropNames),
      dapMin: rawItem.dapMin ? Number(rawItem.dapMin) : null,
      dapMax: rawItem.dapMax ? Number(rawItem.dapMax) : null,
      chemical: rawItem.chemical || "",
      dose: rawItem.dose || "",
      remark: rawItem.remark || "",
      createdAt: now, updatedAt: now,
    };
  }
  return null;
}

// Resolve comma-separated crop names to cropIds
function resolveCropNames(cropNamesStr) {
  if (!cropNamesStr) return [];
  const allCrops = inventoryState.items.crops || [];
  return cropNamesStr.split(",").map(n => n.trim()).filter(Boolean).map(name => {
    const found = allCrops.find(c => (c.name || "").toLowerCase().trim() === name.toLowerCase());
    return found ? found.id : null;
  }).filter(Boolean);
}
