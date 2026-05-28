const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs/promises");
const { exec } = require("child_process");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = Boolean(process.env.VERCEL);
const appRoot = process.pkg ? path.dirname(process.execPath) : __dirname;
const uploadDir = isVercel ? path.join("/tmp", "uploads") : path.join(appRoot, "uploads");
const savedUploadsDir = isVercel
  ? path.join("/tmp", "uploaded-files")
  : path.join(appRoot, "uploaded-files");
const publicDir = path.join(__dirname, "public");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const defaultAssetWorkbookPath = path.join(__dirname, "ASSET CODE - AM MEDICAL CENTRE.xlsx");
const defaultAmcWorkbookPath = path.join(__dirname, "AMC 25-26 biomedical. - Copy.xlsx");

const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];
    const isAllowedExtension = /\.(xlsx|xls)$/i.test(file.originalname || "");

    if (allowedMimeTypes.includes(file.mimetype) || isAllowedExtension) {
      cb(null, true);
      return;
    }

    cb(new Error("Only .xlsx and .xls files are allowed."));
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));
app.use("/uploaded-files", express.static(savedUploadsDir));

const state = {
  assets: [],
  assetSheets: [],
  amcTrackers: [],
  amcSheets: [],
  lastUpload: null,
  uploadHistory: [],
  adminSessions: new Set(),
};

const parseCookies = (cookieHeader = "") => {
  const cookies = {};

  for (const token of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = token.trim().split("=");
    if (!rawKey) {
      continue;
    }

    cookies[rawKey] = decodeURIComponent(rawValue.join("=") || "");
  }

  return cookies;
};

