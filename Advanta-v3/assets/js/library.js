// Library Management
let libraryState = {
  items: [],
  trialPhotos: [],
  folderId: null,
  selectedId: null,
  previewUrl: null,
  searchQuery: "",
  activeFilter: "all",
  sortBy: "modifiedTime",
  sortDir: "desc",
  section: "files", // "files" | "trial-photos"
  uploading: {}, // Track upload progress by file name: { filename: { progress: 0-100 } }
  _driveLoaded: false, // Whether items have been loaded from Drive this session
  _trialPhotosLoaded: false,
  // Background scanning/conversion tracking
  _scanningInline: false,
  _scanProgress: null,
  _convertingInline: false,
  _convertProgress: null,
  _operationAbort: null,
  // Bulk selection for trial photos
  _selectedTrialPhotos: new Set(), // Track multiple selections
  _bulkSelectionMode: false,
};

async function initializeLibrary(options = {}) {
  const onProgress = options.onProgress;

  try {
    // Load from local cache only (no Drive fetch at startup)
    let cached = null;
    if (typeof loadLocalCache === "function") {
      cached = await loadLocalCache("library");
    }

    if (cached?.items) {
      libraryState.items = cached.items;
      renderLibraryList();
      if (onProgress) {
        onProgress(0.5, "Loaded library from device");
      }
    }

    libraryState.folderId = await getOrCreateFolder(
      "Library",
      driveState.advantaFolderId,
    );
    setupLibraryEvents();

    // Do NOT load from Drive here — will be lazy-loaded on first Library page visit
    if (onProgress) {
      onProgress(1, "Library initialized");
    }
  } catch (error) {
    console.error("Error initializing library:", error);
  }
}

function setupLibraryEvents() {
  const uploadBtn = document.getElementById("uploadLibraryBtn");
  const uploadInput = document.getElementById("libraryUploadInput");
  const renameBtn = document.getElementById("libraryRenameBtn");
  const deleteBtn = document.getElementById("libraryDeleteBtn");
  const downloadBtn = document.getElementById("libraryDownloadBtn");
  const closeBtn = document.getElementById("libraryCloseBtn");
  const searchInput = document.getElementById("librarySearchInput");
  const filterTrigger = document.getElementById("libraryFilterTrigger");
  const filterDropdown = document.getElementById("libraryFilterDropdown");
  const filterItems = document.querySelectorAll(".library-filter-item");
  const sortBySelect = document.getElementById("librarySortBy");
  const sortDirSelect = document.getElementById("librarySortDir");
  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      await uploadLibraryFiles(files);
      uploadInput.value = "";
    });
  }

  // Refresh button (incremental — only fetches new files)
  const refreshBtn = document.getElementById("refreshLibraryBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.querySelector("span:last-child").textContent = "Refreshing...";
      try {
        if (libraryState.section === "trial-photos") {
          await loadTrialPhotoItems({ force: true });
        } else {
          await incrementalRefreshLibrary();
        }
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.querySelector("span:last-child").textContent = "Refresh";
      }
    });
  }

  if (renameBtn) {
    renameBtn.addEventListener("click", () => renameLibraryItem());
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => deleteLibraryItem());
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => downloadLibraryItem());
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeLibraryDetail());
  }

  // Search functionality
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      libraryState.searchQuery = e.target.value.toLowerCase();
      renderLibraryList();
    });
  }

  // Filter dropdown functionality
  if (filterTrigger && filterDropdown) {
    filterTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      filterDropdown.classList.toggle("active");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !filterDropdown.contains(e.target) &&
        !filterTrigger.contains(e.target)
      ) {
        filterDropdown.classList.remove("active");
      }
    });
  }

  // Filter item selection
  filterItems.forEach((item) => {
    item.addEventListener("click", () => {
      filterItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      libraryState.activeFilter = item.dataset.filter;
      renderLibraryList();
      // Keep dropdown open for better UX
      // filterDropdown.classList.remove("active");
    });
  });

  if (sortBySelect) {
    sortBySelect.value = libraryState.sortBy;
    sortBySelect.addEventListener("change", (e) => {
      libraryState.sortBy = e.target.value;
      renderLibraryList();
    });
  }

  if (sortDirSelect) {
    sortDirSelect.value = libraryState.sortDir;
    sortDirSelect.addEventListener("change", (e) => {
      libraryState.sortDir = e.target.value;
      renderLibraryList();
    });
  }
}

function setLibraryStatus(message, type = "info") {
  const banner = document.getElementById("libraryStatusBanner");
  if (!banner) return;

  if (!message) {
    banner.textContent = "";
    banner.classList.add("hidden");
    banner.classList.remove("info", "success", "warning", "error", "loading");
    return;
  }

  banner.classList.remove("hidden", "info", "success", "warning", "error", "loading");
  banner.classList.add(type);
  banner.textContent = message;
}

function clearLibraryStatus(delayMs = 0) {
  if (delayMs > 0) {
    setTimeout(() => setLibraryStatus(""), delayMs);
    return;
  }
  setLibraryStatus("");
}

async function switchLibrarySection(section = "files") {
  const nextSection = section === "trial-photos" ? "trial-photos" : "files";
  libraryState.section = nextSection;
  libraryState.selectedId = null;

  const uploadBtn = document.getElementById("uploadLibraryBtn");
  const uploadInput = document.getElementById("libraryUploadInput");
  const filterContainer = document.querySelector(".library-filter-container");
  const searchInput = document.getElementById("librarySearchInput");
  const actionBarContainer = document.getElementById("trialPhotoActionsContainer");

  if (nextSection === "trial-photos") {
    if (uploadBtn) uploadBtn.classList.add("hidden");
    if (uploadInput) uploadInput.classList.add("hidden");
    if (filterContainer) filterContainer.classList.add("hidden");
    if (actionBarContainer) actionBarContainer.classList.remove("hidden");
    libraryState.activeFilter = "all";
    if (searchInput) searchInput.placeholder = "Search trial photos...";
    
    // Check if a scan/convert is in progress and show its status
    if (libraryState._scanningInline) {
      setLibraryStatus("Scanning inline photos in background...", "loading");
    } else if (libraryState._convertingInline) {
      setLibraryStatus("Converting inline photos in background...", "loading");
    } else {
      setLibraryStatus("Loading trial photos in background...", "loading");
    }
    
    loadTrialPhotoItems().catch(() => {});
  } else {
    if (uploadBtn) uploadBtn.classList.remove("hidden");
    if (uploadInput) uploadInput.classList.remove("hidden");
    if (filterContainer) filterContainer.classList.remove("hidden");
    if (actionBarContainer) actionBarContainer.classList.add("hidden");
    if (searchInput) searchInput.placeholder = "Search files...";
    renderLibraryList();
    setLibraryStatus("Loading uploaded files in background...", "loading");
    lazyLoadLibraryFromDrive().catch(() => {});
  }

  closeLibraryDetail();
}

function ensureLibrarySectionLoaded() {
  if (libraryState.section === "trial-photos") {
    setLibraryStatus("Loading trial photos in background...", "loading");
    loadTrialPhotoItems().catch(() => {});
    return;
  }
  setLibraryStatus("Loading uploaded files in background...", "loading");
  lazyLoadLibraryFromDrive().catch(() => {});
}

