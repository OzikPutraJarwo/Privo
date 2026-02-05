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
};

async function initializeLibrary() {
  try {
    libraryState.folderId = await getOrCreateFolder(
      "Library",
      driveState.advantaFolderId,
    );
    setupLibraryEvents();
    await loadLibraryItems();
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
  const filterBtns = document.querySelectorAll(".library-filter-btn");
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

  // Filter functionality
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      libraryState.activeFilter = btn.dataset.filter;
      renderLibraryList();
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

  // Filter items based on search and filter
  let filteredItems = libraryState.items.filter((file) => {
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

  if (filteredItems.length === 0) {
    const emptyMessage =
      libraryState.items.length === 0
        ? "No files yet. Upload your first document to the library."
        : "No files match your search or filter.";

    container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-rounded">folder_open</span>
                <p>${emptyMessage}</p>
            </div>
        `;
    setLibraryDetailVisible(false);
    return;
  }

  container.innerHTML = filteredItems
    .map((file) => {
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

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Upload failed");
  }

  return response.json();
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
    preview.innerHTML = `<iframe src="${url}" style="height: 520px;"></iframe>`;
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
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <p>Preview not available for this file type.</p>
            <a href="${url}" download="${escapeHtml(file.name)}" class="btn btn-primary" style="width: fit-content;">Download</a>
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
    meta.textContent = `${file.mimeType || "Unknown"} · ${sizeLabel} · ${dateLabel}`;
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

  if (!confirm(`Delete ${item.name}? This cannot be undone.`)) return;

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
    alert("Failed to download file.");
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