const openBrowser = (url) =>
  new Promise((resolve, reject) => {
    let command;

    if (process.platform === "win32") {
      command = `start "" "${url}"`;
    } else if (process.platform === "darwin") {
      command = `open "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const loadDefaultDataIfPresent = async () => {
  const tryLoadWorkbook = async (filePath, parser, uploadType) => {
    try {
      await fs.access(filePath);
    } catch (_error) {
      // eslint-disable-next-line no-console
      console.warn(`Default ${uploadType} file not found: ${path.basename(filePath)}`);
      return;
    }

    const workbook = XLSX.readFile(filePath);
    const sourceFileName = path.basename(filePath);

    if (uploadType === "asset") {
      const { parsedAssets, parsedSheets } = parser(workbook, sourceFileName);
      state.assets = parsedAssets;
      state.assetSheets = parsedSheets;
      return;
    }

    const { parsedTrackers, parsedSheets } = parser(workbook, sourceFileName);
    state.amcTrackers = parsedTrackers;
    state.amcSheets = parsedSheets;
  };

  await tryLoadWorkbook(defaultAssetWorkbookPath, parseWorkbookAssets, "asset");
  await tryLoadWorkbook(defaultAmcWorkbookPath, parseWorkbookAmcCmc, "amc-cmc");
};

const getAdminToken = (req) => {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies.admin_token || "";
};

const isAuthenticatedAdmin = (req) => {
  const token = getAdminToken(req);
  return Boolean(token && state.adminSessions.has(token));
};

const requireAdmin = (req, res, next) => {
  if (!isAuthenticatedAdmin(req)) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }

  next();
};

const FIELD_ALIASES = {
  slNo: ["sl no", "sl.no", "slno", "s no", "serial index"],
  floorWise: ["floor wise", "floor", "floorwise", "location floor"],
  dept: ["dept", "department", "deprt", "depat"],
  assetDescription: ["asset description", "description", "asset desc"],
  assetName: [
    "asset name",
    "equipment name",
    "name of equipment",
    "exact name",
    "exact name part",
    "equipment",
  ],
  serialNo: ["serial no", "serial number", "serial no.", "serial", "s/n", "sn"],
  brand: ["brand", "make", "manufacturer", "company"],
  assetCode: ["asset code", "code", "asset id", "asset no", "asset number"],
};

const AMCCMC_FIELD_ALIASES = {
  slNo: ["sl no", "sl.no", "slno"],
  typeOfEquipment: ["type of equipment", "equipment type", "asset description"],
  equipmentCompany: ["equipment company", "company", "brand", "manufacturer"],
  equipmentModNo: [
    "equipment mod no",
    "equipment model no",
    "equipment mod no.",
    "equipment model",
    "model no",
    "model number",
  ],
  location: ["location", "dept", "department", "floor wise"],
  amcCmc: ["amc cmc", "amc/cmc", "amc-cmc", "amc or cmc"],
  amcFrom: ["amc from", "cmc from", "amc cmc period from", "contract from", "period from", "from"],
  amcTo: ["amc to", "cmc to", "amc cmc period to", "contract to", "period to", "to"],
  pmFreqYr: ["pm freq yr", "pm freq", "pm frequency", "pm frequency yr", "yr", "yr."],
};

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\/]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");

const isBlankCell = (value) => {
  const normalized = normalizeKey(value);
  return (
    !normalized ||
    normalized === "na" ||
    normalized === "n a" ||
    normalized === "none" ||
    normalized === "-"
  );
};

const getVisibleColumns = (rows, columns) => {
  const visible = columns.filter((column) =>
    rows.some((row) => !isBlankCell(row[column]))
  );

  if (visible.includes("sheet")) {
    const uniqueSheets = new Set(
      rows.map((row) => String(row.sheet || "").trim()).filter((value) => value)
    );
    if (uniqueSheets.size <= 1) {
      return visible.filter((column) => column !== "sheet");
    }
  }

  return visible;
};

const isAliasMatch = (normalizedHeader, aliases) => {
  if (!normalizedHeader) {
    return false;
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (normalizedHeader === normalizedAlias) {
      return true;
    }

    // Allow partial matching only for sufficiently descriptive alias text.
    if (normalizedAlias.length >= 4 && normalizedHeader.includes(normalizedAlias)) {
      return true;
    }
  }

  return false;
};

const firstPresent = (row, aliases) => {
  const rowEntries = Object.entries(row);

  // First pass: exact normalized match for predictable mapping.
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    for (const [key, rawValue] of rowEntries) {
      if (normalizeKey(key) === normalizedAlias) {
        const value = String(rawValue ?? "").trim();
        if (value) {
          return value;
        }
      }
    }
  }

  // Second pass: tolerant contains match for headers like "Equipment Name (Full)".
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    for (const [key, rawValue] of rowEntries) {
      const normalizedKey = normalizeKey(key);
      if (
        normalizedKey.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedKey)
      ) {
        const value = String(rawValue ?? "").trim();
        if (value) {
          return value;
        }
      }
    }
  }

  return "";
};

const parseWorkbookAssets = (workbook, fileName) => {
  const parsedAssets = [];
  const parsedSheets = [];
  const fieldNames = Object.keys(FIELD_ALIASES);

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });

    if (!rows.length) {
      continue;
    }

    let headerRowIndex = -1;
    let fieldToColumn = {};
    let bestScore = -1;

    const probeRowLimit = Math.min(rows.length, 30);
    for (let r = 0; r < probeRowLimit; r += 1) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      const mapping = {};

      for (let c = 0; c < row.length; c += 1) {
        const normalizedHeader = normalizeKey(row[c]);
        if (!normalizedHeader) {
          continue;
        }

        for (const fieldName of fieldNames) {
          if (
            mapping[fieldName] === undefined &&
            isAliasMatch(normalizedHeader, FIELD_ALIASES[fieldName])
          ) {
            mapping[fieldName] = c;
          }
        }
      }

      const score = Object.keys(mapping).length;
      if (score > bestScore) {
        bestScore = score;
        headerRowIndex = r;
        fieldToColumn = mapping;
      }
    }

    if (bestScore < 3) {
      continue;
    }

    parsedSheets.push(sheetName);

    for (let r = headerRowIndex + 1; r < rows.length; r += 1) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];

      const getValue = (fieldName) => {
        const col = fieldToColumn[fieldName];
        if (col === undefined) {
          return "";
        }

        return String(row[col] ?? "").trim();
      };

      const slNo = getValue("slNo");
      const floorWise = getValue("floorWise");
      const dept = getValue("dept");
      const assetDescription = getValue("assetDescription");
      const assetName = getValue("assetName");
      const serialNo = getValue("serialNo");
      const brand = getValue("brand");
      const assetCode = getValue("assetCode");

      if (
        !slNo &&
        !floorWise &&
        !dept &&
        !assetDescription &&
        !assetName &&
        !serialNo &&
        !brand &&
        !assetCode
      ) {
        continue;
      }

      if (normalizeKey(slNo) === "total") {
        continue;
      }

      parsedAssets.push({
        id: `${sheetName}-${parsedAssets.length + 1}`,
        slNo: slNo || "",
        floorWise: floorWise || "",
        dept: dept || "",
        assetDescription: assetDescription || "",
        assetName: assetName || "",
        serialNo: serialNo || "",
        brand: brand || "",
        assetCode: assetCode || "",
        sheet: sheetName,
        searchText: [
          slNo,
          floorWise,
          dept,
          assetDescription,
          assetName,
          serialNo,
          brand,
          assetCode,
          sheetName,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" "),
        sourceSheet: sheetName,
        sourceFile: fileName,
      });
    }
  }

  return { parsedAssets, parsedSheets };
};

const parseWorkbookAmcCmc = (workbook, fileName) => {
  const parsedTrackers = [];
  const parsedSheets = [];
  const fieldNames = Object.keys(AMCCMC_FIELD_ALIASES);
  const hasMeaningfulValue = (value) => {
    const normalized = normalizeKey(value);
    return Boolean(normalized && normalized !== "na" && normalized !== "n a");
  };

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });

    if (!rows.length) {
      continue;
    }

    let headerRowIndex = -1;
    let fieldToColumn = {};
    let bestScore = -1;

    const probeRowLimit = Math.min(rows.length, 30);
    for (let r = 0; r < probeRowLimit; r += 1) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      const nextRow = Array.isArray(rows[r + 1]) ? rows[r + 1] : [];
      const mapping = {};

      const colLimit = Math.max(row.length, nextRow.length);
      for (let c = 0; c < colLimit; c += 1) {
        const normalizedHeader = normalizeKey(row[c]);
        const normalizedSubHeader = normalizeKey(nextRow[c]);
        const combinedHeader = normalizeKey(`${row[c] || ""} ${nextRow[c] || ""}`);

        if (!normalizedHeader && !normalizedSubHeader && !combinedHeader) {
          continue;
        }

        if (
          normalizedHeader.includes("tag from") ||
          normalizedHeader.includes("tag to") ||
          combinedHeader.includes("tag from") ||
          combinedHeader.includes("tag to")
        ) {
          continue;
        }

        for (const fieldName of fieldNames) {
          if (
            mapping[fieldName] === undefined &&
            (isAliasMatch(normalizedHeader, AMCCMC_FIELD_ALIASES[fieldName]) ||
              isAliasMatch(normalizedSubHeader, AMCCMC_FIELD_ALIASES[fieldName]) ||
              isAliasMatch(combinedHeader, AMCCMC_FIELD_ALIASES[fieldName]))
          ) {
            mapping[fieldName] = c;
          }
        }
      }

      const score = Object.keys(mapping).length;
      if (score > bestScore) {
        bestScore = score;
        headerRowIndex = r;
        fieldToColumn = mapping;
      }
    }

    if (bestScore < 4 || fieldToColumn.amcCmc === undefined) {
      continue;
    }

    parsedSheets.push(sheetName);

    for (let r = headerRowIndex + 1; r < rows.length; r += 1) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];

      const getValue = (fieldName) => {
        const col = fieldToColumn[fieldName];
        if (col === undefined) {
          return "";
        }

        return String(row[col] ?? "").trim();
      };

      const slNo = getValue("slNo");
      const typeOfEquipment = getValue("typeOfEquipment");
      const equipmentCompany = getValue("equipmentCompany");
      const equipmentModNo = getValue("equipmentModNo");
      const location = getValue("location");
      const amcCmc = getValue("amcCmc");
      const amcFrom = getValue("amcFrom");
      const amcTo = getValue("amcTo");
      const pmFreqYr = getValue("pmFreqYr");

      if (
        !slNo &&
        !typeOfEquipment &&
        !equipmentCompany &&
        !equipmentModNo &&
        !location &&
        !amcCmc &&
        !amcFrom &&
        !amcTo &&
        !pmFreqYr
      ) {
        continue;
      }

      const isHeaderLikeRow =
        normalizeKey(typeOfEquipment) === "type of equipment" ||
        normalizeKey(equipmentCompany) === "equipment company" ||
        normalizeKey(equipmentModNo) === "equipment mod no" ||
        normalizeKey(location) === "location" ||
        normalizeKey(amcCmc) === "amc cmc" ||
        normalizeKey(amcFrom) === "from" ||
        normalizeKey(amcTo) === "to" ||
        normalizeKey(pmFreqYr) === "yr";

      if (isHeaderLikeRow) {
        continue;
      }

      if (
        !hasMeaningfulValue(amcCmc) &&
        !hasMeaningfulValue(amcFrom) &&
        !hasMeaningfulValue(amcTo) &&
        !hasMeaningfulValue(pmFreqYr)
      ) {
        continue;
      }

      if (normalizeKey(slNo) === "total") {
        continue;
      }

      parsedTrackers.push({
        id: `${sheetName}-amc-${parsedTrackers.length + 1}`,
        slNo: slNo || "",
        typeOfEquipment: typeOfEquipment || "",
        equipmentCompany: equipmentCompany || "",
        equipmentModNo: equipmentModNo || "",
        location: location || "",
        amcCmc: amcCmc || "",
        amcFrom: amcFrom || "",
        amcTo: amcTo || "",
        pmFreqYr: pmFreqYr || "",
        sheet: sheetName,
        searchText: [
          slNo,
          typeOfEquipment,
          equipmentCompany,
          equipmentModNo,
          location,
          amcCmc,
          amcFrom,
          amcTo,
          pmFreqYr,
          sheetName,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" "),
        sourceFile: fileName,
      });
    }
  }

  return { parsedTrackers, parsedSheets };
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/amc-cmc", (req, res) => {
  res.sendFile(path.join(publicDir, "amc-cmc.html"));
});

app.get("/api/admin/check", (req, res) => {
  res.json({ authenticated: isAuthenticatedAdmin(req) });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body?.password || "");

  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin password." });
    return;
  }

  const sessionToken = crypto.randomBytes(24).toString("hex");
  state.adminSessions.add(sessionToken);

  res.setHeader(
    "Set-Cookie",
    `admin_token=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
  );
  res.json({ message: "Admin login successful." });
});

