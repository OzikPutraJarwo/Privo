// ===========================
// REMINDER MODULE
// ===========================
// Generates observation & agronomy reminders per trial, per area.
// Depends on: inventoryState (inventory.js), trialState (trial.js), escapeHtml (inventory.js)

/**
 * Build observation reminder items for all active trials.
 * Returns array of trial groups, each containing area sub-groups.
 *
 * Structure:
 * [{ trial, areas: [{ area, areaIndex, items: [{ param, dateMin, dateMax, doo, done }] }] }]
 */
function buildObservationReminders() {
  const trials = (trialState.trials || []).filter(t => !t.archived && t.parameters && t.parameters.length > 0);
  const allParams = inventoryState.items.parameters || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return trials.map(trial => {
    const cropId = trial.cropId;

    // Resolve parameter objects that belong to this trial
    const params = trial.parameters
      .map(pid => allParams.find(p => p.id === pid))
      .filter(Boolean);

    // If trial has no areas, create a virtual "General" group
    const areas = (trial.areas && trial.areas.length > 0)
      ? trial.areas
      : [{ name: "General" }];

    const areaGroups = areas.map((area, areaIndex) => {
      const areaPlantingDate = typeof getAreaPlantingDate === "function"
        ? getAreaPlantingDate(trial, areaIndex)
        : (area?.plantingDate || trial?.plantingDate || "");
      const pDate = areaPlantingDate ? new Date(areaPlantingDate + "T00:00:00") : null;
      const items = params.map(param => {
        const dooEntry = param.daysOfObservation && param.daysOfObservation[cropId];
        let dooMin = null, dooMax = null;
        if (dooEntry != null) {
          if (typeof dooEntry === "object") {
            dooMin = dooEntry.min;
            dooMax = dooEntry.max ?? dooEntry.min;
          } else {
            dooMin = Number(dooEntry);
            dooMax = dooMin;
          }
        }

        let dateMin = null, dateMax = null;
        if (dooMin != null && pDate && !isNaN(pDate.getTime())) {
          dateMin = new Date(pDate);
          dateMin.setDate(dateMin.getDate() + dooMin);
        }
        if (dooMax != null && pDate && !isNaN(pDate.getTime())) {
          dateMax = new Date(pDate);
          dateMax.setDate(dateMax.getDate() + dooMax);
        }

        // Check completion: has any response data for this area+param?
        // If trial responses haven't been loaded from Drive yet, mark as unknown
        let done = false;
        let status = "no-date";

        if (!trial._responsesLoaded) {
          // Responses not loaded — don't show "overdue", mark as not-loaded
          done = false;
          status = "not-loaded";
        } else {
          done = !!(trial.responses && trial.responses[areaIndex] && trial.responses[areaIndex][param.id] &&
            Object.keys(trial.responses[areaIndex][param.id]).length > 0);

          // Status: past, today, upcoming, no-date
          if (dateMin && dateMax) {
            const endDay = new Date(dateMax);
            endDay.setHours(23, 59, 59, 999);
            if (done) {
              status = "done";
            } else if (today > endDay) {
              status = "overdue";
            } else if (today >= dateMin && today <= endDay) {
              status = "today";
            } else {
              status = "upcoming";
            }
          }
        }

        return {
          param,
          dooMin,
          dooMax,
          dateMin,
          dateMax,
          done,
          status,
        };
      }).filter(item => item.dooMin != null); // Only show params with DoO set for this crop

      return { area, areaIndex, areaPlantingDate, items };
    }).filter(ag => ag.items.length > 0);

    return { trial, areaGroups };
  }).filter(tg => tg.areaGroups.length > 0);
}

/**
 * Build agronomy reminder items for all active trials.
 */