async function loadLibraryItems() {
  if (!libraryState.folderId) return;

  const response = await gapi.client.drive.files.list({
    q: `'${libraryState.folderId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, modifiedTime, size)",
    orderBy: "modifiedTime desc",
    pageSize: 1000,
  });

  libraryState.items = response.result.files || [];
  renderLibraryList();

  if (typeof saveLocalCache === "function") {
    saveLocalCache("library", { items: libraryState.items });
  }
}

/**
 * Lazy-load library items from Drive on first visit to the Library page.
 * Runs in background and updates inline status. Skips if already loaded this session.
 */
async function lazyLoadLibraryFromDrive() {
  if (libraryState._driveLoaded) return;
  if (!libraryState.folderId) return;

  setLibraryStatus("Loading uploaded files from Drive...", "loading");

  try {
    const response = await gapi.client.drive.files.list({
      q: `'${libraryState.folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, modifiedTime, size)",
      orderBy: "modifiedTime desc",
      pageSize: 1000,
    });

    const files = response.result.files || [];
    libraryState.items = files;
    libraryState._driveLoaded = true;
    renderLibraryList();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("library", { items: libraryState.items });
    }

    setLibraryStatus(`Uploaded files loaded (${files.length}).`, "success");
    clearLibraryStatus(3000);
  } catch (error) {
    console.error("Error lazy-loading library:", error);
    setLibraryStatus("Error loading uploaded files from Drive.", "error");
  }
}

/**
 * Incremental refresh: only fetches new files from Drive that aren't already in the local list.
 * Existing files are kept as-is for fast refresh.
 */
async function incrementalRefreshLibrary() {
  if (!libraryState.folderId) return;

  try {
    const response = await gapi.client.drive.files.list({
      q: `'${libraryState.folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, modifiedTime, size)",
      orderBy: "modifiedTime desc",
      pageSize: 1000,
    });

    const driveFiles = response.result.files || [];
    const existingIds = new Set(libraryState.items.map(f => f.id));
    const driveIds = new Set(driveFiles.map(f => f.id));

    // Find new files (in Drive but not in local)
    const newFiles = driveFiles.filter(f => !existingIds.has(f.id));
    // Find removed files (in local but no longer in Drive)
    const remainingItems = libraryState.items.filter(f => driveIds.has(f.id));

    // Merge: keep existing + add new
    libraryState.items = [...newFiles, ...remainingItems];
    // Re-sort by modifiedTime desc (default)
    libraryState.items.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));

    renderLibraryList();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("library", { items: libraryState.items });
    }

    if (newFiles.length > 0) {
      showToast(`${newFiles.length} new file(s) added to library.`, "success");
    } else {
      showToast("Library is up to date.", "info");
    }
  } catch (error) {
    console.error("Error refreshing library:", error);
    showToast("Error refreshing library.", "error");
  }
}

async function loadTrialPhotoItems(options = {}) {
  const { force = false } = options;
  if (libraryState._trialPhotosLoaded && !force) {
    renderLibraryList();
    return;
  }

  setTrialPhotoProgress(0, "Fetching trial folders...");

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFoldersResp = await gapi.client.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1000,
    });
    const trialFolders = trialFoldersResp.result.files || [];
    const allPhotos = [];
    const total = trialFolders.length;

    for (let i = 0; i < total; i++) {
      const trialFolder = trialFolders[i];
      const trialId = trialFolder.name;
      const trialName = trialState?.trials?.find((t) => t.id === trialId)?.name || trialId;
      const pct = Math.round(((i + 1) / total) * 100);

      setTrialPhotoProgress(pct, `Scanning photos: ${trialName} (${i + 1}/${total})`);

      // Only scan binary photos from /photos folder
      const photosFolder = await findFolder("photos", trialFolder.id);
      if (photosFolder) {
        const photoFilesResp = await gapi.client.drive.files.list({
          q: `'${photosFolder.id}' in parents and trashed=false`,
          fields: "files(id,name,mimeType,modifiedTime,size)",
          pageSize: 1000,
        });
        (photoFilesResp.result.files || []).forEach((file) => {
          if (!String(file.mimeType || "").startsWith("image/")) return;
          allPhotos.push({
            id: `binary:${file.id}`,
            section: "trial-photos",
            storageType: "binary",
            trialId,
            trialName,
            trialFolderId: trialFolder.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime,
            size: file.size,
            driveFileId: file.id,
          });
        });
      }
    }

    libraryState.trialPhotos = allPhotos;
    libraryState._trialPhotosLoaded = true;
    renderLibraryList();
    clearTrialPhotoProgress();
    setLibraryStatus(`Trial photos loaded (${allPhotos.length} binary files).`, "success");
    clearLibraryStatus(3000);
  } catch (error) {
    console.error("Error loading trial photos:", error);
    clearTrialPhotoProgress();
    setLibraryStatus("Failed to load trial photos.", "error");
  }
}

function setTrialPhotoProgress(pct, message) {
  const banner = document.getElementById("libraryStatusBanner");
  if (!banner) return;
  banner.classList.remove("hidden", "info", "success", "warning", "error", "loading");
  banner.classList.add("loading");
  banner.innerHTML = `
    <div class="trial-photo-progress-text">${escapeHtml(message || "")}</div>
    <div class="trial-photo-progress-bar">
      <div class="trial-photo-progress-fill" style="width: ${Math.min(100, Math.max(0, pct))}%"></div>
    </div>
  `;
}

function clearTrialPhotoProgress() {
  const banner = document.getElementById("libraryStatusBanner");
  if (!banner) return;
  banner.classList.add("hidden");
  banner.classList.remove("loading");
  banner.innerHTML = "";
}

async function scanInlineTrialPhotos() {
  // If already scanning, don't start another
  if (libraryState._scanningInline) {
    showToast("Scan already in progress...", "info");
    return;
  }

  // Create abort controller for this operation
  libraryState._operationAbort = new AbortController();
  libraryState._scanningInline = true;

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFoldersResp = await gapi.client.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1000,
    });
    const trialFolders = trialFoldersResp.result.files || [];
    
    // Resume from saved progress if available
    let inlinePhotos = libraryState._scanProgress?.discoveredPhotos || [];
    let startIndex = libraryState._scanProgress?.lastIndex || 0;
    
    const total = trialFolders.length;
    setTrialPhotoProgress(Math.round((startIndex / total) * 100), `Scanning inline: resuming from trial ${startIndex + 1}/${total}`);

    for (let i = startIndex; i < total; i++) {
      // Check if operation was cancelled
      if (libraryState._operationAbort?.signal.aborted) {
        console.log("Scan cancelled by user");
        break;
      }

      const trialFolder = trialFolders[i];
      const trialId = trialFolder.name;
      const trialName = trialState?.trials?.find((t) => t.id === trialId)?.name || trialId;
      const pct = Math.round(((i + 1) / total) * 100);
      setTrialPhotoProgress(pct, `Scanning inline: ${trialName} (${i + 1}/${total})`);

      const [responsesFolder, agronomyFolder] = await Promise.all([
        findFolder("responses", trialFolder.id),
        findFolder("agronomy", trialFolder.id),
      ]);

      const jsonFiles = [];
      if (responsesFolder) {
        const respList = await gapi.client.drive.files.list({
          q: `'${responsesFolder.id}' in parents and mimeType='application/json' and trashed=false`,
          fields: "files(id,name,modifiedTime)",
          pageSize: 1000,
        });
        (respList.result.files || []).forEach((f) => jsonFiles.push({ ...f, scope: "responses" }));
      }
      if (agronomyFolder) {
        const agroList = await gapi.client.drive.files.list({
          q: `'${agronomyFolder.id}' in parents and mimeType='application/json' and trashed=false`,
          fields: "files(id,name,modifiedTime)",
          pageSize: 1000,
        });
        (agroList.result.files || []).forEach((f) => jsonFiles.push({ ...f, scope: "agronomy" }));
      }

      for (const file of jsonFiles) {
        let data;
        try {
          data = await getFileContent(file.id);
        } catch (_) {
          continue;
        }
        if (!data || typeof data !== "object") continue;

        const areaMatch = String(file.name || "").match(/^(\d+)[~_]/);
        const areaIndex = areaMatch ? areaMatch[1] : null;
        collectInlinePhotosFromJson(data, {
          trialId,
          trialName,
          trialFolderId: trialFolder.id,
          sourceFileId: file.id,
          sourceFileName: file.name,
          sourceScope: file.scope,
          areaIndex,
          modifiedTime: file.modifiedTime,
        }, inlinePhotos);
      }

      // Save progress in case user navigates away
      libraryState._scanProgress = {
        lastIndex: i + 1,
        total: total,
        discoveredPhotos: inlinePhotos,
      };
    }

    // Merge with existing binary photos (avoid duplicates)
    const existingIds = new Set((libraryState.trialPhotos || []).map((p) => p.id));
    const newInline = inlinePhotos.filter((p) => !existingIds.has(p.id));
    libraryState.trialPhotos = [...(libraryState.trialPhotos || []), ...newInline];

    clearTrialPhotoProgress();
    libraryState._scanningInline = false;
    libraryState._scanProgress = null;
    libraryState._operationAbort = null;
    
    renderLibraryList();

    if (newInline.length > 0) {
      setLibraryStatus(`Found ${newInline.length} inline photo(s) not yet stored as binary.`, "warning");
    } else {
      setLibraryStatus("All photos are already stored as binary files.", "success");
      clearLibraryStatus(3000);
    }
  } catch (error) {
    console.error("Error scanning inline photos:", error);
    clearTrialPhotoProgress();
    libraryState._scanningInline = false;
    libraryState._scanProgress = null;
    libraryState._operationAbort = null;
    setLibraryStatus("Failed to scan inline photos.", "error");
  }
}

async function convertAllInlinePhotosToBinary() {
  // If already converting, don't start another
  if (libraryState._convertingInline) {
    showToast("Conversion already in progress...", "info");
    return;
  }

  const inlineItems = (libraryState.trialPhotos || []).filter((p) => p.storageType === "inline-json");
  if (inlineItems.length === 0) {
    showToast("No inline photos to convert.", "info");
    return;
  }

  // Create abort controller for this operation
  libraryState._operationAbort = new AbortController();
  libraryState._convertingInline = true;

  const total = inlineItems.length;
  let converted = libraryState._convertProgress?.converted || 0;
  let failed = libraryState._convertProgress?.failed || 0;
  let sourceIndex = libraryState._convertProgress?.sourceIndex || 0;
  let itemIndex = libraryState._convertProgress?.itemIndex || 0;
  
  setTrialPhotoProgress(Math.round(((converted + failed) / total) * 100), `Converting ${converted + failed}/${total}...`);

  // Group inline photos by sourceFileId to batch updates
  const bySource = new Map();
  for (const item of inlineItems) {
    if (!bySource.has(item.sourceFileId)) bySource.set(item.sourceFileId, []);
    bySource.get(item.sourceFileId).push(item);
  }

  const sourceEntries = Array.from(bySource.entries());

  for (let si = sourceIndex; si < sourceEntries.length; si++) {
    const [sourceFileId, items] = sourceEntries[si];
    let sourceData;
    try {
      sourceData = await getFileContent(sourceFileId);
    } catch (_) {
      failed += items.length;
      continue;
    }
    if (!sourceData || typeof sourceData !== "object") {
      failed += items.length;
      continue;
    }

    let sourceModified = false;
    const firstItem = items[0];

    for (let ii = (si === sourceIndex ? itemIndex : 0); ii < items.length; ii++) {
      // Check if operation was cancelled
      if (libraryState._operationAbort?.signal.aborted) {
        console.log("Conversion cancelled by user");
        libraryState._convertingInline = false;
        libraryState._convertProgress = null;
        libraryState._operationAbort = null;
        clearTrialPhotoProgress();
        showToast("Conversion paused. Will resume when you return.", "info");
        return;
      }

      const item = items[ii];
      const pct = Math.round(((converted + failed) / total) * 100);
      setTrialPhotoProgress(pct, `Converting ${converted + failed}/${total}...`);

      try {
        let node = sourceData;
        for (const key of (item.pointerPath || [])) {
          node = node?.[key];
          if (!node) break;
        }
        if (!node || !Array.isArray(node.photos)) { failed++; continue; }

        const rawPhoto = node.photos[item.photoIndex];
        if (typeof rawPhoto !== "string" || !rawPhoto.startsWith("data:")) { converted++; continue; }

        const { blob, width, height } = await compressPhotoToWebP(rawPhoto, 1000, 0.7);
        const photosFolderId = await getOrCreateFolder("photos", item.trialFolderId);
        const photoIdValue = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `photo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const fileName = `${photoIdValue}.webp`;
        const newFileId = await uploadBinaryFileToDrive(fileName, photosFolderId, blob, "image/webp");

        node.photos[item.photoIndex] = {
          photoId: photoIdValue,
          fileId: newFileId,
          width,
          height,
          timestamp: node.timestamp || new Date().toISOString(),
        };
        sourceModified = true;
        converted++;
      } catch (err) {
        console.warn("Convert failed for", item.id, err);
        failed++;
      }

      // Save progress in case user navigates away
      libraryState._convertProgress = {
        sourceIndex: si,
        itemIndex: ii + 1,
        converted: converted,
        failed: failed,
        total: total,
      };
    }

    if (sourceModified) {
      try {
        await updateJsonFileById(sourceFileId, firstItem.sourceFileName || "responses.json", sourceData);
      } catch (err) {
        console.warn("Failed to update source JSON:", err);
      }
    }
  }

  clearTrialPhotoProgress();
  libraryState._convertingInline = false;
  libraryState._convertProgress = null;
  libraryState._operationAbort = null;
  
  showToast(`Conversion complete: ${converted} converted, ${failed} failed.`, converted > 0 ? "success" : "warning");
  await loadTrialPhotoItems({ force: true });
}

