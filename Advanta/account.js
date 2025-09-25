//////// Google Drive API Integration


const CLIENT_ID = "400272927751-t5ehe632lahuk9p38eie583tv2obv60s.apps.googleusercontent.com";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata openid profile email";

let tokenClient;
let gapiInited = false;
let rootFolderId = null;
let subFolders = {};

function gapiLoaded() { 
  gapi.load('client', initializeGapiClient); 
}

async function initializeGapiClient() {
  await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
  gapiInited = true;
  document.getElementById('login').style.display = 'flex';

  const savedToken = localStorage.getItem("gdrive_token");
  if (savedToken) {
    gapi.client.setToken(JSON.parse(savedToken));
    try {
      await ensureToken();
    } catch (e) {
      console.warn("Silent refresh gagal, user mungkin harus login ulang:", e);
    }

    document.getElementById('logout').style.display = 'flex';
    document.getElementById('login').style.display = 'none';

    notification("loading", "Loading data...");
    await showUserInfo();
    await ensureFolders();
    await ensureInventoryFiles();

    await loadCropData();
    await loadLineData(); 
    await loadParamData(); 
    await loadLocationData();

    await loadTrialData();
    await renderTrialTable();

    await renderLocationCheckbox('.locationCheckbox');
    await renderCropSelect('.cropSelect');
    await renderLineSelect('.lineSelect');
    
    await renderParamCheckbox(".paramCheckbox");
    await listLibraryFilesUI();
    notification("success", "All data loaded");

  }
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  });
}

document.getElementById('login').onclick = () => {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    document.getElementById('logout').style.display = 'flex';
    document.getElementById('login').style.display = 'none';
    localStorage.setItem("gdrive_token", JSON.stringify(gapi.client.getToken()));
    location.reload();
  };
  if (!gapi.client.getToken()) tokenClient.requestAccessToken({ prompt: 'consent' });
  else tokenClient.requestAccessToken({ prompt: '' });
};

document.getElementById('logout').onclick = () => {
  const token = gapi.client.getToken();
  if (token) google.accounts.oauth2.revoke(token.access_token);
  gapi.client.setToken('');
  localStorage.removeItem("gdrive_token");
  rootFolderId = null;
  subFolders = {};
  document.querySelector('.table.fix .tbody').innerHTML = '';
  document.getElementById('login').style.display = 'flex';
  document.getElementById('logout').style.display = 'none';
  document.getElementById('username').innerText = 'Guest';
  document.getElementById('useremail').innerText = '-';
  document.getElementById('userphoto').style.display = 'none';
  location.reload();
};

async function ensureToken() {
  const token = gapi.client.getToken();
  if (token && token.expiry && Date.now() < token.expiry) {
    return;
  }
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(resp);
      const newToken = gapi.client.getToken();
      newToken.expiry = Date.now() + (newToken.expires_in * 1000);
      gapi.client.setToken(newToken);
      localStorage.setItem("gdrive_token", JSON.stringify(newToken));
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

function formatDateRange(windowStart, windowEnd) {
    const [startYear, startMonth] = windowStart.split('-');
    const [endYear, endMonth] = windowEnd.split('-');

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const startMonthName = monthNames[parseInt(startMonth, 10) - 1];
    const endMonthName = monthNames[parseInt(endMonth, 10) - 1];

    if (startYear === endYear) {
        return `${startYear},<br> ${startMonthName} - ${endMonthName}`;
    } else {
        return `${startMonthName} ${startYear} - ${endMonthName} ${endYear}`;
    }
}


//////// User Info and File / Folder Setup


async function showUserInfo() {
  await ensureToken();
  try {
    const token = gapi.client.getToken();
    const resp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { "Authorization": `Bearer ${token.access_token}` }
    });
    if (!resp.ok) throw new Error("Unauthorized");
    const user = await resp.json();
    document.getElementById('username').innerText = user.name || "Guest";
    document.getElementById('useremail').innerText = user.email || "-";
    if (user.picture) {
      document.getElementById('userphoto').src = user.picture;
      document.getElementById('userphoto').style.display = logout;
    }
  } catch (e) {
    document.querySelector('#logout').click();
    document.getElementById('username').innerText = "Guest";
    document.getElementById('useremail').innerText = "-";
    document.getElementById('userphoto').style.display = 'none';
  }
}

async function ensureFolders() {
  await ensureToken();
  rootFolderId = await createOrGetFolder('kj-advanta');
  subFolders.inventory = await createOrGetFolder('inventory', rootFolderId);
  subFolders.library = await createOrGetFolder('library', rootFolderId);

  await ensureInventoryFiles();
}

async function ensureInventoryFiles() {
  await ensureToken();
  trialFileId = await createOrGetFile('trial.json', subFolders.inventory, { trials: [] });
  cropFileId = await createOrGetFile('crop.json', subFolders.inventory, { crops: [] });
  lineFileId = await createOrGetFile('line.json', subFolders.inventory, { lines: [] });
  paramFileId = await createOrGetFile('param.json', subFolders.inventory, { params: [] });
  locationFileId = await createOrGetFile('location.json', subFolders.inventory, { locations: [] });
}

async function createOrGetFile(name, parentId, defaultJson) {
  await ensureToken();
  const q = `name='${name}' and '${parentId}' in parents and trashed=false`;
  const res = await gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
  if (res.result.files && res.result.files.length) {
    return res.result.files[0].id;
  }

  const metadata = { name, mimeType: 'application/json', parents: [parentId] };
  const blob = new Blob([JSON.stringify(defaultJson, null, 2)], { type: 'application/json' });
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const accessToken = gapi.client.getToken().access_token;
  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  const data = await resp.json();
  return data.id;
}

