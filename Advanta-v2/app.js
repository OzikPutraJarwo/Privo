let tokenClient;
let gapiInited = !1;
let gisInited = !1;
let rootFolderId = null;
let inventoryData = { ...DEFAULT_INVENTORY };
let currentTrials = [];
let activeTrial = null;
let currentQuestionIndex = 0;

const cloudSuccess = document.querySelector(".cloud-success");
const cloudSyncing = document.querySelector(".cloud-syncing");

window.onload = () => {
  gapiLoaded();
  gisLoaded();
};

function gapiLoaded() {
  gapi.load("client", async () => {
    await gapi.client.init({ apiKey: API_KEY, discoveryDocs: DISCOVERY_DOCS });
    gapiInited = !0;
    checkInitState();
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: "",
  });
  gisInited = !0;
  checkInitState();
}

function checkInitState() {
  if (gapiInited && gisInited) {
    document.getElementById("auth-loading").classList.add("hidden");
    document.getElementById("btn-login").onclick = handleAuthClick;
    const savedToken = localStorage.getItem("advanta_token");
    if (savedToken) {
      const token = JSON.parse(savedToken);
      if (Date.now() < token.expires_at) {
        gapi.client.setToken(token);
        handleAuthSuccess();
      } else {
        localStorage.removeItem("advanta_token");
      }
    }
  }
}

async function handleAuthSuccess() {
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");
  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: {
          Authorization: `Bearer ${gapi.client.getToken().access_token}`,
        },
      }
    );
    const userData = await response.json();
    console.log("User Data:", userData);
    document.querySelector("#user-photo img").src = userData.picture || "";
    document.getElementById("user-name").textContent =
      userData.name || userData.given_name;
  } catch (error) {
    console.error("Error fetching profile:", error);
  }
  await initializeStorage();
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error) return;
    const tokenInfo = {
      ...resp,
      expires_at: Date.now() + resp.expires_in * 1000,
    };
    localStorage.setItem("advanta_token", JSON.stringify(tokenInfo));
    handleAuthSuccess();
  };
  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({ prompt: "consent" });
  } else {
    tokenClient.requestAccessToken({ prompt: "" });
  }
}

function handleSignoutClick() {
  if (!confirm("Apakah Anda yakin ingin keluar?")) return;
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token, () => {
      gapi.client.setToken("");
      localStorage.clear();
      location.reload();
    });
  } else {
    localStorage.clear();
    location.reload();
  }
}

async function initializeStorage() {
  showToast("Connecting to Google Drive...");
  rootFolderId = await getOrCreateFolder(APP_CONFIG.folderName);
  const invFile = await getFileInFolder(rootFolderId, APP_CONFIG.inventoryFile);
  if (invFile) {
    inventoryData = await readFile(invFile.id);
  } else {
    await createFile(rootFolderId, APP_CONFIG.inventoryFile, inventoryData);
  }
  await loadTrials();
  renderDashboard();
  setupNavigation();
  const lastId = localStorage.getItem("advanta_last_trial_id");
  if (lastId) {
    const trial = currentTrials.find((t) => t.id === lastId);
    if (trial) {
      activeTrial = trial;
      currentQuestionIndex = parseInt(
        localStorage.getItem("advanta_last_question_idx") || 0
      );
      showPage("run-trial");
      renderQuestion();
    }
  }
}

async function getOrCreateFolder(name, parentId = null) {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const res = await gapi.client.drive.files.list({
    q: query,
    fields: "files(id, name)",
  });
  if (res.result.files.length > 0) return res.result.files[0].id;
  const meta = { name: name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];
  const folder = await gapi.client.drive.files.create({
    resource: meta,
    fields: "id",
  });
  return folder.result.id;
}