app.post("/api/admin/logout", (req, res) => {
  const token = getAdminToken(req);
  if (token) {
    state.adminSessions.delete(token);
  }

  res.setHeader(
    "Set-Cookie",
    "admin_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  );
  res.json({ message: "Logged out." });
});

app.get("/api/sheets", (req, res) => {
  const type = String(req.query.type || "asset").trim().toLowerCase();
  const sheets = type === "amc-cmc" ? state.amcSheets : state.assetSheets;
  res.json({ sheets, lastUpload: state.lastUpload, type });
});

app.get("/api/uploads", requireAdmin, (req, res) => {
  res.json({ uploads: state.uploadHistory });
});

app.get("/api/assets", (req, res) => {
  const searchText = String(req.query.search || "").trim().toLowerCase();
  const selectedSheet = String(req.query.sheet || "").trim();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);

  let filtered = state.assets;

  if (selectedSheet) {
    filtered = filtered.filter((item) => item.sheet === selectedSheet);
  }

  if (searchText) {
    filtered = filtered.filter((item) => item.searchText.includes(searchText));
  }

  const total = filtered.length;
  const visibleColumns = getVisibleColumns(filtered, [
    "slNo",
    "floorWise",
    "dept",
    "assetDescription",
    "assetName",
    "serialNo",
    "brand",
    "assetCode",
    "sheet",
  ]);
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const assets = filtered.slice(start, start + pageSize).map((item) => ({
    id: item.id,
    slNo: item.slNo,
    floorWise: item.floorWise,
    dept: item.dept,
    assetDescription: item.assetDescription,
    assetName: item.assetName,
    serialNo: item.serialNo,
    brand: item.brand,
    assetCode: item.assetCode,
    sheet: item.sheet,
  }));

  res.json({
    assets,
    meta: {
      total,
      page: safePage,
      pageSize,
      totalPages,
      sheetCount: state.assetSheets.length,
      visibleColumns,
      lastUpload: state.lastUpload,
    },
  });
});