function buildAgronomyReminders() {
  const trials = (trialState.trials || []).filter(t => !t.archived && t.agronomyMonitoring && t.agronomyItems && t.agronomyItems.length > 0);
  const allAgronomy = inventoryState.items.agronomy || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return trials.map(trial => {
    const agItems = trial.agronomyItems
      .map(aid => allAgronomy.find(a => a.id === aid))
      .filter(Boolean);

    const areas = (trial.areas && trial.areas.length > 0)
      ? trial.areas
      : [{ name: "General" }];

    const areaGroups = areas.map((area, areaIndex) => {
      const areaPlantingDate = typeof getAreaPlantingDate === "function"
        ? getAreaPlantingDate(trial, areaIndex)
        : (area?.plantingDate || trial?.plantingDate || "");
      const pDate = areaPlantingDate ? new Date(areaPlantingDate + "T00:00:00") : null;
      const items = agItems.map(agItem => {
        const dapMin = agItem.dapMin != null ? Number(agItem.dapMin) : null;
        const dapMax = agItem.dapMax != null ? Number(agItem.dapMax) : dapMin;

        let dateMin = null, dateMax = null;
        if (dapMin != null && pDate && !isNaN(pDate.getTime())) {
          dateMin = new Date(pDate);
          dateMin.setDate(dateMin.getDate() + dapMin);
        }
        if (dapMax != null && pDate && !isNaN(pDate.getTime())) {
          dateMax = new Date(pDate);
          dateMax.setDate(dateMax.getDate() + dapMax);
        }

        // Check completion
        // If trial responses haven't been loaded from Drive yet, mark as not-loaded
        let done = false;
        let status = "no-date";

        if (!trial._responsesLoaded) {
          done = false;
          status = "not-loaded";
        } else {
          const resp = trial.agronomyResponses && trial.agronomyResponses[areaIndex] && trial.agronomyResponses[areaIndex][agItem.id];
          done = !!(resp && resp.applicationDate && resp.photos && resp.photos.length > 0);

          if (dateMin && dateMax) {
            const endDay = new Date(dateMax);
            endDay.setHours(23, 59, 59, 999);
            if (done) {
              status = "done";
            } else if (today > endDay) {
              status = "overdue";
            } else if (today >= dateMin && today <= endDay) {
              status = "today";
            } else {
              status = "upcoming";
            }
          }
        }

        return {
          agItem,
          dapMin,
          dapMax,
          dateMin,
          dateMax,
          done,
          status,
        };
      }).filter(item => item.dapMin != null);

      return { area, areaIndex, areaPlantingDate, items };
    }).filter(ag => ag.items.length > 0);

    return { trial, areaGroups };
  }).filter(tg => tg.areaGroups.length > 0);
}