function clearBulkSelection() {
  libraryState._selectedTrialPhotos.clear();
  libraryState._bulkSelectionMode = false;
  renderBulkActionBar();
  renderLibraryList();
}

async function bulkConvertSelected() {
  const selectedIds = Array.from(libraryState._selectedTrialPhotos);
  const selectedItems = (libraryState.trialPhotos || []).filter((p) => selectedIds.includes(p.id));
  const inlineItems = selectedItems.filter((p) => p.storageType === "inline-json");
  
  if (inlineItems.length === 0) {
    showToast("No inline photos to convert in selection.", "info");
    return;
  }

  libraryState._operationAbort = new AbortController();
  libraryState._convertingInline = true;

  const total = inlineItems.length;
  let converted = 0;
  let failed = 0;
  setTrialPhotoProgress(0, `Converting selected: 0/${total}...`);

  // Group by sourceFileId
  const bySource = new Map();
  for (const item of inlineItems) {
    if (!bySource.has(item.sourceFileId)) bySource.set(item.sourceFileId, []);
    bySource.get(item.sourceFileId).push(item);
  }

  for (const [sourceFileId, items] of bySource) {
    if (libraryState._operationAbort?.signal.aborted) break;

    let sourceData;
    try {
      sourceData = await getFileContent(sourceFileId);
    } catch (_) {
      failed += items.length;
      continue;
    }
    if (!sourceData || typeof sourceData !== "object") {
      failed += items.length;
      continue;
    }

    let sourceModified = false;
    const firstItem = items[0];

    for (const item of items) {
      if (libraryState._operationAbort?.signal.aborted) break;

      const pct = Math.round(((converted + failed) / total) * 100);
      setTrialPhotoProgress(pct, `Converting selected: ${converted + failed}/${total}...`);

      try {
        let node = sourceData;
        for (const key of (item.pointerPath || [])) {
          node = node?.[key];
          if (!node) break;
        }
        if (!node || !Array.isArray(node.photos)) { failed++; continue; }

        const rawPhoto = node.photos[item.photoIndex];
        if (typeof rawPhoto !== "string" || !rawPhoto.startsWith("data:")) { converted++; continue; }

        const { blob, width, height } = await compressPhotoToWebP(rawPhoto, 1000, 0.7);
        const photosFolderId = await getOrCreateFolder("photos", item.trialFolderId);
        const photoIdValue = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `photo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const fileName = `${photoIdValue}.webp`;
        const newFileId = await uploadBinaryFileToDrive(fileName, photosFolderId, blob, "image/webp");

        node.photos[item.photoIndex] = {
          photoId: photoIdValue,
          fileId: newFileId,
          width,
          height,
          timestamp: node.timestamp || new Date().toISOString(),
        };
        sourceModified = true;
        converted++;
      } catch (err) {
        console.warn("Convert failed for", item.id, err);
        failed++;
      }
    }

    if (sourceModified) {
      try {
        await updateJsonFileById(sourceFileId, firstItem.sourceFileName || "responses.json", sourceData);
      } catch (err) {
        console.warn("Failed to update source JSON:", err);
      }
    }
  }

  clearTrialPhotoProgress();
  libraryState._convertingInline = false;
  libraryState._operationAbort = null;
  clearBulkSelection();
  
  showToast(`Conversion complete: ${converted} converted, ${failed} failed.`, converted > 0 ? "success" : "warning");
  await loadTrialPhotoItems({ force: true });
}

async function bulkDeleteSelected() {
  const selectedIds = Array.from(libraryState._selectedTrialPhotos);
  const selectedItems = (libraryState.trialPhotos || []).filter((p) => selectedIds.includes(p.id));
  
  if (selectedItems.length === 0) return;

  const confirmed = confirm(`Delete ${selectedItems.length} photo(s)?\n\nThis will remove them from the library. Inline photos will be removed from their source files, and binary photos will be deleted from Drive.`);
  if (!confirmed) return;

  let deleted = 0;
  let failed = 0;
  setTrialPhotoProgress(0, `Deleting: 0/${selectedItems.length}...`);

  // For inline photos, remove from source
  const inlineBySource = new Map();
  const binaryIds = [];
  
  for (const item of selectedItems) {
    if (item.storageType === "inline-json") {
      if (!inlineBySource.has(item.sourceFileId)) {
        inlineBySource.set(item.sourceFileId, []);
      }
      inlineBySource.get(item.sourceFileId).push(item);
    } else {
      binaryIds.push(item.driveFileId);
    }
  }

  // Delete inline photos from source
  for (const [sourceFileId, items] of inlineBySource) {
    let sourceData;
    try {
      sourceData = await getFileContent(sourceFileId);
    } catch (_) {
      failed += items.length;
      continue;
    }
    if (!sourceData || typeof sourceData !== "object") {
      failed += items.length;
      continue;
    }

    let sourceModified = false;
    const firstItem = items[0];

    for (const item of items) {
      try {
        let node = sourceData;
        for (const key of (item.pointerPath || [])) {
          node = node?.[key];
          if (!node) break;
        }
        if (node && Array.isArray(node.photos)) {
          node.photos.splice(item.photoIndex, 1);
          sourceModified = true;
          deleted++;
        }
      } catch (err) {
        console.warn("Delete failed for", item.id, err);
        failed++;
      }
    }

    if (sourceModified) {
      try {
        await updateJsonFileById(sourceFileId, firstItem.sourceFileName || "responses.json", sourceData);
      } catch (err) {
        console.warn("Failed to update source JSON:", err);
      }
    }
  }

  // Delete binary photos from Drive
  for (const fileId of binaryIds) {
    try {
      await gapi.client.drive.files.delete({ fileId });
      deleted++;
    } catch (err) {
      console.warn("Failed to delete binary photo:", err);
      failed++;
    }
  }

  clearTrialPhotoProgress();
  clearBulkSelection();
  
  showToast(`Deleted: ${deleted} photo(s)${failed > 0 ? `, ${failed} failed` : ""}.`, deleted > 0 ? "success" : "warning");
  await loadTrialPhotoItems({ force: true });
}

function collectInlinePhotosFromJson(node, baseMeta, output, path = []) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node.photos)) {
    node.photos.forEach((photo, idx) => {
      if (typeof photo === "string" && photo.startsWith("data:")) {
        output.push({
          id: `inline:${baseMeta.sourceFileId}:${path.join("|")}:${idx}`,
          section: "trial-photos",
          storageType: "inline-json",
          trialId: baseMeta.trialId,
          trialName: baseMeta.trialName,
          trialFolderId: baseMeta.trialFolderId,
          sourceFileId: baseMeta.sourceFileId,
          sourceFileName: baseMeta.sourceFileName,
          sourceScope: baseMeta.sourceScope,
          areaIndex: baseMeta.areaIndex,
          pointerPath: path,
          photoIndex: idx,
          modifiedTime: baseMeta.modifiedTime || null,
          mimeType: "image/*",
          name: `${baseMeta.trialName} · ${baseMeta.sourceFileName} · #${idx + 1}`,
        });
      }
    });
  }

  Object.entries(node).forEach(([k, v]) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return;
    collectInlinePhotosFromJson(v, baseMeta, output, [...path, k]);
  });
}