async function createOrGetFolder(name, parentId = null) {
  await ensureToken();
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const check = await gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
  if (check.result.files && check.result.files.length) return check.result.files[0].id;

  const fileMetadata = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) fileMetadata.parents = [parentId];
  const folder = await gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
  return folder.result.id;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function listLibraryFilesUI() {
  await ensureToken();
  if (!subFolders.library) return;
  const response = await gapi.client.drive.files.list({
    q: `'${subFolders.library}' in parents and trashed=false`,
    fields: 'files(id, thumbnailLink, name, mimeType, size, modifiedTime, webContentLink, webViewLink)'
  });
  const files = response.result.files;
  const fileListDiv = document.querySelector('.table.fix .tbody');
  fileListDiv.innerHTML = '';
  files.forEach(f => {
    const div = document.createElement('div');
    div.className = 'tr';
    div.setAttribute('onclick', ``);
    div.innerHTML = `
        <div class="td icon" data-format="${f.mimeType}" onclick='viewFile("${f.webViewLink}")'></div>
        <div class="td name" onclick='viewFile("${f.webViewLink}")'>${f.name}</div>
        <div class="td" onclick='viewFile("${f.webViewLink}")'>${formatDate(f.modifiedTime)}</div>
        <div class="td" onclick='viewFile("${f.webViewLink}")'>${formatSize(f.size)}</div>
        <div class="td" onclick='viewFile("${f.webViewLink}")'>${(f.mimeType).split('/').pop()}</div>
        <div class="td action">
          <button id="view" onclick='viewFile("${f.webViewLink}")'>
            <svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path fill-rule="evenodd" clip-rule="evenodd" d="M12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9ZM11 12C11 11.4477 11.4477 11 12 11C12.5523 11 13 11.4477 13 12C13 12.5523 12.5523 13 12 13C11.4477 13 11 12.5523 11 12Z"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M21.83 11.2807C19.542 7.15186 15.8122 5 12 5C8.18777 5 4.45796 7.15186 2.17003 11.2807C1.94637 11.6844 1.94361 12.1821 2.16029 12.5876C4.41183 16.8013 8.1628 19 12 19C15.8372 19 19.5882 16.8013 21.8397 12.5876C22.0564 12.1821 22.0536 11.6844 21.83 11.2807ZM12 17C9.06097 17 6.04052 15.3724 4.09173 11.9487C6.06862 8.59614 9.07319 7 12 7C14.9268 7 17.9314 8.59614 19.9083 11.9487C17.9595 15.3724 14.939 17 12 17Z"/> </svg>
          </button>
          <button id="download" onclick="window.location.href='${f.webContentLink}';">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" version="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"> <path d="m3.25 13.25h9m-8.5-6.5 4 3.5 4-3.5m-4-5v8.5"/> </svg>
          </button>
          <button id="delete" onclick='deleteFile("${f.id}")'>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/> </svg>
          </button>
        </div>
        `;
    fileListDiv.appendChild(div);
  });
}

function viewFile(url) {
  window.open(url, '_blank', 'width=800,height=600,resizable=yes,scrollbars=yes');
}

async function deleteFile(fileId) {
  await ensureToken();
  notification("loading", "Deleting file...");
  await gapi.client.drive.files.delete({ fileId });
  notification("success", "File deleted");
  await listLibraryFilesUI();
}

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');

fileInput.addEventListener('change', () => {
  uploadBtn.style.display = fileInput.files.length ? 'block' : 'none';
  uploadStatus.textContent = '';
});

uploadBtn.onclick = async () => {
  if (!fileInput.files.length) return;
  const file = fileInput.files[0];
  uploadStatus.textContent = 'Uploading... 0%';
  uploadBtn.disabled = true;

  const metadata = {
    name: file.name,
    mimeType: file.type,
    parents: [subFolders.library]
  };

  const accessToken = gapi.client.getToken().access_token;

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id");
    xhr.setRequestHeader("Authorization", "Bearer " + accessToken);

    // progress upload
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        uploadBtn.style.display = 'none';
        uploadStatus.style.display = 'block';
        uploadStatus.textContent = `Uploading...`;
        notification('loading', `Uploading file    ${percent}%`);
        if (percent == 100) {
          uploadStatus.textContent = 'Please wait...';
          notification('loading', 'Finalizing upload...');
        }
      }
    });

    xhr.onreadystatechange = async () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          closePopup();
          fileInput.value = '';
          document.querySelector('.popup.library').classList.remove('file-chosen');
          uploadStatus.textContent = 'Success';
          uploadStatus.style.display = 'none';
          uploadBtn.style.display = 'none';
          await listLibraryFilesUI();
          notification('success', 'File uploaded successfully');
        } else {
          uploadStatus.textContent = 'Error uploading file';
          notification('error', 'Error uploading file. Please refresh.');
        }
        uploadBtn.disabled = false;
      }
    };

    xhr.send(form);

  } catch (e) {
    uploadStatus.textContent = 'Error uploading file';
    notification('error', 'Error uploading file. Please refresh.');
    uploadBtn.disabled = false;
  }
};


//////// Trial

let trialFileId = null;
let trialData = [];