async function getFileInFolder(folderId, filename) {
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and name='${filename}' and trashed=false`,
    fields: "files(id, name)",
  });
  return res.result.files[0] || null;
}

async function readFile(fileId) {
  const res = await gapi.client.drive.files.get({
    fileId: fileId,
    alt: "media",
  });
  return res.result;
}

async function createFile(parentId, filename, content) {
  const metadata = {
    name: filename,
    mimeType: "application/json",
    parents: [parentId],
  };
  const file = new Blob([JSON.stringify(content)], {
    type: "application/json",
  });
  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  formData.append("file", file);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: new Headers({
        Authorization: "Bearer " + gapi.client.getToken().access_token,
      }),
      body: formData,
    }
  );
  const result = await res.json();
  return result.id;
}

async function updateFile(fileId, content) {
  const file = new Blob([JSON.stringify(content)], {
    type: "application/json",
  });
  await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: new Headers({
        Authorization: "Bearer " + gapi.client.getToken().access_token,
      }),
      body: file,
    }
  );
}

async function setFilePublic(fileId) {
  try {
    await gapi.client.drive.permissions.create({
      fileId: fileId,
      resource: {
        role: "reader",
        type: "anyone",
      },
    });
    console.log("File is now public");
  } catch (error) {
    console.error("Error setting permissions:", error);
  }
}

async function loadTrials() {
  const trialsFolderId = await getOrCreateFolder(
    APP_CONFIG.trialsFolder,
    rootFolderId
  );
  const res = await gapi.client.drive.files.list({
    q: `'${trialsFolderId}' in parents and trashed=false`,
    fields: "files(id, name)",
  });
  const trialPromises = res.result.files.map((f) => readFile(f.id));
  currentTrials = await Promise.all(trialPromises);
}

function setupNavigation() {
  document.querySelectorAll(".nav-link, .btn-back").forEach((btn) => {
    btn.onclick = () => showPage(btn.dataset.target);
  });
  document.getElementById("btn-new-trial").onclick = () => {
    document.getElementById("trial-form-title").textContent =
      "Create New Trial";
    populateTrialForm();
    showPage("create-trial");
    citySelect(document.getElementById("city-select"));
  };
  document.getElementById("form-create-trial").onsubmit = handleCreateTrial;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelector(".inventory-content").classList.remove("hidden");
      document
        .querySelectorAll(".tab-btn")
        .forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      renderInventoryList(btn.dataset.tab);
    };
  });
  document.getElementById("btn-add-inventory").onclick = () => {
    const activeTab = document.querySelector(".tab-btn.active").dataset.tab;
    openInventoryModal(activeTab);
  };
  document.getElementById("btn-close-modal").onclick = () => {
    document.getElementById("modal-inventory").classList.add("hidden");
  };
  document.getElementById("form-inventory").onsubmit = handleSaveInventory;
  document.getElementById("btn-logout").onclick = handleSignoutClick;
}

function showPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-link")
    .forEach((l) => l.classList.remove("active"));
  document.getElementById(`page-${pageId}`).classList.add("active");
  const navLink = document.querySelector(`.nav-link[data-target="${pageId}"]`);
  if (navLink) navLink.classList.add("active");
}

function renderDashboard() {
  const container = document.getElementById("trial-list");
  container.innerHTML = "";
  document.getElementById("stat-total-trials").textContent =
    currentTrials.length;
  document.getElementById("stat-active-trials").textContent =
    currentTrials.filter((t) => t.progress < 100).length;
  document.getElementById("stat-completed-trials").textContent =
    currentTrials.filter((t) => t.progress === 100).length;
  currentTrials.forEach((trial, index) => {
    console.log(trial);
    const card = document.createElement("div");
    card.className = "trial-card";
    card.innerHTML = `
    <div class="trial-card-content" onclick="startRunById('${trial.id}')">
        <h4>${trial.name}</h4>
        <p class="trial-description">${trial.description}</p>
        <p class="trial-meta">${trial.crop}</p>
        <span class="trial-status">${trial.progress}% Complete</span>
    </div>
    <div class="trial-card-actions">
        <button class="icon-btn" onclick="openEditTrial('${trial.id}', event)">
            <span class="material-symbols-rounded">edit</span>
        </button>
        <button class="icon-btn-danger" onclick="deleteTrial('${trial.id}', event)">
            <span class="material-symbols-rounded">delete_outline</span>
        </button>
    </div>
`;
    container.appendChild(card);
  });
}

async function deleteTrial(trialId, event) {
  if (event) event.stopPropagation();

  if (!confirm("Hapus trial dan semua foto terkait secara permanen?")) return;

  try {
    showToast("Sedang menghapus...");

    // 1. Ambil data trial dari array lokal
    const trialToDelete = currentTrials.find((t) => t.id === trialId);

    if (trialToDelete && trialToDelete.questions) {
      // 2. Ambil daftar ID foto yang unik (agar tidak menghapus ID yang sama dua kali)
      const photoIds = [
        ...new Set(
          trialToDelete.questions.filter((q) => q.photoId).map((q) => q.photoId)
        ),
      ];

      // 3. Hapus foto satu per satu (Sequential) untuk menghindari limit API
      for (const id of photoIds) {
        try {
          await gapi.client.drive.files.delete({ fileId: id });
          console.log(`Foto ${id} berhasil dihapus`);
        } catch (err) {
          // Jika file sudah tidak ada atau error lain, biarkan lanjut
          console.warn(`Gagal hapus foto ${id}, mungkin sudah tidak ada.`, err);
        }
      }
    }

    // 4. Hapus file JSON Trial utama
    const trialsFolderId = await getOrCreateFolder(
      APP_CONFIG.trialsFolder,
      rootFolderId
    );
    const trialFile = await getFileInFolder(trialsFolderId, `${trialId}.json`);

    if (trialFile) {
      await gapi.client.drive.files.delete({ fileId: trialFile.id });
    }

    // 5. Update State Lokal dan UI
    currentTrials = currentTrials.filter((t) => t.id !== trialId);

    // Bersihkan sesi aktif jika trial yang dihapus sedang dikerjakan
    if (localStorage.getItem("advanta_last_trial_id") === trialId) {
      localStorage.removeItem("advanta_last_trial_id");
      localStorage.removeItem("advanta_last_question_idx");
      activeTrial = null;
    }

    renderDashboard();
    showToast("Trial dan foto berhasil dibersihkan");
  } catch (error) {
    console.error("Delete error detail:", error);
    showToast("Error sistem saat menghapus trial");
  }
}

function startRunById(id) {
  const trial = currentTrials.find((t) => t.id === id);
  if (trial) startRun(trial);
}

function populateTrialForm() {
  const cropSel = document.getElementById("select-crop");
  const locSel = document.getElementById("city-select");
  const lineGrp = document.getElementById("checkbox-group-lines");
  const paramGrp = document.getElementById("checkbox-group-params");

  // 1. Isi Dropdown Crop (hanya jika belum ada isinya atau sedang inisialisasi)
  // Kita pertahankan value yang sedang terpilih agar tidak reset saat fungsi dipanggil lagi
  const currentSelectedCrop = cropSel.value;
  cropSel.innerHTML = inventoryData.crops
    .map((c) => {
      const val = typeof c === "object" ? c.name : c;
      return ` 
        <option value="${val}" ${ val === currentSelectedCrop ? "selected" : ""}>${val}</option>
      `;
    })
    .join("");

  // 2. Isi Dropdown Location
  locSel.innerHTML = inventoryData.locations
    .map((l) => {
      const val = typeof l === "object" ? l.name : l;
      const coord = typeof l === "object" ? l.coord : "";
      return `<option value="${coord}">${val}</option>`
    })
    .join("");

  // 3. FILTER LINES BERDASARKAN CROP YANG DIPILIH
  const selectedCrop = cropSel.value;

  // Filter data lines dari inventory yang memiliki property crop sesuai selectedCrop
  const filteredLines = inventoryData.lines.filter((l) => {
    if (typeof l === "object") {
      return l.crop === selectedCrop;
    }
    return true; // Tampilkan jika data lama masih berupa string (untuk migrasi)
  });

  lineGrp.innerHTML = filteredLines
    .map((l) => {
      const name = typeof l === "object" ? l.name : l;
      const qty = typeof l === "object" ? l.quantity : "";
      return `
        <label class="checkbox-item">
          <input type="checkbox" name="lines" value="${name}"> ${name} (${qty})
        </label>
      `;
    })
    .join("");

  // 4. Isi Checkbox Parameters
  paramGrp.innerHTML = inventoryData.params
    .map(
      (p) => `
        <label class="checkbox-item">
          <input type="checkbox" name="params" value="${p.id}"> ${p.name} (${p.initial})
        </label>
      `
    )
    .join("");

  // 5. TAMBAHKAN EVENT LISTENER (Agar saat Crop diganti, daftar Line langsung berubah)
  // Kita gunakan {once: false} tapi pastikan tidak menumpuk listener
  cropSel.onchange = () => {
    // Kita panggil lagi fungsi ini untuk merefresh daftar lines
    populateTrialForm();
  };
}

async function handleCreateTrial(e) {
  cloudSuccess.classList.add("hidden");
  cloudSyncing.classList.remove("hidden");
  e.preventDefault();

  const name = document.getElementById("input-trial-name").value;
  const description = document.getElementById("input-trial-description").value;
  const crop = document.getElementById("select-crop").value;
  const loc = document.getElementById("city-select").value;
  const date = document.getElementById("input-date").value;
  const ends = document.getElementById("input-ends").value;
  // Analysis
  const selectedLines = Array.from(
    document.querySelectorAll('input[name="lines"]:checked')
  ).map((i) => i.value);
  const numSamples =
    parseInt(document.getElementById("input-trial-samples").value) || 1;
  const numReps =
    parseInt(document.getElementById("input-trial-replications").value) || 1;
  const selectedParamIds = Array.from(
    document.querySelectorAll('input[name="params"]:checked')
  ).map((i) => i.value);

  let questions = [];
  let existingQuestions = [];

  if (editingTrialId) {
    const oldTrial = currentTrials.find((t) => t.id === editingTrialId);
    existingQuestions = oldTrial.questions;
  }

  selectedLines.forEach((line) => {
    for (let r = 1; r <= numReps; r++) {
      // Loop Replication di dalam Line
      for (let s = 1; s <= numSamples; s++) {
        // Loop Sample di dalam Replication
        selectedParamIds.forEach((pId) => {
          const p = inventoryData.params.find((px) => px.id === pId);

          // Logic pencarian match untuk menyimpan data lama saat edit
          const match = existingQuestions.find(
            (eq) =>
              eq.line === line &&
              eq.replication === r &&
              eq.sampleNumber === s &&
              eq.paramId === pId
          );

          if (match) {
            questions.push({ ...match });
          } else {
            questions.push({
              line: line,
              description: description,
              replication: r,
              sampleNumber: s,
              paramId: p.id,
              paramName: p.name,
              paramInitial: p.initial || p.name.substring(0, 3).toUpperCase(),
              type: p.type,
              options: p.options || "", // Sudah benar
              needsPhoto: p.photo || false, // TAMBAHKAN INI agar fitur foto muncul
              unit: p.unit || "", // TAMBAHKAN INI jika ingin menampilkan satuan (cm, kg, dll)
              value: "", // Inisialisasi nilai kosong
              photoId: null,
              completed: false,
            });
          }
        });
      }
    }
  });

  const completedCount = questions.filter((q) => q.completed).length;
  const progress = Math.round((completedCount / questions.length) * 100) || 0;

  const trialData = {
    id: editingTrialId || "trial_" + Date.now(),
    name,
    description,
    crop,
    loc,
    date,
    ends,
    samples: numSamples,
    numReps,
    questions,
    progress,
  };

  const trialsFolderId = await getOrCreateFolder(
    APP_CONFIG.trialsFolder,
    rootFolderId
  );

  if (editingTrialId) {
    const file = await getFileInFolder(
      trialsFolderId,
      `${editingTrialId}.json`
    );
    await updateFile(file.id, trialData);
    const idx = currentTrials.findIndex((t) => t.id === editingTrialId);
    currentTrials[idx] = trialData;
  } else {
    await createFile(trialsFolderId, `${trialData.id}.json`, trialData);
    currentTrials.push(trialData);
  }

  editingTrialId = null;
  renderDashboard();
  showPage("dashboard");
  cloudSuccess.classList.remove("hidden");
  cloudSyncing.classList.add("hidden");
  showToast(trialData.id ? "Trial Saved" : "Trial Created");
}

function startRun(trial) {
  activeTrial = trial;
  currentQuestionIndex = 0;
  showPage("run-trial");
  renderQuestion();
}

async function renderQuestion() {
  const q = activeTrial.questions[currentQuestionIndex];

  document.getElementById("run-trial-title").textContent = activeTrial.name;
  document.getElementById("run-progress-text").textContent = `${
    currentQuestionIndex + 1
  } / ${activeTrial.questions.length}`;
  document.getElementById("run-progress-bar").style.width = `${
    ((currentQuestionIndex + 1) / activeTrial.questions.length) * 100
  }%`;

  document.getElementById(
    "q-line-name"
  ).textContent = `${q.line} - Rep ${q.replication} - Sample #${q.sampleNumber}`;
  document.getElementById("q-param-type").textContent = q.type.toUpperCase();
  document.getElementById("q-param-name").textContent = q.paramName;

  const numInput = document.getElementById("input-run-number");
  const txtInput = document.getElementById("input-run-text");
  const photoArea = document.getElementById("input-run-photo");
  const previewContainer = document.getElementById("photo-preview-container");
  const fileInput = document.getElementById("file-photo");
  const inputContainer = document.getElementById("input-area");
  const photoLabel = document.querySelector(".photo-label");

  numInput.classList.add("hidden");
  txtInput.classList.add("hidden");
  photoArea.classList.add("hidden");
  previewContainer.classList.add("hidden");
  previewContainer.innerHTML = "";
  fileInput.value = "";
  inputContainer.innerHTML = "";

  if (q.type === "text") {
    inputContainer.innerHTML = `<input type="text" id="active-input" class="form-control" value="${
      q.value || ""
    }" placeholder="Enter text...">`;
  } else if (q.type === "number") {
    inputContainer.innerHTML = `<input type="number" id="active-input" class="form-control" value="${
      q.value || ""
    }" placeholder="Enter number...">`;
  } else if (q.type === "date") {
    inputContainer.innerHTML = `<input type="date" id="active-input" class="form-control" value="${
      q.value || ""
    }">`;
  } else if (q.type === "range") {
    console.log(q);
    console.log(q.options);
    const [min, max] = q.options.split("-").map(Number);
    inputContainer.innerHTML = `
            <div class="range-container">
                <input type="range" id="range-slider" min="${min}" max="${max}" value="${
      q.value || min
    }" oninput="document.getElementById('active-input').value = this.value">
                <input type="number" id="active-input" class="form-control" value="${
                  q.value || min
                }" min="${min}" max="${max}">
                <small>Range: ${min} - ${max}</small>
            </div>`;
    document.getElementById("active-input").oninput = (e) => {
      document.getElementById("range-slider").value = e.target.value;
    };
  } else if (q.type === "radio" || q.type === "checkbox") {
    const options = q.options.split(",").map((opt) => opt.trim());
    const inputType = q.type;
    let html = `<div class="${inputType}-group">`;
    options.forEach((opt) => {
      const checked =
        inputType === "checkbox"
          ? (q.value || "").split(",").includes(opt)
          : q.value === opt;
      html += `
                <label class="option-item">
                    <input type="${inputType}" name="active-option" value="${opt}" ${
        checked ? "checked" : ""
      }>
                    ${opt}
                </label>`;
    });
    html += `</div><input type="hidden" id="active-input" value="${
      q.value || ""
    }">`;
    inputContainer.innerHTML = html;

    inputContainer.querySelectorAll("input").forEach((input) => {
      input.onchange = () => {
        if (inputType === "checkbox") {
          const selected = Array.from(
            inputContainer.querySelectorAll("input:checked")
          ).map((i) => i.value);
          document.getElementById("active-input").value = selected.join(",");
        } else {
          document.getElementById("active-input").value = input.value;
        }
      };
    });
  }

  if (q.needsPhoto) {
    photoArea.classList.remove("hidden");
    if (q.photoId) {
      console.log(q);
      photoLabel.classList.add("hidden");
      previewContainer.classList.remove("hidden");
      const displayUrl = `https://lh3.googleusercontent.com/d/${q.photoId}`;
      previewContainer.innerHTML = `
        <div class="photo-notice success">
            <img src="${displayUrl}" onerror="this.src='https://placehold.co/400x300?text=ERROR'">
            <div class="photo-actions">
                <a href="${displayUrl}" target="_blank" class="btn-view-link">
                    <span class="material-symbols-rounded">visibility</span> View in Full
                </a>
                <span class="btn-edit-link" onclick="document.getElementById('file-photo').click();">
                    <span class="material-symbols-rounded">edit</span> Edit
                </span>
                <span class="btn-delete-link" onclick="removePhoto()">
                    <span class="material-symbols-rounded">delete</span> Delete
                </span>
            </div>
        </div>
      `;
    } else {
      photoLabel.classList.remove("hidden");
    }
  } else {
  }

  document.getElementById("btn-prev-q").disabled = currentQuestionIndex === 0;
  document.getElementById("btn-next-q").onclick = nextQuestion;
  document.getElementById("btn-prev-q").onclick = prevQuestion;

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeTrial) return;
    const uploadIndex = currentQuestionIndex;
    showToast("Uploading photo...");

    const photoData = await uploadPhotoToDrive(file); // Sekarang mengembalikan objek
    if (photoData) {
      activeTrial.questions[uploadIndex].photoId = photoData.id;
      activeTrial.questions[uploadIndex].photoUrl = photoData.url; // Simpan URL publiknya
      activeTrial.questions[uploadIndex].completed = true;
      await syncTrialToDrive();
      renderQuestion();
      renderOverview();
      showToast("Photo saved!");
    }
  };

  renderOverview();
}

