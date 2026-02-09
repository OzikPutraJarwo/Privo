// Main App Controller

// Loading & Caching Helpers
const CACHE_VERSION = 1;

function getCacheKey(name) {
  const user = getCurrentUser?.();
  const userKey = user?.email || "anonymous";
  return `advanta_cache_v${CACHE_VERSION}_${name}_${userKey}`;
}

function loadLocalCache(name) {
  try {
    const raw = localStorage.getItem(getCacheKey(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CACHE_VERSION) return null;
    return parsed.data || null;
  } catch (error) {
    console.warn("Failed to load cache:", name, error);
    return null;
  }
}

function saveLocalCache(name, data) {
  try {
    const payload = {
      version: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(getCacheKey(name), JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to save cache:", name, error);
  }
}

function clearLocalCache() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(`advanta_cache_v${CACHE_VERSION}_`)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn("Failed to clear cache:", error);
  }
}

// Show/hide loading spinner
function showLoading(show) {
  const spinner = document.getElementById("loadingSpinner");
  if (show) {
    spinner.classList.add("active");
    setLoadingProgress(0, "Loading...");
  } else {
    spinner.classList.remove("active");
  }
}

function setLoadingProgress(percent, message) {
  const bar = document.getElementById("loadingProgressBar");
  const text = document.getElementById("loadingProgressText");
  const pct = document.getElementById("loadingProgressPercent");
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

  if (bar) bar.style.width = `${safePercent}%`;
  if (text && message) text.textContent = message;
  if (pct) pct.textContent = `${safePercent}%`;
}

// Show success message
function showSuccessMessage(message) {
  console.log("Success:", message);
  // You can add a toast notification here in the future
}

// Show error message
function showErrorMessage(message) {
  console.error("Error:", message);
  showAlert(message, "error");
}

// Show generic alert modal
function showAlert(message, type = "info", title = null) {
  const modal = document.getElementById("alertModal");
  const titleEl = document.getElementById("alertModalTitle");
  const msgEl = document.getElementById("alertModalMessage");
  const btnEl = document.getElementById("alertModalBtn");
  const iconEl = document.getElementById("alertModalIcon");
  const headerEl = document.getElementById("alertModalHeader");
  
  if (!modal) return;
  
  // Set title
  if (title) {
    titleEl.textContent = title;
  } else {
    titleEl.textContent = type === "error" ? "Error" : type === "success" ? "Success" : "Message";
  }
  
  // Set message
  msgEl.textContent = message;
  
  // Set icon and styling
  headerEl.style.background = 
    type === "error" ? "var(--danger-soft)" :
    type === "success" ? "var(--success-soft)" :
    type === "warning" ? "var(--warning-soft)" :
    "var(--info-soft)";
  
  iconEl.style.color =
    type === "error" ? "var(--danger)" :
    type === "success" ? "var(--success)" :
    type === "warning" ? "var(--warning)" :
    "var(--info)";
  
  iconEl.textContent =
    type === "error" ? "error" :
    type === "success" ? "check_circle" :
    type === "warning" ? "warning" :
    "info";
  
  // Close previous listeners and add new one
  const oldBtn = btnEl.cloneNode(true);
  btnEl.parentNode.replaceChild(oldBtn, btnEl);
  oldBtn.addEventListener("click", () => {
    modal.classList.remove("active");
  });
  
  // Show modal
  modal.classList.add("active");
}

// ===========================
// Sync Queue Manager
// ===========================
const syncState = {
  status: "synced",
  queue: [],
  processing: false,
  lastError: null,
};

function enqueueSync(task) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const entry = {
    id,
    label: task.label,
    run: task.run,
    status: "pending",
    createdAt: new Date().toISOString(),
    error: null,
  };

  syncState.queue.push(entry);
  updateSyncUI();
  processSyncQueue();
}

async function processSyncQueue() {
  if (syncState.processing) return;
  syncState.processing = true;

  while (syncState.queue.some((item) => item.status === "pending")) {
    const next = syncState.queue.find((item) => item.status === "pending");
    if (!next) break;

    next.status = "syncing";
    syncState.status = "syncing";
    updateSyncUI();

    try {
      await next.run();
      next.status = "success";
      next.error = null;
      syncState.lastError = null;
    } catch (error) {
      next.status = "error";
      next.error = error?.message || "Unknown error";
      syncState.lastError = next.error;
      syncState.status = "error";

      // Check if it's an authentication error
      if (error?.message?.includes("401") || error?.message?.includes("unauthorized") || error?.message?.includes("Invalid Credentials")) {
        next.error = next.error + " - [Requires re-login]";
        // Show alert with login option
        showSyncErrorAlert(next.error, error);
      }

      updateSyncUI();
      continue;
    }

    updateSyncUI();
  }

  const hasError = syncState.queue.some((item) => item.status === "error");
  const hasPending = syncState.queue.some(
    (item) => item.status === "pending" || item.status === "syncing",
  );

  if (hasPending) {
    syncState.status = "syncing";
  } else if (hasError) {
    syncState.status = "error";
  } else {
    syncState.status = "synced";
  }

  syncState.processing = false;
  updateSyncUI();
}