// ---- Background library status is rendered in #libraryStatusBanner ----

function getFileCategory(mimeType) {
  if (!mimeType) return "other";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

function getFileIcon(mimeType) {
  const category = getFileCategory(mimeType);
  switch (category) {
    case "pdf":
      return "picture_as_pdf";
    case "image":
      return "image";
    case "video":
      return "movie";
    default:
      return "insert_drive_file";
  }
}

function getFileIconColor(mimeType) {
  const category = getFileCategory(mimeType);
  switch (category) {
    case "pdf":
      return "var(--danger)";
    case "image":
      return "var(--success)";
    case "video":
      return "var(--warning)";
    default:
      return "var(--text-secondary)";
  }
}

function getTrialPhotoStorageBadge(storageType) {
  if (storageType === "binary") {
    return ''; // No badge for binary photos
  }
  return '<span class="library-photo-badge inline"><span class="material-symbols-rounded">warning</span> Inline JSON</span>';
}

async function getInlinePhotoDataUrl(item) {
  try {
    const sourceData = await getFileContent(item.sourceFileId);
    if (!sourceData || typeof sourceData !== "object") return null;
    
    let node = sourceData;
    for (const key of (item.pointerPath || [])) {
      node = node?.[key];
      if (!node) return null;
    }
    
    if (!node || !Array.isArray(node.photos)) return null;
    const photo = node.photos[item.photoIndex];
    if (typeof photo === "string" && photo.startsWith("data:")) {
      return photo;
    }
    return null;
  } catch (err) {
    console.warn("Error fetching inline photo:", err);
    return null;
  }
}

function renderTrialPhotoPreview(item) {
  const previewId = `trial-photo-preview-${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  
  if (item.storageType === "binary") {
    const imgHtml = `<img 
      id="${previewId}"
      class="library-item-preview"
      data-photo-fileid="${item.driveFileId}"
      data-loading="true"
      alt="${escapeHtml(item.name)}"
      onerror="this.dataset.loading='false'; this.alt='Failed to load'; this.classList.add('error')"
      onload="this.dataset.loading='false'"
    />`;
    return imgHtml;
  } else {
    // Inline photo - load async and update once available
    const imgHtml = `<img 
      id="${previewId}"
      class="library-item-preview"
      data-loading="true"
      alt="${escapeHtml(item.name)}"
      onerror="this.dataset.loading='false'; this.alt='Failed to load'; this.classList.add('error')"
      onload="this.dataset.loading='false'"
    />`;
    
    // Schedule async load
    setTimeout(() => {
      getInlinePhotoDataUrl(item).then(dataUrl => {
        const img = document.getElementById(previewId);
        if (!img) return;
        if (dataUrl) {
          img.src = dataUrl;
        } else {
          img.dataset.loading = "false";
          img.classList.add("error");
        }
      });
    }, 0);
    
    return imgHtml;
  }
}

function renderTrialPhotoActionBar() {
  const container = document.getElementById("trialPhotoActionsContainer");
  if (!container) return;

  const allItems = libraryState.trialPhotos || [];
  const inlineCount = allItems.filter((p) => p.storageType === "inline-json").length;
  const binaryCount = allItems.filter((p) => p.storageType === "binary").length;

  let actionBarHtml = `<div class="trial-photo-action-bar">`;
  actionBarHtml += `<button class="btn btn-secondary btn-sm" onclick="scanInlineTrialPhotos()"><span class="material-symbols-rounded">search</span> Scan Inline Photos</button>`;
  if (inlineCount > 0) {
    actionBarHtml += `<button class="btn btn-primary btn-sm" onclick="convertAllInlinePhotosToBinary()"><span class="material-symbols-rounded">conversion_path</span> Convert All to Binary (${inlineCount})</button>`;
  }
  actionBarHtml += `<span class="trial-photo-summary">${binaryCount} binary${inlineCount > 0 ? ` · ${inlineCount} inline` : ""}</span>`;
  actionBarHtml += `</div>`;

  container.innerHTML = actionBarHtml;
}

function renderBulkActionBar() {
  const container = document.getElementById("trialPhotoActionsContainer");
  if (!container) return;

  if (!libraryState._bulkSelectionMode || libraryState._selectedTrialPhotos.size === 0) {
    renderTrialPhotoActionBar();
    return;
  }

  const selectedIds = Array.from(libraryState._selectedTrialPhotos);
  const selectedItems = (libraryState.trialPhotos || []).filter((p) => selectedIds.includes(p.id));
  const inlineSelected = selectedItems.filter((p) => p.storageType === "inline-json");
  
  let actionBarHtml = `<div class="trial-photo-action-bar bulk-action-bar">`;
  actionBarHtml += `<span class="bulk-selection-info">${selectedIds.length} selected</span>`;
  
  if (inlineSelected.length > 0) {
    actionBarHtml += `<button class="btn btn-primary btn-sm" onclick="bulkConvertSelected()"><span class="material-symbols-rounded">conversion_path</span> Convert to Binary (${inlineSelected.length})</button>`;
  }
  
  actionBarHtml += `<button class="btn btn-danger btn-sm" onclick="bulkDeleteSelected()"><span class="material-symbols-rounded">delete</span> Delete</button>`;
  actionBarHtml += `<button class="btn btn-secondary btn-sm" onclick="clearBulkSelection()"><span class="material-symbols-rounded">close</span> Cancel</button>`;
  actionBarHtml += `</div>`;

  container.innerHTML = actionBarHtml;
}

function renderTrialPhotoList(container) {
  const allItems = libraryState.trialPhotos || [];
  const query = (libraryState.searchQuery || "").toLowerCase();

  let filtered = allItems.filter((item) => {
    if (!query) return true;
    const haystack = [
      item.name,
      item.trialName,
      item.trialId,
      item.sourceFileName,
      item.storageType,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });

  const sortDir = libraryState.sortDir === "asc" ? 1 : -1;
  filtered = filtered.sort((a, b) => {
    let av;
    let bv;
    switch (libraryState.sortBy) {
      case "name":
        av = (a.name || "").toLowerCase();
        bv = (b.name || "").toLowerCase();
        return av.localeCompare(bv) * sortDir;
      case "type":
        av = a.storageType || "";
        bv = b.storageType || "";
        return av.localeCompare(bv) * sortDir;
      case "size":
        av = Number(a.size || 0);
        bv = Number(b.size || 0);
        return (av - bv) * sortDir;
      case "modifiedTime":
      default:
        av = new Date(a.modifiedTime || 0).getTime();
        bv = new Date(b.modifiedTime || 0).getTime();
        return (av - bv) * sortDir;
    }
  });

  if (filtered.length === 0) {
    container.classList.add("library-grid-empty");
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">photo_library</span>
        <p>No trial photos found for current filter.</p>
      </div>
    `;
    return;
  }

  container.classList.remove("library-grid-empty");
  container.innerHTML = filtered.map((item) => {
    const dateLabel = item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : "-";
    const metaRight = item.storageType === "binary"
      ? `${formatFileSize(Number(item.size || 0))} · ${dateLabel}`
      : `${item.sourceScope || "json"} · ${item.sourceFileName || "source"}`;
    const isSelected = libraryState._selectedTrialPhotos.has(item.id);

    return `
      <div class="library-item ${isSelected ? "selected" : ""}" data-trial-photo-id="${item.id}">
        <div class="library-item-checkbox">
          <input type="checkbox" class="trial-photo-checkbox" data-trial-photo-id="${item.id}" ${isSelected ? "checked" : ""}>
        </div>
        <div class="library-item-icon">
          ${renderTrialPhotoPreview(item)}
        </div>
        <div class="library-item-info">
          <div class="library-item-name">${escapeHtml(item.trialName || item.trialId || "Trial")}</div>
          <div class="library-item-meta">${escapeHtml(metaRight)}</div>
        </div>
        <div class="library-item-storage">${getTrialPhotoStorageBadge(item.storageType)}</div>
        <div class="library-item-actions" style="opacity:1;">
          <button class="icon-btn view-trial-photo-btn" data-trial-photo-id="${item.id}" title="Detail">
            <span class="material-symbols-rounded">visibility</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Load binary photos from Drive
  loadExternalPhotos(container);

  // Checkbox event handlers
  container.querySelectorAll(".trial-photo-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const itemId = checkbox.dataset.trialPhotoId;
      if (checkbox.checked) {
        libraryState._selectedTrialPhotos.add(itemId);
      } else {
        libraryState._selectedTrialPhotos.delete(itemId);
      }
      libraryState._bulkSelectionMode = libraryState._selectedTrialPhotos.size > 0;
      renderBulkActionBar();
      renderLibraryList();
    });
  });

  container.querySelectorAll(".view-trial-photo-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTrialPhotoDetail(btn.dataset.trialPhotoId);
    });
  });

  // Item preview click only if not in bulk selection mode
  if (!libraryState._bulkSelectionMode) {
    container.querySelectorAll(".library-item[data-trial-photo-id]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".trial-photo-checkbox")) return;
        openTrialPhotoDetail(row.dataset.trialPhotoId);
      });
    });
  }
}

// ─── Library list mode helpers ───
function getLibraryListColumns() {
  return [
    { key: "name", label: "Name", min: 120, flex: true },
    { key: "type", label: "Type", min: 70, width: 90 },
    { key: "size", label: "Size", min: 70, width: 90 },
    { key: "date", label: "Date", min: 90, width: 110 },
    { key: "actions", label: "Actions", auto: true, fixed: true },
  ];
}

function getLibraryListTemplate(columns) {
  return columns.map((col) => {
    if (col.flex) return `minmax(${col.min || 80}px, 1fr)`;
    if (col.auto) return "auto";
    return `${col.width || 100}px`;
  }).join(" ");
}

function renderLibraryListMode(container, displayItems) {
  const columns = getLibraryListColumns();
  const template = getLibraryListTemplate(columns);

  const headerHtml = `
    <div class="inventory-list-header">
      ${columns.map((col) => `
        <div class="inventory-list-head-cell"><span>${escapeHtml(col.label)}</span></div>
      `).join("")}
    </div>
  `;

  const rowsHtml = displayItems.map((file) => {
    if (file.isUploading) {
      const progress = Math.round(file.progress || 0);
      return `
        <div class="inventory-list-row">
          <div class="inventory-list-cell">${escapeHtml(file.name)}</div>
          <div class="inventory-list-cell">—</div>
          <div class="inventory-list-cell">Uploading…</div>
          <div class="inventory-list-cell">${progress}%</div>
          <div class="inventory-list-cell inventory-list-cell-actions"></div>
        </div>`;
    }

    const sizeLabel = file.size ? formatFileSize(Number(file.size)) : "-";
    const dateLabel = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "-";
    const category = typeof getFileCategory === "function" ? getFileCategory(file.mimeType) : "-";

    return `
      <div class="inventory-list-row" data-id="${file.id}" style="cursor:pointer">
        <div class="inventory-list-cell" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="inventory-list-cell">${escapeHtml(category)}</div>
        <div class="inventory-list-cell">${sizeLabel}</div>
        <div class="inventory-list-cell">${dateLabel}</div>
        <div class="inventory-list-cell inventory-list-cell-actions">
          <div class="library-item-actions" style="opacity:1">
            <button class="icon-btn view-btn" data-id="${file.id}" title="View"><span class="material-symbols-rounded">visibility</span></button>
            <button class="icon-btn delete-btn" data-id="${file.id}" title="Delete"><span class="material-symbols-rounded">delete</span></button>
          </div>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `<div class="inventory-list-table" style="grid-template-columns:${template}">${headerHtml}${rowsHtml}</div>`;

  container.querySelectorAll(".inventory-list-row[data-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (!e.target.closest(".library-item-actions")) {
        openLibraryDetail(row.dataset.id);
      }
    });
  });
  container.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openLibraryDetail(btn.dataset.id); });
  });
  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteLibraryItem(btn.dataset.id); });
  });
}

