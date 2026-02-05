// Google OAuth Configuration
const CLIENT_ID =
  "400272927751-t5ehe632lahuk9p38eie583tv2obv60s.apps.googleusercontent.com";
const API_KEY = "AIzaSyACgQqP_f8cohSUMTJEN2CbKwiNvQN2E7Y";
const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
];
const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile";

let tokenClient;
let currentUser = null;
let accessToken = null;

// Initialize Google APIs
function initializeGoogleAPIs() {
  return new Promise((resolve) => {
    gapi.load("client", async () => {
      await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
      });

      // Initialize Google Identity Services
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleAuthResponse,
      });

      resolve();
    });
  });
}

function handleAuthResponse(response) {
  if (response.error) {
    console.error("Auth error:", response);
    showLoading(false);
    alert("Authentication failed. Please try again.");
    return;
  }

  if (response.access_token) {
    accessToken = response.access_token;
    gapi.client.setToken({ access_token: accessToken });

    // Get user info
    fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((userInfo) => {
        currentUser = {
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
        };

        // Save to localStorage
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        localStorage.setItem("accessToken", accessToken);

        // Initialize app
        initializeApp();
      })
      .catch((error) => {
        console.error("Error getting user info:", error);
        showLoading(false);
        alert("Failed to get user information. Please try again.");
      });
  }
}

function requestLogin() {
  showLoading(true);
  tokenClient.requestAccessToken({ prompt: "consent" });
}

function logout() {
  // Revoke the token
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      console.log("Token revoked");
    });
  }

  // Clear data
  gapi.client.setToken(null);
  currentUser = null;
  accessToken = null;
  localStorage.removeItem("currentUser");
  localStorage.removeItem("accessToken");

  // Reset to login view
  document.getElementById("loginView").classList.add("active");
  document.getElementById("appView").classList.remove("active");
}

function getCurrentUser() {
  const stored = localStorage.getItem("currentUser");
  return stored ? JSON.parse(stored) : null;
}

function getAccessToken() {
  return accessToken || localStorage.getItem("accessToken");
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initializeGoogleAPIs();

    // Setup login button
    const loginBtn = document.getElementById("googleLoginBtn");
    if (loginBtn) {
      loginBtn.addEventListener("click", requestLogin);
    }

    // Check if user was previously logged in
    const storedToken = localStorage.getItem("accessToken");
    const storedUser = localStorage.getItem("currentUser");

    if (storedToken && storedUser) {
      accessToken = storedToken;
      currentUser = JSON.parse(storedUser);
      gapi.client.setToken({ access_token: accessToken });

      // Verify token is still valid by making a simple API call
      try {
        await gapi.client.drive.about.get({ fields: "user" });
        showView("app");
        initializeApp();
      } catch (error) {
        // Token expired, clear and show login
        console.log("Token expired, please login again");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("currentUser");
        accessToken = null;
        currentUser = null;
      }
    }
  } catch (error) {
    console.error("Error initializing:", error);
  }
});