function updateSyncUI() {
  const btn = document.getElementById("syncStatusBtn");
  const badge = document.getElementById("syncQueueCount");
  const panel = document.getElementById("syncQueueList");
  const iconSpan = btn?.querySelector(".material-symbols-rounded");

  if (btn && badge && iconSpan) {
    btn.classList.remove("syncing", "error", "synced");
    if (syncState.status === "syncing") {
      btn.classList.add("syncing");
      iconSpan.textContent = "sync";
      btn.setAttribute("aria-label", "Syncing...");
      btn.setAttribute("title", "Syncing...");
    } else if (syncState.status === "error") {
      btn.classList.add("error");
      iconSpan.textContent = "sync";
      btn.setAttribute("aria-label", "Sync error");
      btn.setAttribute("title", "Sync error - Click to retry or re-login");
    } else {
      btn.classList.add("synced");
      iconSpan.textContent = "check_circle";
      btn.setAttribute("aria-label", "All synced");
      btn.setAttribute("title", "All synced");
    }

    const pendingCount = syncState.queue.filter(
      (item) => item.status === "pending" || item.status === "syncing",
    ).length;
    badge.textContent = String(pendingCount);
    badge.classList.toggle("hidden", pendingCount <= 0);
  }

  if (panel) {
    if (syncState.queue.length === 0) {
      panel.innerHTML =
        '<div class="sync-item"><span>No sync activity yet</span><span class="sync-item-status">Idle</span></div>';
      return;
    }

    panel.innerHTML = syncState.queue
      .slice(-20)
      .reverse()
      .map((item) => {
        const statusClass =
          item.status === "success"
            ? "success"
            : item.status === "error"
              ? "error"
              : "pending";
        const statusLabel =
          item.status === "success"
            ? "Synced"
            : item.status === "error"
              ? "Error"
              : "Syncing";
        const errorHint =
          item.status === "error" && item.error ? ` - ${item.error}` : "";
        return `
                    <div class="sync-item">
                        <span>${item.label}${errorHint}</span>
                        <span class="sync-item-status ${statusClass}">${statusLabel}</span>
                    </div>
                `;
      })
      .join("");
  }
}

function setupSyncUI() {
  const btn = document.getElementById("syncStatusBtn");
  const panel = document.getElementById("syncPanel");
  const closeBtn = document.getElementById("syncPanelClose");

  if (btn && panel) {
    btn.addEventListener("click", () => {
      panel.classList.toggle("active");
    });
  }

  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => {
      panel.classList.remove("active");
    });
  }

  updateSyncUI();
}

window.addEventListener("beforeunload", (event) => {
  const hasPending = syncState.queue.some(
    (item) => item.status === "pending" || item.status === "syncing",
  );
  if (hasPending) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// Show specific view
function showView(viewName) {
  // Hide all views
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("active");
  });

  // Show selected view
  if (viewName === "login") {
    document.getElementById("loginView").classList.add("active");
    clearNavActiveState();
  } else if (viewName === "app") {
    document.getElementById("appView").classList.add("active");
    const activePage = document.querySelector(".page-content.active");
    const activePageName =
      activePage?.id === "inventoryContent"
        ? "inventory"
        : activePage?.id === "trialContent"
          ? "trial"
          : activePage?.id === "libraryContent"
            ? "library"
            : "dashboard";
    syncNavActiveState(activePageName);
  }
}

// Switch page content
function switchPage(pageName) {
  // Hide all page contents
  document.querySelectorAll(".page-content").forEach((content) => {
    content.classList.remove("active");
  });

  // Show selected page
  const pageMap = {
    dashboard: "dashboardContent",
    inventory: "inventoryContent",
    trial: "trialContent",
    library: "libraryContent",
  };

  if (pageMap[pageName]) {
    document.getElementById(pageMap[pageName]).classList.add("active");
  }

  // Update page title
  const titleMap = {
    dashboard: "Dashboard",
    inventory: "Inventory",
    trial: "Trial",
    library: "Library",
  };

  if (titleMap[pageName]) {
    document.getElementById("pageTitle").textContent = titleMap[pageName];
  }

  syncNavActiveState(pageName);
}

// Helper function to navigate to a view
function navigateToView(item) {
  const view = item.dataset.view;
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (item.classList.contains("nav-parent")) {
    const group = item.closest(".nav-group");
    if (group) group.classList.remove("collapsed");
    item.setAttribute("aria-expanded", "true");
  }

  // Remove active from all nav items
  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.remove("active"));
  item.classList.add("active");

  switchPage(view);

  // Auto-select first subitem if has submenu
  if (view === "inventory") {
    const firstSub = document.querySelector(
      '.nav-subitem[data-parent="inventory"]',
    );
    if (firstSub) {
      const category = firstSub.dataset.category;
      switchCategory(category);
      syncInventoryNavState(category);
    }
  } else if (view === "trial") {
    const firstSub = document.querySelector(
      '.nav-subitem[data-parent="trial"]',
    );
    if (firstSub) {
      document
        .querySelectorAll('.nav-subitem[data-parent="trial"]')
        .forEach((s) => s.classList.remove("active"));
      firstSub.classList.add("active");
      const tab = firstSub.dataset.trialTab;
      switchTrialTab(tab);
    }
  }

  // Close mobile sidebar after navigation
  if (sidebar) sidebar.classList.remove("open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("active");
}