app.get("/api/amc-cmc", (req, res) => {
  const searchText = String(req.query.search || "").trim().toLowerCase();
  const selectedSheet = String(req.query.sheet || "").trim();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);

  let filtered = state.amcTrackers;

  if (selectedSheet) {
    filtered = filtered.filter((item) => item.sheet === selectedSheet);
  }

  if (searchText) {
    filtered = filtered.filter((item) => item.searchText.includes(searchText));
  }

  const total = filtered.length;
  const visibleColumns = getVisibleColumns(filtered, [
    "slNo",
    "typeOfEquipment",
    "equipmentCompany",
    "equipmentModNo",
    "location",
    "amcCmc",
    "amcFrom",
    "amcTo",
    "pmFreqYr",
    "sheet",
  ]);
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize).map((item) => ({
    id: item.id,
    slNo: item.slNo,
    typeOfEquipment: item.typeOfEquipment,
    equipmentCompany: item.equipmentCompany,
    equipmentModNo: item.equipmentModNo,
    location: item.location,
    amcCmc: item.amcCmc,
    amcFrom: item.amcFrom,
    amcTo: item.amcTo,
    pmFreqYr: item.pmFreqYr,
    sheet: item.sheet,
  }));

  res.json({
    rows,
    meta: {
      total,
      page: safePage,
      pageSize,
      totalPages,
      sheetCount: state.amcSheets.length,
      visibleColumns,
      lastUpload: state.lastUpload,
    },
  });
});