function renderLibraryList() {
  const container = document.getElementById("libraryList");
  if (!container) return;

  if (libraryState.section === "trial-photos") {
    renderTrialPhotoList(container);
    renderBulkActionBar();
    return;
  }

  // Combine items with uploading files
  const allItems = [...libraryState.items];
  const uploadingItems = Object.entries(libraryState.uploading).map(
    ([fileName, data]) => ({
      name: fileName,
      isUploading: true,
      progress: data.progress,
    })
  );

  // Filter items based on search and filter
  let filteredItems = allItems.filter((file) => {
    // Search filter
    if (libraryState.searchQuery) {
      if (!file.name.toLowerCase().includes(libraryState.searchQuery)) {
        return false;
      }
    }

    // Type filter
    if (libraryState.activeFilter !== "all") {
      const category = getFileCategory(file.mimeType);
      if (category !== libraryState.activeFilter) {
        return false;
      }
    }

    return true;
  });

  const sortDir = libraryState.sortDir === "asc" ? 1 : -1;
  filteredItems = filteredItems.sort((a, b) => {
    let aVal;
    let bVal;

    switch (libraryState.sortBy) {
      case "name":
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
        return aVal.localeCompare(bVal) * sortDir;
      case "size":
        aVal = Number(a.size || 0);
        bVal = Number(b.size || 0);
        return (aVal - bVal) * sortDir;
      case "type":
        aVal = getFileCategory(a.mimeType || "");
        bVal = getFileCategory(b.mimeType || "");
        return aVal.localeCompare(bVal) * sortDir;
      case "modifiedTime":
      default:
        aVal = new Date(a.modifiedTime || 0).getTime();
        bVal = new Date(b.modifiedTime || 0).getTime();
        return (aVal - bVal) * sortDir;
    }
  });

  // Combine filtered items with uploading items at the top
  const displayItems = [...uploadingItems, ...filteredItems];

  if (displayItems.length === 0) {
    const emptyMessage =
      libraryState.items.length === 0
        ? "No files yet. Upload your first document to the library."
        : "No files match your search or filter.";

    container.classList.add('library-grid-empty');
    container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-rounded">folder_open</span>
                <p>${emptyMessage}</p>
            </div>
        `;
    setLibraryDetailVisible(false);
    return;
  }

  // Reset grid to normal when showing items
  container.classList.remove('library-grid-empty');

  container.innerHTML = displayItems
    .map((file) => {
      if (file.isUploading) {
        // Render uploading item with progress
        const progress = Math.round(file.progress || 0);
        const circumference = 2 * Math.PI * 18;
        const strokeDashoffset = circumference - (progress / 100) * circumference;

        return `
          <div class="library-item" data-uploading="${file.name}">
              <div class="library-item-icon uploading">
                  <div class="upload-progress-circle">
                      <svg width="40" height="40" viewBox="0 0 40 40">
                          <circle class="progress-ring" cx="20" cy="20" r="18" 
                                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}"></circle>
                      </svg>
                      <div class="upload-progress-text">${progress}%</div>
                  </div>
              </div>
              <div class="library-item-info">
                  <div class="library-item-name">${escapeHtml(file.name)}</div>
                  <div class="library-item-meta">Uploading...</div>
              </div>
          </div>
        `;
      }

      const sizeLabel = file.size ? formatFileSize(Number(file.size)) : "-";
      const dateLabel = file.modifiedTime
        ? new Date(file.modifiedTime).toLocaleDateString()
        : "-";
      const icon = getFileIcon(file.mimeType);
      const iconColor = getFileIconColor(file.mimeType);

      return `
            <div class="library-item ${libraryState.selectedId === file.id ? "selected" : ""}" data-id="${file.id}">
                <div class="library-item-icon" style="color: ${iconColor}">
                    <span class="material-symbols-rounded">${icon}</span>
                </div>
                <div class="library-item-info">
                    <div class="library-item-name">${escapeHtml(file.name)}</div>
                    <div class="library-item-meta">${sizeLabel} · ${dateLabel}</div>
                </div>
                <div class="library-item-actions">
                    <button class="icon-btn view-btn" data-id="${file.id}" title="View">
                        <span class="material-symbols-rounded">visibility</span>
                    </button>
                    <button class="icon-btn delete-btn" data-id="${file.id}" title="Delete">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                </div>
            </div>
        `;
    })
    .join("");

  // Click on item to view
  container.querySelectorAll(".library-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (!e.target.closest(".library-item-actions")) {
        openLibraryDetail(item.dataset.id);
      }
    });
  });

  container.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openLibraryDetail(btn.dataset.id);
    });
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteLibraryItem(btn.dataset.id);
    });
  });
}

async function uploadLibraryFiles(files) {
  if (!libraryState.folderId) return;

  for (const file of files) {
    await uploadLibraryFile(file);
  }

  await loadLibraryItems();
  showSuccessMessage("Files uploaded.");
}

async function uploadLibraryFile(file) {
  const boundary = "-------advanta-library-boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    parents: [libraryState.folderId],
  };

  const body = new Blob([
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${metadata.mimeType}\r\n\r\n`,
    file,
    closeDelimiter,
  ]);

  // Track upload progress
  libraryState.uploading[file.name] = { progress: 0 };
  renderLibraryList();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        libraryState.uploading[file.name].progress = percentComplete;
        renderLibraryList();
      }
    });

    xhr.addEventListener("load", async () => {
      if (xhr.status === 200) {
        delete libraryState.uploading[file.name];
        try {
          const result = JSON.parse(xhr.responseText);
          resolve(result);
        } catch (e) {
          reject(new Error("Failed to parse response"));
        }
      } else {
        delete libraryState.uploading[file.name];
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      delete libraryState.uploading[file.name];
      reject(new Error("Upload error"));
    });

    xhr.addEventListener("abort", () => {
      delete libraryState.uploading[file.name];
      reject(new Error("Upload aborted"));
    });

    xhr.open(
      "POST",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
    );
    xhr.setRequestHeader(
      "Authorization",
      `Bearer ${getAccessToken()}`
    );
    xhr.setRequestHeader(
      "Content-Type",
      `multipart/related; boundary=${boundary}`
    );
    xhr.send(body);
  });
}

