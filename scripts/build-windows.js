const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const publicSourceDir = path.join(projectRoot, "public");
const publicTargetDir = path.join(distDir, "public");
const workbookFiles = [
  "ASSET CODE - AM MEDICAL CENTRE.xlsx",
  "AMC 25-26 biomedical. - Copy.xlsx",
  "Biomedical Fixed Assets Physical Verification Location Wise (Autosaved).xlsx",
];

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(publicTargetDir, { recursive: true, force: true });
fs.cpSync(publicSourceDir, publicTargetDir, { recursive: true });

for (const workbookFile of workbookFiles) {
  const sourcePath = path.join(projectRoot, workbookFile);
  const targetPath = path.join(distDir, workbookFile);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }
}

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["pkg", "desktop-launcher.js", "--targets", "node18-win-x64", "--output", "dist/start-asset-tracker.exe"],
  {
    stdio: "inherit",
    cwd: projectRoot,
  }
);