async function removePhoto() {
  if (confirm("Remove this photo?")) {
    activeTrial.questions[currentQuestionIndex].photoId = null;
    await syncTrialToDrive();
    renderQuestion();
    renderOverview();
    photoLabel.classList.remove("hidden");
    showToast("Photo removed");
  }
}

async function nextQuestion() {
  saveCurrentResponse();
  await syncTrialToDrive("nextprev");
  if (currentQuestionIndex < activeTrial.questions.length - 1) {
    currentQuestionIndex++;
    renderQuestion();
  } else {
    showToast("Trial completed!");
  }
}

async function prevQuestion() {
  saveCurrentResponse();
  await syncTrialToDrive("nextprev");
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderQuestion();
  }
}

function saveCurrentResponse() {
  const q = activeTrial.questions[currentQuestionIndex];
  const val = document.getElementById("active-input").value;

  q.value = val;
  q.completed = val !== "" && val !== null;

  const completedCount = activeTrial.questions.filter(
    (qx) => qx.completed
  ).length;
  activeTrial.progress = Math.round(
    (completedCount / activeTrial.questions.length) * 100
  );

  localStorage.setItem("advanta_last_trial_id", activeTrial.id);
  localStorage.setItem("advanta_last_question_idx", currentQuestionIndex);
}