async function openLibraryDetail(fileId) {
  if (libraryState.section === "trial-photos") {
    return openTrialPhotoDetail(fileId);
  }

  const file = libraryState.items.find((item) => item.id === fileId);
  if (!file) return;

  const renameBtn = document.getElementById("libraryRenameBtn");
  const deleteBtn = document.getElementById("libraryDeleteBtn");
  const downloadBtn = document.getElementById("libraryDownloadBtn");
  if (renameBtn) renameBtn.classList.remove("hidden");
  if (deleteBtn) deleteBtn.classList.remove("hidden");
  if (downloadBtn) {
    downloadBtn.classList.remove("hidden");
    downloadBtn.onclick = () => downloadLibraryItem();
  }

  libraryState.selectedId = fileId;
  setLibraryDetailVisible(true);
  updateLibraryDetailMeta(file);

  const preview = document.getElementById("libraryPreview");
  if (!preview) return;

  preview.innerHTML = "<p>Loading preview...</p>";

  try {
    const blob = await fetchLibraryFileBlob(fileId);
    if (libraryState.previewUrl) {
      URL.revokeObjectURL(libraryState.previewUrl);
    }
    libraryState.previewUrl = URL.createObjectURL(blob);
    renderLibraryPreview(file, libraryState.previewUrl);
  } catch (error) {
    console.error("Error loading preview:", error);
    preview.innerHTML = "<p>Unable to load preview.</p>";
  }
}