// Helper function to navigate to a sub-view
function navigateToSubView(item) {
  const parent = item.dataset.parent;
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  const group = item.closest(".nav-group");
  if (group) group.classList.remove("collapsed");

  // Remove active from all subitems of same parent
  document
    .querySelectorAll(`.nav-subitem[data-parent="${parent}"]`)
    .forEach((sub) => sub.classList.remove("active"));
  item.classList.add("active");

  if (parent === "inventory") {
    const category = item.dataset.category;
    switchPage("inventory");
    switchCategory(category);
    syncInventoryNavState(category);
  }

  if (parent === "trial") {
    const tab = item.dataset.trialTab;
    switchPage("trial");
    switchTrialTab(tab);
  }

  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (isMobile && sidebar && sidebarOverlay) {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("active");
  }
}

// Show exit run trial confirmation modal
function showExitRunTrialConfirmation(onConfirm) {
  const modal = document.getElementById("exitRunTrialModal");
  if (modal) {
    modal.classList.add("active");
    window.pendingNavigation = onConfirm;
  }
}

function clearNavActiveState() {
  document
    .querySelectorAll(
      ".nav-item, .nav-subitem, .submenu-item, .trial-submenu-item",
    )
    .forEach((item) => item.classList.remove("active"));
}

function syncNavActiveState(pageName) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === pageName);
  });

  if (pageName === "inventory") {
    const category = inventoryState?.currentCategory || "crops";
    syncInventoryNavState(category);
    return;
  }

  if (pageName === "trial") {
    const activeTrialTab =
      document.querySelector(".trial-submenu-item.active")?.dataset.trialTab ||
      "management";
    document
      .querySelectorAll('.nav-subitem[data-parent="trial"]')
      .forEach((item) => {
        item.classList.toggle(
          "active",
          item.dataset.trialTab === activeTrialTab,
        );
      });
    document.querySelectorAll(".trial-submenu-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.trialTab === activeTrialTab);
    });
    document
      .querySelectorAll('.nav-subitem[data-parent="inventory"]')
      .forEach((item) => item.classList.remove("active"));
    return;
  }

  document
    .querySelectorAll(".nav-subitem, .submenu-item, .trial-submenu-item")
    .forEach((item) => item.classList.remove("active"));
}

function syncInventoryNavState(category) {
  document
    .querySelectorAll('.nav-subitem[data-parent="inventory"]')
    .forEach((item) => {
      item.classList.toggle("active", item.dataset.category === category);
    });
  document.querySelectorAll(".submenu-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.category === category);
  });
  document
    .querySelectorAll('.nav-subitem[data-parent="trial"]')
    .forEach((item) => item.classList.remove("active"));
}

// ===========================
// TOAST NOTIFICATION SYSTEM
// ===========================

function showToast(message, type = "info", duration = 3000) {
  let existingContainer = document.getElementById("toastContainer");
  if (!existingContainer) {
    existingContainer = document.createElement("div");
    existingContainer.id = "toastContainer";
    existingContainer.style.cssText = `
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      pointer-events: none;
      z-index: 2000;
      max-width: 400px;
    `;
    document.body.appendChild(existingContainer);
  }

  const toast = document.createElement("div");
  const bgColor = type === "success" ? "var(--success)" : 
                  type === "error" ? "var(--danger)" :
                  type === "warning" ? "var(--warning)" :
                  "var(--primary)";
  const icon = type === "success" ? "check_circle" :
               type === "error" ? "error" :
               type === "warning" ? "warning" :
               "info";

  toast.style.cssText = `
    background: ${bgColor};
    color: white;
    padding: 0.875rem 1.25rem;
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    font-weight: 500;
    animation: slideInRight 0.3s ease-out;
    pointer-events: auto;
  `;

  toast.innerHTML = `
    <span class="material-symbols-rounded" style="font-size: 1.25rem; flex-shrink: 0;">${icon}</span>
    <span style="flex: 1; line-height: 1.4;">${escapeHtml(message)}</span>
    <button style="
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      cursor: pointer;
      padding: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s;
      flex-shrink: 0;
    " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
      <span class="material-symbols-rounded" style="font-size: 1rem;">close</span>
    </button>
  `;

  const closeBtn = toast.querySelector("button");
  closeBtn.addEventListener("click", () => {
    toast.style.animation = "slideOutRight 0.3s ease-out forwards";
    setTimeout(() => toast.remove(), 300);
  });

  existingContainer.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = "slideOutRight 0.3s ease-out forwards";
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }
}