async function loadTrialData() {
  await ensureToken();
  if (!trialFileId) {
    const q = `name='trial.json' and '${subFolders.inventory}' in parents and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
    if (res.result.files && res.result.files.length) {
      trialFileId = res.result.files[0].id;
    } else {
      trialFileId = await createOrGetFile('trial.json', subFolders.inventory, { trials: [] });
    }
  }

  const accessToken = gapi.client.getToken().access_token;
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${trialFileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!resp.ok) {
    console.error('Gagal memuat trial.json:', await resp.text());
    trialData = [];
    return;
  }

  const json = await resp.json();
  trialData = Array.isArray(json.trials) ? json.trials : [];

  if (typeof renderTrialTable === 'function') {
    renderTrialTable();
  }
}

function saveTrial() {
  const id = document.getElementById("addTrial-id").value;
  const name = document.getElementById("addTrial-name").value;

  const locationCheck = document.querySelectorAll('.locationCheckbox input[type="checkbox"]:checked');
  const location = Array.from(locationCheck).map(checkbox => checkbox.value);

  const windowStart = document.getElementById("addTrial-windowStart").value;
  const windowEnd = document.getElementById("addTrial-windowEnd").value;
  const trialPlanted = document.getElementById("addTrial-trialPlanted").value;
  const trialHarvested = document.getElementById("addTrial-trialHarvested").value;
  const stage = document.getElementById("addTrial-stage").value;
  const plantingProgress = document.getElementById("addTrial-plantingProgress").value;
  const harvestedProgress = document.getElementById("addTrial-harvestedProgress").value;
  const remark = document.getElementById("addTrial-remark").value;

  const paramCheck = document.querySelectorAll('.paramCheckbox input[type="checkbox"]:checked');
  const param = Array.from(paramCheck).map(checkbox => checkbox.value);

  const crop = document.getElementById("addTrial-crop").value;
  const line = document.getElementById("addTrial-line").value;
  const quantityLine = document.getElementById("addTrial-quantityLine").value;
  const noReplication = document.getElementById("addTrial-noReplication").value;
  const noEntry = document.getElementById("addTrial-noEntry").value;
  const season = document.getElementById("addTrial-season").value;
  // const  = document.getElementById("addTrial-").value;

  console.log("ID:", id);
  console.log("Name:", name);
  console.log("Location:", location);
  console.log("Window Start:", windowStart);
  console.log("Window End:", windowEnd);
  console.log("Trial Planted:", trialPlanted);
  console.log("Trial Harvested:", trialHarvested);
  console.log("Stage:", stage);
  console.log("Planting Progress:", plantingProgress);
  console.log("Harvested Progress:", harvestedProgress);
  console.log("Remark:", remark);
  console.log("Param:", param);
  console.log("Crop:", crop);
  console.log("Line:", line);
  console.log("Quantity Line:", quantityLine);
  console.log("No Replication:", noReplication);
  console.log("No Entry:", noEntry);
  console.log("Season:", season);

  if (id) {
    const idx = trialData.findIndex(l => l.id === id);
    if (idx !== -1) {
      trialData[idx] = {
        id,
        name,
        location,
        windowStart,
        windowEnd,
        trialPlanted,
        trialHarvested,
        stage,
        plantingProgress,
        harvestedProgress,
        remark,
        param,
        crop,
        line,
        quantityLine,
        noReplication,
        noEntry,
        season
      };
    }
  } else {
    trialData.push({
      id: generateId(),
      name,
      location,
      windowStart,
      windowEnd,
      trialPlanted,
      trialHarvested,
      stage,
      plantingProgress,
      harvestedProgress,
      remark,
      param,
      crop,
      line,
      quantityLine,
      noReplication,
      noEntry,
      season
    });
  }

  notification("loading", "Saving trial...");
  updateTrialJson();
  renderTrialTable();
  // resetForm();
  // closePopup();
  notification("success", "Saving success");
}

async function renderTrialTable() {
  const tbody = document.querySelector("#dashboard .table .tbody");
  tbody.innerHTML = "";
  trialData.forEach(trial => {
    const tr = document.createElement("div");
    tr.classList.add('tr');
    tr.innerHTML = `
      <div class="td no center"></div>
      <div class="td">${trial.name}</div>
      <div class="td">${formatDateRange(trial.windowStart, trial.windowEnd)}</div>
      <div class="td" data-progress-value="location-target"><span>${trial.location.length}</span></div>
      <div class="td" data-progress-value="trials-planted"><span>${trial.trialPlanted}</span></div>
      <div class="td" data-progress-value="trials-harvested"><span>${trial.trialHarvested}</span></div>
      <div class="td">${trial.stage}</div>
      <div class="td progress" data-progress-value="planting"><span>${trial.plantingProgress}</span></div>
      <div class="td progress" data-progress-value="harvested"><span>${trial.harvestedProgress}</span></div>
      <div class="td">${trial.remark}</div>
      <div class="td action">
        <button id="info">
          <svg viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg"> <title>info</title> <path d="M16.247 4.733c0 1.684 1.271 2.825 2.84 2.825s2.842-1.142 2.842-2.825c0-1.685-1.272-2.826-2.842-2.826-1.568 0-2.84 1.141-2.84 2.826zM10.096 14.375c0 0.334-0.061 1.163 0.008 1.662l2.479-2.983c0.513-0.562 1.106-0.955 1.409-0.849s0.47 0.463 0.371 0.795l-4.103 13.59c-0.473 1.588 0.421 3.148 2.599 3.504 3.189 0 5.084-2.158 6.948-4.955 0-0.334 0.111-1.213 0.044-1.713l-2.479 2.982c-0.514 0.562-1.151 0.955-1.455 0.85-0.28-0.098-0.444-0.41-0.389-0.721l4.132-13.653c0.344-1.734-0.59-3.312-2.564-3.514-2.076 0.001-5.136 2.209-7 5.005z"></path> </svg>
        </button>
        <button id="run">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <g id="Media / Play"> <path id="Vector" d="M5 17.3336V6.66698C5 5.78742 5 5.34715 5.18509 5.08691C5.34664 4.85977 5.59564 4.71064 5.87207 4.67499C6.18868 4.63415 6.57701 4.84126 7.35254 5.25487L17.3525 10.5882L17.3562 10.5898C18.2132 11.0469 18.642 11.2756 18.7826 11.5803C18.9053 11.8462 18.9053 12.1531 18.7826 12.4189C18.6418 12.7241 18.212 12.9537 17.3525 13.4121L7.35254 18.7454C6.57645 19.1593 6.1888 19.3657 5.87207 19.3248C5.59564 19.2891 5.34664 19.1401 5.18509 18.9129C5 18.6527 5 18.2132 5 17.3336Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/> </g> </svg>
        </button>
        <button id="edit" onclick="editTrial('${trial.id}')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <g> <g id="edit"> <path id="vector" d="M18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L9.54019 19.9458C9.17774 20.3082 8.70239 20.536 8.19281 20.5915L4.57509 20.9856C3.78097 21.072 3.11061 20.4017 3.1971 19.6076L3.59111 15.9898C3.64661 15.4803 3.87444 15.0049 4.23689 14.6425L3.70656 14.1121L4.23689 14.6425L15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512Z" stroke-width="2"/> <path id="vector_2" d="M15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L18.7283 10.7576L13.425 5.45432L15.2282 3.6512Z" stroke-width="2"/> </g> </g> </svg>
        </button>
        <button id="delete" onclick="deleteTrial('${trial.id}')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-cropcap="round" stroke-cropjoin="round"/> </svg>
        </button>
      </div>
    `;
    tbody.prepend(tr);
  });
  setupProgressUpdater();
}

async function updateTrialJson() {
  await ensureToken();
  const accessToken = gapi.client.getToken().access_token;
  const metadata = { name: "trial.json" };

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const content = JSON.stringify({ trials: trialData }, null, 2);

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    close_delim;

  await gapi.client.request({
    path: `/upload/drive/v3/files/${trialFileId}`,
    method: 'PATCH',
    params: { uploadType: 'multipart' },
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: multipartRequestBody
  });
}


//////// Crops


let cropFileId = null;
let cropData = [];

async function loadCropData() {
  await ensureToken();
  if (!cropFileId) {
    const q = `name='crop.json' and '${subFolders.inventory}' in parents and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
    if (res.result.files && res.result.files.length) {
      cropFileId = res.result.files[0].id;
    } else {
      cropFileId = await createOrGetFile('crop.json', subFolders.inventory, { crops: [] });
    }
  }

  const accessToken = gapi.client.getToken().access_token;
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${cropFileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!resp.ok) {
    console.error('Gagal memuat crop.json:', await resp.text());
    cropData = [];
    return;
  }

  const json = await resp.json();
  cropData = Array.isArray(json.crops) ? json.crops : [];

  if (typeof renderCropTable === 'function') {
    renderCropTable();
  }
}