async function syncTrialToDrive(type) {
  if (type === "nextprev") {
    showToast("Saving response...");
  }
  const trialsFolderId = await getOrCreateFolder(
    APP_CONFIG.trialsFolder,
    rootFolderId
  );
  const file = await getFileInFolder(trialsFolderId, `${activeTrial.id}.json`);
  if (file) await updateFile(file.id, activeTrial);
  if (type === "nextprev") {
    showToast("Saved!");
  }
}

function renderOverview() {
  const container = document.getElementById("run-overview-list");
  container.innerHTML = "";

  // 1. Kelompokkan Data: Line -> Rep -> Sample
  const grouped = activeTrial.questions.reduce((acc, q, idx) => {
    if (!acc[q.line]) acc[q.line] = {};
    if (!acc[q.line][q.replication]) acc[q.line][q.replication] = {};
    if (!acc[q.line][q.replication][q.sampleNumber])
      acc[q.line][q.replication][q.sampleNumber] = [];

    acc[q.line][q.replication][q.sampleNumber].push({
      ...q,
      originalIndex: idx,
    });
    return acc;
  }, {});

  const currentQ = activeTrial.questions[currentQuestionIndex];

  // 2. Render Hierarki
  for (const line in grouped) {
    const lineGroup = document.createElement("div");
    lineGroup.className = "line-group";
    const isLineActive = line === currentQ.line;

    lineGroup.innerHTML = `
      <div class="line-header" onclick="toggleOverviewSection(this)">
        <span>${line}</span>
        <span class="material-symbols-rounded">expand_more</span>
      </div>
      <div class="rep-container ${isLineActive ? "" : "hidden"}"></div>
    `;

    const repContainer = lineGroup.querySelector(".rep-container");

    for (const rNum in grouped[line]) {
      const repBox = document.createElement("div");
      repBox.className = "rep-box";
      const isRepActive =
        isLineActive && parseInt(rNum) === currentQ.replication;

      repBox.innerHTML = `
        <div class="rep-header" onclick="toggleOverviewSection(this)">
          <span>Rep. ${rNum}</span>
          <span class="material-symbols-rounded">unfold_more</span>
        </div>
        <div class="sample-container ${isRepActive ? "" : "hidden"}"></div>
      `;

      const sampleContainer = repBox.querySelector(".sample-container");

      for (const sNum in grouped[line][rNum]) {
        const sampleBox = document.createElement("div");
        sampleBox.className = "sample-box";
        const isSampleActive =
          isRepActive && parseInt(sNum) === currentQ.sampleNumber;

        sampleBox.innerHTML = `
          <div class="sample-header" onclick="toggleOverviewSection(this)">
            <span>Sample #${sNum}</span>
            <span class="material-symbols-rounded">unfold_more</span>
          </div>
          <div class="param-grid ${isSampleActive ? "" : "hidden"}"></div>
        `;

        const paramGrid = sampleBox.querySelector(".param-grid");
        grouped[line][rNum][sNum].forEach((q) => {
          const item = document.createElement("div");
          item.className = `overview-item ${q.completed ? "filled" : ""} ${
            q.originalIndex === currentQuestionIndex ? "current" : ""
          }`;
          item.innerHTML = `<span>${q.paramInitial}</span>`;
          item.onclick = (e) => {
            e.stopPropagation();
            saveCurrentResponse();
            currentQuestionIndex = q.originalIndex;
            renderQuestion();
          };
          paramGrid.appendChild(item);
        });
        sampleContainer.appendChild(sampleBox);
      }
      repContainer.appendChild(repBox);
    }
    container.appendChild(lineGroup);
  }
}

