const totalRows = document.getElementById("totalRows");
const totalSheets = document.getElementById("totalSheets");
const lastUpload = document.getElementById("lastUpload");
const searchInput = document.getElementById("searchInput");
const sheetFilter = document.getElementById("sheetFilter");
const tableBody = document.getElementById("trackerTableBody");
const trackerCards = document.getElementById("trackerCards");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");

const TRACKER_COLUMNS = [
  { key: "slNo", label: "SL.NO." },
  { key: "typeOfEquipment", label: "TYPE OF EQUIPMENT" },
  { key: "equipmentCompany", label: "EQUIPMENT COMPANY" },
  { key: "equipmentModNo", label: "EQUIPMENT MOD NO." },
  { key: "location", label: "LOCATION" },
  { key: "amcCmc", label: "AMC/CMC" },
  { key: "amcFrom", label: "FROM" },
  { key: "amcTo", label: "TO" },
  { key: "pmFreqYr", label: "PM FREQ YR." },
  { key: "sheet", label: "Sheet" },
];

const state = {
  page: 1,
  pageSize: 12,
  totalPages: 1,
  search: "",
  sheet: "",
  visibleColumns: TRACKER_COLUMNS.map((column) => column.key),
};

let requestController = null;

const formatUploadTime = (isoTime) => {
  if (!isoTime) {
    return "Not uploaded yet";
  }

  return new Date(isoTime).toLocaleString();
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
      "This request was rejected because the payload is too large for the current Vercel deployment. Use a smaller workbook or move the backend to a non-serverless host."
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

const isBlankCell = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "n a" ||
    normalized === "-"
  );
};

const syncTableColumnVisibility = () => {
  const headers = document.querySelectorAll("thead th[data-col]");
  for (const header of headers) {
    const key = header.getAttribute("data-col");
    const isVisible = state.visibleColumns.includes(key);
    header.style.display = isVisible ? "" : "none";
  }
};

const renderRows = (rows) => {
  syncTableColumnVisibility();

  tableBody.innerHTML = "";
  trackerCards.innerHTML = "";

  if (!rows.length) {
    tableBody.innerHTML = `<tr><td colspan="${Math.max(state.visibleColumns.length, 1)}">No AMC/CMC tracker rows found.</td></tr>`;
    trackerCards.innerHTML = '<article class="asset-card">No AMC/CMC tracker rows found.</article>';
    return;
  }

  for (const item of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = state.visibleColumns
      .map((columnKey) => `<td>${item[columnKey] ?? ""}</td>`)
      .join("");
    tableBody.appendChild(tr);

    const card = document.createElement("article");
    card.className = "asset-card";
    const titleValue = !isBlankCell(item.typeOfEquipment)
      ? item.typeOfEquipment
      : !isBlankCell(item.equipmentModNo)
        ? item.equipmentModNo
        : "AMC/CMC Item";
    const cardDetails = TRACKER_COLUMNS.filter((column) => state.visibleColumns.includes(column.key))
      .filter((column) => column.key !== "typeOfEquipment")
      .filter((column) => !isBlankCell(item[column.key]))
      .map((column) => `<div><b>${column.label}:</b> ${item[column.key]}</div>`)
      .join("");
    card.innerHTML = `
      <strong>${titleValue}</strong>
      ${cardDetails}
      ${!isBlankCell(item.sheet) && state.visibleColumns.includes("sheet") ? `<span class="badge">Sheet: ${item.sheet}</span>` : ""}
    `;
    trackerCards.appendChild(card);
  }
};

const updateStats = (meta) => {
  totalRows.textContent = String(meta.total ?? 0);
  totalSheets.textContent = String(meta.sheetCount ?? 0);
  lastUpload.textContent = formatUploadTime(meta.lastUpload?.uploadedAt);

  state.totalPages = meta.totalPages || 1;
  pageInfo.textContent = `Page ${meta.page || 1} of ${state.totalPages}`;
  prevPageBtn.disabled = state.page <= 1;
  nextPageBtn.disabled = state.page >= state.totalPages;
};

const loadSheetFilter = async () => {
  const response = await fetchWithTimeout("/api/sheets?type=amc-cmc");
  const data = await readJsonResponse(response, "Failed to load sheets.");

  if (!response.ok) {
    throw new Error(data.error || "Failed to load sheets.");
  }

  const currentValue = sheetFilter.value;
  sheetFilter.innerHTML = '<option value="">All Sheets</option>';

  for (const sheet of data.sheets || []) {
    const option = document.createElement("option");
    option.value = sheet;
    option.textContent = sheet;
    sheetFilter.appendChild(option);
  }

  if (currentValue && (data.sheets || []).includes(currentValue)) {
    sheetFilter.value = currentValue;
  }
};

const loadTrackerRows = async () => {
  if (requestController) {
    requestController.abort();
  }

  requestController = new AbortController();

  const query = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
  });

  if (state.search) {
    query.set("search", state.search);
  }

  if (state.sheet) {
    query.set("sheet", state.sheet);
  }

  try {
    const response = await fetchWithTimeout(
      `/api/amc-cmc?${query.toString()}`,
      { signal: requestController.signal },
      25000
    );
    const data = await readJsonResponse(response, "Failed to load tracker rows.");

    if (!response.ok) {
      throw new Error(data.error || "Failed to load tracker rows.");
    }

    state.visibleColumns =
      Array.isArray(data.meta?.visibleColumns) && data.meta.visibleColumns.length
        ? data.meta.visibleColumns
        : TRACKER_COLUMNS.map((column) => column.key);

    renderRows(data.rows || []);
    updateStats(data.meta || {});
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    throw error;
  } finally {
    requestController = null;
  }
};

const debounce = (fn, delay = 250) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

searchInput.addEventListener(
  "input",
  debounce(async (event) => {
    state.search = event.target.value.trim();
    state.page = 1;
    await loadTrackerRows();
  })
);

sheetFilter.addEventListener("change", async (event) => {
  state.sheet = event.target.value;
  state.page = 1;
  await loadTrackerRows();
});

prevPageBtn.addEventListener("click", async () => {
  if (state.page <= 1) {
    return;
  }

  state.page -= 1;
  await loadTrackerRows();
});

nextPageBtn.addEventListener("click", async () => {
  if (state.page >= state.totalPages) {
    return;
  }

  state.page += 1;
  await loadTrackerRows();
});

const init = async () => {
  try {
    await loadSheetFilter();
    await loadTrackerRows();
  } catch (error) {
    tableBody.innerHTML = '<tr><td colspan="10">Failed to load AMC/CMC tracker data.</td></tr>';
    trackerCards.innerHTML =
      '<article class="asset-card">Failed to load AMC/CMC tracker data.</article>';
  }
};

init();