async function saveCrop() {
  const id = document.getElementById("editCropId").value;
  const cropName = document.getElementById("cropName").value;

  if (id) {
    const idx = cropData.findIndex(l => l.id === id);
    if (idx !== -1) {
      cropData[idx] = { id, cropName };
    }
  } else {
    cropData.push({
      id: generateId(),
      cropName
    });
  }

  notification("loading", "Saving crop...");
  await updateCropJson();
  renderCropTable();
  resetCropForm();
  closePopup();
  notification("success", "Crop saved");
}

function renderCropTable() {
  const tbody = document.querySelector("#crops .table .tbody");
  tbody.innerHTML = "";
  cropData.forEach(crop => {
    const tr = document.createElement("div");
    tr.classList.add('tr');
    tr.innerHTML = `
      <div class="td no center"></div>
      <div class="td">${crop.cropName}</div>
      <div class="td action">
        <button id="edit" onclick="editCrop('${crop.id}');openPopup('.crops')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <g id="style=cropar"> <g id="edit"> <path id="vector" d="M18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L9.54019 19.9458C9.17774 20.3082 8.70239 20.536 8.19281 20.5915L4.57509 20.9856C3.78097 21.072 3.11061 20.4017 3.1971 19.6076L3.59111 15.9898C3.64661 15.4803 3.87444 15.0049 4.23689 14.6425L3.70656 14.1121L4.23689 14.6425L15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512Z" stroke-width="2"/> <path id="vector_2" d="M15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L18.7283 10.7576L13.425 5.45432L15.2282 3.6512Z" stroke-width="2"/> </g> </g> </svg>
        </button>
        <button id="delete" onclick="deleteCrop('${crop.id}')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-cropcap="round" stroke-cropjoin="round"/> </svg>
        </button>
      </div>
    `;
    tbody.prepend(tr);
  });
}

function editCrop(id) {
  const crop = cropData.find(l => l.id === id);
  if (!crop) return;

  document.getElementById("editCropId").value = crop.id;
  document.getElementById("cropName").value = crop.cropName;
  document.getElementById("saveCropBtn").textContent = "Save Changes";
}

function resetCropForm() {
  document.getElementById("cropForm").reset();
  document.getElementById("editCropId").value = "";
  document.getElementById("saveCropBtn").textContent = "Add Crop";
}