// ===========================
// CONFIRMATION MODAL
// ===========================
function showConfirmModal(title, message, onConfirm, onCancel) {
  const existingModal = document.getElementById("confirmModal");
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement("div");
  modal.id = "confirmModal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
    animation: fadeIn 0.2s ease-out;
  `;

  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  `;
  backdrop.addEventListener("click", () => {
    modal.style.animation = "fadeOut 0.2s ease-out forwards";
    setTimeout(() => modal.remove(), 200);
    if (onCancel) onCancel();
  });
  modal.appendChild(backdrop);

  const content = document.createElement("div");
  content.style.cssText = `
    position: relative;
    background: var(--bg-primary);
    border-radius: var(--radius);
    box-shadow: var(--shadow-xl);
    max-width: 500px;
    width: 90%;
    padding: 2rem;
    z-index: 1;
  `;

  const titleEl = document.createElement("h2");
  titleEl.style.cssText = `
    margin: 0 0 0.75rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  `;
  titleEl.textContent = title;

  const messageEl = document.createElement("p");
  messageEl.style.cssText = `
    margin: 0 0 1.5rem 0;
    color: var(--text-secondary);
    line-height: 1.5;
  `;
  messageEl.textContent = message;

  const buttonsDiv = document.createElement("div");
  buttonsDiv.style.cssText = `
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  `;

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText = `
    padding: 0.625rem 1.25rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-radius: var(--radius);
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
  `;
  cancelBtn.addEventListener("mouseover", () => {
    cancelBtn.style.background = "var(--bg-tertiary)";
  });
  cancelBtn.addEventListener("mouseout", () => {
    cancelBtn.style.background = "var(--bg-secondary)";
  });
  cancelBtn.addEventListener("click", () => {
    modal.style.animation = "fadeOut 0.2s ease-out forwards";
    setTimeout(() => modal.remove(), 200);
    if (onCancel) onCancel();
  });

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "Confirm";
  confirmBtn.style.cssText = `
    padding: 0.625rem 1.25rem;
    border: none;
    background: var(--primary);
    color: white;
    border-radius: var(--radius);
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
  `;
  confirmBtn.addEventListener("mouseover", () => {
    confirmBtn.style.opacity = "0.9";
  });
  confirmBtn.addEventListener("mouseout", () => {
    confirmBtn.style.opacity = "1";
  });
  confirmBtn.addEventListener("click", () => {
    modal.style.animation = "fadeOut 0.2s ease-out forwards";
    setTimeout(() => modal.remove(), 200);
    if (onConfirm) onConfirm();
  });

  buttonsDiv.appendChild(cancelBtn);
  buttonsDiv.appendChild(confirmBtn);

  content.appendChild(titleEl);
  content.appendChild(messageEl);
  content.appendChild(buttonsDiv);
  modal.appendChild(content);

  document.body.appendChild(modal);

  // Add fadeIn/fadeOut animations if not already in CSS
  if (!document.getElementById("confirmModalStyles")) {
    const style = document.createElement("style");
    style.id = "confirmModalStyles";
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// ===========================
// INITIALIZE APP
// ===========================

async function initializeApp() {
  const isGuest = getCurrentUser()?.isGuest;

  try {
    showLoading(true);
    setLoadingProgress(5, "Preparing your workspace...");

    // Update user info
    const user = getCurrentUser();
    if (user) {
      const initials = user.name
        .split(" ")
        .map((n) => n.charAt(0))
        .join("")
        .toUpperCase();

      // Update topbar user
      const userNameEl = document.getElementById("userName");
      const userEmailEl = document.getElementById("userEmail");
      const userAvatar = document.getElementById("userAvatar");
      if (userNameEl) userNameEl.textContent = user.name;
      if (userEmailEl) userEmailEl.textContent = user.isGuest ? "Local data only" : (user.email || "");
      if (userAvatar) {
        if (user.picture) {
          userAvatar.style.backgroundImage = `url('${user.picture}')`;
          userAvatar.textContent = "";
          userAvatar.classList.add("has-image");
        } else {
          userAvatar.style.backgroundImage = "";
          userAvatar.textContent = initials;
          userAvatar.classList.remove("has-image");
        }
      }

      // Update user dropdown in topbar
      const userDropdownName = document.getElementById("userDropdownName");
      const userDropdownEmail = document.getElementById("userDropdownEmail");

      if (userDropdownName) userDropdownName.textContent = user.name;
      if (userDropdownEmail) userDropdownEmail.textContent = user.isGuest ? "Guest · Local data only" : user.email;
    }

    // Initialize Drive structure (skip for guest)
    if (!isGuest) {
      setLoadingProgress(12, "Preparing...");
      await initializeDriveStructure();
    }

    // Initialize Inventory (silent background loading)
    setLoadingProgress(20, "Loading cached data...");
    initializeInventory({
      onProgress: (p, msg) => {
        // Silent background sync - no UI updates
      },
    });

    // Initialize Trials (silent background loading)
    setLoadingProgress(55, "Loading cached data...");
    initializeTrials({
      onProgress: (p, msg) => {
        // Silent background sync - no UI updates
      },
    });

    // Initialize Library (silent background loading)
    setLoadingProgress(80, "Loading cached data...");
    initializeLibrary({
      onProgress: (p, msg) => {
        // Silent background sync - no UI updates
      },
    });

    // Setup event listeners
    setupEventListeners();
    setupDataTransferEvents();
    setupSyncUI();

    // Hide sync button for guests
    const syncBtn = document.getElementById("syncStatusBtn");
    if (syncBtn) syncBtn.classList.toggle("hidden", !!isGuest);

    setLoadingProgress(100, "Ready");
    showView("app");
    showLoading(false);
    console.log("App initialized successfully");
  } catch (error) {
    console.error("Error initializing app:", error);
    showLoading(false);
    showToast("Error initializing app: " + error.message, "error");
  }
}

// Setup event listeners
function setupEventListeners() {
  // Guard against duplicate setup
  if (setupEventListeners.initialized) {
    console.log("Event listeners already initialized");
    return;
  }
  setupEventListeners.initialized = true;

  // Mobile menu toggle
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile) {
        sidebar.classList.toggle("open");
        if (sidebarOverlay) sidebarOverlay.classList.toggle("active");
      } else {
        document.body.classList.toggle("sidebar-collapsed");
      }
    });
  }

  if (sidebarOverlay && sidebar) {
    sidebarOverlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      sidebarOverlay.classList.remove("active");
    });
  }

  // User dropdown menu
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  const userDropdown = document.getElementById("userDropdown");

  if (userMenuTrigger && userDropdown) {
    userMenuTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle("active");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !userDropdown.contains(e.target) &&
        !userMenuTrigger.contains(e.target)
      ) {
        userDropdown.classList.remove("active");
      }
    });
  }

  // User logout button (in dropdown)
  const userLogoutBtn = document.getElementById("userLogoutBtn");
  if (userLogoutBtn) {
    userLogoutBtn.addEventListener("click", () => {
      showConfirmModal("Logout", "Are you sure you want to logout?", () => {
        logout();
      });
    });
  }

  // Navigation - Main items
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      
      // Check if in run trial mode
      const isInRunTrialMode = document.body.classList.contains("run-trial-active");
      if (isInRunTrialMode) {
        showExitRunTrialConfirmation(() => {
          navigateToView(item);
        });
        return;
      }
      
      navigateToView(item);
    });
  });

  // Sidebar submenus
  document.querySelectorAll(".nav-subitem").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      
      // Check if in run trial mode
      const isInRunTrialMode = document.body.classList.contains("run-trial-active");
      if (isInRunTrialMode) {
        showExitRunTrialConfirmation(() => {
          navigateToSubView(item);
        });
        return;
      }
      
      navigateToSubView(item);
    });
  });

  document.querySelectorAll(".nav-caret").forEach((caret) => {
    caret.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const group = caret.closest(".nav-group");
      if (!group) return;
      group.classList.toggle("collapsed");
      const parent = group.querySelector(".nav-parent");
      if (parent) {
        parent.setAttribute(
          "aria-expanded",
          String(!group.classList.contains("collapsed")),
        );
      }
    });
  });

  // Exit Run Trial Modal handlers
  const exitRunTrialModal = document.getElementById("exitRunTrialModal");
  const exitRunTrialCancelBtn = document.getElementById("exitRunTrialCancelBtn");
  const exitRunTrialConfirmBtn = document.getElementById("exitRunTrialConfirmBtn");
  
  if (exitRunTrialCancelBtn) {
    exitRunTrialCancelBtn.addEventListener("click", () => {
      exitRunTrialModal.classList.remove("active");
    });
  }
  
  if (exitRunTrialConfirmBtn) {
    exitRunTrialConfirmBtn.addEventListener("click", async () => {
      exitRunTrialModal.classList.remove("active");
      
      // Auto-save progress before exiting
      if (typeof saveRunTrialProgress === "function") {
        await saveRunTrialProgress();
      }
      
      // Exit run trial mode
      if (typeof exitRunTrial === "function") {
        exitRunTrial();
      }
      
      // Execute pending navigation if any
      if (window.pendingNavigation) {
        window.pendingNavigation();
        window.pendingNavigation = null;
      }
    });
  }

  // Inventory submenu
  document.querySelectorAll(".submenu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const category = item.dataset.category;
      switchCategory(category);
      syncInventoryNavState(category);
    });
  });

  // Trial submenu
  document.querySelectorAll(".trial-submenu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = item.dataset.trialTab;
      switchTrialTab(tab);
    });
  });

  // Add item button
  document.getElementById("addItemBtn").addEventListener("click", () => {
    openAddModal();
  });

  // Add trial button
  const addTrialBtn = document.getElementById("addTrialBtn");
  if (addTrialBtn) {
    addTrialBtn.addEventListener("click", () => {
      openAddTrialModal();
    });
  }

  // Modal controls
  document
    .getElementById("modalCancelBtn")
    .addEventListener("click", closeModal);
  document.getElementById("modalSaveBtn").addEventListener("click", saveItem);

  document.querySelectorAll(".modal-close").forEach((btn) => {
    if (btn.id === "trialModalClose") {
      btn.addEventListener("click", closeTrialModal);
    } else {
      btn.addEventListener("click", closeModal);
    }
  });

  // Trial modal controls
  const trialModalCancelBtn = document.getElementById("trialModalCancelBtn");
  if (trialModalCancelBtn) {
    trialModalCancelBtn.addEventListener("click", closeTrialModal);
  }
  const trialModalSaveBtn = document.getElementById("trialModalSaveBtn");
  if (trialModalSaveBtn) {
    trialModalSaveBtn.addEventListener("click", saveTrial);
  }
  const trialNextBtn = document.getElementById("trialNextBtn");
  if (trialNextBtn) {
    trialNextBtn.addEventListener("click", nextTrialSection);
  }
  const trialPrevBtn = document.getElementById("trialPrevBtn");
  if (trialPrevBtn) {
    trialPrevBtn.addEventListener("click", prevTrialSection);
  }

  // Form submit on Enter
  document.getElementById("itemForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveItem();
  });

  // Make dashboard cards clickable to go to inventory
  document.querySelectorAll(".dashboard-card").forEach((card, index) => {
    card.addEventListener("click", () => {
      const categories = ["crops", "lines", "locations", "parameters"];
      switchPage("inventory");
      switchCategory(categories[index]);
    });
  });
}