app.post("/api/upload", requireAdmin, upload.single("excelFile"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No Excel file provided." });
    return;
  }

  try {
    const uploadType = String(req.body?.uploadType || "asset").trim().toLowerCase();
    if (!["asset", "amc-cmc"].includes(uploadType)) {
      res.status(400).json({ error: "Invalid upload type. Use asset or amc-cmc." });
      return;
    }

    await fs.mkdir(savedUploadsDir, { recursive: true });
    const safeOriginalName = path
      .basename(req.file.originalname)
      .replace(/[^a-zA-Z0-9._ -]/g, "_");
    const storedFileName = `${Date.now()}-${uploadType}-${safeOriginalName}`;
    await fs.copyFile(req.file.path, path.join(savedUploadsDir, storedFileName));

    const workbook = XLSX.readFile(req.file.path);
    let assetCount = state.assets.length;
    let amcCmcCount = state.amcTrackers.length;

    if (uploadType === "asset") {
      const { parsedAssets, parsedSheets } = parseWorkbookAssets(workbook, req.file.originalname);
      state.assets = parsedAssets;
      state.assetSheets = parsedSheets;
      assetCount = parsedAssets.length;
    } else {
      const { parsedTrackers, parsedSheets } = parseWorkbookAmcCmc(workbook, req.file.originalname);
      state.amcTrackers = parsedTrackers;
      state.amcSheets = parsedSheets;
      amcCmcCount = parsedTrackers.length;
    }

    state.lastUpload = {
      fileName: req.file.originalname,
      storedFileName,
      uploadType,
      uploadedAt: new Date().toISOString(),
      assetCount,
      amcCmcCount,
      sheetCount: uploadType === "asset" ? state.assetSheets.length : state.amcSheets.length,
    };

    state.uploadHistory.unshift(state.lastUpload);
    if (state.uploadHistory.length > 50) {
      state.uploadHistory = state.uploadHistory.slice(0, 50);
    }

    res.json({
      message: `Excel file uploaded and parsed successfully for ${uploadType}.`,
      lastUpload: state.lastUpload,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to parse Excel file." });
  } finally {
    try {
      await fs.unlink(req.file.path);
    } catch (cleanupError) {
      // Best-effort upload temp-file cleanup.
    }
  }
});

app.use((err, req, res, next) => {
  if (err) {
    res.status(400).json({ error: err.message || "Request failed." });
    return;
  }

  next();
});

const startServer = async ({ openApp = false } = {}) => {
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(savedUploadsDir, { recursive: true });
  await loadDefaultDataIfPresent();

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Asset Tracker running on http://localhost:${PORT}`);

    if (openApp) {
      openBrowser(`http://localhost:${PORT}`).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn(`Unable to open browser automatically: ${error.message}`);
      });
    }
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
};