async function deleteCrop(id) {
  notification('loading', 'Deleting crop...');
  cropData = cropData.filter(l => l.id !== id);
  await updateCropJson();
  renderCropTable();
  notification('success', 'Crop deleted');
}

async function updateCropJson() {
  await ensureToken();
  const accessToken = gapi.client.getToken().access_token;

  const content = JSON.stringify({ crops: cropData }, null, 2);

  await gapi.client.request({
    path: `/upload/drive/v3/files/${cropFileId}?uploadType=media`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: content
  });
}


//////// Lines


let lineFileId = null;
let lineData = [];

async function loadLineData() {
  await ensureToken();
  if (!lineFileId) {
    const q = `name='line.json' and '${subFolders.inventory}' in parents and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
    if (res.result.files && res.result.files.length) {
      lineFileId = res.result.files[0].id;
    } else {
      lineFileId = await createOrGetFile('line.json', subFolders.inventory, { lines: [] });
    }
  }

  const accessToken = gapi.client.getToken().access_token;
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${lineFileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!resp.ok) {
    console.error('Gagal memuat line.json:', await resp.text());
    lineData = [];
    return;
  }

  const json = await resp.json();
  lineData = Array.isArray(json.lines) ? json.lines : [];

  if (typeof renderLineTable === 'function') {
    renderLineTable(); 
  }
}

function saveLine() {
  const id = document.getElementById("editId").value;
  const lineName = document.getElementById("lineName").value;
  const cropSelect = document.getElementById("cropSelect").value;
  const hybridCode = document.getElementById("hybridCode").value;
  const sprCode = document.getElementById("sprCode").value;
  const year = document.getElementById("year").value;
  const stages = document.getElementById("stages").value;
  const qty = document.getElementById("qty").value;
  const dateAdded = document.getElementById("dateAdded").value;

  if (id) {
    const idx = lineData.findIndex(l => l.id === id);
    if (idx !== -1) {
      lineData[idx] = { id, lineName, cropSelect, hybridCode, sprCode, year, stages, qty, dateAdded };
    }
  } else {
    lineData.push({
      id: generateId(),
      lineName,
      cropSelect,
      hybridCode,
      sprCode,
      year,
      stages,
      qty,
      dateAdded
    });
  }

  notification("loading", "Saving line...");
  updateLineJson();
  renderLineTable();
  resetForm();
  closePopup();
  notification("success", "Line saved");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { 
    year: "numeric", 
    month: "long", 
    day: "numeric" 
  });
}

function renderLineTable() {
  renderCropSelect(".lines #cropSelect");
  const tbody = document.querySelector("#lines .table .tbody");
  tbody.innerHTML = "";
  lineData.forEach(line => {
    const tr = document.createElement("div");
    tr.classList.add('tr');
    tr.innerHTML = `
      <div class="td no center"></div>
      <div class="td">${line.lineName}</div>
      <div class="td">${line.cropSelect}</div>
      <div class="td">${line.hybridCode}</div>
      <div class="td">${line.sprCode}</div>
      <div class="td">${line.year}</div>
      <div class="td">${line.stages}</div>
      <div class="td">${line.qty}</div>
      <div class="td">${formatDate(line.dateAdded)}</div>
      <div class="td action">
        <button id="edit" onclick="editLine('${line.id}');openPopup('.lines')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <g id="style=linear"> <g id="edit"> <path id="vector" d="M18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L9.54019 19.9458C9.17774 20.3082 8.70239 20.536 8.19281 20.5915L4.57509 20.9856C3.78097 21.072 3.11061 20.4017 3.1971 19.6076L3.59111 15.9898C3.64661 15.4803 3.87444 15.0049 4.23689 14.6425L3.70656 14.1121L4.23689 14.6425L15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512Z" stroke-width="2"/> <path id="vector_2" d="M15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L18.7283 10.7576L13.425 5.45432L15.2282 3.6512Z" stroke-width="2"/> </g> </g> </svg>
        </button>
        <button id="delete" onclick="deleteLine('${line.id}')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/> </svg>
        </button>
      </div>
    `;
    tbody.prepend(tr);
  });
}

function editLine(id) {
  const line = lineData.find(l => l.id === id);
  if (!line) return;
  renderCropSelect(".lines #cropSelect");
  document.querySelector('.popup.lines').classList.add('edit');
  document.getElementById("editId").value = line.id;
  document.getElementById("lineName").value = line.lineName;
  document.getElementById("cropSelect").value = line.cropSelect;
  document.getElementById("hybridCode").value = line.hybridCode;
  document.getElementById("sprCode").value = line.sprCode;
  document.getElementById("year").value = line.year;
  document.getElementById("stages").value = line.stages;
  document.getElementById("qty").value = line.qty;
  document.getElementById("dateAdded").value = line.dateAdded;

  document.getElementById("saveBtn").textContent = "Save Changes";
}

function resetForm() {
  document.querySelector('.popup.lines').classList.remove('edit');
  document.getElementById("lineForm").reset();
  document.getElementById("editId").value = "";
  document.getElementById("saveBtn").textContent = "Add Line";
}

function deleteLine(id) {
  notification("loading", "Deleting line...");
  lineData = lineData.filter(l => l.id !== id);
  updateLineJson();
  renderLineTable();
  notification("success", "Line deleted");
}

async function updateLineJson() {
  await ensureToken();
  const accessToken = gapi.client.getToken().access_token;
  const metadata = { name: "line.json" };

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const content = JSON.stringify({ lines: lineData }, null, 2);

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    close_delim;

  await gapi.client.request({
    path: `/upload/drive/v3/files/${lineFileId}`,
    method: 'PATCH',
    params: { uploadType: 'multipart' },
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: multipartRequestBody
  });
}


//////// Observation Parameters


let paramFileId = null;
let paramData = [];

async function loadParamData() {
  await ensureToken();
  if (!paramFileId) {
    const q = `name='param.json' and '${subFolders.inventory}' in parents and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
    if (res.result.files && res.result.files.length) {
      paramFileId = res.result.files[0].id;
    } else {
      paramFileId = await createOrGetFile('param.json', subFolders.inventory, { params: [] });
    }
  }

  const accessToken = gapi.client.getToken().access_token;
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${paramFileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!resp.ok) {
    console.error('Gagal memuat param.json:', await resp.text());
    paramData = [];
    return;
  }

  const json = await resp.json();
  paramData = Array.isArray(json.params) ? json.params : [];

  if (typeof renderParamTable === 'function') {
    renderParamTable();
  }
}