// Handle keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Close modal on Escape
  if (e.key === "Escape") {
    if (document.getElementById("itemModal").classList.contains("active")) {
      closeModal();
    }
    const trialEditor = document.getElementById("trialEditor");
    if (trialEditor && trialEditor.classList.contains("active")) {
      closeTrialModal();
    }
  }
});

// Show sync error alert with retry/login options
function showSyncErrorAlert(errorMessage, error) {
  const isAuthError = errorMessage?.toLowerCase().includes("unauthorized") || 
                      errorMessage?.toLowerCase().includes("requires re-login") ||
                      error?.message?.includes("401");

  const title = isAuthError ? "Authentication Required" : "Sync Error";
  const message = isAuthError 
    ? "Your session has expired. Please log in again to continue syncing."
    : errorMessage || "An error occurred during sync. Please try again.";

  // Create custom alert with buttons
  showAlert(message, isAuthError ? "warning" : "error", title);
  
  // If it's auth error, add login button
  if (isAuthError) {
    const alertModal = document.getElementById("alertModal");
    if (alertModal) {
      const button = alertModal.querySelector(".alert-button");
      if (button) {
        const container = button.parentElement;
        const loginBtn = document.createElement("button");
        loginBtn.className = "btn btn-primary";
        loginBtn.textContent = "Log In Again";
        loginBtn.onclick = () => {
          // Sign out and force re-login
          gapi.auth2.getAuthInstance().signOut().then(() => {
            location.reload();
          });
        };
        container.insertBefore(loginBtn, button);
      }
    }
  }
}