function toggleOverviewSection(element) {
  const content = element.nextElementSibling;
  content.classList.toggle("hidden");
}

function showToast(msg) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

let editingIndex = null;

function renderInventoryList(tab) {
  const container = document.getElementById("inventory-list");
  container.innerHTML = "";
  const data = inventoryData[tab];
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">No items found.</div>';
    return;
  }
  data.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "list-item";
    let displayName;
    if (tab === "params") {
      displayName = `${item.name} (${item.type})`;
    } else if (tab === "crops") {
      displayName =
        typeof item === "object"
          ? `${item.name}<small>${item.type}</small>`
          : item;
    } else if (tab === "lines") {
      displayName =
        typeof item === "object"
          ? `${item.name}<small>${item.crop} · ${item.quantity} · ${item.stage} · ${item.origin} · ${item.arrivalDate} · ${item.registeredDate} · ${item.parentCode} · ${item.hybridCode} · ${item.sprCode} · ${item.role}</small>`
          : item;
    } else if (tab === "locations") {
      displayName = item.name;
    }
    div.innerHTML = `
            <span>${displayName}</span>
            <div class="item-actions">
                <button onclick="editInventoryItem('${tab}', ${index})" class="btn-text">Edit</button>
                <button onclick="deleteInventoryItem('${tab}', ${index})" class="btn-text" style="color:var(--danger)">Delete</button>
            </div>
        `;
    container.appendChild(div);
  });
}