async function openTrialPhotoDetail(photoId) {
  const item = (libraryState.trialPhotos || []).find((p) => p.id === photoId);
  if (!item) return;

  libraryState.selectedId = photoId;
  setLibraryDetailVisible(true);

  const title = document.getElementById("libraryDetailTitle");
  const meta = document.getElementById("libraryDetailMeta");
  const preview = document.getElementById("libraryPreview");
  const renameBtn = document.getElementById("libraryRenameBtn");
  const deleteBtn = document.getElementById("libraryDeleteBtn");
  const downloadBtn = document.getElementById("libraryDownloadBtn");

  if (title) title.textContent = `${item.trialName || item.trialId} · Photo`;
  if (meta) {
    const parts = [
      `Storage: ${item.storageType === "binary" ? "Binary" : "Inline JSON"}`,
      item.sourceFileName ? `Source: ${item.sourceFileName}` : null,
      item.areaIndex != null ? `Area ${Number(item.areaIndex) + 1}` : null,
    ].filter(Boolean);
    meta.textContent = parts.join(" · ");
  }

  if (renameBtn) renameBtn.classList.add("hidden");
  if (deleteBtn) deleteBtn.classList.add("hidden");
  if (downloadBtn) {
    downloadBtn.classList.toggle("hidden", item.storageType !== "binary");
    downloadBtn.onclick = () => downloadTrialPhotoItem(item.id);
  }

  if (!preview) return;
  preview.innerHTML = "<p>Loading photo detail...</p>";

  try {
    let photoUrl = "";
    if (item.storageType === "binary") {
      const blob = await fetchLibraryFileBlob(item.driveFileId);
      if (libraryState.previewUrl) URL.revokeObjectURL(libraryState.previewUrl);
      libraryState.previewUrl = URL.createObjectURL(blob);
      photoUrl = libraryState.previewUrl;
    } else {
      photoUrl = await resolveInlinePhotoDataUrl(item);
    }

    const statusHtml = item.storageType === "binary"
      ? `<div class="trial-photo-detail-status ok"><span class="material-symbols-rounded">check_circle</span> Stored as separate binary file</div>`
      : `<div class="trial-photo-detail-status warn"><span class="material-symbols-rounded">warning</span> Still inline in JSON</div>`;

    const actionHtml = item.storageType === "inline-json"
      ? `<button class="btn btn-primary" onclick="convertInlineTrialPhotoToBinary('${item.id}')"><span class="material-symbols-rounded">conversion_path</span> Convert to Binary</button>`
      : "";

    preview.innerHTML = `
      <div class="trial-photo-detail-wrap">
        <div class="trial-photo-preview-panel">
          <img src="${photoUrl}" alt="Trial Photo">
        </div>
        <div class="trial-photo-info-panel">
          ${statusHtml}
          <div class="trial-photo-info-row"><strong>Trial:</strong> ${escapeHtml(item.trialName || item.trialId || "-")}</div>
          <div class="trial-photo-info-row"><strong>Area:</strong> ${item.areaIndex != null ? `Area ${Number(item.areaIndex) + 1}` : "-"}</div>
          <div class="trial-photo-info-row"><strong>Source:</strong> ${escapeHtml(item.sourceFileName || "Binary file")}</div>
          ${actionHtml ? `<div class="trial-photo-info-actions">${actionHtml}</div>` : ""}
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Failed to open trial photo detail:", error);
    preview.innerHTML = "<p>Unable to load trial photo detail.</p>";
  }
}

async function resolveInlinePhotoDataUrl(item) {
  const sourceData = await getFileContent(item.sourceFileId);
  if (!sourceData || typeof sourceData !== "object") throw new Error("Invalid source JSON");

  let node = sourceData;
  for (const key of (item.pointerPath || [])) {
    node = node?.[key];
    if (!node) break;
  }
  if (!node || !Array.isArray(node.photos)) {
    throw new Error("Photo pointer not found");
  }
  const photo = node.photos[item.photoIndex];
  if (typeof photo !== "string" || !photo.startsWith("data:")) {
    throw new Error("Photo already converted or missing");
  }
  return photo;
}

async function updateJsonFileById(fileId, fileName, data) {
  const boundary = "-------advanta-update-json-boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metadata = {
    name: fileName,
    mimeType: "application/json",
  };

  const body =
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(data, null, 2) +
    closeDelimiter;

  await gapi.client.request({
    path: `/upload/drive/v3/files/${fileId}`,
    method: "PATCH",
    params: { uploadType: "multipart" },
    headers: {
      "Content-Type": `multipart/related; boundary=\"${boundary}\"`,
    },
    body,
  });
}