// Handle responsive sidebar toggle on mobile
function setupMobileNav() {
  if (window.innerWidth <= 768) {
    // Add hamburger menu functionality if needed
  }
}

window.addEventListener("resize", setupMobileNav);

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  setupMobileNav();
});

// ===========================
// DATA IMPORT / EXPORT
// ===========================
const DATA_MAGIC = "ADVANTA_V3_BACKUP";
const DATA_VERSION = 1;

function showDataTransfer(title, message) {
  const overlay = document.getElementById("dataTransferOverlay");
  const titleEl = document.getElementById("dataTransferTitle");
  const msgEl = document.getElementById("dataTransferMessage");
  const bar = document.getElementById("dataTransferBar");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (bar) bar.style.width = "0%";
  if (overlay) overlay.classList.add("active");
}

function updateDataTransfer(message, percent) {
  const msgEl = document.getElementById("dataTransferMessage");
  const bar = document.getElementById("dataTransferBar");
  if (msgEl && message) msgEl.textContent = message;
  if (bar && percent != null) bar.style.width = `${Math.round(percent)}%`;
}

function hideDataTransfer() {
  const overlay = document.getElementById("dataTransferOverlay");
  if (overlay) overlay.classList.remove("active");
}

// XOR-based obfuscation so the file can't be opened as plain text
function obfuscate(str) {
  const key = "AdvantaV3SecretKey2026";
  const bytes = new TextEncoder().encode(str);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ key.charCodeAt(i % key.length);
  }
  return out;
}

function deobfuscate(buffer) {
  const key = "AdvantaV3SecretKey2026";
  const bytes = new Uint8Array(buffer);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ key.charCodeAt(i % key.length);
  }
  return new TextDecoder().decode(out);
}