function openInventoryModal(tab, index = null) {
  editingIndex = index;
  const modal = document.getElementById("modal-inventory");
  const fieldsContainer = document.getElementById("modal-inv-fields");
  fieldsContainer.innerHTML = "";
  document.getElementById("modal-inv-title").textContent =
    (index !== null ? "Edit " : "Add ") + tab.slice(0, -1);
  if (tab === "params") {
    const item =
      index !== null
        ? inventoryData.params[index]
        : { name: "", type: "text", unit: "", photo: !1, options: "" };
    fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>Parameter Name</label>
                <input type="text" id="inv-param-name" value="${
                  item.name
                }" required>
            </div>
<div class="form-group">
        <label>Parameter Initial (Max 3 Characters)</label>
        <input type="text" id="input-param-initial" maxlength="3" value="${
          item.initial || ""
        }" placeholder="e.g., PH, HGT" required>
    </div>
            <div class="form-group">
                <label>Type</label>
                <select id="inv-param-type" onchange="toggleParamOptions(this.value)">
                    <option value="text" ${
                      item.type === "text" ? "selected" : ""
                    }>Text</option>
                    <option value="number" ${
                      item.type === "number" ? "selected" : ""
                    }>Number</option>
                    <option value="range" ${
                      item.type === "range" ? "selected" : ""
                    }>Range (e.g. 1-100)</option>
                    <option value="radio" ${
                      item.type === "radio" ? "selected" : ""
                    }>Radio</option>
                    <option value="checkbox" ${
                      item.type === "checkbox" ? "selected" : ""
                    }>Checkbox</option>
                    <option value="date" ${
                      item.type === "date" ? "selected" : ""
                    }>Date</option>
                </select>
            </div>
            <div id="param-options-container" class="form-group ${
              ["range", "radio", "checkbox"].includes(item.type) ? "" : "hidden"
            }">
                <label id="label-options">Options / Range Config</label>
                <input type="text" id="inv-param-options" value="${
                  item.options || ""
                }" placeholder="1-100 or Option A, Option B">
            </div>
            <div class="form-group">
                <label>Unit</label>
                <input type="text" id="inv-param-unit" value="${
                  item.unit || ""
                }" placeholder="e.g. cm, kg, score">
            </div>
            <div class="form-group checkbox-item">
                <input type="checkbox" id="inv-param-photo" ${
                  item.photo ? "checked" : ""
                }>
                <label>Require Photo Upload</label>
            </div>
        `;
  } else if (tab === "crops") {
    const item =
      index !== null ? inventoryData.crops[index] : { name: "", type: "" };
    const nameVal = typeof item === "object" ? item.name : item;
    const typeVal = typeof item === "object" ? item.type : "";

    fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>Crop Name</label>
                <input type="text" id="inv-crop-name" value="${nameVal}" required>
            </div>
            <div class="form-group">
                <label>Crop Type</label>
                <select id="inv-crop-type">
                    <option value="" disabled selected>Select type</option>
                    <option value="Veggies" ${
                      typeVal === "Veggies" ? "selected" : ""
                    }>Veggies</option>
                    <option value="Forage" ${
                      typeVal === "Forage" ? "selected" : ""
                    }>Forage</option>
                    <option value="Field crop" ${
                      typeVal === "Field crop" ? "selected" : ""
                    }>Field crop</option>
                    <option value="Other crop" ${
                      typeVal === "Other crop" ? "selected" : ""
                    }>Other crop</option>
                </select>
            </div>
        `;
  } else if (tab === "lines") {
    const item =
      index !== null ? inventoryData.lines[index] : { name: "", crop: "" };
    const nameVal = typeof item === "object" ? item.name : item;
    const selectedCrop = typeof item === "object" ? item.crop : "";
    const quantityVal = typeof item === "object" ? item.quantity : "";
    const stageVal = typeof item === "object" ? item.stage : "";
    const originVal = typeof item === "object" ? item.origin : "";
    const arrivalDateVal = typeof item === "object" ? item.arrivalDate : "";
    const registeredDateVal =
      typeof item === "object" ? item.registeredDate : "";
    const parentCodeVal = typeof item === "object" ? item.parentCode : "";
    const hybridCodeVal = typeof item === "object" ? item.hybridCode : "";
    const sprCodeVal = typeof item === "object" ? item.sprCode : "";
    const roleVal = typeof item === "object" ? item.role : "";

    const cropOptions = inventoryData.crops
      .map((c) => {
        const cName = typeof c === "object" ? c.name : c;
        return `<option value="${cName}" ${
          selectedCrop === cName ? "selected" : ""
        }>${cName}</option>`;
      })
      .join("");

    fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="inv-line-name" value="${nameVal}" required>
            </div>
            <div class="form-group">
                <label>Crop</label>
                <select id="inv-line-crop" required>
                    <option value="" disabled selected>Select crop</option>
                    ${cropOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Quantity</label>
                <input type="number" id="inv-line-quantity" required value="${quantityVal}" min="0">
            </div>
            <div class="form-group">
                <label>Stage</label>
                <select id="inv-line-stage" required>
                    <option value="" disabled selected>Select stage</option>
                    <option value="Breeder Seed" ${
                      stageVal === "Breeder Seed" ? "selected" : ""
                    }>Breeder Seed</option>
                    <option value="Pre Basic 1" ${
                      stageVal === "Pre Basic 1" ? "selected" : ""
                    }>Pre Basic 1</option>
                    <option value="Pre Basic 2" ${
                      stageVal === "Pre Basic 2" ? "selected" : ""
                    }>Pre Basic 2</option>
                    <option value="Basic Seed" ${
                      stageVal === "Basic Seed" ? "selected" : ""
                    }>Basic Seed</option>
                    <option value="Parent Seed" ${
                      stageVal === "Parent Seed" ? "selected" : ""
                    }>Parent Seed</option>
                    <option value="Commercial" ${
                      stageVal === "Commercial" ? "selected" : ""
                    }>Commercial</option>
                </select>
            </div>
            <div class="form-group">
                <label>Origin</label>
                <input type="text" id="inv-line-origin" required value="${originVal}">
            </div>
            <div class="form-group">
                <label>Arrival Date</label>
                <input type="date" id="inv-line-arrival-date" required value="${arrivalDateVal}">
            </div>
            <div class="form-group">
                <label>Registered Date</label>
                <input type="date" id="inv-line-registered-date" required value="${registeredDateVal}">
            </div>
            <div class="form-group">
                <label>Parent Code</label>
                <input type="number" id="inv-line-parent-code" required value="${parentCodeVal}">
            </div>
            <div class="form-group">
                <label>Hybrid Code</label>
                <input type="number" id="inv-line-hybrid-code" required value="${hybridCodeVal}">
            </div>
            <div class="form-group">
                <label>SPR Code</label>
                <input type="number" id="inv-line-spr-code" required value="${sprCodeVal}">
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="inv-line-role" required>
                    <option value="" disabled selected>Select role</option>
                    <option value="Male" ${
                      roleVal === "Male" ? "selected" : ""
                    }>Male</option>
                    <option value="Female" ${
                      roleVal === "Female" ? "selected" : ""
                    }>Female</option>
                    <option value="Both" ${
                      roleVal === "Both" ? "selected" : ""
                    }>Both</option>
                </select>
            </div>
        `;
  } else if (tab === "locations") {
    const value = index !== null ? inventoryData[tab][index] : "";
    const locCoord = index !== null ? inventoryData[tab][index].coord : null;
    fieldsContainer.innerHTML = `
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="inv-generic-name" value="${value}" required>
            </div>
            <div class="form-group">
              <label>Location</label>
              <div id="map-single"></div>
              <input type="text" id="single-coord-output" required disabled value="${locCoord ? locCoord.lat + ", " + locCoord.lng : ""}">
            </div>
        `;
    // initSingleMap();
    setTimeout(() => initSingleMap(), 100);
  }
  modal.classList.remove("hidden");
}

function toggleParamOptions(type) {
  const container = document.getElementById("param-options-container");
  const label = document.getElementById("label-options");
  if (["radio", "checkbox", "range"].includes(type)) {
    container.classList.remove("hidden");
    label.textContent =
      type === "range" ? "Range (Min-Max)" : "Options (Comma separated)";
  } else {
    container.classList.add("hidden");
  }
}

async function handleSaveInventory(e) {
  e.preventDefault();
  const tab = document.querySelector(".tab-btn.active").dataset.tab;
  let newValue;

  if (tab === "params") {
    newValue = {
      id:
        editingIndex !== null
          ? inventoryData.params[editingIndex].id
          : "p_" + Date.now(),
      name: document.getElementById("inv-param-name").value,
      initial: document
        .getElementById("input-param-initial")
        .value.toUpperCase(),
      type: document.getElementById("inv-param-type").value,
      unit: document.getElementById("inv-param-unit").value,
      photo: document.getElementById("inv-param-photo").checked,
      options: document.getElementById("inv-param-options").value,
    };
  } else if (tab === "crops") {
    newValue = {
      name: document.getElementById("inv-crop-name").value,
      type: document.getElementById("inv-crop-type").value,
    };
  } else if (tab === "lines") {
    newValue = {
      name: document.getElementById("inv-line-name").value,
      crop: document.getElementById("inv-line-crop").value,
      quantity: parseInt(document.getElementById("inv-line-quantity").value),
      stage: document.getElementById("inv-line-stage").value,
      origin: document.getElementById("inv-line-origin").value,
      arrivalDate: document.getElementById("inv-line-arrival-date").value,
      registeredDate: document.getElementById("inv-line-registered-date").value,
      parentCode: document.getElementById("inv-line-parent-code").value,
      hybridCode: document.getElementById("inv-line-hybrid-code").value,
      sprCode: document.getElementById("inv-line-spr-code").value,
      role: document.getElementById("inv-line-role").value,
    };
  } else if (tab === "locations") {
    newValue = {
      name: document.getElementById("inv-generic-name").value,
      coord: document.getElementById("single-coord-output").value
    };
  }

  if (editingIndex !== null) {
    inventoryData[tab][editingIndex] = newValue;
  } else {
    inventoryData[tab].push(newValue);
  }

  await syncInventoryToDrive();
  document.getElementById("modal-inventory").classList.add("hidden");
  renderInventoryList(tab);
  showToast("Inventory updated");
}

async function deleteInventoryItem(tab, index) {
  if (!confirm("Are you sure you want to delete this item?")) return;
  inventoryData[tab].splice(index, 1);
  await syncInventoryToDrive();
  renderInventoryList(tab);
  showToast("Item deleted");
}

function editInventoryItem(tab, index) {
  openInventoryModal(tab, index);
}

async function syncInventoryToDrive() {
  const file = await getFileInFolder(rootFolderId, APP_CONFIG.inventoryFile);
  if (file) {
    await updateFile(file.id, inventoryData);
  }
}

async function uploadPhotoToDrive(file) {
  try {
    const photosFolderId = await getOrCreateFolder(
      APP_CONFIG.photosFolder,
      rootFolderId
    );
    const metadata = {
      name: `img_${Date.now()}_${file.name}`,
      parents: [photosFolderId],
      mimeType: file.type,
    };

    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    formData.append("file", file);

    // Ambil fields 'id' DAN 'thumbnailLink'
    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,thumbnailLink",
      {
        method: "POST",
        headers: new Headers({
          Authorization: "Bearer " + gapi.client.getToken().access_token,
        }),
        body: formData,
      }
    );

    const result = await response.json();

    if (result.id) {
      await setFilePublic(result.id);
      // Ganti resolusi thumbnail agar lebih besar (dari s220 ke s1000)
      const highResPhoto = result.thumbnailLink
        ? result.thumbnailLink.replace("=s220", "=s1000")
        : null;
      return { id: result.id, url: highResPhoto };
    }
    return null;
  } catch (error) {
    console.error("Upload error:", error);
    return null;
  }
}

async function getFileViewUrl(fileId) {
  if (!fileId) return null;
  try {
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      fields: "thumbnailLink, webContentLink",
    });
    if (response.result.thumbnailLink) {
      return response.result.thumbnailLink.replace("=s220", "=s1000");
    }
    return response.result.webContentLink;
  } catch (e) {
    console.error("Error fetching image URL", e);
    return null;
  }
}

let editingTrialId = null;

function openEditTrial(trialId, event) {
  if (event) event.stopPropagation();
  editingTrialId = trialId;
  const trial = currentTrials.find((t) => t.id === trialId);

  showPage("create-trial");
  document.getElementById("trial-form-title").textContent = "Edit Trial";

  document.getElementById("input-trial-name").value = trial.name;
  document.getElementById("input-trial-description").value = trial.description;
  document.getElementById("select-crop").value = trial.crop;
  document.getElementById("city-select").value = trial.location;
  document.getElementById("input-date").value = trial.date;
  document.getElementById("input-ends").value = trial.ends;
  document.getElementById("input-trial-replications").value = trial.numReps;
  console.log(trial);
  document.getElementById("input-trial-samples").value = trial.samples;

  populateTrialForm();

  const existingLines = [...new Set(trial.questions.map((q) => q.line))];
  document.querySelectorAll('input[name="lines"]').forEach((cb) => {
    if (existingLines.includes(cb.value)) cb.checked = true;
  });

  const existingParamIds = [...new Set(trial.questions.map((q) => q.paramId))];
  document.querySelectorAll('input[name="params"]').forEach((cb) => {
    if (existingParamIds.includes(cb.value)) cb.checked = true;
  });
}

// ================= MAP =================

/**
 * SECTION 1: GLOBAL SETTINGS & UTILITIES
 * Handles map layers, calculations, and common tools.
 */
const getLayers = () => {
  const osm = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxNativeZoom: 19, maxZoom: 25, attribution: '<a href="https://www.kodejarwo.com" title="Kode Jarwo"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8"><path fill="#ED1C24" d="M0 0h12v4H0z"></path><path fill="#FFFFFF" d="M0 4h12v3H0z"></path><path fill="#e9e9e9ff" d="M0 7h12v1H0z"></path></svg> Ozik Jarwo</a>' }
  );
  const satellite = L.tileLayer(
    "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.{ext}",
    { maxNativeZoom: 20, maxZoom: 25, ext: 'jpg', attribution: '<a href="https://www.kodejarwo.com" title="Kode Jarwo"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8"><path fill="#ED1C24" d="M0 0h12v4H0z"></path><path fill="#FFFFFF" d="M0 4h12v3H0z"></path><path fill="#e9e9e9ff" d="M0 7h12v1H0z"></path></svg> Ozik Jarwo</a>' }
  );
  return { osm, satellite };
};

function calculateArea(coords) {
  let area = 0;
  const R = 6378137;
  if (coords.length < 3) return 0;
  for (let i = 0; i < coords.length; i++) {
    const p1 = coords[i],
      p2 = coords[(i + 1) % coords.length];
    const lat1 = (p1[0] * Math.PI) / 180,
      lat2 = (p2[0] * Math.PI) / 180;
    const lng1 = (p1[1] * Math.PI) / 180,
      lng2 = (p2[1] * Math.PI) / 180;
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((area * R * R) / 2.0);
}

function formatArea(val) {
  if (val > 10000)
    return (
      (val / 10000).toFixed(2) +
      " ha (" +
      val.toLocaleString("id-ID", { maximumFractionDigits: 0 }) +
      " m²)"
    );
  return val.toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " m²";
}

/**
 * SECTION 2: AREA SELECTOR LOGIC (Interactive Mode)
 * Handles city selection, searching, and manual polygon drawing.
 */
let map;
let markers = [];
let points = [];
let polygonLayer = null;
let searchTimeout = null;

function initAreaMap(lat, lng) {
  if (map) map.remove();
  const { osm, satellite } = getLayers();
  map = L.map("map", { center: [lat, lng], zoom: 13, layers: [satellite] });
  L.control
    .layers(
      { "Road Map": osm, Satellite: satellite }
    )
    .addTo(map);
  map.on("click", (e) => addPoint(e.latlng.lat, e.latlng.lng));
}

function addPoint(lat, lng) {
  points.push([lat, lng]);
  const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
  marker.on("dragend", (e) => {
    const idx = markers.indexOf(e.target);
    if (idx !== -1) {
      points[idx] = [e.target.getLatLng().lat, e.target.getLatLng().lng];
      drawPolygon(map, points, "polygonLayer", "#2563eb");
      updateAreaOutput();
    }
  });
  markers.push(marker);
  drawPolygon(map, points, "polygonLayer", "#2563eb");
  updateAreaOutput();
}

function drawPolygon(targetMap, coords, layerName, color) {
  if (layerName === "polygonLayer" && polygonLayer)
    targetMap.removeLayer(polygonLayer);
  if (coords.length >= 3) {
    const poly = L.polygon(coords, {
      color,
      fillColor: color,
      fillOpacity: 0.4,
      weight: 2,
    }).addTo(targetMap);
    if (layerName === "polygonLayer") polygonLayer = poly;
  }
}

function updateAreaOutput() {
  const listEl = document.getElementById("coords-list");
  const jsonEl = document.getElementById("json-output");
  const areaEl = document.getElementById("area-output");
  const area = calculateArea(points);
  areaEl.innerText = formatArea(area);

  if (points.length === 0) {
    listEl.innerHTML =
      '<li style="font-style: italic; color: #9ca3af;">No points selected yet...</li>';
    jsonEl.value = "";
    return;
  }

  listEl.innerHTML = points
    .map(
      (p, i) => `
                <li class="coords-item">
                    <span><strong>#${i + 1}</strong>: ${p[0].toFixed(
        5
      )}, ${p[1].toFixed(5)}</span>
                    <button onclick="removePoint(${i})" style="color: var(--danger); border: none; background: none; cursor: pointer; font-weight: bold;">
                      <span class="material-symbols-rounded"> delete </span>
                    </button>
                </li>`
    )
    .join("");
  jsonEl.value = JSON.stringify(points);
}

function removePoint(idx) {
  map.removeLayer(markers[idx]);
  markers.splice(idx, 1);
  points.splice(idx, 1);
  drawPolygon(map, points, "polygonLayer", "#2563eb");
  updateAreaOutput();
}

function resetMap() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  if (polygonLayer) map.removeLayer(polygonLayer);
  polygonLayer = null;
  points = [];
  updateAreaOutput();
}

// Listeners for Section 2
function citySelect(a) {
  a.setAttribute("data-city", a.options[a.selectedIndex].text);
  const [lat, lng] = a.value.split(",").map(Number);
  setTimeout(() => {
    initAreaMap(lat, lng);
    resetMap();
  }, 100);
}

document.getElementById("city-select").addEventListener("change", function(event) {
  citySelect(event.target);
});

document.getElementById("address-input").addEventListener("input", function () {
  clearTimeout(searchTimeout);
  const query = document.getElementById("city-select").getAttribute("data-city") + " " + this.value;
  const msg = document.getElementById("search-result-msg");
  if (query.length < 3) return;
  msg.innerText = "Searching...";
  searchTimeout = setTimeout(async () => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=1`
    );
    console.log(query);
    const data = await res.json();
    if (data.length > 0) {
      map.flyTo([data[0].lat, data[0].lon], 18);
      msg.className = "text-success";
      msg.innerText = "Found: " + data[0].display_name.split(",")[0];
    } else {
      msg.className = "text-error";
      msg.innerText = "Not found.";
    }
  }, 1000);
});