function saveParam() {
  const id = document.getElementById("editId").value;
  const paramName = document.getElementById("paramName").value;
  const paramType = document.getElementById("paramType").value;
  const paramUnit = document.getElementById("paramUnit").value;
  const paramPhoto = document.getElementById("paramPhoto").checked;

  const paramValue = [];
  const rows = document.querySelectorAll(`#paramTypeTable [data-value="${paramType}"] .table .tbody .tr`);
  rows.forEach(row => {
    if (paramType == "range") {
      const number = row.querySelector('.number').textContent.trim();
      const desc = row.querySelector('.desc').textContent.trim();
      paramValue.push({ number, desc });
    } else {
      const name = row.querySelector(`.name`).textContent.trim();
      paramValue.push({ name });
    }
  });

  if (id) {
    const idx = paramData.findIndex(l => l.id === id);
    if (idx !== -1) {
      paramData[idx] = { id, paramName, paramType, paramValue, paramUnit, paramPhoto };
    }
  } else {
    paramData.push({
      id: generateId(),
      paramName,
      paramType,
      paramValue,
      paramUnit,
      paramPhoto
    });
  }

  notification("loading", "Saving parameter...");
  updateParamJson();
  renderParamTable();
  resetParamForm();
  closePopup();
  notification("success", "Parameter saved");
}

const paramTypeSelect = document.querySelector('select#paramType');
const paramTypeForm = document.querySelectorAll('.pop-child form');
const paramTypeTable = document.querySelectorAll('#paramTypeTable > .type');

function controlParamTypeSelect() {
  const selectedType = paramTypeSelect.value;
  paramTypeForm.forEach(form => {
    if (form.dataset.value === selectedType) {
      form.classList.add('active')
    } else {
      form.classList.remove('active')
    }
  });
  paramTypeTable.forEach(type => {
    if (type.dataset.value === selectedType) {
      type.classList.add('active')
    } else {
      type.classList.remove('active')
    }
  });

  const tableTr = document.querySelectorAll(`#paramTypeTable .tr`);
  tableTr.forEach(tr => tr.remove());
};

controlParamTypeSelect();

paramTypeSelect.addEventListener('change', () => {
  controlParamTypeSelect();
});

function renderParamTable() {
  const tbody = document.querySelector("#observation-parameters .table .tbody");
  tbody.innerHTML = "";
  paramData.forEach(param => {
    function paramPhoto() {
      const checkbox = param?.paramPhoto;
      return checkbox ? "Yes" : "No";
    }
    const tr = document.createElement("div");
    tr.classList.add('tr');
    tr.innerHTML = `
      <div class="td no center"></div>
      <div class="td">${param.paramName}</div>
      <div class="td">${param.paramType}</div>
      <div class="td">${param.paramUnit}</div>
      <div class="td">${paramPhoto()}</div>
      <div class="td action">
        <button id="edit" onclick="editParam('${param.id}');openPopup('.params')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <g id="style=paramar"> <g id="edit"> <path id="vector" d="M18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L9.54019 19.9458C9.17774 20.3082 8.70239 20.536 8.19281 20.5915L4.57509 20.9856C3.78097 21.072 3.11061 20.4017 3.1971 19.6076L3.59111 15.9898C3.64661 15.4803 3.87444 15.0049 4.23689 14.6425L3.70656 14.1121L4.23689 14.6425L15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512Z" stroke-width="2"/> <path id="vector_2" d="M15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L18.7283 10.7576L13.425 5.45432L15.2282 3.6512Z" stroke-width="2"/> </g> </g> </svg>
        </button>
        <button id="delete" onclick="deleteParam('${param.id}')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-paramcap="round" stroke-paramjoin="round"/> </svg>
        </button>
      </div>
    `;
    tbody.prepend(tr);
  });
}

function editParam(id) {
  const param = paramData.find(l => l.id === id);
  if (!param) return;

  document.getElementById("editId").value = param.id;
  document.getElementById("paramName").value = param.paramName;
  const paramType = (document.getElementById("paramType").value = param.paramType);
  document.getElementById("paramUnit").value = param.paramUnit;
  document.getElementById("paramPhoto").checked = param.paramPhoto;
  document.getElementById("saveParamBtn").textContent = "Save Changes";

  controlParamTypeSelect();
  const paramValue = param.paramValue;
  
  paramValue.forEach(i => {
    const tableContainer = document.querySelector(`#paramTypeTable [data-value="${param.paramType}"] .table .tbody`);
    const tr = document.createElement('div');
    tr.classList.add('tr');
    if (paramType == 'range') {
      tr.innerHTML = `
        <div class="td number">${i.number}</div> 
        <div class="td desc">${i.desc}</div> 
        <div class="td action">
          <button id="delete" onclick="event.preventDefault();  deleteRange(this);"> <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-paramcap="round" stroke-paramjoin="round"></path> </svg> </button> 
        </div>
      `;
    } else {
      tr.innerHTML = `
        <div class="td number">${i.name}</div> 
        <div class="td action">
          <button id="delete" onclick="event.preventDefault();  deleteRange(this);"> <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-paramcap="round" stroke-paramjoin="round"></path> </svg> </button> 
        </div>
      `;
    }
    tableContainer.append(tr);
  });  
}