// EXPORT DATA
async function exportData() {
  showDataTransfer("Exporting Data", "Collecting all data...");
  updateDataTransfer(null, 10);

  await new Promise(r => setTimeout(r, 200));

  const payload = {
    magic: DATA_MAGIC,
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    inventory: {
      crops: inventoryState.items.crops || [],
      lines: inventoryState.items.lines || [],
      locations: inventoryState.items.locations || [],
      parameters: inventoryState.items.parameters || [],
    },
    trials: trialState.trials || [],
  };

  updateDataTransfer("Encoding data...", 50);
  await new Promise(r => setTimeout(r, 150));

  const json = JSON.stringify(payload);
  const encoded = obfuscate(json);

  updateDataTransfer("Preparing file...", 80);
  await new Promise(r => setTimeout(r, 150));

  const blob = new Blob([encoded], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `advanta_backup_${dateStr}.adv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  updateDataTransfer("Export complete!", 100);
  await new Promise(r => setTimeout(r, 600));
  hideDataTransfer();
  showAlert("Data exported successfully.", "success", "Export Complete");
}

// IMPORT DATA
function triggerImport() {
  const input = document.getElementById("importFileInput");
  if (input) {
    input.value = "";
    input.click();
  }
}

async function handleImportFile(file) {
  if (!file) return;

  showDataTransfer("Importing Data", "Reading file...");
  updateDataTransfer(null, 10);

  try {
    const buffer = await file.arrayBuffer();

    updateDataTransfer("Decoding data...", 30);
    await new Promise(r => setTimeout(r, 150));

    let json;
    try {
      json = deobfuscate(buffer);
    } catch {
      hideDataTransfer();
      showAlert("Invalid backup file. Cannot read data.", "error", "Import Failed");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(json);
    } catch {
      hideDataTransfer();
      showAlert("Corrupted backup file. Data could not be parsed.", "error", "Import Failed");
      return;
    }

    if (payload.magic !== DATA_MAGIC) {
      hideDataTransfer();
      showAlert("This file is not a valid Advanta backup.", "error", "Import Failed");
      return;
    }

    updateDataTransfer("Checking for duplicates...", 60);
    await new Promise(r => setTimeout(r, 200));

    // Merge & detect duplicates
    const incoming = payload.inventory || {};
    const incomingTrials = payload.trials || [];

    const duplicates = [];

    // Check each category
    const categories = ["crops", "lines", "locations", "parameters"];
    for (const cat of categories) {
      const existing = inventoryState.items[cat] || [];
      const newItems = incoming[cat] || [];
      for (const item of newItems) {
        const dup = existing.find(e => e.id === item.id || (e.name && e.name === item.name));
        if (dup) {
          duplicates.push({
            category: cat,
            existingItem: dup,
            newItem: item,
            action: "keep_existing", // default action
          });
        }
      }
    }

    // Check trials
    for (const trial of incomingTrials) {
      const dup = trialState.trials.find(e => e.id === trial.id || (e.name && e.name === trial.name));
      if (dup) {
        duplicates.push({
          category: "trials",
          existingItem: dup,
          newItem: trial,
          action: "keep_existing",
        });
      }
    }

    hideDataTransfer();

    if (duplicates.length > 0) {
      // Show duplicate review modal
      await showDuplicateReview(duplicates, incoming, incomingTrials);
    } else {
      // No duplicates — apply directly
      await applyImport(incoming, incomingTrials, []);
    }

  } catch (error) {
    hideDataTransfer();
    console.error("Import error:", error);
    showAlert("Error importing data: " + error.message, "error", "Import Failed");
  }
}

function showDuplicateReview(duplicates, incoming, incomingTrials) {
  return new Promise((resolve) => {
    const modal = document.getElementById("duplicateReviewModal");
    const list = document.getElementById("duplicateReviewList");
    const desc = document.getElementById("duplicateReviewDesc");

    desc.textContent = `Found ${duplicates.length} duplicate(s). Choose how to handle each one.`;

    list.innerHTML = duplicates.map((dup, idx) => {
      const catLabel = dup.category.charAt(0).toUpperCase() + dup.category.slice(1);
      return `
        <div class="dup-item" id="dupItem${idx}">
          <div class="dup-item-info">
            <div class="dup-item-name">${escapeHtml(dup.newItem.name || dup.newItem.id)}</div>
            <div class="dup-item-meta">${catLabel} · ID: ${dup.newItem.id.substring(0, 12)}...</div>
          </div>
          <span class="dup-item-badge">Duplicate</span>
          <div class="dup-actions">
            <button class="btn btn-secondary dup-action-btn active" data-idx="${idx}" data-action="keep_existing" title="Keep existing, skip imported">Keep Existing</button>
            <button class="btn btn-secondary dup-action-btn" data-idx="${idx}" data-action="replace" title="Replace existing with imported">Replace</button>
            <button class="btn btn-secondary dup-action-btn" data-idx="${idx}" data-action="keep_both" title="Keep both items">Keep Both</button>
          </div>
        </div>
      `;
    }).join("");

    modal.classList.add("active");

    // Handle per-item actions
    list.addEventListener("click", function handler(e) {
      const btn = e.target.closest(".dup-action-btn");
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      duplicates[idx].action = action;

      // Update active state
      const row = document.getElementById(`dupItem${idx}`);
      row.querySelectorAll(".dup-action-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });

    // Keep All button
    document.getElementById("dupKeepAllBtn").onclick = () => {
      duplicates.forEach((d, i) => {
        d.action = "keep_existing";
        const row = document.getElementById(`dupItem${i}`);
        row.querySelectorAll(".dup-action-btn").forEach(b => b.classList.toggle("active", b.dataset.action === "keep_existing"));
      });
    };

    // Skip All New
    document.getElementById("dupRemoveAllNewBtn").onclick = () => {
      duplicates.forEach((d, i) => {
        d.action = "keep_existing";
        const row = document.getElementById(`dupItem${i}`);
        row.querySelectorAll(".dup-action-btn").forEach(b => b.classList.toggle("active", b.dataset.action === "keep_existing"));
      });
    };

    // Apply
    document.getElementById("dupApplyBtn").onclick = async () => {
      modal.classList.remove("active");
      await applyImport(incoming, incomingTrials, duplicates);
      resolve();
    };
  });
}

async function applyImport(incoming, incomingTrials, duplicates) {
  showDataTransfer("Applying Import", "Merging data...");
  updateDataTransfer(null, 20);
  await new Promise(r => setTimeout(r, 200));

  const dupMap = {};
  for (const dup of duplicates) {
    const key = `${dup.category}_${dup.newItem.id}`;
    dupMap[key] = dup.action;
    // Also track by name for name-matched duplicates
    if (dup.newItem.name) {
      const nameKey = `${dup.category}_name_${dup.newItem.name}`;
      dupMap[nameKey] = dup.action;
    }
  }

  function getDupAction(cat, item) {
    const a = dupMap[`${cat}_${item.id}`];
    if (a) return a;
    if (item.name) {
      const b = dupMap[`${cat}_name_${item.name}`];
      if (b) return b;
    }
    return null; // no duplicate
  }

  // Merge inventory categories
  const categories = ["crops", "lines", "locations", "parameters"];
  for (const cat of categories) {
    const existing = inventoryState.items[cat] || [];
    const newItems = incoming[cat] || [];

    for (const item of newItems) {
      const action = getDupAction(cat, item);
      if (action === "keep_existing") continue; // skip imported
      if (action === "replace") {
        // Remove existing, add new
        const idx = existing.findIndex(e => e.id === item.id || (e.name && e.name === item.name));
        if (idx >= 0) existing.splice(idx, 1);
        existing.push(item);
      } else if (action === "keep_both") {
        // Give new item a unique id suffix
        item.id = item.id + "_imported_" + Date.now();
        existing.push(item);
      } else {
        // No duplicate — just add
        existing.push(item);
      }
    }
    inventoryState.items[cat] = existing;
  }

  updateDataTransfer("Merging trials...", 50);
  await new Promise(r => setTimeout(r, 150));

  // Merge trials
  for (const trial of incomingTrials) {
    const action = getDupAction("trials", trial);
    if (action === "keep_existing") continue;
    if (action === "replace") {
      const idx = trialState.trials.findIndex(e => e.id === trial.id || (e.name && e.name === trial.name));
      if (idx >= 0) trialState.trials.splice(idx, 1);
      trialState.trials.push(trial);
    } else if (action === "keep_both") {
      trial.id = trial.id + "_imported_" + Date.now();
      trialState.trials.push(trial);
    } else {
      trialState.trials.push(trial);
    }
  }

  updateDataTransfer("Saving to local cache...", 70);
  await new Promise(r => setTimeout(r, 150));

  // Save everything to local cache
  if (typeof saveLocalCache === "function") {
    saveLocalCache("inventory", { items: inventoryState.items });
    saveLocalCache("trials", { trials: trialState.trials });
  }

  updateDataTransfer("Updating UI...", 85);
  await new Promise(r => setTimeout(r, 150));

  // Refresh UI
  updateDashboardCounts();
  switchCategory(inventoryState.currentCategory || "crops");
  renderTrials();
  renderDashboardTrialProgress();

  // Sync to Google Drive if logged in (not guest)
  const isGuest = getCurrentUser()?.isGuest;
  if (!isGuest && typeof getAccessToken === "function" && getAccessToken()) {
    updateDataTransfer("Uploading to Google Drive...", 90);

    // Enqueue sync for all inventory items
    for (const cat of categories) {
      for (const item of inventoryState.items[cat]) {
        if (typeof enqueueSync === "function") {
          enqueueSync({
            label: `Sync ${cat}: ${item.name || item.id}`,
            run: async () => {
              await saveItemToGoogleDrive(cat, item);
            }
          });
        }
      }
    }
    // Enqueue sync for all trials
    for (const trial of trialState.trials) {
      if (typeof enqueueSync === "function") {
        enqueueSync({
          label: `Sync trial: ${trial.name || trial.id}`,
          run: async () => {
            await saveTrialToGoogleDrive(trial);
          }
        });
      }
    }
  }

  updateDataTransfer("Import complete!", 100);
  await new Promise(r => setTimeout(r, 600));
  hideDataTransfer();
  showAlert("Data imported successfully!", "success", "Import Complete");
}

// Wire up import/export buttons
function setupDataTransferEvents() {
  const exportBtn = document.getElementById("exportDataBtn");
  const importBtn = document.getElementById("importDataBtn");
  const importInput = document.getElementById("importFileInput");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const dropdown = document.getElementById("userDropdown");
      if (dropdown) dropdown.classList.remove("active");
      exportData();
    });
  }

  if (importBtn) {
    importBtn.addEventListener("click", () => {
      const dropdown = document.getElementById("userDropdown");
      if (dropdown) dropdown.classList.remove("active");
      triggerImport();
    });
  }

  if (importInput) {
    importInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleImportFile(file);
    });
  }
}