/**
 * SECTION 3: IMPORT JSON LOGIC
 * Handles visualizing external JSON coordinate arrays.
 */
let mapImport;
let importMarkers = [];
let importPolygonLayer = null;

function importFromJson() {
  const input = document.getElementById("json-input").value;
  const msgEl = document.getElementById("import-msg");
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed) || parsed.length < 1)
      throw new Error("Format must be an array.");
    msgEl.className = "text-success";
    msgEl.innerText = "Data parsed successfully!";

    if (!mapImport) {
      document.getElementById("map-import").innerHTML = "";
      const { osm, satellite, labels } = getLayers();
      mapImport = L.map("map-import", { layers: [osm] });
      L.control
        .layers(
          { "Road Map": osm, Satellite: satellite },
          { "Street Labels": labels }
        )
        .addTo(mapImport);
    }

    importMarkers.forEach((m) => mapImport.removeLayer(m));
    importMarkers = [];
    if (importPolygonLayer) mapImport.removeLayer(importPolygonLayer);

    parsed.forEach((p) => {
      const m = L.marker(p).addTo(mapImport);
      importMarkers.push(m);
    });

    if (parsed.length >= 3) {
      importPolygonLayer = L.polygon(parsed, {
        color: "#10b981",
        fillOpacity: 0.4,
      }).addTo(mapImport);
    }
    mapImport.fitBounds(L.latLngBounds(parsed), { padding: [20, 20] });
    document.getElementById("import-area-val").innerText =
      "Area: " + formatArea(calculateArea(parsed));
  } catch (e) {
    msgEl.className = "text-error";
    msgEl.innerText = "Error: " + e.message;
  }
}

/**
 * SECTION 4: SINGLE POINT SELECTOR LOGIC (New Section)
 * Handles marking exactly one point on a separate map.
 */
let mapSingle;
let singleMarker = null;

function initSingleMap() {
  const { osm, satellite, labels } = getLayers();
  // Default center to Jakarta
  mapSingle = L.map("map-single", {
    center: [-2.416426, 116.426164], 
    zoom: 4.5,
    layers: [osm],
  });
  L.control
    .layers(
      { "Road Map": osm, Satellite: satellite },
      { "Street Labels": labels }
    )
    .addTo(mapSingle);

  mapSingle.on("click", function (e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    // Remove existing marker (max 1 point)
    if (singleMarker) {
      mapSingle.removeLayer(singleMarker);
    }

    // Add new marker
    singleMarker = L.marker([lat, lng])
      .addTo(mapSingle)
      // .bindPopup(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
      .openPopup();

    // Update output
    document.getElementById("single-coord-output").value = `${lat.toFixed(
      6
    )}, ${lng.toFixed(6)}`;
  });
}
