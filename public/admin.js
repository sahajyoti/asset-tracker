const loginPanel = document.getElementById("loginPanel");
const uploadPanel = document.getElementById("uploadPanel");
const loginForm = document.getElementById("loginForm");
const adminPassword = document.getElementById("adminPassword");
const loginMessage = document.getElementById("loginMessage");
const uploadForm = document.getElementById("uploadForm");
const uploadType = document.getElementById("uploadType");
const excelFileInput = document.getElementById("excelFile");
const uploadMessage = document.getElementById("uploadMessage");
const logoutBtn = document.getElementById("logoutBtn");
const uploadedFilesPanel = document.getElementById("uploadedFilesPanel");
const uploadedFilesList = document.getElementById("uploadedFilesList");
const VERCEL_UPLOAD_LIMIT_BYTES = 4.5 * 1024 * 1024;

const formatTooLargeMessage = (file) => {
  const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);
  return `This workbook is ${fileSizeMb} MB, which is too large for Vercel's serverless upload limit of about 4.5 MB. Use a smaller workbook or move the upload backend to a non-serverless host.`;
};

const setMessage = (el, text, isError = false) => {
  el.textContent = text;
  el.classList.toggle("error", isError);
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 25000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const readJsonResponse = async (response, fallbackMessage) => {
  const text = await response.text();

  if (response.status === 413) {
    throw new Error(
      "This workbook is too large for Vercel's serverless upload limit of about 4.5 MB. Use a smaller workbook or move the upload backend to a non-serverless host."
    );
  }

  if (!text) {
    throw new Error(fallbackMessage || "Empty response from server.");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const contentType = response.headers.get("content-type") || "unknown content type";
    const statusInfo = `${response.status} ${response.statusText}`.trim();
    const bodyPreview = text.length > 200 ? `${text.slice(0, 200)}...` : text;

    throw new Error(
      `Expected JSON but received ${contentType} from server (${statusInfo}). Response preview: ${bodyPreview}`
    );
  }
};

const toggleAdminUI = (authenticated) => {
  loginPanel.classList.toggle("hidden", authenticated);
  uploadPanel.classList.toggle("hidden", !authenticated);
  uploadedFilesPanel.classList.toggle("hidden", !authenticated);
};

const renderUploadedFiles = (uploads) => {
  if (!uploads.length) {
    uploadedFilesList.innerHTML = '<p class="upload-list-empty">No uploaded files yet.</p>';
    return;
  }

  uploadedFilesList.innerHTML = uploads
    .map(
      (item) => `
        <article class="upload-item">
          <a href="/uploaded-files/${encodeURIComponent(item.storedFileName)}" target="_blank" rel="noopener noreferrer">${item.fileName}</a>
          <p>Type: ${item.uploadType} | Uploaded: ${new Date(item.uploadedAt).toLocaleString()}</p>
        </article>
      `
    )
    .join("");
};

const loadUploadHistory = async () => {
  const response = await fetchWithTimeout("/api/uploads");
  const data = await readJsonResponse(response, "Failed to load uploaded files.");

  if (!response.ok) {
    throw new Error(data.error || "Failed to load uploaded files.");
  }

  renderUploadedFiles(data.uploads || []);
};

const checkAuth = async () => {
  const response = await fetchWithTimeout("/api/admin/check");
  const data = await readJsonResponse(response, "Failed to verify admin session.");

  if (!response.ok) {
    throw new Error(data.error || "Failed to verify admin session.");
  }

  toggleAdminUI(Boolean(data.authenticated));
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = adminPassword.value.trim();
  if (!password) {
    setMessage(loginMessage, "Password is required.", true);
    return;
  }

  setMessage(loginMessage, "Authenticating...");

  try {
    const response = await fetchWithTimeout("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await readJsonResponse(response, "Login failed.");
    if (!response.ok) {
      throw new Error(data.error || "Login failed.");
    }

    adminPassword.value = "";
    setMessage(loginMessage, "Login successful.");
    toggleAdminUI(true);
    await loadUploadHistory();
  } catch (error) {
    setMessage(loginMessage, error.message, true);
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!excelFileInput.files.length) {
    setMessage(uploadMessage, "Please select an Excel file.", true);
    return;
  }

  const selectedFile = excelFileInput.files[0];
  if (selectedFile.size > VERCEL_UPLOAD_LIMIT_BYTES) {
    setMessage(uploadMessage, formatTooLargeMessage(selectedFile), true);
    return;
  }

  const formData = new FormData();
  formData.append("uploadType", uploadType.value);
  formData.append("excelFile", selectedFile);

  setMessage(uploadMessage, "Uploading and parsing workbook...");

  try {
    const response = await fetchWithTimeout("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await readJsonResponse(response, "Upload failed.");
    if (!response.ok) {
      throw new Error(data.error || "Upload failed.");
    }

    setMessage(
      uploadMessage,
      `Upload successful for ${data.lastUpload.uploadType}: ${data.lastUpload.assetCount} assets, ${data.lastUpload.amcCmcCount || 0} AMC/CMC rows.`
    );
    await loadUploadHistory();
  } catch (error) {
    setMessage(uploadMessage, error.message, true);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await fetchWithTimeout("/api/admin/logout", { method: "POST" });
  } finally {
    toggleAdminUI(false);
    setMessage(uploadMessage, "");
    setMessage(loginMessage, "Logged out.");
    uploadedFilesList.innerHTML = "";
  }
});

const init = async () => {
  try {
    await checkAuth();
    if (!loginPanel.classList.contains("hidden")) {
      return;
    }

    await loadUploadHistory();
  } catch (error) {
    toggleAdminUI(false);
    setMessage(loginMessage, error.message, true);
  }
};

init();
