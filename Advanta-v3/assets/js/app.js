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
    badge.style.display = pendingCount > 0 ? "inline-flex" : "none";
  }

  if (panel) {
    if (syncState.queue.length === 0) {
      panel.innerHTML =
        '<div class="sync-item"><span>No sync activity yet</span><span class="sync-item-status">Idle</span></div>';
      return;
    }

    panel.innerHTML = syncState.queue
      .slice(-20)
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

// Initialize app
async function initializeApp() {
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
      if (userEmailEl) userEmailEl.textContent = user.email || "";
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
      if (userDropdownEmail) userDropdownEmail.textContent = user.email;
    }

    // Initialize Drive structure
    setLoadingProgress(12, "Preparing...");
    await initializeDriveStructure();

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
    setupSyncUI();

    setLoadingProgress(100, "Ready");
    showView("app");
    showLoading(false);
    console.log("App initialized successfully");
  } catch (error) {
    console.error("Error initializing app:", error);
    showLoading(false);
    alert("Error initializing app: " + error.message);
  }
}

// Setup event listeners
function setupEventListeners() {
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
      if (confirm("Are you sure you want to logout?")) {
        logout();
      }
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
