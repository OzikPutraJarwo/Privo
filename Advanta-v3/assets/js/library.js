// Library Management
let libraryState = {
  items: [],
  folderId: null,
  selectedId: null,
  previewUrl: null,
  searchQuery: "",
  activeFilter: "all",
  sortBy: "modifiedTime",
  sortDir: "desc",
  uploading: {}, // Track upload progress by file name: { filename: { progress: 0-100 } }
  _driveLoaded: false, // Whether items have been loaded from Drive this session
};

async function initializeLibrary(options = {}) {
  const onProgress = options.onProgress;

  try {
    // Load from local cache only (no Drive fetch at startup)
    const cached = typeof loadLocalCache === "function"
      ? loadLocalCache("library")
      : null;

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
        await incrementalRefreshLibrary();
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
 * Shows a loading popup with file-count progress. Skips if already loaded this session.
 */
async function lazyLoadLibraryFromDrive() {
  if (libraryState._driveLoaded) return;
  if (!libraryState.folderId) return;

  // Show loading popup overlay
  showLibraryLoadingPopup("Loading library files...", 0);

  try {
    const response = await gapi.client.drive.files.list({
      q: `'${libraryState.folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, modifiedTime, size)",
      orderBy: "modifiedTime desc",
      pageSize: 1000,
    });

    const files = response.result.files || [];
    const total = files.length;

    // Update progress as we process each file
    for (let i = 0; i < files.length; i++) {
      updateLibraryLoadingProgress(Math.round(((i + 1) / total) * 100), `Loaded ${i + 1} of ${total} files`);
    }

    libraryState.items = files;
    libraryState._driveLoaded = true;
    renderLibraryList();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("library", { items: libraryState.items });
    }

    hideLibraryLoadingPopup();
    showToast(`Library loaded (${files.length} files).`, "success");
  } catch (error) {
    console.error("Error lazy-loading library:", error);
    hideLibraryLoadingPopup();
    showToast("Error loading library from Drive.", "error");
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

// ---- Library Loading Popup ----

function showLibraryLoadingPopup(message, percent) {
  let popup = document.getElementById("libraryLoadingPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "libraryLoadingPopup";
    popup.className = "library-loading-popup-overlay";
    popup.innerHTML = `
      <div class="library-loading-popup">
        <span class="spinner-sm"></span>
        <p id="libraryLoadingMsg">${message || "Loading..."}</p>
        <div class="library-loading-bar-track">
          <div class="library-loading-bar-fill" id="libraryLoadingBar" style="width:${percent || 0}%"></div>
        </div>
        <span class="library-loading-percent" id="libraryLoadingPercent">${percent || 0}%</span>
      </div>
    `;
    document.body.appendChild(popup);
  }
  popup.classList.add("active");
}

function updateLibraryLoadingProgress(percent, message) {
  const bar = document.getElementById("libraryLoadingBar");
  const pct = document.getElementById("libraryLoadingPercent");
  const msg = document.getElementById("libraryLoadingMsg");
  if (bar) bar.style.width = percent + "%";
  if (pct) pct.textContent = percent + "%";
  if (msg && message) msg.textContent = message;
}

function hideLibraryLoadingPopup() {
  const popup = document.getElementById("libraryLoadingPopup");
  if (popup) {
    popup.classList.remove("active");
    popup.remove();
  }
}

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

function renderLibraryList() {
  const container = document.getElementById("libraryList");
  if (!container) return;

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
  const file = libraryState.items.find((item) => item.id === fileId);
  if (!file) return;

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