async function convertInlineTrialPhotoToBinary(photoId) {
  const item = (libraryState.trialPhotos || []).find((p) => p.id === photoId);
  if (!item || item.storageType !== "inline-json") return;

  const preview = document.getElementById("libraryPreview");
  if (preview) {
    preview.insertAdjacentHTML("beforeend", `<p id="trialPhotoConvertMsg"><span class="spinner-sm"></span> Converting photo...</p>`);
  }

  try {
    const sourceData = await getFileContent(item.sourceFileId);
    if (!sourceData || typeof sourceData !== "object") throw new Error("Source JSON missing");

    let node = sourceData;
    for (const key of (item.pointerPath || [])) {
      node = node?.[key];
      if (!node) break;
    }
    if (!node || !Array.isArray(node.photos)) throw new Error("Photo pointer not found");

    const rawPhoto = node.photos[item.photoIndex];
    if (typeof rawPhoto !== "string" || !rawPhoto.startsWith("data:")) {
      showToast("Photo already converted or invalid.", "info");
      await loadTrialPhotoItems({ force: true });
      return;
    }

    const { blob, width, height } = await compressPhotoToWebP(rawPhoto, 1000, 0.7);
    const photosFolderId = await getOrCreateFolder("photos", item.trialFolderId);
    const photoIdValue = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `photo_${Date.now()}`;
    const fileName = `${photoIdValue}.webp`;
    const newFileId = await uploadBinaryFileToDrive(fileName, photosFolderId, blob, "image/webp");

    node.photos[item.photoIndex] = {
      photoId: photoIdValue,
      fileId: newFileId,
      width,
      height,
      timestamp: node.timestamp || new Date().toISOString(),
    };

    await updateJsonFileById(item.sourceFileId, item.sourceFileName || "responses.json", sourceData);
    showToast("Photo converted to binary successfully.", "success");

    await loadTrialPhotoItems({ force: true });
    openTrialPhotoDetail(`binary:${newFileId}`);
  } catch (error) {
    console.error("Inline to binary conversion failed:", error);
    showToast("Failed to convert inline photo.", "error");
  } finally {
    const msg = document.getElementById("trialPhotoConvertMsg");
    if (msg) msg.remove();
  }
}

async function downloadTrialPhotoItem(photoId) {
  const item = (libraryState.trialPhotos || []).find((p) => p.id === photoId);
  if (!item || item.storageType !== "binary") return;

  try {
    const blob = await fetchLibraryFileBlob(item.driveFileId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name || `${item.trialId || "trial-photo"}.webp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading trial photo:", error);
    showToast("Failed to download trial photo.", "error");
  }
}

function renderLibraryPreview(file, url) {
  const preview = document.getElementById("libraryPreview");
  if (!preview) return;

  if (file.mimeType === "application/pdf") {
    preview.innerHTML = `<iframe src="${url}" class="library-preview-iframe"></iframe>`;
    return;
  }

  if (file.mimeType && file.mimeType.startsWith("image/")) {
    preview.innerHTML = `<img src="${url}" alt="${escapeHtml(file.name)}">`;
    return;
  }

  if (file.mimeType && file.mimeType.startsWith("video/")) {
    preview.innerHTML = `<video src="${url}" controls></video>`;
    return;
  }

  preview.innerHTML = `
        <div class="library-preview-fallback">
            <p>Preview not available for this file type.</p>
            <!--<a href="${url}" download="${escapeHtml(file.name)}" class="btn btn-primary library-download-btn">Download</a>-->
        </div>
    `;
}

async function fetchLibraryFileBlob(fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Download failed");
  }

  return response.blob();
}

function formatMimeLabel(mimeType) {
  if (!mimeType) return "Unknown";
  const map = {
    "application/pdf": "PDF",
    "application/zip": "ZIP Archive",
    "application/x-zip-compressed": "ZIP Archive",
    "application/json": "JSON",
    "application/xml": "XML",
    "text/plain": "Text",
    "text/csv": "CSV",
    "text/html": "HTML",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel (XLSX)",
    "application/vnd.ms-excel": "Excel (XLS)",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (DOCX)",
    "application/msword": "Word (DOC)",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint (PPTX)",
    "application/vnd.ms-powerpoint": "PowerPoint (PPT)",
    "application/vnd.google-apps.spreadsheet": "Google Sheets",
    "application/vnd.google-apps.document": "Google Docs",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.folder": "Folder",
  };
  if (map[mimeType]) return map[mimeType];
  if (mimeType.startsWith("image/")) return "Image (" + mimeType.split("/")[1].toUpperCase() + ")";
  if (mimeType.startsWith("video/")) return "Video (" + mimeType.split("/")[1].toUpperCase() + ")";
  if (mimeType.startsWith("audio/")) return "Audio (" + mimeType.split("/")[1].toUpperCase() + ")";
  // Fallback: take last segment after last dot or slash
  const parts = mimeType.split(/[/.]+/);
  const last = parts[parts.length - 1];
  return last.length <= 12 ? last.toUpperCase() : mimeType;
}

function updateLibraryDetailMeta(file) {
  const title = document.getElementById("libraryDetailTitle");
  const meta = document.getElementById("libraryDetailMeta");

  if (title) {
    title.textContent = file.name;
  }

  if (meta) {
    const sizeLabel = file.size ? formatFileSize(Number(file.size)) : "-";
    const dateLabel = file.modifiedTime
      ? new Date(file.modifiedTime).toLocaleString()
      : "-";
    meta.textContent = `${formatMimeLabel(file.mimeType)} · ${sizeLabel} · ${dateLabel}`;
  }
}

function setLibraryDetailVisible(show) {
  const modal = document.getElementById("libraryPreviewModal");
  if (!modal) return;
  modal.classList.toggle("active", show);
}

async function renameLibraryItem(fileId = null) {
  const targetId = fileId || libraryState.selectedId;
  if (!targetId) return;

  const item = libraryState.items.find((file) => file.id === targetId);
  if (!item) return;

  const newName = prompt("Rename file:", item.name);
  if (!newName || newName.trim() === item.name) return;

  await gapi.client.drive.files.update({
    fileId: targetId,
    resource: { name: newName.trim() },
  });

  await loadLibraryItems();
  openLibraryDetail(targetId);
}

async function deleteLibraryItem(fileId = null) {
  const targetId = fileId || libraryState.selectedId;
  if (!targetId) return;

  const item = libraryState.items.find((file) => file.id === targetId);
  if (!item) return;

  showConfirmModal(
    "Delete File",
    `Delete ${item.name}? This cannot be undone.`,
    async () => {
      await gapi.client.drive.files.delete({ fileId: targetId });
      if (libraryState.selectedId === targetId) {
        libraryState.selectedId = null;
        if (libraryState.previewUrl) {
          URL.revokeObjectURL(libraryState.previewUrl);
          libraryState.previewUrl = null;
        }
        setLibraryDetailVisible(false);
      }

      await loadLibraryItems();
      showToast("File deleted", "success");
    }
  );
}

async function downloadLibraryItem() {
  if (!libraryState.selectedId) return;

  const file = libraryState.items.find(
    (item) => item.id === libraryState.selectedId,
  );
  if (!file) return;

  try {
    const blob = await fetchLibraryFileBlob(libraryState.selectedId);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading file:", error);
    showToast("Failed to download file.", "error");
  }
}

function closeLibraryDetail() {
  libraryState.selectedId = null;
  if (libraryState.previewUrl) {
    URL.revokeObjectURL(libraryState.previewUrl);
    libraryState.previewUrl = null;
  }
  setLibraryDetailVisible(false);
  renderLibraryList(); // Refresh to remove selected state
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