function resetParamForm() {
  document.getElementById("paramForm").reset();
  document.getElementById("editId").value = "";
  document.getElementById("saveParamBtn").textContent = "Add Param";
}

async function deleteParam(id) {
  notification('loading', 'Deleting parameter...');
  paramData = paramData.filter(l => l.id !== id);
  await updateParamJson();
  renderParamTable();
  notification('success', 'Parameter deleted');
}

async function updateParamJson() {
  await ensureToken();
  const accessToken = gapi.client.getToken().access_token;
  const metadata = { name: "param.json" };

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const content = JSON.stringify({ params: paramData }, null, 2);

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    close_delim;

  await gapi.client.request({
    path: `/upload/drive/v3/files/${paramFileId}`,
    method: 'PATCH',
    params: { uploadType: 'multipart' },
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: multipartRequestBody
  });
}

function addRange() {
  const tableContainer = document.querySelector(`#paramTypeTable [data-value="range"] .table .tbody`);
  const numberValue = document.querySelector(`#inputRange`).value;
  const descValue = document.querySelector(`#inputRangeDesc`).value;
  const tr = document.createElement('div');
  tr.classList.add('tr');
  tr.innerHTML = `
    <div class="td number">${numberValue}</div> 
    <div class="td desc">${descValue}</div> 
    <div class="td action">
      <button id="delete" onclick="event.preventDefault();  deleteRange(this);"> <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-paramcap="round" stroke-paramjoin="round"></path> </svg> </button> 
    </div>
  `;
  tableContainer.append(tr);
  document.querySelector(`#inputRange`).value = ``;
  document.querySelector(`#inputRangeDesc`).value = ``;
}

function addParamValue(e) {
  const type = e.getAttribute(`data-value`);
  const tableContainer = document.querySelector(`#paramTypeTable [data-value="${type}"] .table .tbody`);
  const nameValue = document.querySelector(`#input${capitalizeFirstLetter(type)}`).value;
  const tr = document.createElement('div');
  tr.classList.add('tr');
  tr.innerHTML = `
    <div class="td name">${nameValue}</div> 
    <div class="td action">
      <button id="delete" onclick="event.preventDefault();  deleteRange(this);"> <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-paramcap="round" stroke-paramjoin="round"></path> </svg> </button> 
    </div>
  `;
  tableContainer.append(tr);
  document.querySelector(`#inputRange`).value = ``;
  document.querySelector(`#inputRangeDesc`).value = ``;
}

function deleteRange(btn) { 
  const tr = btn.closest('.tr');
  tr.remove();
}


//////// Locations


let locationFileId = null;
let locationData = [];

