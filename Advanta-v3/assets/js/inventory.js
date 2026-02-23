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
    "agronomyCropGroup",
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

  // Populate crop checkboxes when showing
  if (show) {
    populateAgronomyCropCheckboxes();
  }
}

function populateAgronomyCropCheckboxes(selectedCropIds = []) {
  const container = document.getElementById("agronomyCropCheckboxes");
  if (!container) return;

  const crops = inventoryState.items.crops || [];
  if (crops.length === 0) {
    container.innerHTML = '<p class="form-hint">No crops available. Add crops first.</p>';
    return;
  }

  container.innerHTML = crops.map(crop => `
    <label class="agronomy-crop-checkbox-label">
      <input type="checkbox" value="${crop.id}" ${selectedCropIds.includes(crop.id) ? 'checked' : ''}>
      <span>${escapeHtml(crop.name)}</span>
    </label>
  `).join('');
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

  // Render items
  renderInventoryItems();
}

// Render inventory items
function renderInventoryItems() {
  const container = document.getElementById("inventoryList");
  const items = inventoryState.items[inventoryState.currentCategory];
  const isCrops = inventoryState.currentCategory === "crops";
  const isLocations = inventoryState.currentCategory === "locations";
  const isParameters = inventoryState.currentCategory === "parameters";
  const isAgronomy = inventoryState.currentCategory === "agronomy";

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
                            ${crop.cropType ? `<div class="item-subtext">Type: ${escapeHtml(crop.cropType)}</div>` : ""}
                            ${relatedLines.length > 0 ? `<div class="item-subtext">Lines: ${relatedLines.length}</div>` : ""}
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
                <div class="item-subtext">Type: ${escapeHtml(item.type || "-")} · Initial: ${escapeHtml(item.initial || "-")} · Unit: ${escapeHtml(item.unit || "-")}</div>
                ${item.updatedAt ? `<div class="item-subtext item-updated">Last updated: ${new Date(item.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>` : ''}
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
  const agronomyCropCheckboxes = document.getElementById("agronomyCropCheckboxes");
  if (agronomyCropCheckboxes) {
    agronomyCropCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
  
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

  // Agronomy fields
  const agronomyCropIds = isAgronomy
    ? Array.from(document.querySelectorAll('#agronomyCropCheckboxes input[type="checkbox"]:checked')).map(cb => cb.value)
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