// ---- Date formatting helpers ----
function formatReminderDate(d) {
  if (!d) return "–";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(dMin, dMax) {
  if (!dMin && !dMax) return "–";
  if (!dMax || dMin.getTime() === dMax.getTime()) return formatReminderDate(dMin);
  // Same month+year → compact
  if (dMin.getMonth() === dMax.getMonth() && dMin.getFullYear() === dMax.getFullYear()) {
    return `${dMin.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${dMax.getDate()}, ${dMax.getFullYear()}`;
  }
  return `${formatReminderDate(dMin)} – ${formatReminderDate(dMax)}`;
}

function statusLabel(status) {
  const map = {
    done: '<span class="reminder-badge badge-done">Done</span>',
    overdue: '<span class="reminder-badge badge-overdue">Overdue</span>',
    today: '<span class="reminder-badge badge-today">Today</span>',
    upcoming: '<span class="reminder-badge badge-upcoming">Upcoming</span>',
    "no-date": '<span class="reminder-badge badge-nodate">No date</span>',
    "not-loaded": '<span class="reminder-badge badge-nodate">Not loaded</span>',
  };
  return map[status] || "";
}

function statusIcon(status) {
  const map = {
    done: "check_circle",
    overdue: "error",
    today: "today",
    upcoming: "schedule",
    "no-date": "help_outline",
    "not-loaded": "cloud_off",
  };
  return map[status] || "schedule";
}

// ---- Sort helpers ----
// Sort items: overdue first, then today, upcoming, done, no-date
function statusPriority(s) {
  return { overdue: 0, today: 1, upcoming: 2, "no-date": 3, done: 4, "not-loaded": 5 }[s] ?? 6;
}

function sortReminderItems(items) {
  return [...items].sort((a, b) => {
    const sp = statusPriority(a.status) - statusPriority(b.status);
    if (sp !== 0) return sp;
    // Within same status, sort by date ascending
    const da = a.dateMin ? a.dateMin.getTime() : Infinity;
    const db = b.dateMin ? b.dateMin.getTime() : Infinity;
    return da - db;
  });
}

// ===========================
// RENDER: Observation Tab
// ===========================
function renderObservationReminders() {
  const container = document.getElementById("reminderObservationContent");
  if (!container) return;

  const groups = buildObservationReminders();

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">event_available</span>
        <h3>No Observation Reminders</h3>
        <p>Create trials with parameters and set Days of Observation to see reminders here</p>
      </div>`;
    return;
  }

  container.innerHTML = groups.map(({ trial, areaGroups }) => {
    const cropName = trial.cropName || "Unknown Crop";
    const pDateStr = typeof getTrialPlantingDateSummary === "function"
      ? getTrialPlantingDateSummary(trial)
      : "–";

    return `
      <div class="reminder-trial-group">
        <div class="reminder-trial-header" data-trial-id="${trial.id}">
          <div class="reminder-trial-info">
            <span class="reminder-trial-name">${escapeHtml(trial.name)}</span>
            <span class="reminder-trial-meta">${escapeHtml(cropName)} · Planted ${pDateStr}</span>
          </div>
          <span class="material-symbols-rounded reminder-trial-caret">expand_more</span>
        </div>
        <div class="reminder-trial-body">
          ${areaGroups.map(({ area, items, areaPlantingDate }) => `
            <div class="reminder-area-group">
              <div class="reminder-area-header">
                <span class="material-symbols-rounded" style="font-size:1rem">location_on</span>
                ${escapeHtml(area.name || "General")}${areaPlantingDate ? ` · ${formatReminderDate(new Date(areaPlantingDate + "T00:00:00"))}` : ""}
              </div>
              <div class="reminder-items">
                ${sortReminderItems(items).map(item => `
                  <div class="reminder-item reminder-status-${item.status}" data-trial-id="${trial.id}" data-action="observation">
                    <div class="reminder-item-icon">
                      <span class="material-symbols-rounded">${statusIcon(item.status)}</span>
                    </div>
                    <div class="reminder-item-body">
                      <div class="reminder-item-name">${escapeHtml(item.param.name)}</div>
                      <div class="reminder-item-detail">
                        <span class="reminder-item-date">${formatDateRange(item.dateMin, item.dateMax)}</span>
                        <span class="reminder-item-doo">DoO ${item.dooMin === item.dooMax ? item.dooMin : item.dooMin + '–' + item.dooMax}</span>
                      </div>
                    </div>
                    <div class="reminder-item-status">${statusLabel(item.status)}</div>
                  </div>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>`;
  }).join("");

  // Attach toggle handlers
  container.querySelectorAll(".reminder-trial-header").forEach(header => {
    header.addEventListener("click", () => {
      const group = header.closest(".reminder-trial-group");
      group.classList.toggle("collapsed");
    });
  });

  // Attach click-to-navigate on items
  attachReminderItemClickHandlers(container, "observation");
}

// ===========================
// RENDER: Agronomy Tab
// ===========================
function renderAgronomyReminders() {
  const container = document.getElementById("reminderAgronomyContent");
  if (!container) return;

  const groups = buildAgronomyReminders();

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">event_available</span>
        <h3>No Agronomy Reminders</h3>
        <p>Create trials with agronomy monitoring enabled to see reminders here</p>
      </div>`;
    return;
  }

  container.innerHTML = groups.map(({ trial, areaGroups }) => {
    const cropName = trial.cropName || "Unknown Crop";
    const pDateStr = typeof getTrialPlantingDateSummary === "function"
      ? getTrialPlantingDateSummary(trial)
      : "–";

    return `
      <div class="reminder-trial-group">
        <div class="reminder-trial-header" data-trial-id="${trial.id}">
          <div class="reminder-trial-info">
            <span class="reminder-trial-name">${escapeHtml(trial.name)}</span>
            <span class="reminder-trial-meta">${escapeHtml(cropName)} · Planted ${pDateStr}</span>
          </div>
          <span class="material-symbols-rounded reminder-trial-caret">expand_more</span>
        </div>
        <div class="reminder-trial-body">
          ${areaGroups.map(({ area, items, areaPlantingDate }) => `
            <div class="reminder-area-group">
              <div class="reminder-area-header">
                <span class="material-symbols-rounded" style="font-size:1rem">location_on</span>
                ${escapeHtml(area.name || "General")}${areaPlantingDate ? ` · ${formatReminderDate(new Date(areaPlantingDate + "T00:00:00"))}` : ""}
              </div>
              <div class="reminder-items">
                ${sortReminderItems(items).map(item => `
                  <div class="reminder-item reminder-status-${item.status}" data-trial-id="${trial.id}" data-action="agronomy">
                    <div class="reminder-item-icon">
                      <span class="material-symbols-rounded">${statusIcon(item.status)}</span>
                    </div>
                    <div class="reminder-item-body">
                      <div class="reminder-item-name">${escapeHtml(item.agItem.activity || item.agItem.name)}</div>
                      <div class="reminder-item-detail">
                        <span class="reminder-item-date">${formatDateRange(item.dateMin, item.dateMax)}</span>
                        <span class="reminder-item-doo">DAP ${item.dapMin === item.dapMax ? item.dapMin : item.dapMin + '–' + item.dapMax}</span>
                        ${item.agItem.chemical ? `<span class="reminder-item-chem">${escapeHtml(item.agItem.chemical)}</span>` : ""}
                      </div>
                    </div>
                    <div class="reminder-item-status">${statusLabel(item.status)}</div>
                  </div>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>`;
  }).join("");

  // Attach toggle handlers
  container.querySelectorAll(".reminder-trial-header").forEach(header => {
    header.addEventListener("click", () => {
      const group = header.closest(".reminder-trial-group");
      group.classList.toggle("collapsed");
    });
  });

  // Attach click-to-navigate on items
  attachReminderItemClickHandlers(container, "agronomy");
}

// ===========================
// Click-to-navigate handler
// ===========================
function attachReminderItemClickHandlers(container, type) {
  container.querySelectorAll(".reminder-item[data-trial-id]").forEach(item => {
    item.style.cursor = "pointer";
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const trialId = item.dataset.trialId;
      const action = item.dataset.action;
      const trial = (trialState.trials || []).find(t => t.id === trialId);
      if (!trial) return;

      const actionLabel = action === "observation" ? "Run Observation" : "Agronomy Monitoring";
      const trialName = trial.name || "this trial";

      if (typeof showConfirmModal === "function") {
        showConfirmModal(
          actionLabel,
          `Go to ${actionLabel} for "${trialName}"?`,
          () => {
            if (typeof switchPage === "function") switchPage("trial");
            if (action === "observation" && typeof startRunTrial === "function") {
              startRunTrial(trialId);
            } else if (action === "agronomy" && typeof startAgronomyMonitoring === "function") {
              startAgronomyMonitoring(trialId);
            }
          },
          "Go",
          "btn-primary"
        );
      }
    });
  });
}

// ===========================
// Public: called from switchReminderTab
// ===========================
function renderReminders(tabName) {
  if (tabName === "observation") {
    renderObservationReminders();
  } else if (tabName === "agronomy") {
    renderAgronomyReminders();
  }
}

function refreshReminderViewsRealtime(options = {}) {
  const includeDashboard = options.includeDashboard !== false;
  const includeReminderPage = options.includeReminderPage !== false;

  if (includeDashboard && typeof renderDashboardReminders === "function") {
    renderDashboardReminders();
  }

  if (!includeReminderPage || typeof renderReminders !== "function") return;

  const reminderPage = document.getElementById("reminderContent");
  if (!reminderPage || !reminderPage.classList.contains("active")) return;

  const activeNavTab = document.querySelector('.nav-subitem[data-parent="reminder"].active')?.dataset?.reminderTab;
  const activeContent = document.querySelector(".reminder-tab-content.active")?.id;
  const activeTab = activeNavTab || (activeContent === "reminderAgronomyContent" ? "agronomy" : "observation");

  renderReminders(activeTab);
}

// ===========================
// DASHBOARD REMINDER PREVIEW
// ===========================
/**
 * Renders compact reminder previews on the dashboard – split into
 * Observation and Agronomy sections.
 */
function renderDashboardReminders() {
  _renderDashReminderSection("observation");
  _renderDashReminderSection("agronomy");
}

function _renderDashReminderSection(type) {
  const containerId = type === "observation" ? "dashboardObsReminders" : "dashboardAgroReminders";
  const container = document.getElementById(containerId);
  if (!container) return;

  const groups = type === "observation" ? buildObservationReminders() : buildAgronomyReminders();
  const items = [];

  groups.forEach(({ trial, areaGroups }) => {
    areaGroups.forEach(({ area, items: rawItems }) => {
      rawItems.forEach(item => {
        if (item.status === "done" || item.status === "no-date") return;
        items.push({
          type,
          trialId: trial.id,
          trialName: trial.name,
          areaName: area.name || "General",
          name: type === "observation" ? item.param.name : (item.agItem.activity || item.agItem.name),
          status: item.status,
          dateMin: item.dateMin,
          dateMax: item.dateMax,
        });
      });
    });
  });

  // Sort: overdue → today → upcoming, then by date
  const prio = { overdue: 0, today: 1, upcoming: 2 };
  items.sort((a, b) => {
    const sp = (prio[a.status] ?? 9) - (prio[b.status] ?? 9);
    if (sp !== 0) return sp;
    const da = a.dateMin ? a.dateMin.getTime() : Infinity;
    const db = b.dateMin ? b.dateMin.getTime() : Infinity;
    return da - db;
  });

  const MAX_ITEMS = 6;
  const shown = items.slice(0, MAX_ITEMS);

  if (shown.length === 0) {
    const label = type === "observation" ? "observation" : "agronomy";
    container.classList.add("empty-grid");
    container.innerHTML = `
      <div class="empty-state-small">
        <span class="material-symbols-rounded">event_available</span>
        <p>No pending ${label} reminders</p>
      </div>`;
    return;
  } else {
    container.classList.remove("empty-grid");
  }

  const iconMap = { overdue: "error", today: "today", upcoming: "schedule" };
  const labelMap = { overdue: "Overdue", today: "Today", upcoming: "Upcoming" };

  container.innerHTML = shown.map(item => {
    const icon = iconMap[item.status] || "schedule";
    const badge = labelMap[item.status] || "";
    const dateStr = item.dateMin
      ? item.dateMin.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";

    return `
      <div class="dash-reminder-item ${item.status}" data-trial-id="${item.trialId}" data-action="${item.type}">
        <div class="dash-reminder-icon">
          <span class="material-symbols-rounded">${icon}</span>
        </div>
        <div class="dash-reminder-body">
          <div class="dash-reminder-title">${escapeHtml(item.name)}</div>
          <div class="dash-reminder-sub">${escapeHtml(item.trialName)}</div>
        </div>
        <span class="dash-reminder-badge ${item.status}">${badge}</span>
      </div>`;
  }).join("");

  if (items.length > MAX_ITEMS) {
    container.insertAdjacentHTML("beforeend", `
      <div style="text-align:center; padding:0.5rem 0; font-size:0.75rem; color:var(--text-tertiary); grid-column: span 3;">
        +${items.length - MAX_ITEMS} more
      </div>`);
  }

  // Click handler on each dashboard reminder item
  container.querySelectorAll(".dash-reminder-item[data-trial-id]").forEach(el => {
    el.addEventListener("click", () => {
      const trialId = el.dataset.trialId;
      const action = el.dataset.action;
      const trial = (trialState.trials || []).find(t => t.id === trialId);
      if (!trial) return;

      const actionLabel = action === "observation" ? "Run Observation" : "Agronomy Monitoring";
      const trialName = trial.name || "this trial";

      if (typeof showConfirmModal === "function") {
        showConfirmModal(
          actionLabel,
          `Go to ${actionLabel} for "${trialName}"?`,
          () => {
            if (typeof switchPage === "function") switchPage("trial");
            if (action === "observation" && typeof startRunTrial === "function") {
              startRunTrial(trialId);
            } else if (action === "agronomy" && typeof startAgronomyMonitoring === "function") {
              startAgronomyMonitoring(trialId);
            }
          },
          "Go",
          "btn-primary"
        );
      }
    });
  });
}