async function loadLocationData() {
  await ensureToken();
  if (!locationFileId) {
    const q = `name='location.json' and '${subFolders.inventory}' in parents and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
    if (res.result.files && res.result.files.length) {
      locationFileId = res.result.files[0].id;
    } else {
      locationFileId = await createOrGetFile('location.json', subFolders.inventory, { locations: [] });
    }
  }

  const accessToken = gapi.client.getToken().access_token;
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${locationFileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!resp.ok) {
    console.error('Gagal memuat location.json:', await resp.text());
    locationData = [];
    return;
  }

  const json = await resp.json();
  locationData = Array.isArray(json.locations) ? json.locations : [];

  if (typeof renderLocationTable === 'function') {
    renderLocationTable();
  }
}

async function saveLocation() {
  const id = document.getElementById("editLocationId").value;
  const locationName = document.getElementById("locationName").value;

  if (id) {
    const idx = locationData.findIndex(l => l.id === id);
    if (idx !== -1) {
      locationData[idx] = { id, locationName };
    }
  } else {
    locationData.push({
      id: generateId(),
      locationName
    });
  }

  notification("loading", "Saving location...");
  await updateLocationJson();
  renderLocationTable();
  resetLocationForm();
  closePopup();
  notification("success", "Location saved");
}

function renderLocationTable() {
  const tbody = document.querySelector("#locations .table .tbody");
  tbody.innerHTML = "";
  locationData.forEach(location => {
    const tr = document.createElement("div");
    tr.classList.add('tr');
    tr.innerHTML = `
      <div class="td no center"></div>
      <div class="td">${location.locationName}</div>
      <div class="td action">
        <button id="edit" onclick="editLocation('${location.id}');openPopup('.locations')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <g id="style=locationar"> <g id="edit"> <path id="vector" d="M18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L9.54019 19.9458C9.17774 20.3082 8.70239 20.536 8.19281 20.5915L4.57509 20.9856C3.78097 21.072 3.11061 20.4017 3.1971 19.6076L3.59111 15.9898C3.64661 15.4803 3.87444 15.0049 4.23689 14.6425L3.70656 14.1121L4.23689 14.6425L15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512Z" stroke-width="2"/> <path id="vector_2" d="M15.2282 3.6512C16.1068 2.77252 17.5315 2.77252 18.4101 3.6512L20.5315 5.77252C21.4101 6.6512 21.4101 8.07582 20.5315 8.9545L18.7283 10.7576L13.425 5.45432L15.2282 3.6512Z" stroke-width="2"/> </g> </g> </svg>
        </button>
        <button id="delete" onclick="deleteLocation('${location.id}')">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6" stroke-width="2" stroke-locationcap="round" stroke-locationjoin="round"/> </svg>
        </button>
      </div>
    `;
    tbody.prepend(tr);
  });
}

function editLocation(id) {
  const location = locationData.find(l => l.id === id);
  if (!location) return;

  document.getElementById("editLocationId").value = location.id;
  document.getElementById("locationName").value = location.locationName;
  document.getElementById("saveLocationBtn").textContent = "Save Changes";
}

function resetLocationForm() {
  document.getElementById("locationForm").reset();
  document.getElementById("editLocationId").value = "";
  document.getElementById("saveLocationBtn").textContent = "Add Location";
}

async function deleteLocation(id) {
  notification('loading', 'Deleting location...');
  locationData = locationData.filter(l => l.id !== id);
  await updateLocationJson();
  renderLocationTable();
  notification('success', 'Location deleted');
}

async function updateLocationJsonrenderParamSelectparam () {
  await ensureToken();
  const accessToken = gapi.client.getToken().access_token;

  const content = JSON.stringify({ locations: locationData }, null, 2);

  await gapi.client.request({
    path: `/upload/drive/v3/files/${locationFileId}?uploadType=media`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: content
  });
}

//////// Additional

function renderCropSelect(container) {
  const option = document.querySelector(container);
  option.innerHTML = '';
  cropData.forEach(crop => {
    const select = document.createElement("option");
    select.value = crop.cropName;
    select.innerHTML = crop.cropName;
    option.prepend(select);
  });
}

async function renderParamCheckbox(container) {
  const option = document.querySelector(container);
  option.innerHTML = '';
  paramData.forEach(param => {
    const container = document.createElement("label");
    container.htmlFor = (param.paramName).replace(' ', '_');

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = param.paramName;
    input.id = (param.paramName).replace(' ', '_');
    input.name = "addTrial-param";
    container.prepend(input);

    const span = document.createElement("span");
    span.textContent = param.paramName;
    container.append(span);

    option.prepend(container);
  });
}

async function renderLocationCheckbox(container) {
  const option = document.querySelector(container);
  option.innerHTML = '';
  locationData.forEach(location => {
    const container = document.createElement("label");
    container.htmlFor = (location.locationName).replace(' ', '_');

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = location.locationName;
    input.id = (location.locationName).replace(' ', '_');
    input.name = "addTrial-location";
    container.prepend(input);

    const span = document.createElement("span");
    span.textContent = location.locationName;
    container.append(span);

    option.prepend(container);
  });
}

async function renderLineSelect(container) {
  const option = document.querySelector(container);
  option.innerHTML = '';
  lineData.forEach(line => {
    const select = document.createElement("option");
    select.value = line.lineName;
    select.innerHTML = line.lineName + " (" + line.qty + ")";
    option.prepend(select);
  });
}

function capitalizeFirstLetter(str) {
  if (str === null || str === undefined || str.length === 0) {
    return ""; // Handle empty or invalid strings
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}


// ETC


// PROGRESS COLOR


// PROGRESS AVERAGE

const setupProgressUpdater = () => {

  const colors = [
    [244, 67, 54],
    [255, 111, 0],
    [255, 179, 0],
    [104, 159, 56],
    [56, 142, 60]
  ];

  function applyColors() {
    function getColor(value) {
      value = Math.max(0, Math.min(100, value));
      const step = 100 / (colors.length - 1);
      const idx = Math.floor(value / step);
      const t = (value % step) / step;
      if (idx >= colors.length - 1) return `rgb(${colors[colors.length - 1].join(",")})`;
      const c1 = colors[idx];
      const c2 = colors[idx + 1];
      return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * t)},${Math.round(c1[1] + (c2[1] - c1[1]) * t)},${Math.round(c1[2] + (c2[2] - c1[2]) * t)})`;
    }

    function updateColors() {
      document.querySelectorAll('.progress span').forEach(span => {
        span.style.backgroundColor = getColor(parseInt(span.textContent.trim()));
      });
    }

    const observer = new MutationObserver(updateColors);
    document.querySelectorAll('.progress span').forEach(span => observer.observe(span, { childList: true }));
    updateColors();
  }

  applyColors();

  const valueContainers = Array.from(document.querySelectorAll('[data-progress-value]'));
  const targetContainers = Array.from(document.querySelectorAll('[data-progress][data-progress-type]'));

  const updateProgress = () => {
    const valuesMap = {};
    valueContainers.forEach(el => {
      const type = el.dataset.progressValue;
      const val = parseFloat(el.querySelector('span').textContent) || 0;
      if (!valuesMap[type]) valuesMap[type] = [];
      valuesMap[type].push(val);
    });

    targetContainers.forEach(target => {
      const type = target.dataset.progress;
      const calcType = target.dataset.progressType;
      const span = target.querySelector('span');
      const values = valuesMap[type] || [];
      let result = 0;

      if (calcType === 'average') {
        result = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(0) : 0;
      } else if (calcType === 'sum') {
        result = values.length ? values.reduce((a, b) => a + b, 0) : 0;
      }

      span.textContent = result;
    });
  };

  const observer = new MutationObserver(updateProgress);
  const config = { childList: true, subtree: true };
  valueContainers.forEach(el => observer.observe(el, config));
  updateProgress();
};